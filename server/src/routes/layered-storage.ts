/**
 * Layered Storage API
 * 
 * Endpoints for managing BASE + CUSTOM layer inheritance/override system
 * 
 * 🔒 Access Control:
 * - Merge operations: Consultant, Superadmin, Customer Admin
 * - Rework review: Consultant, Superadmin
 * - Runtime access: All authenticated users
 */

import { Router, Request, Response } from "express";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";
import { LayeredStorageService } from "../services/layered-storage-service.js";

const router = Router();
const log = logger.child("LayeredStorageAPI");

/**
 * POST /api/layered-storage/merge
 * Merge BASE + CUSTOM layers into RUNTIME
 * 
 * 🔒 Consultant, Superadmin, Customer Admin
 */
router.post("/merge", authenticateUser, async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    if (
      userRole !== "superadmin" &&
      userRole !== "consultant" &&
      userRole !== "customer_admin"
    ) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const {
      organizationId = req.user?.organizationId,
      deploymentProfile = "standard",
      baseVersion = "1.0.0",
      createSnapshot = true,
    } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: "organizationId required" });
    }

    log.info("Merging deployment layers", {
      organizationId,
      deploymentProfile,
      baseVersion,
      createSnapshot,
      userId: req.user?.id,
    });

    const service = new LayeredStorageService({
      organizationId,
      deploymentProfile,
      baseVersion,
      createSnapshot,
    });

    const result = await service.mergeLayersToRuntime();

    // Send alerts if there are failed files
    if (result.filesFailed > 0) {
      log.warn("Files failed validation during merge", {
        organizationId,
        filesFailed: result.filesFailed,
        failedFiles: result.failedFiles,
      });

      // TODO: Trigger notification to consultant
      // await notificationService.alertConsultant({
      //   organizationId,
      //   subject: "Deployment files require rework",
      //   filesCount: result.filesFailed,
      //   files: result.failedFiles,
      // });
    }

    res.json({
      success: result.success,
      message: "Layer merge completed",
      result: {
        runtimePath: result.runtimePath,
        runtimeVersion: result.runtimeVersion,
        baseVersion: result.baseVersion,
        snapshotPath: result.snapshotPath,
        summary: {
          filesProcessed: result.filesProcessed,
          filesFromBase: result.filesFromBase,
          filesFromCustom: result.filesFromCustom,
          filesOverridden: result.filesOverridden,
          filesFailed: result.filesFailed,
        },
        failedFiles: result.failedFiles,
        warnings: result.warnings,
      },
    });
  } catch (error: any) {
    log.error("Layer merge failed", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/layered-storage/rework/:organizationId
 * List files requiring consultant rework
 * 
 * 🔒 Consultant, Superadmin
 */
router.get("/rework/:organizationId", authenticateUser, async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== "superadmin" && userRole !== "consultant") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { organizationId } = req.params;
    const { deploymentProfile = "standard" } = req.query;

    const service = new LayeredStorageService({
      organizationId,
      deploymentProfile: deploymentProfile as any,
    });

    const reworkFiles = await service.listReworkFiles();

    res.json({
      organizationId,
      reworkFilesCount: reworkFiles.length,
      files: reworkFiles,
    });
  } catch (error: any) {
    log.error("Failed to list rework files", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/layered-storage/runtime/:organizationId
 * Get runtime package path
 * 
 * 🔒 All authenticated users
 */
router.get("/runtime/:organizationId", authenticateUser, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { deploymentProfile = "standard" } = req.query;

    // Authorization check
    if (
      req.user?.role !== "superadmin" &&
      req.user?.organizationId !== organizationId
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    const service = new LayeredStorageService({
      organizationId,
      deploymentProfile: deploymentProfile as any,
    });

    const runtimePath = await service.getRuntimePackage();

    res.json({
      organizationId,
      deploymentProfile,
      runtimePath,
      downloadUrl: `/api/deployments/download/${encodeURIComponent(
        `${organizationId}/runtime`
      )}`,
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    log.error("Failed to get runtime package", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/layered-storage/status/:organizationId
 * Get layered storage status and statistics
 * 
 * 🔒 All authenticated users (own org)
 */
router.get("/status/:organizationId", authenticateUser, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { deploymentProfile = "standard" } = req.query;

    // Authorization check
    if (
      req.user?.role !== "superadmin" &&
      req.user?.organizationId !== organizationId
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    const service = new LayeredStorageService({
      organizationId,
      deploymentProfile: deploymentProfile as any,
    });

    // Check if runtime exists
    let runtimeExists = false;
    let runtimeManifest: any = null;
    
    try {
      const runtimePath = await service.getRuntimePackage();
      runtimeExists = true;

      // Try to read manifest
      const fs = await import("fs/promises");
      const path = await import("path");
      const manifestPath = path.join(runtimePath, "RUNTIME_MANIFEST.json");
      
      try {
        const manifestContent = await fs.readFile(manifestPath, "utf-8");
        runtimeManifest = JSON.parse(manifestContent);
      } catch {
        // Manifest doesn't exist
      }
    } catch {
      // Runtime doesn't exist
    }

    // Get rework files
    const reworkFiles = await service.listReworkFiles();

    res.json({
      organizationId,
      deploymentProfile,
      runtimeExists,
      runtimeManifest,
      reworkFilesCount: reworkFiles.length,
      reworkFiles: reworkFiles.slice(0, 10), // First 10 files
      needsAttention: reworkFiles.length > 0,
    });
  } catch (error: any) {
    log.error("Failed to get layered storage status", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/layered-storage/snapshots/:organizationId
 * List all runtime snapshots (version history)
 * 
 * 🔒 All authenticated users (own org)
 */
router.get("/snapshots/:organizationId", authenticateUser, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { deploymentProfile = "standard" } = req.query;

    // Authorization check
    if (
      req.user?.role !== "superadmin" &&
      req.user?.organizationId !== organizationId
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    const service = new LayeredStorageService({
      organizationId,
      deploymentProfile: deploymentProfile as any,
    });

    const snapshots = await service.listRuntimeSnapshots();

    res.json({
      organizationId,
      deploymentProfile,
      snapshotsCount: snapshots.length,
      snapshots: snapshots.map((s) => ({
        version: s.version,
        baseVersion: s.baseVersion,
        customIncrement: s.customIncrement,
        createdAt: s.createdAt,
        downloadUrl: `/api/deployments/download/${encodeURIComponent(
          `${organizationId}/snapshots/${s.version}`
        )}`,
      })),
    });
  } catch (error: any) {
    log.error("Failed to list snapshots", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
