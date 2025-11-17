import { Router, Request, Response } from "express";
import { db } from "../../db";
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

    // TODO: Send email notification to superadmin

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

export default router;
