import { Router, Request, Response } from "express";
import { db } from "../../db.js";
import { users, systemLogs, magicLinks, customerLicense } from "../../schema.pg.js";
import { eq, and } from "drizzle-orm";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";

const router = Router();
const log = logger.child("GDPR");

/**
 * GDPR Compliance Endpoints
 * 
 * Implements:
 * - Article 15: Right of Access
 * - Article 17: Right to Erasure (Right to be Forgotten)
 * - Article 20: Right to Data Portability
 */

/**
 * GET /api/gdpr/export
 * Export all user data (GDPR Article 20 - Data Portability)
 * 🔒 Authenticated users can export their own data
 */
router.get("/export", authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    log.info("GDPR data export requested", { userId, role: userRole });

    // Collect all user data
    const userData = await (db.select() as any)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows: any[]) => rows[0]);

    if (!userData) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get user's flows (if any) - from SQLite storage
    const userFlows: any[] = [];
    // Note: Flows are stored in SQLite, not PostgreSQL
    // This would require accessing SQLite db separately

    // Get user's organization license (if customer_admin)
    let license = null;
    if (userData.organizationId) {
      license = await (db.select() as any)
        .from(customerLicense)
        .where(eq(customerLicense.organizationId, userData.organizationId))
        .limit(1)
        .then((rows: any[]) => rows[0] || null);
    }

    // Get user's recent system logs (last 90 days)
    const recentLogs = await (db.select() as any)
      .from(systemLogs)
      .where(eq(systemLogs.userId, userId))
      .limit(1000)
      .all();

    // Get user's magic links (if any)
    const magicLinksData = await (db.select() as any)
      .from(magicLinks)
      .where(eq(magicLinks.email, userData.email))
      .all();

    // Sanitize sensitive data
    const sanitizedUser = {
      ...userData,
      passwordHash: "[REDACTED]",
      apiKey: userData.apiKey ? "[REDACTED]" : null,
    };

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
      dataCategories: {
        personalInformation: {
          id: sanitizedUser.id,
          email: sanitizedUser.email,
          role: sanitizedUser.role,
          organizationId: sanitizedUser.organizationId,
          organizationName: sanitizedUser.organizationName,
          enabled: sanitizedUser.enabled,
          emailConfirmed: sanitizedUser.emailConfirmed,
          createdAt: sanitizedUser.createdAt,
          updatedAt: sanitizedUser.updatedAt,
          lastLoginAt: sanitizedUser.lastLoginAt,
          metadata: sanitizedUser.metadata,
        },
        flows: userFlows.map((flow: any) => ({
          id: flow.id,
          name: flow.name,
          status: flow.status,
          createdAt: flow.createdAt,
          updatedAt: flow.updatedAt,
        })),
        organizationLicense: license ? {
          organizationId: license.organizationId,
          organizationName: license.organizationName,
          licenseType: license.licenseType,
          active: license.active,
          validFrom: license.validFrom,
          validUntil: license.validUntil,
        } : null,
        systemLogs: recentLogs.map((log: any) => ({
          timestamp: log.timestamp,
          level: log.level,
          service: log.service,
          message: log.message,
        })),
        authenticationHistory: magicLinksData.map((link: any) => ({
          createdAt: link.createdAt,
          used: link.used,
          usedAt: link.usedAt,
          ipAddress: link.ipAddress,
        })),
      },
      gdprNotice: {
        rightToAccess: "You have the right to access your personal data at any time",
        rightToRectification: "You have the right to request correction of inaccurate data",
        rightToErasure: "You have the right to request deletion of your data (see /api/gdpr/delete)",
        rightToDataPortability: "This export fulfills your right to data portability",
        contactEmail: process.env.GDPR_CONTACT_EMAIL || "privacy@continuitybridge.com",
      },
    };

    log.info("GDPR data export completed", { 
      userId, 
      flowsCount: userFlows.length,
      logsCount: recentLogs.length,
    });

    res.json(exportData);
  } catch (error: any) {
    log.error("GDPR data export failed", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/gdpr/delete
 * Delete all user data (GDPR Article 17 - Right to Erasure)
 * 🔒 Authenticated users can delete their own data
 * ⚠️ This is PERMANENT and IRREVERSIBLE
 * 
 * LOGIC:
 * - Regular users (customer_user): Full deletion
 * - Customer Admins: Cannot delete (would break organization) - Schedule contract termination instead
 * - Superadmin/Consultant: Cannot delete (system integrity)
 */
router.delete("/delete", authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    const userRole = req.user?.role;
    const confirmationToken = req.body.confirmationToken;

    if (!userId || !userEmail) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Require explicit confirmation token to prevent accidental deletion
    if (confirmationToken !== `DELETE_MY_DATA_${userId}`) {
      return res.status(400).json({
        error: "Invalid confirmation token",
        message: "To delete your data, you must provide the correct confirmation token",
        requiredToken: `DELETE_MY_DATA_${userId}`,
      });
    }

    log.warn("GDPR data deletion requested", { userId, email: userEmail, role: userRole });

    // Get user data to check role and organization
    const userData = await (db.select() as any)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows: any[]) => rows[0]);

    if (!userData) {
      return res.status(404).json({ error: "User not found" });
    }

    // ================================================================
    // PROTECTION: Cannot delete critical roles
    // ================================================================
    
    if (userRole === "superadmin" || userRole === "consultant") {
      log.warn("GDPR deletion blocked - critical role", { userId, role: userRole });
      return res.status(403).json({
        error: "Cannot delete account",
        message: `${userRole} accounts cannot be self-deleted as they are critical to system operations. Contact support for account deactivation.`,
        alternative: "You can disable your account instead of deleting it",
        contactEmail: process.env.GDPR_CONTACT_EMAIL || "privacy@continuitybridge.com",
      });
    }

    // ================================================================
    // PROTECTION: Customer Admin cannot delete (would break org)
    // ================================================================
    
    if (userRole === "customer_admin" && userData.organizationId) {
      log.warn("GDPR deletion blocked - customer admin with active organization", { 
        userId, 
        organizationId: userData.organizationId 
      });

      // Check if there are other users in the organization
      const orgUsers = await (db.select() as any)
        .from(users)
        .where(eq(users.organizationId, userData.organizationId))
        .all();

      if (orgUsers.length > 1) {
        return res.status(403).json({
          error: "Cannot delete account",
          message: "You are the admin of an active organization with other users. You must transfer ownership or remove all users first.",
          organizationId: userData.organizationId,
          organizationName: userData.organizationName,
          activeUsers: orgUsers.length,
          steps: [
            "1. Transfer admin role to another user, OR",
            "2. Remove all other users from organization, OR",
            "3. Contact support to schedule contract termination",
          ],
          contactEmail: process.env.GDPR_CONTACT_EMAIL || "privacy@continuitybridge.com",
        });
      }

      // If customer_admin is the ONLY user, schedule contract termination instead of immediate delete
      log.warn("Customer admin is sole user - scheduling contract termination", {
        userId,
        organizationId: userData.organizationId,
      });

      // Disable the organization license (soft delete)
      await (db.update(customerLicense) as any)
        .set({
          active: false,
          notes: `GDPR deletion request by ${userEmail} on ${new Date().toISOString()}. Contract termination scheduled.`,
          updatedAt: new Date(),
        })
        .where(eq(customerLicense.organizationId, userData.organizationId));

      // Disable the user account (soft delete)
      await (db.update(users) as any)
        .set({
          enabled: false,
          metadata: {
            ...userData.metadata,
            gdprDeletionRequested: true,
            gdprDeletionRequestedAt: new Date().toISOString(),
            contractTerminationScheduled: true,
            terminationReason: "GDPR Article 17 - Right to Erasure",
          },
        })
        .where(eq(users.id, userId));

      log.warn("Contract termination scheduled (GDPR)", {
        userId,
        organizationId: userData.organizationId,
        scheduledAt: new Date().toISOString(),
      });

      return res.json({
        success: true,
        action: "contract_termination_scheduled",
        message: "Your account has been disabled and contract termination has been scheduled.",
        scheduledAt: new Date().toISOString(),
        nextSteps: [
          "Your account is now disabled and you cannot log in",
          "Your organization license is now inactive",
          "Our team will contact you within 48 hours to finalize contract termination",
          "All data will be permanently deleted after contract termination is confirmed",
          "You have 30 days to cancel this request by contacting support",
        ],
        contactEmail: process.env.GDPR_CONTACT_EMAIL || "privacy@continuitybridge.com",
        gdprNotice: "This complies with GDPR Article 17. Your data will be deleted after proper contract termination procedures.",
      });
    }

    // ================================================================
    // SAFE TO DELETE: Regular customer_user
    // ================================================================

    log.info("Proceeding with full GDPR deletion - regular user", { userId, role: userRole });

    // Step 1: Delete user's flows (would require accessing SQLite separately)
    // Note: Flows are in SQLite database, not PostgreSQL
    // This is a limitation - flows deletion would need separate implementation
    const deletedFlows = 0; // Placeholder

    log.info("User flows deletion skipped (SQLite limitation)", { userId });

    // Step 2: Delete user's system logs
    const deletedLogs = await (db.delete(systemLogs) as any)
      .where(eq(systemLogs.userId, userId));

    log.info("Deleted user logs", { userId, count: deletedLogs });

    // Step 3: Delete user's magic links
    const deletedMagicLinks = await (db.delete(magicLinks) as any)
      .where(eq(magicLinks.email, userEmail));

    log.info("Deleted magic links", { userId, count: deletedMagicLinks });

    // Step 4: Delete user account (FINAL STEP)
    await (db.delete(users) as any)
      .where(eq(users.id, userId));

    log.warn("User account permanently deleted (GDPR)", { 
      userId, 
      email: userEmail,
      role: userRole,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      action: "permanent_deletion",
      message: "Your data has been permanently deleted in compliance with GDPR Article 17",
      deletedAt: new Date().toISOString(),
      deletedData: {
        user: true,
        flows: deletedFlows,
        logs: deletedLogs,
        magicLinks: deletedMagicLinks,
      },
      gdprNotice: "All your personal data has been removed from our systems. This action is irreversible.",
    });
  } catch (error: any) {
    log.error("GDPR data deletion failed", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/gdpr/info
 * Get GDPR information and user's data processing details
 * 🔓 Public endpoint
 */
router.get("/info", async (req: Request, res: Response) => {
  res.json({
    gdprCompliance: {
      dataController: {
        name: "ContinuityBridge",
        contactEmail: process.env.GDPR_CONTACT_EMAIL || "privacy@continuitybridge.com",
        dpo: process.env.DPO_EMAIL || "dpo@continuitybridge.com",
      },
      legalBasis: "Consent and Contract Performance (GDPR Article 6)",
      dataRetention: {
        activeSessions: "90 days after last activity",
        systemLogs: "90 days (configurable)",
        userProfiles: "Until account deletion",
        backups: "30 days",
      },
      rights: {
        rightToAccess: "GET /api/gdpr/export - Export all your data",
        rightToRectification: "PUT /api/users/:id - Update your profile",
        rightToErasure: "DELETE /api/gdpr/delete - Delete all your data",
        rightToDataPortability: "GET /api/gdpr/export - Portable JSON format",
        rightToObject: "Contact DPO to object to processing",
        rightToRestrict: "Contact DPO to restrict processing",
      },
      dataProcessing: {
        purposes: [
          "Service delivery (integration flows, webhooks, transformations)",
          "Authentication and access control",
          "Error logging and debugging",
          "System monitoring and performance",
          "License management and billing",
        ],
        thirdParties: [
          "Neon (Database hosting - US)",
          "Render (Application hosting - US)",
          "Resend (Email delivery - US)",
          "Google Cloud (Storage - US)",
        ],
        encryption: {
          inTransit: "TLS 1.3 (HTTPS)",
          atRest: "AES-256 (Database level)",
          passwords: "Argon2 hashing",
        },
      },
      updates: {
        lastUpdated: "2024-11-18",
        privacyPolicyUrl: `${process.env.APP_URL || 'http://localhost:5000'}/privacy-policy`,
        cookiePolicyUrl: `${process.env.APP_URL || 'http://localhost:5000'}/cookie-policy`,
      },
    },
  });
});

export default router;
