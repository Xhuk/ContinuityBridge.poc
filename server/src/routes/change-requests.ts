import { Router, Request, Response } from "express";
import { db, customerLicense, pricingCatalog } from "../../db";
import { changeRequests, configurationVersions } from "../../schema";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { authenticateUser } from "../auth/rbac-middleware";
import { logger } from "../core/logger";

const router = Router();

/**
 * GET /api/change-requests
 * List all change requests (filtered by organization for contractors)
 */
router.get("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const isSuperadmin = req.user?.role === "superadmin";
    const { status, organizationId } = req.query;

    let query = (db.select() as any).from(changeRequests);

    // Filter by organization (unless superadmin)
    if (!isSuperadmin) {
      query = query.where(eq(changeRequests.organizationId, req.user?.organizationId || ""));
    } else if (organizationId) {
      query = query.where(eq(changeRequests.organizationId, organizationId as string));
    }

    // Filter by status
    if (status) {
      query = query.where(eq(changeRequests.status, status as string));
    }

    const requests = await query.orderBy(desc(changeRequests.createdAt)).all();

    res.json({
      success: true,
      changeRequests: requests,
      count: requests.length,
    });
  } catch (error: any) {
    logger.error("Failed to list change requests", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/change-requests/:id
 * Get specific change request details
 */
router.get("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const request = await (db.select() as any)
      .from(changeRequests)
      .where(eq(changeRequests.id, req.params.id))
      .get();

    if (!request) {
      return res.status(404).json({ error: "Change request not found" });
    }

    // Authorization: superadmin or same org
    if (req.user?.role !== "superadmin" && request.organizationId !== req.user?.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json(request);
  } catch (error: any) {
    logger.error("Failed to get change request", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/change-requests
 * Contractor creates change request (e.g., remap SKU, update flow)
 */
router.post("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      requestType,
      proposedChanges,
      impactLevel = "medium",
      affectedFlows = [],
      testingNotes,
      priority = "normal",
      dueDate,
    } = req.body;

    if (!title || !description || !requestType || !proposedChanges) {
      return res.status(400).json({
        error: "Missing required fields: title, description, requestType, proposedChanges",
      });
    }

    const organizationId = req.user?.organizationId;
    const organizationName = req.user?.organizationName;

    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    const requestId = randomUUID();

    await (db.insert(changeRequests) as any).values({
      id: requestId,
      organizationId,
      organizationName: organizationName || "Unknown",
      title,
      description,
      requestType,
      proposedChanges,
      impactLevel,
      affectedFlows,
      testingNotes,
      status: "pending",
      priority,
      dueDate,
      requestedBy: req.user?.id || "",
      requestedByEmail: req.user?.email || "",
    }).run();

    logger.info("Change request created", {
      scope: "customer",
      organizationId,
      userId: req.user?.id,
      changeRequestId: requestId,
      title,
    });

    // Send notification to founder/sales team
    if (requestType === "sow_amendment" || requestType === "license_upgrade") {
      logger.info("SOW/License change request - notify sales team", {
        scope: "superadmin",
        organizationId,
        requestType,
      });
      // Email notification handled by sales team notification system
    }

    res.status(201).json({
      success: true,
      message: "Change request submitted for review",
      changeRequest: {
        id: requestId,
        title,
        status: "pending",
      },
    });
  } catch (error: any) {
    logger.error("Failed to create change request", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/change-requests/:id
 * Update change request (draft only, before approval)
 */
router.put("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const request = await (db.select() as any)
      .from(changeRequests)
      .where(eq(changeRequests.id, req.params.id))
      .get();

    if (!request) {
      return res.status(404).json({ error: "Change request not found" });
    }

    // Authorization check
    if (req.user?.role !== "superadmin" && request.organizationId !== req.user?.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Can only update pending requests
    if (request.status !== "pending") {
      return res.status(400).json({ error: `Cannot update ${request.status} request` });
    }

    const {
      title,
      description,
      proposedChanges,
      impactLevel,
      affectedFlows,
      testingNotes,
      priority,
    } = req.body;

    await (db.update(changeRequests) as any)
      .set({
        ...(title && { title }),
        ...(description && { description }),
        ...(proposedChanges && { proposedChanges }),
        ...(impactLevel && { impactLevel }),
        ...(affectedFlows && { affectedFlows }),
        ...(testingNotes && { testingNotes }),
        ...(priority && { priority }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(changeRequests.id, req.params.id))
      .run();

    logger.info("Change request updated", {
      scope: "customer",
      organizationId: request.organizationId,
      userId: req.user?.id,
      changeRequestId: request.id,
    });

    res.json({
      success: true,
      message: "Change request updated",
    });
  } catch (error: any) {
    logger.error("Failed to update change request", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/change-requests/:id/approve
 * Superadmin approves change request and creates new version
 * 🔒 Superadmin only
 */
router.post("/:id/approve", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const { reviewNotes } = req.body;

    const request = await (db.select() as any)
      .from(changeRequests)
      .where(eq(changeRequests.id, req.params.id))
      .get();

    if (!request) {
      return res.status(404).json({ error: "Change request not found" });
    }

    if (request.status !== "pending" && request.status !== "reviewing") {
      return res.status(400).json({ error: `Cannot approve ${request.status} request` });
    }

    // Update change request status
    await (db.update(changeRequests) as any)
      .set({
        status: "approved",
        reviewNotes,
        reviewedBy: req.user?.id,
        reviewedByEmail: req.user?.email,
        reviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(changeRequests.id, req.params.id))
      .run();

    logger.info("Change request approved by superadmin", {
      scope: "superadmin",
      organizationId: request.organizationId,
      userId: req.user?.id,
      changeRequestId: request.id,
    });

    // TODO: Automatically create new version with changes (implement in next iteration)

    res.json({
      success: true,
      message: "Change request approved. Ready to create version.",
    });
  } catch (error: any) {
    logger.error("Failed to approve change request", error, {
      scope: "superadmin",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/change-requests/:id/reject
 * Superadmin rejects change request
 * 🔒 Superadmin only
 */
router.post("/:id/reject", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const { reviewNotes } = req.body;

    if (!reviewNotes) {
      return res.status(400).json({ error: "Review notes required for rejection" });
    }

    const request = await (db.select() as any)
      .from(changeRequests)
      .where(eq(changeRequests.id, req.params.id))
      .get();

    if (!request) {
      return res.status(404).json({ error: "Change request not found" });
    }

    await (db.update(changeRequests) as any)
      .set({
        status: "rejected",
        reviewNotes,
        reviewedBy: req.user?.id,
        reviewedByEmail: req.user?.email,
        reviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(changeRequests.id, req.params.id))
      .run();

    logger.warn("Change request rejected by superadmin", {
      scope: "superadmin",
      organizationId: request.organizationId,
      userId: req.user?.id,
      changeRequestId: request.id,
      reason: reviewNotes,
    });

    // TODO: Send email notification to contractor

    res.json({
      success: true,
      message: "Change request rejected",
    });
  } catch (error: any) {
    logger.error("Failed to reject change request", error, {
      scope: "superadmin",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/change-requests/:id
 * Delete change request (pending only)
 */
router.delete("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const request = await (db.select() as any)
      .from(changeRequests)
      .where(eq(changeRequests.id, req.params.id))
      .get();

    if (!request) {
      return res.status(404).json({ error: "Change request not found" });
    }

    // Authorization check
    if (req.user?.role !== "superadmin" && request.organizationId !== req.user?.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Can only delete pending requests
    if (request.status !== "pending") {
      return res.status(400).json({ error: `Cannot delete ${request.status} request` });
    }

    await (db.delete(changeRequests) as any)
      .where(eq(changeRequests.id, req.params.id))
      .run();

    logger.info("Change request deleted", {
      scope: "customer",
      organizationId: request.organizationId,
      userId: req.user?.id,
      changeRequestId: request.id,
    });

    res.json({
      success: true,
      message: "Change request deleted",
    });
  } catch (error: any) {
    logger.error("Failed to delete change request", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/change-requests/sow/suggest
 * Generate AI suggestions for SOW amendment request
 * Customer Admin requests SOW changes, AI analyzes and suggests optimal plan
 */
router.post("/sow/suggest", authenticateUser, async (req: Request, res: Response) => {
  try {
    const {
      requestedInterfaces,
      requestedSystems,
      businessJustification,
    } = req.body;

    if (!requestedInterfaces && !requestedSystems) {
      return res.status(400).json({
        error: "Must request at least interfaces or systems change",
      });
    }

    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    // Fetch current license
    const licenses = await (db.select().from(customerLicense)
      .where(eq(customerLicense.organizationId, organizationId)) as any);
    
    const currentLicense = licenses[0];

    if (!currentLicense) {
      return res.status(404).json({ error: "No license found for organization" });
    }

    const currentInterfaces = currentLicense.limits?.maxInterfaces || 0;
    const currentSystems = currentLicense.limits?.maxSystems || 0;
    const currentLicenseType = currentLicense.licenseType || "trial";

    // Fetch pricing catalog from database
    const pricingTiers = await (db.select().from(pricingCatalog)
      .where(eq(pricingCatalog.isActive, true)) as any);

    if (!pricingTiers || pricingTiers.length === 0) {
      return res.status(500).json({ 
        error: "Pricing catalog not configured. Founder must seed pricing tiers first." 
      });
    }

    // Find current tier
    let currentTier = pricingTiers.find((t: any) => t.tierName === currentLicenseType) || pricingTiers[0];
    
    // Determine recommended tier based on requested resources
    let recommendedTier = currentTier;
    for (const tier of pricingTiers) {
      if (requestedInterfaces <= tier.maxInterfaces && requestedSystems <= tier.maxSystems) {
        recommendedTier = tier;
        break;
      }
    }

    // Calculate current cost (monthly in cents)
    const currentInterfaceCost = currentInterfaces * (currentTier.extraInterfacePrice || 10000);
    const currentSystemCost = currentSystems * (currentTier.extraSystemPrice || 20000);
    const currentMonthlyCost = (currentTier.monthlyPrice + currentInterfaceCost + currentSystemCost) / 100;

    // Calculate new cost (monthly in cents)
    const newInterfaceCost = requestedInterfaces * (recommendedTier.extraInterfacePrice || 10000);
    const newSystemCost = requestedSystems * (recommendedTier.extraSystemPrice || 20000);
    const newMonthlyCost = (recommendedTier.monthlyPrice + newInterfaceCost + newSystemCost) / 100;

    const costIncrease = newMonthlyCost - currentMonthlyCost;

    // AI analysis
    const aiSuggestions = {
      recommendedPlan: recommendedTier.displayName,
      costOptimization: costIncrease > 1000 
        ? `Consider ${recommendedTier.displayName} plan for better per-unit pricing`
        : `${recommendedTier.displayName} plan is cost-effective for your needs`,
      alternativeOptions: [
        requestedInterfaces > currentInterfaces 
          ? `Add ${requestedInterfaces - currentInterfaces} interfaces (+$${((requestedInterfaces - currentInterfaces) * (recommendedTier.extraInterfacePrice / 100))}/mo)`
          : null,
        requestedSystems > currentSystems
          ? `Add ${requestedSystems - currentSystems} systems (+$${((requestedSystems - currentSystems) * (recommendedTier.extraSystemPrice / 100))}/mo)`
          : null,
        `Save 15% with annual billing: $${Math.round(newMonthlyCost * 12 * 0.85)}/year`,
      ].filter(Boolean),
      confidence: 0.85,
    };

    res.json({
      success: true,
      currentState: {
        licenseType: currentLicenseType,
        tierName: currentTier.tierName,
        displayName: currentTier.displayName,
        interfaces: currentInterfaces,
        systems: currentSystems,
        monthlyCost: currentMonthlyCost,
      },
      requestedState: {
        recommendedTier: recommendedTier.tierName,
        recommendedDisplayName: recommendedTier.displayName,
        interfaces: requestedInterfaces,
        systems: requestedSystems,
        estimatedMonthlyCost: newMonthlyCost,
        costIncrease,
      },
      aiSuggestions,
      availableTiers: pricingTiers.map((t: any) => ({
        tierName: t.tierName,
        displayName: t.displayName,
        monthlyPrice: t.monthlyPrice / 100,
        maxInterfaces: t.maxInterfaces,
        maxSystems: t.maxSystems,
      })),
    });
  } catch (error: any) {
    logger.error("Failed to generate SOW suggestions", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/change-requests/:id/approve-sow
 * Superadmin approves SOW amendment and updates license
 * 🔒 Superadmin only
 */
router.post("/:id/approve-sow", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const { reviewNotes } = req.body;

    const request = await (db.select() as any)
      .from(changeRequests)
      .where(eq(changeRequests.id, req.params.id))
      .get();

    if (!request) {
      return res.status(404).json({ error: "Change request not found" });
    }

    if (request.requestType !== "sow_amendment") {
      return res.status(400).json({ error: "Not a SOW amendment request" });
    }

    // Extract SOW changes from proposedChanges
    const sowChanges = request.proposedChanges?.[0]?.sowChanges;

    if (!sowChanges) {
      return res.status(400).json({ error: "Invalid SOW amendment data" });
    }

    // Update license
    await (db.update(customerLicense) as any)
      .set({
        limits: {
          maxFlows: 999999,
          maxDataSources: 999999,
          maxInterfaces: sowChanges.requestedInterfaces,
          maxSystems: sowChanges.requestedSystems,
          maxUsers: 999999,
          maxExecutionsPerMonth: 999999999,
        },
        licenseType: sowChanges.requestedLicenseType || sowChanges.currentLicenseType,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customerLicense.organizationId, request.organizationId))
      .run();

    // Update change request status
    await (db.update(changeRequests) as any)
      .set({
        status: "approved",
        reviewNotes,
        reviewedBy: req.user?.id,
        reviewedByEmail: req.user?.email,
        reviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(changeRequests.id, req.params.id))
      .run();

    logger.info("SOW amendment approved and license updated", {
      scope: "superadmin",
      organizationId: request.organizationId,
      userId: req.user?.id,
      changeRequestId: request.id,
      newInterfaces: sowChanges.requestedInterfaces,
      newSystems: sowChanges.requestedSystems,
    });

    res.json({
      success: true,
      message: "SOW amendment approved. License updated.",
      updatedLimits: {
        maxInterfaces: sowChanges.requestedInterfaces,
        maxSystems: sowChanges.requestedSystems,
      },
    });
  } catch (error: any) {
    logger.error("Failed to approve SOW amendment", error, {
      scope: "superadmin",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

export default router;
