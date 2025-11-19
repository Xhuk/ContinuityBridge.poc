/**
 * Cluster Configuration Routes
 * 
 * Access Control:
 * - View/Edit Cluster Config: Superadmin, Consultant, Customer Admin only
 * - Generate deployment files: Same as above
 */

import { Router, type Request, type Response } from "express";
import { logger } from "../core/logger.js";
import {
  getClusterConfig,
  upsertClusterConfig,
  deleteClusterConfig,
  generateClusterFiles,
  getAllClusterConfigs,
} from "../services/cluster-config-service.js";

const router = Router();
const log = logger.child("ClusterConfigRoutes");

// ============================================================================
// Helper: Check if user can manage cluster configuration
// ============================================================================

function canManageClusterConfig(user: any): boolean {
  const allowedRoles = ["superadmin", "consultant", "customer_admin"];
  return allowedRoles.includes(user?.role);
}

// ============================================================================
// GET /api/cluster/config - Get cluster configuration
// ============================================================================

router.get("/config", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Check permissions
    if (!canManageClusterConfig(user)) {
      return res.status(403).json({
        error: "Access denied",
        message: "Only superadmin, consultant, and customer admin can view cluster configuration",
      });
    }

    // Get organization ID from user
    const organizationId = user.organizationId || user.id;

    const config = getClusterConfig(organizationId);

    res.json(config);
  } catch (error: any) {
    log.error("Failed to get cluster configuration", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PUT /api/cluster/config - Update cluster configuration
// ============================================================================

router.put("/config", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Check permissions
    if (!canManageClusterConfig(user)) {
      return res.status(403).json({
        error: "Access denied",
        message: "Only superadmin, consultant, and customer admin can update cluster configuration",
      });
    }

    // Get organization ID from user
    const organizationId = user.organizationId || user.id;

    // Validate request body
    const updates = req.body;
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({
        error: "Invalid request",
        message: "Request body must be a valid configuration object",
      });
    }

    // Update configuration
    const config = upsertClusterConfig(organizationId, updates);

    log.info("Cluster configuration updated", {
      organizationId,
      updatedBy: user.email,
      enabled: config.enabled,
    });

    res.json(config);
  } catch (error: any) {
    log.error("Failed to update cluster configuration", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DELETE /api/cluster/config - Delete cluster configuration
// ============================================================================

router.delete("/config", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Check permissions (only superadmin can delete)
    if (user.role !== "superadmin") {
      return res.status(403).json({
        error: "Access denied",
        message: "Only superadmin can delete cluster configuration",
      });
    }

    // Get organization ID from user
    const organizationId = user.organizationId || user.id;

    const deleted = deleteClusterConfig(organizationId);

    if (!deleted) {
      return res.status(404).json({
        error: "Not found",
        message: "Cluster configuration not found",
      });
    }

    log.warn("Cluster configuration deleted", {
      organizationId,
      deletedBy: user.email,
    });

    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to delete cluster configuration", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// POST /api/cluster/generate-files - Generate deployment files
// ============================================================================

router.post("/generate-files", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Check permissions
    if (!canManageClusterConfig(user)) {
      return res.status(403).json({
        error: "Access denied",
        message: "Only superadmin, consultant, and customer admin can generate deployment files",
      });
    }

    // Get configuration from request body or from stored config
    const organizationId = user.organizationId || user.id;
    let config = req.body;

    if (!config || Object.keys(config).length === 0) {
      // Use stored configuration
      config = getClusterConfig(organizationId);
    }

    if (!config.enabled) {
      return res.status(400).json({
        error: "Cluster mode not enabled",
        message: "Enable cluster mode before generating deployment files",
      });
    }

    // Generate files
    const result = await generateClusterFiles(config);

    log.info("Cluster deployment files generated", {
      organizationId,
      generatedBy: user.email,
      files: result.files,
    });

    res.json(result);
  } catch (error: any) {
    log.error("Failed to generate cluster deployment files", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// GET /api/cluster/all - Get all cluster configurations (superadmin only)
// ============================================================================

router.get("/all", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Check permissions (superadmin only)
    if (user.role !== "superadmin") {
      return res.status(403).json({
        error: "Access denied",
        message: "Only superadmin can view all cluster configurations",
      });
    }

    const configs = getAllClusterConfigs();

    res.json(configs);
  } catch (error: any) {
    log.error("Failed to get all cluster configurations", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
