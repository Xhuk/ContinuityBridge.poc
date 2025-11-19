import { Router, Request, Response } from "express";
import { db } from "../../db.js";
import { users, flowDefinitions, systemLogs, magicLinks, customerLicense } from "../../schema.pg.js";
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
    const userData = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows: any[]) => rows[0]);

    if (!userData) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get user's flows (if any)
    const userFlows = await db
      .select()
      .from(flowDefinitions)
      .where(eq(flowDefinitions.createdBy, userId))
      .all();

    // Get user's organization license (if customer_admin)
    let license = null;
    if (userData.organizationId) {
      license = await db
        .select()
        .from(customerLicense)
        .where(eq(customerLicense.organizationId, userData.organizationId))
        .limit(1)
        .then((rows: any[]) => rows[0] || null);
    }

    // Get user's recent system logs (last 90 days)
    const recentLogs = await db
      .select()
      .from(systemLogs)
      .where(eq(systemLogs.userId, userId))
      .limit(1000)
      .all();

    // Get user's magic links (if any)
    const magicLinksData = await db
      .select()
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
 */
router.delete("/delete", authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email;
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

    log.warn("GDPR data deletion requested", { userId, email: userEmail });

    // Step 1: Delete user's flows
    const deletedFlows = await db
      .delete(flowDefinitions)
      .where(eq(flowDefinitions.createdBy, userId));

    log.info("Deleted user flows", { userId, count: deletedFlows });

    // Step 2: Delete user's system logs
    const deletedLogs = await db
      .delete(systemLogs)
      .where(eq(systemLogs.userId, userId));

    log.info("Deleted user logs", { userId, count: deletedLogs });

    // Step 3: Delete user's magic links
    const deletedMagicLinks = await db
      .delete(magicLinks)
      .where(eq(magicLinks.email, userEmail));

    log.info("Deleted magic links", { userId, count: deletedMagicLinks });

    // Step 4: If user is organization admin, anonymize license data
    // (Don't delete organization license as it may affect other users)
    const userData = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows: any[]) => rows[0]);

    if (userData?.organizationId && userData.role === "customer_admin") {
      await db
        .update(customerLicense)
        .set({
          createdBy: "[DELETED_USER]",
          updatedAt: new Date(),
        })
        .where(eq(customerLicense.organizationId, userData.organizationId));

      log.info("Anonymized license data", { userId, organizationId: userData.organizationId });
    }

    // Step 5: Delete user account (FINAL STEP)
    await db
      .delete(users)
      .where(eq(users.id, userId));

    log.warn("User account permanently deleted (GDPR)", { 
      userId, 
      email: userEmail,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
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
