import { Router, Request, Response } from "express";
import { db } from "../../db";
import { integrationNotes } from "../../schema";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { authenticateUser } from "../auth/rbac-middleware";
import { logger } from "../core/logger";

const router = Router();

/**
 * GET /api/integration-notes
 * List all integration notes (filtered by org and visibility)
 */
router.get("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const isSuperadmin = req.user?.role === "superadmin";
    const { organizationId, category, tags, isPinned } = req.query;

    let query = (db.select() as any).from(integrationNotes);

    // Filter by organization
    if (!isSuperadmin) {
      // Contractors see only their org notes (public + their own private)
      query = query.where(
        and(
          eq(integrationNotes.organizationId, req.user?.organizationId || ""),
          // Show public notes OR notes created by this user
          // SQL: (isPublic = true OR authorId = userId)
        )
      );
    } else if (organizationId) {
      query = query.where(eq(integrationNotes.organizationId, organizationId as string));
    }

    // Filter by category
    if (category) {
      query = query.where(eq(integrationNotes.category, category as string));
    }

    // Filter by pinned
    if (isPinned === "true") {
      query = query.where(eq(integrationNotes.isPinned, true));
    }

    const notes = await query.orderBy(
      desc(integrationNotes.isPinned), // Pinned first
      desc(integrationNotes.createdAt)
    ).all();

    // Filter by tags in-memory (if needed)
    let filteredNotes = notes;
    if (tags) {
      const tagList = (tags as string).split(",");
      filteredNotes = notes.filter((note: any) =>
        note.tags?.some((t: string) => tagList.includes(t))
      );
    }

    res.json({
      success: true,
      notes: filteredNotes,
      count: filteredNotes.length,
    });
  } catch (error: any) {
    logger.error("Failed to list integration notes", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/integration-notes/:id
 * Get specific note details
 */
router.get("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const note = await (db.select() as any)
      .from(integrationNotes)
      .where(eq(integrationNotes.id, req.params.id))
      .get();

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    // Authorization: superadmin, same org, or public note
    const hasAccess =
      req.user?.role === "superadmin" ||
      note.organizationId === req.user?.organizationId ||
      note.isPublic;

    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json(note);
  } catch (error: any) {
    logger.error("Failed to get integration note", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/integration-notes
 * Create new integration note (any authenticated user)
 */
router.post("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const {
      title,
      category,
      content,
      relatedReleasePlanId,
      relatedVersionId,
      relatedFlowId,
      relatedInterfaceId,
      tags = [],
      isPublic = false,
      isPinned = false,
    } = req.body;

    if (!title || !category || !content) {
      return res.status(400).json({
        error: "Missing required fields: title, category, content",
      });
    }

    const organizationId = req.user?.organizationId;
    const organizationName = req.user?.organizationName || "Unknown";

    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    const noteId = randomUUID();

    await (db.insert(integrationNotes) as any).values({
      id: noteId,
      organizationId,
      organizationName,
      title,
      category,
      content,
      relatedReleasePlanId,
      relatedVersionId,
      relatedFlowId,
      relatedInterfaceId,
      tags,
      isPublic,
      isPinned: req.user?.role === "superadmin" ? isPinned : false, // Only superadmin can pin
      authorId: req.user?.id || "",
      authorEmail: req.user?.email || "",
      authorRole: req.user?.role,
    }).run();

    logger.info("Integration note created", {
      scope: "customer",
      organizationId,
      userId: req.user?.id,
      noteId,
      title,
      category,
    });

    res.status(201).json({
      success: true,
      message: "Integration note created",
      note: {
        id: noteId,
        title,
        category,
      },
    });
  } catch (error: any) {
    logger.error("Failed to create integration note", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/integration-notes/:id
 * Update integration note (author or superadmin)
 */
router.put("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const note = await (db.select() as any)
      .from(integrationNotes)
      .where(eq(integrationNotes.id, req.params.id))
      .get();

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    // Authorization: author or superadmin
    if (req.user?.role !== "superadmin" && note.authorId !== req.user?.id) {
      return res.status(403).json({ error: "Only note author or superadmin can update" });
    }

    const {
      title,
      category,
      content,
      relatedReleasePlanId,
      relatedVersionId,
      relatedFlowId,
      relatedInterfaceId,
      tags,
      isPublic,
      isPinned,
    } = req.body;

    await (db.update(integrationNotes) as any)
      .set({
        ...(title && { title }),
        ...(category && { category }),
        ...(content && { content }),
        ...(relatedReleasePlanId !== undefined && { relatedReleasePlanId }),
        ...(relatedVersionId !== undefined && { relatedVersionId }),
        ...(relatedFlowId !== undefined && { relatedFlowId }),
        ...(relatedInterfaceId !== undefined && { relatedInterfaceId }),
        ...(tags && { tags }),
        ...(isPublic !== undefined && { isPublic }),
        ...(isPinned !== undefined && req.user?.role === "superadmin" && { isPinned }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(integrationNotes.id, req.params.id))
      .run();

    logger.info("Integration note updated", {
      scope: "customer",
      organizationId: note.organizationId,
      userId: req.user?.id,
      noteId: note.id,
    });

    res.json({
      success: true,
      message: "Integration note updated",
    });
  } catch (error: any) {
    logger.error("Failed to update integration note", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/integration-notes/:id
 * Delete integration note (author or superadmin)
 */
router.delete("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const note = await (db.select() as any)
      .from(integrationNotes)
      .where(eq(integrationNotes.id, req.params.id))
      .get();

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    // Authorization: author or superadmin
    if (req.user?.role !== "superadmin" && note.authorId !== req.user?.id) {
      return res.status(403).json({ error: "Only note author or superadmin can delete" });
    }

    await (db.delete(integrationNotes) as any)
      .where(eq(integrationNotes.id, req.params.id))
      .run();

    logger.info("Integration note deleted", {
      scope: "customer",
      organizationId: note.organizationId,
      userId: req.user?.id,
      noteId: note.id,
    });

    res.json({
      success: true,
      message: "Integration note deleted",
    });
  } catch (error: any) {
    logger.error("Failed to delete integration note", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

export default router;
