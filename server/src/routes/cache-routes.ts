/**
 * Cache Management Routes
 * Admin endpoints for cache monitoring and management
 */

import { Router, type Request, type Response } from "express";
import { getCache } from "../cache/valkey-cache.js";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";

const router = Router();
const log = logger.child("CacheRoutes");

/**
 * GET /api/admin/cache/stats
 * Get cache statistics (admin only)
 */
router.get("/stats", authenticateUser, async (req: Request, res: Response) => {
  try {
    const cache = getCache();

    if (!cache.isReady()) {
      return res.json({
        enabled: false,
        message: "Cache is disabled or not connected",
      });
    }

    const stats = await cache.getStats();

    res.json({
      enabled: true,
      stats,
    });
  } catch (error: any) {
    log.error("Failed to get cache stats", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/cache/flush
 * Flush all cache entries (superadmin only)
 */
router.post("/flush", authenticateUser, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    if (user?.role !== "superadmin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const cache = getCache();

    if (!cache.isReady()) {
      return res.status(400).json({ error: "Cache is not enabled" });
    }

    await cache.flushAll();

    log.info("Cache flushed by admin", { userId: user.id, email: user.email });

    res.json({
      success: true,
      message: "Cache flushed successfully",
    });
  } catch (error: any) {
    log.error("Failed to flush cache", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/cache/key/:key
 * Delete specific cache key (superadmin only)
 */
router.delete("/key/:key", authenticateUser, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    if (user?.role !== "superadmin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const { key } = req.params;
    const cache = getCache();

    if (!cache.isReady()) {
      return res.status(400).json({ error: "Cache is not enabled" });
    }

    const deleted = await cache.del(key);

    res.json({
      success: true,
      deleted,
    });
  } catch (error: any) {
    log.error("Failed to delete cache key", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
