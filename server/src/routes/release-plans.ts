import { Router, Request, Response } from "express";
import { db } from "../../db";
import { releasePlans, configurationVersions } from "../../schema";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { authenticateUser } from "../auth/rbac-middleware";
import { logger } from "../core/logger";

const router = Router();

/**
 * GET /api/release-plans
 * List all release plans (superadmin sees all, contractors see own org)
 */
router.get("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const isSuperadmin = req.user?.role === "superadmin";
    const { organizationId, status } = req.query;

    let query = (db.select() as any).from(releasePlans);

    // Filter by organization
    if (!isSuperadmin) {
      query = query.where(eq(releasePlans.organizationId, req.user?.organizationId || ""));
    } else if (organizationId) {
      query = query.where(eq(releasePlans.organizationId, organizationId as string));
    }

    // Filter by status
    if (status) {
      query = query.where(eq(releasePlans.overallStatus, status as string));
    }

    const plans = await query.orderBy(desc(releasePlans.createdAt)).all();

    res.json({
      success: true,
      releasePlans: plans,
      count: plans.length,
    });
  } catch (error: any) {
    logger.error("Failed to list release plans", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/release-plans/:id
 * Get specific release plan details
 */
router.get("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const plan = await (db.select() as any)
      .from(releasePlans)
      .where(eq(releasePlans.id, req.params.id))
      .get();

    if (!plan) {
      return res.status(404).json({ error: "Release plan not found" });
    }

    // Authorization: superadmin or same org
    if (req.user?.role !== "superadmin" && plan.organizationId !== req.user?.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json(plan);
  } catch (error: any) {
    logger.error("Failed to get release plan", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/release-plans
 * Create new release plan
 * 🔒 Superadmin only (contractors can view, not create)
 */
router.post("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required to create release plans" });
    }

    const {
      organizationId,
      organizationName,
      releaseName,
      releaseType,
      devSchedule,
      stagingSchedule,
      prodSchedule,
      projectManager,
      technicalLead,
      businessOwner,
      riskLevel = "medium",
      risks = [],
    } = req.body;

    if (!organizationId || !organizationName || !releaseName || !releaseType) {
      return res.status(400).json({
        error: "Missing required fields: organizationId, organizationName, releaseName, releaseType",
      });
    }

    const planId = randomUUID();

    await (db.insert(releasePlans) as any).values({
      id: planId,
      organizationId,
      organizationName,
      releaseName,
      releaseType,
      devSchedule,
      stagingSchedule,
      prodSchedule,
      overallStatus: "planning",
      projectManager,
      technicalLead,
      businessOwner,
      riskLevel,
      risks,
      createdBy: req.user?.id || "",
      createdByEmail: req.user?.email || "",
    }).run();

    logger.info("Release plan created", {
      scope: "superadmin",
      organizationId,
      userId: req.user?.id,
      releasePlanId: planId,
      releaseName,
    });

    res.status(201).json({
      success: true,
      message: "Release plan created",
      releasePlan: {
        id: planId,
        releaseName,
        overallStatus: "planning",
      },
    });
  } catch (error: any) {
    logger.error("Failed to create release plan", error, {
      scope: "superadmin",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/release-plans/:id
 * Update release plan
 * 🔒 Superadmin only
 */
router.put("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const plan = await (db.select() as any)
      .from(releasePlans)
      .where(eq(releasePlans.id, req.params.id))
      .get();

    if (!plan) {
      return res.status(404).json({ error: "Release plan not found" });
    }

    const {
      releaseName,
      releaseType,
      devSchedule,
      stagingSchedule,
      prodSchedule,
      overallStatus,
      devVersionId,
      stagingVersionId,
      prodVersionId,
      projectManager,
      technicalLead,
      businessOwner,
      riskLevel,
      risks,
    } = req.body;

    await (db.update(releasePlans) as any)
      .set({
        ...(releaseName && { releaseName }),
        ...(releaseType && { releaseType }),
        ...(devSchedule && { devSchedule }),
        ...(stagingSchedule && { stagingSchedule }),
        ...(prodSchedule && { prodSchedule }),
        ...(overallStatus && { overallStatus }),
        ...(devVersionId !== undefined && { devVersionId }),
        ...(stagingVersionId !== undefined && { stagingVersionId }),
        ...(prodVersionId !== undefined && { prodVersionId }),
        ...(projectManager !== undefined && { projectManager }),
        ...(technicalLead !== undefined && { technicalLead }),
        ...(businessOwner !== undefined && { businessOwner }),
        ...(riskLevel && { riskLevel }),
        ...(risks && { risks }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(releasePlans.id, req.params.id))
      .run();

    logger.info("Release plan updated", {
      scope: "superadmin",
      organizationId: plan.organizationId,
      userId: req.user?.id,
      releasePlanId: plan.id,
    });

    res.json({
      success: true,
      message: "Release plan updated",
    });
  } catch (error: any) {
    logger.error("Failed to update release plan", error, {
      scope: "superadmin",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/release-plans/:id
 * Delete release plan
 * 🔒 Superadmin only
 */
router.delete("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const plan = await (db.select() as any)
      .from(releasePlans)
      .where(eq(releasePlans.id, req.params.id))
      .get();

    if (!plan) {
      return res.status(404).json({ error: "Release plan not found" });
    }

    await (db.delete(releasePlans) as any)
      .where(eq(releasePlans.id, req.params.id))
      .run();

    logger.info("Release plan deleted", {
      scope: "superadmin",
      organizationId: plan.organizationId,
      userId: req.user?.id,
      releasePlanId: plan.id,
    });

    res.json({
      success: true,
      message: "Release plan deleted",
    });
  } catch (error: any) {
    logger.error("Failed to delete release plan", error, {
      scope: "superadmin",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/release-plans/:id/timeline
 * Get release timeline with dates across all environments
 */
router.get("/:id/timeline", authenticateUser, async (req: Request, res: Response) => {
  try {
    const plan = await (db.select() as any)
      .from(releasePlans)
      .where(eq(releasePlans.id, req.params.id))
      .get();

    if (!plan) {
      return res.status(404).json({ error: "Release plan not found" });
    }

    // Authorization check
    if (req.user?.role !== "superadmin" && plan.organizationId !== req.user?.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Build timeline
    const timeline = [
      {
        environment: "dev",
        label: "DEV",
        ...plan.devSchedule,
      },
      {
        environment: "staging",
        label: "STAGING (UAT)",
        ...plan.stagingSchedule,
      },
      {
        environment: "prod",
        label: "PRODUCTION (Go-Live)",
        ...plan.prodSchedule,
      },
    ];

    res.json({
      success: true,
      releaseName: plan.releaseName,
      overallStatus: plan.overallStatus,
      timeline,
    });
  } catch (error: any) {
    logger.error("Failed to get release timeline", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

export default router;
