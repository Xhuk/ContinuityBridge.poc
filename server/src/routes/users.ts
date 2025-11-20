import { Router } from "express";
import { db } from "../../db";
import { users } from "../../schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as crypto from "crypto";
import { authenticateUser, requireSuperAdmin, UserRole } from "../auth/rbac-middleware";
import { requireConsultant } from "../auth/rbac-middleware";

const router = Router();

/**
 * GET /api/users
 * List users based on role:
 * - Superadmin: Sees all users grouped by organization, with founders first
 * - Consultant: Sees users from assigned customers
 * - Customer Admin: Sees users from their organization
 */
router.get("/", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;
    const assignedCustomers = req.user?.assignedCustomers || [];

    let query;

    if (userRole === "superadmin") {
      // Superadmin sees all users grouped by organization
      const allUsers = await (db.select({
        id: users.id,
        email: users.email,
        role: users.role,
        organizationId: users.organizationId,
        organizationName: users.organizationName,
        assignedCustomers: users.assignedCustomers,
        apiKey: users.apiKey, // Include API key for superadmin
        enabled: users.enabled,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        metadata: users.metadata,
      }).from(users) as any);

      // Group users by organization
      const grouped: Record<string, any[]> = {};
      const founders: any[] = [];

      allUsers.forEach((user: any) => {
        // Founders (superadmins) go to a special group shown first
        if (user.role === "superadmin") {
          founders.push(user);
        } else {
          const orgKey = user.organizationName || user.organizationId || "Unassigned";
          if (!grouped[orgKey]) {
            grouped[orgKey] = [];
          }
          grouped[orgKey].push(user);
        }
      });

      // Return structured data: founders first, then projects
      return res.json({
        founders,
        projects: Object.keys(grouped).sort().map(orgName => ({
          organizationName: orgName,
          organizationId: grouped[orgName][0]?.organizationId,
          users: grouped[orgName],
          userCount: grouped[orgName].length,
        })),
        totalUsers: allUsers.length,
      });
    } else if (userRole === "consultant") {
      // Consultant sees users from assigned customers only
      query = db.select({
        id: users.id,
        email: users.email,
        role: users.role,
        organizationId: users.organizationId,
        organizationName: users.organizationName,
        enabled: users.enabled,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      }).from(users).where(
        eq(users.organizationId, assignedCustomers.length > 0 ? assignedCustomers[0] : "")
      );
    } else if (userRole === "customer_admin") {
      // Customer admin sees users from their org only
      query = db.select({
        id: users.id,
        email: users.email,
        role: users.role,
        organizationId: users.organizationId,
        organizationName: users.organizationName,
        enabled: users.enabled,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.organizationId, userOrgId || ""));
    } else {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const allUsers = await (query as any);

    res.json({ users: allUsers, count: allUsers.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/users
 * Create a new user:
 * - Superadmin: Can create consultants, customer_admins, customer_users
 * - Consultant: Can create customer_admins and customer_users for assigned customers
 * - Customer Admin: Can create customer_users for their organization
 */
router.post("/", authenticateUser, async (req, res) => {
  try {
    const {
      email,
      role = "customer_user",
      organizationId,
      organizationName,
      environment = "dev", // Stage-specific: dev, test, staging, prod
      assignedCustomers, // Only for consultants
      maxCustomers, // Contract limit for consultants (number of end customers they can manage)
      bypassEmail = false, // Skip email sending and return API key directly
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Validate consultant limits
    if (role === "consultant") {
      if (!maxCustomers || maxCustomers < 1) {
        return res.status(400).json({ 
          error: "maxCustomers is required for consultants (must be >= 1)" 
        });
      }
      if (assignedCustomers && assignedCustomers.length > maxCustomers) {
        return res.status(400).json({ 
          error: `Cannot assign ${assignedCustomers.length} customers. Contract limit is ${maxCustomers}` 
        });
      }
    }

    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;

    // Permission checks
    if (userRole === "customer_admin") {
      // Customer admin can only create customer_users for their org
      if (role !== "customer_user" || organizationId !== userOrgId) {
        return res.status(403).json({
          error: "Customer Admins can only create Customer Users for their own organization",
        });
      }
    } else if (userRole === "consultant") {
      // Consultant can create users for assigned customers only
      const assignedCustomersList = req.user?.assignedCustomers || [];
      if (!assignedCustomersList.includes(organizationId)) {
        return res.status(403).json({
          error: "Consultants can only create users for their assigned customers",
        });
      }
      // Consultants cannot create other consultants
      if (role === "consultant" || role === "superadmin") {
        return res.status(403).json({
          error: "Consultants cannot create other Consultants or Superadmins",
        });
      }
    }
    // Superadmin has no restrictions

    // Check if user already exists
    const existing = await db.select().from(users)
      .where(eq(users.email, email))
      .get();

    if (existing) {
      return res.status(409).json({ error: "User already exists" });
    }

    // Generate stage-specific API key
    const stage = environment || "dev";
    const apiKey = `cb_${stage}_${randomUUID().replace(/-/g, "")}`;

    // Generate confirmation token (valid for 24 hours)
    const confirmationToken = randomUUID().replace(/-/g, "");
    const confirmationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const newUser = {
      id: randomUUID(),
      email,
      role: role as UserRole,
      apiKey,
      organizationId,
      organizationName,
      assignedCustomers: role === "consultant" ? assignedCustomers : null,
      enabled: true,
      passwordHash: null,  // No password - API key auth only
      lastLoginAt: null,
      emailConfirmed: false,  // Require email confirmation
      confirmationToken,
      confirmationTokenExpires: confirmationTokenExpires.toISOString(),
      metadata: {
        ...(role === "consultant" ? {
          maxCustomers: maxCustomers || 1,
          contractedCustomers: maxCustomers || 1,
        } : {}),
        environment: stage, // Track which stage this user belongs to
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.insert(users).values(newUser).run();

    // Send confirmation email (step 1) - unless bypassed
    if (!bypassEmail) {
      const { resendService } = await import("../notifications/resend-service.js");
      try {
        await resendService.sendAccountConfirmationEmail(
          email,
          organizationName || organizationId,
          role as UserRole,
          confirmationToken
        );
        console.log(`📧 Confirmation email sent to ${email}`);
      } catch (emailError: any) {
        console.warn(`Failed to send confirmation email: ${emailError.message}`);
        // Continue anyway - user created successfully
      }
    } else {
      console.log(`⚠️  Email sending bypassed for ${email}`);
    }

    res.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        organizationId: newUser.organizationId,
        assignedCustomers: newUser.assignedCustomers,
        environment: stage,
        emailConfirmed: bypassEmail, // Auto-confirm if email is bypassed
      },
      // Return API key if email is bypassed
      ...(bypassEmail && { apiKey }),
      message: bypassEmail 
        ? `User created for ${stage} environment. Email bypassed - use /onboarding to generate magic link.`
        : `User created for ${stage} environment. Confirmation email sent to ${email}.`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/users/confirm-email
 * Confirm user email and send account details (API key + magic link)
 */
router.post("/confirm-email", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Confirmation token is required" });
    }

    // Find user by confirmation token
    const userResult = await (db.select().from(users)
      .where(eq(users.confirmationToken, token)) as any);
    
    const user = userResult[0];

    if (!user) {
      return res.status(404).json({ error: "Invalid confirmation token" });
    }

    // Check if token is expired
    if (new Date(user.confirmationTokenExpires) < new Date()) {
      return res.status(400).json({ error: "Confirmation token has expired" });
    }

    // Check if already confirmed
    if (user.emailConfirmed) {
      return res.status(400).json({ error: "Email already confirmed" });
    }

    // Generate magic link token (valid for 7 days)
    const { magicLinks } = await import("../../db.js");
    const magicLinkToken = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await (db.insert(magicLinks).values({
      id: randomUUID(),
      token: magicLinkToken,
      email: user.email,
      used: false,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    }) as any);

    // Mark email as confirmed and clear confirmation token
    await (db.update(users)
      .set({
        emailConfirmed: true,
        confirmationToken: null as any,
        confirmationTokenExpires: null as any,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id)) as any);

    // Get environment from metadata
    const environment = (user.metadata as any)?.environment || "dev";
    const appUrl = process.env.APP_URL || `https://${process.env.APP_DOMAIN || "networkvoid.xyz"}`;
    const magicLink = `${appUrl}/auth/magic-link/${magicLinkToken}`;

    // Send account details email (step 2) with API key and magic link
    const { resendService } = await import("../notifications/resend-service.js");
    try {
      await resendService.sendAccountDetailsEmail(
        user.email,
        user.apiKey,
        magicLink,
        user.organizationName || user.organizationId,
        environment,
        user.role
      );
      console.log(`📧 Account details sent to ${user.email}`);
    } catch (emailError: any) {
      console.warn(`Failed to send account details email: ${emailError.message}`);
      // Continue anyway - email confirmed successfully
    }

    res.json({
      success: true,
      message: "Email confirmed successfully! Check your email for login credentials.",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/users/:id
 * Delete a contractor
 * 🔒 SUPERADMIN ONLY
 */
router.delete("/:id", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await db.select().from(users)
      .where(eq(users.id, id))
      .get();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Don't allow deleting other superadmins
    if (user.role === "superadmin") {
      return res.status(403).json({ error: "Cannot delete superadmin users" });
    }

    await db.delete(users).where(eq(users.id, id)).run();

    res.json({ success: true, message: "User deleted" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/users/:id/enable
 * Enable/disable a contractor
 * 🔒 SUPERADMIN ONLY
 */
router.patch("/:id/enable", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    await (db.update(users)
      .set({ enabled, updatedAt: new Date().toISOString() })
      .where(eq(users.id, id)) as any);

    res.json({ success: true, enabled });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/users/:id/promote-to-admin
 * Promote a customer user to customer_admin role (for production customers)
 * 🔒 SUPERADMIN or CONSULTANT (for their assigned customers)
 */
router.patch("/:id/promote-to-admin", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await (db.select().from(users)
      .where(eq(users.id, id)) as any);
    
    const userRecord = user[0];
    
    if (!userRecord) {
      return res.status(404).json({ error: "User not found" });
    }

    // Permission check: superadmin or consultant (for assigned customers)
    const requestorRole = req.user?.role;
    if (requestorRole === "consultant") {
      const assignedCustomers = req.user?.assignedCustomers || [];
      if (!assignedCustomers.includes(userRecord.organizationId)) {
        return res.status(403).json({ 
          error: "Consultants can only promote users in their assigned customers" 
        });
      }
    } else if (requestorRole !== "superadmin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // Only allow promotion of customer_user to customer_admin
    if (userRecord.role !== "customer_user") {
      return res.status(400).json({ 
        error: "Can only promote customer_user role. Current role: " + userRecord.role 
      });
    }

    // Promote to customer_admin
    await (db.update(users)
      .set({ 
        role: "customer_admin" as any,
        updatedAt: new Date().toISOString(),
        metadata: {
          ...(userRecord.metadata || {}),
          promotedAt: new Date().toISOString(),
          promotedBy: req.user?.email,
        } as any,
      })
      .where(eq(users.id, id)) as any);

    // Send notification email
    const { resendService } = await import("../notifications/resend-service.js");
    try {
      await resendService.sendRolePromotionEmail(
        userRecord.email,
        userRecord.organizationName || userRecord.organizationId,
        "customer_admin"
      );
      console.log(`📧 Role promotion notification sent to ${userRecord.email}`);
    } catch (emailError: any) {
      console.warn(`Failed to send promotion email: ${emailError.message}`);
    }

    res.json({
      success: true,
      message: `User promoted to Customer Admin. They can now manage their organization's users and resend API keys.`,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        role: "customer_admin",
        organizationName: userRecord.organizationName,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/users/:id/regenerate-api-key
 * Regenerate API key for a user and send via email
 * 🔒 SUPERADMIN, CONSULTANT (for their assigned customers), or CUSTOMER_ADMIN (for their org users)
 */
router.post("/:id/regenerate-api-key", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { environment } = req.body; // Optional: specify environment (dev/test/staging/prod)

    const user = await (db.select().from(users)
      .where(eq(users.id, id)) as any);
    
    const userRecord = user[0];
    
    if (!userRecord) {
      return res.status(404).json({ error: "User not found" });
    }

    // Permission check:
    // - Superadmin: can regenerate any key
    // - Consultant: can regenerate keys for assigned customers
    // - Customer Admin: can regenerate keys for their own organization teammates
    const requestorRole = req.user?.role;
    const requestorOrgId = req.user?.organizationId;
    
    if (requestorRole === "consultant") {
      const assignedCustomers = req.user?.assignedCustomers || [];
      if (!assignedCustomers.includes(userRecord.organizationId)) {
        return res.status(403).json({ 
          error: "Consultants can only regenerate API keys for their assigned customers" 
        });
      }
    } else if (requestorRole === "customer_admin") {
      // Customer admin can only regenerate keys for users in their own organization
      if (userRecord.organizationId !== requestorOrgId) {
        return res.status(403).json({ 
          error: "Customer Admins can only regenerate API keys for their own organization" 
        });
      }
    } else if (requestorRole !== "superadmin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // Generate new stage-specific API key
    const stage = environment || (userRecord.metadata as any)?.environment || "dev";
    const newApiKey = `cb_${stage}_${randomUUID().replace(/-/g, "")}`;

    // Update user record
    await (db.update(users)
      .set({ 
        apiKey: newApiKey, 
        updatedAt: new Date().toISOString(),
        metadata: {
          ...(userRecord.metadata || {}),
          environment: stage,
        } as any,
      })
      .where(eq(users.id, id)) as any);

    // Send new API key via email
    const { resendService } = await import("../notifications/resend-service.js");
    try {
      await resendService.sendAPIKeyEmail(
        userRecord.email,
        newApiKey,
        userRecord.organizationName || userRecord.organizationId,
        stage,
        userRecord.role as UserRole
      );
      console.log(`📧 New API key sent to ${userRecord.email} for ${stage} environment`);
    } catch (emailError: any) {
      console.warn(`Failed to send API key email: ${emailError.message}`);
      // Continue anyway - key regenerated successfully
    }

    res.json({
      success: true,
      apiKey: newApiKey,
      environment: stage,
      message: `API key regenerated for ${stage} environment. Sent to ${userRecord.email}.`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/users/me
 * Get current user info (contractors can check their own status)
 * 🔒 Requires authentication
 */
router.get("/me", authenticateUser, async (req, res) => {
  try {
    res.json({
      user: req.user,
      permissions: {
        canExport: req.user?.role === "superadmin",
        canManageUsers: ["superadmin", "consultant", "customer_admin"].includes(req.user?.role || ""),
        canBuildFlows: ["superadmin", "consultant", "customer_admin"].includes(req.user?.role || ""),
        canViewErrorDashboard: true, // All roles can view
        canEditErrorDashboard: ["superadmin", "consultant", "customer_admin"].includes(req.user?.role || ""),
        isReadOnly: req.user?.role === "customer_user",
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/users/transfer-ownership
 * Transfer ownership from admin@continuitybridge.local to a new email
 * Only allowed for the default admin account
 */
router.post("/transfer-ownership", authenticateUser, async (req, res) => {
  try {
    const { newEmail } = req.body;

    // Validate request
    if (!newEmail || !newEmail.includes("@")) {
      return res.status(400).json({ error: "Valid email address is required" });
    }

    // Only allow admin@continuitybridge.local to transfer
    if (req.user?.email !== "admin@continuitybridge.local" || req.user?.role !== "superadmin") {
      return res.status(403).json({ 
        error: "Only the default admin account can transfer ownership" 
      });
    }

    // Check if target email already exists
    const existingUserResult = await (db.select().from(users).where(eq(users.email, newEmail)) as any);
    const existingUser = Array.isArray(existingUserResult) ? existingUserResult[0] : existingUserResult;
    
    if (existingUser) {
      return res.status(409).json({ error: "Email address already in use" });
    }

    // Create new superadmin with the desired email
    const newApiKey = `cb_prod_${randomUUID().replace(/-/g, "")}`;
    const newUserId = randomUUID();

    const newUser = {
      id: newUserId,
      email: newEmail,
      role: "superadmin" as UserRole,
      apiKey: newApiKey,
      organizationId: req.user.organizationId,
      organizationName: req.user.organizationName,
      assignedCustomers: null,
      maxCustomers: null,
      passwordHash: null, // Magic link only
      enabled: true,
      emailConfirmed: true, // Auto-confirm
      confirmationToken: null,
      confirmationTokenExpires: null,
      lastLoginAt: null,
      metadata: {
        transferredFrom: "admin@continuitybridge.local",
        transferredAt: new Date().toISOString(),
        environment: "prod",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Insert new user
    await (db.insert(users).values(newUser) as any);

    // Disable the old admin account
    await (db.update(users)
      .set({ 
        enabled: false,
        updatedAt: new Date().toISOString(),
        metadata: {
          ...(req.user.metadata as any || {}),
          transferredTo: newEmail,
          transferredAt: new Date().toISOString(),
        }
      })
      .where(eq(users.id, req.user.id)) as any);

    console.log(`✅ Ownership transferred from admin@continuitybridge.local to ${newEmail}`);
    console.log(`🔑 New API Key: ${newApiKey}`);

    res.json({
      success: true,
      message: "Ownership transferred successfully",
      newEmail,
      newApiKey,
      note: "Use /onboarding page to generate magic link for the new email",
    });
  } catch (error: any) {
    console.error("Transfer ownership failed:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
