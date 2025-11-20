import { Router, type Request, Response } from "express";
import { db } from "../../db.js";
import { tenants, ecosystems, environments, users } from "../../db";
import { eq, inArray } from "drizzle-orm";
import { authenticateUser, requireRole } from "../auth/rbac-middleware.js";
import { generateSessionToken } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";

const log = logger.child("ConsultantRoutes");

const router = Router();

/**
 * GET /api/consultant/tenants
 * Get list of tenants/environments consultant has access to
 */
router.get("/tenants", authenticateUser, requireRole("consultant"), async (req: Request, res: Response) => {
  try {
    const consultantId = req.user!.id;
    
    // Get consultant's assigned customers from user record
    const consultant = await db
      .select()
      .from(users)
      .where(eq(users.id, consultantId))
      .get();

    if (!consultant || !consultant.assignedCustomers) {
      return res.json([]);
    }

    const assignedTenantIds = consultant.assignedCustomers as string[];

    // Fetch tenants and their environments
    const tenantList = await db
      .select({
        tenantId: tenants.id,
        tenantName: tenants.displayName,
        ecosystemId: ecosystems.id,
        envId: environments.id,
        envName: environments.name,
      })
      .from(tenants)
      .innerJoin(ecosystems, eq(ecosystems.tenantId, tenants.id))
      .innerJoin(environments, eq(environments.ecosystemId, ecosystems.id))
      .where(inArray(tenants.id, assignedTenantIds))
      .all();

    // Format response with instance names
    const response = tenantList.map((item) => ({
      tenantId: item.tenantId,
      tenantName: item.tenantName,
      environment: item.envName as "dev" | "test" | "staging" | "prod",
      instanceName: `${item.tenantName}-${item.envName}`,
      hasAccess: true,
    }));

    res.json(response);
  } catch (error: any) {
    console.error("Error fetching consultant tenants:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/consultant/select-tenant
 * Select which tenant/environment to work with
 */
router.post("/select-tenant", authenticateUser, requireRole("consultant"), async (req: Request, res: Response) => {
  try {
    const { tenantId, environment } = req.body;

    if (!tenantId || !environment) {
      return res.status(400).json({ error: "Tenant ID and environment are required" });
    }

    // Verify consultant has access to this tenant
    const consultant = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user!.id))
      .get();

    if (!consultant || !consultant.assignedCustomers) {
      return res.status(403).json({ error: "You don't have access to any tenants" });
    }

    const assignedTenantIds = consultant.assignedCustomers as string[];
    if (!assignedTenantIds.includes(tenantId)) {
      return res.status(403).json({ error: "You don't have access to this tenant" });
    }

    // Capture previous tenant selection for audit log
    const previousTenant = req.user!.selectedTenant;
    const previousTenantId = previousTenant?.tenantId || null;
    const previousEnvironment = previousTenant?.environment || null;

    // Audit log: Tenant switch
    log.info("Consultant tenant switch", {
      userId: req.user!.id,
      userEmail: req.user!.email,
      from: previousTenantId ? `${previousTenantId}/${previousEnvironment}` : "none",
      to: `${tenantId}/${environment}`,
      previousTenantId,
      previousEnvironment,
      newTenantId: tenantId,
      newEnvironment: environment,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    // Generate new session token with tenant selection
    const newToken = generateSessionToken({
      id: req.user!.id,
      email: req.user!.email,
      role: req.user!.role,
      organizationId: tenantId,
      assignedCustomers: assignedTenantIds,
      selectedTenant: {
        tenantId,
        environment,
      },
    }, "7d");

    // Set cookie with new token
    res.cookie("session", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ success: true, tenantId, environment });
  } catch (error: any) {
    console.error("Error selecting tenant:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
