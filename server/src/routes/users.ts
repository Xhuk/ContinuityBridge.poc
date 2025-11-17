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

    // Send API key via email using Resend
    const { resendService } = await import("../notifications/resend-service.js");
    try {
      await resendService.sendAPIKeyEmail(
        email,
        apiKey,
        organizationName || organizationId,
        stage,
        role as UserRole
      );
      console.log(`📧 API key sent to ${email} via Resend for ${stage} environment`);
    } catch (emailError: any) {
      console.warn(`Failed to send API key email: ${emailError.message}`);
      // Continue anyway - user created successfully
    }

    res.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        apiKey: newUser.apiKey,  // Show once during creation
        organizationId: newUser.organizationId,
        assignedCustomers: newUser.assignedCustomers,
        environment: stage,
      },
      message: `User created for ${stage} environment. API key sent to ${email}.`,
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

    await db.update(users)
      .set({ enabled, updatedAt: new Date().toISOString() })
      .where(eq(users.id, id))
      .run();

    res.json({ success: true, enabled });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/users/:id/regenerate-api-key
 * Regenerate API key for a user and send via email
 * 🔒 SUPERADMIN or CONSULTANT (for their assigned customers)
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

    // Permission check: superadmin can regenerate any key, consultant only for assigned customers
    const requestorRole = req.user?.role;
    if (requestorRole === "consultant") {
      const assignedCustomers = req.user?.assignedCustomers || [];
      if (!assignedCustomers.includes(userRecord.organizationId)) {
        return res.status(403).json({ 
          error: "Consultants can only regenerate API keys for their assigned customers" 
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

export default router;
