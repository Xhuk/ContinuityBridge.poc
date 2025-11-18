import { Router } from "express";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { offlineUpdatePackage } from "../updates/offline-update-package.js";
import { logger } from "../core/logger.js";
import * as fs from "fs/promises";

const log = logger.child("PackageBuilder");
const router = Router();

/**
 * GET /api/package/available-resources
 * Get resources available for packaging (flows, interfaces, nodes)
 * Scoped to specific organization
 */
router.get("/available-resources", authenticateUser, async (req, res) => {
  try {
    // Only superadmin can build packages
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Forbidden: Superadmin only" });
    }

    const organizationId = req.query.organizationId as string;
    
    if (!organizationId) {
      return res.status(400).json({ error: "organizationId required" });
    }

    // TODO: Integrate with actual flow/interface storage when implemented
    // For now, return empty arrays - this will be populated when
    // flow_definitions and interfaces tables are added to schema
    
    res.json({
      flows: [],
      interfaces: [],
      nodes: [],
    });
  } catch (error: any) {
    log.error("Failed to fetch available resources", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/package/build
 * Build signed .cbupdate package
 */
router.post("/build", authenticateUser, async (req, res) => {
  try {
    // Only superadmin can build packages
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Forbidden: Superadmin only" });
    }

    const {
      organizationId,
      packageId,
      version,
      updateType,
      description,
      changelog,
      fileIds,
    } = req.body;

    if (!organizationId || !packageId || !version || !fileIds?.length) {
      return res.status(400).json({ 
        error: "Missing required fields: organizationId, packageId, version, fileIds" 
      });
    }

    log.info("Building update package", {
      organizationId,
      packageId,
      version,
      fileCount: fileIds.length,
    });

    // TODO: Fetch actual file content for selected resources
    // This will be implemented when flow_definitions and interfaces tables
    // are added to the schema. For now, create a placeholder package.
    
    const files = new Map<string, Buffer>();
    const manifestFiles: Array<{
      type: "interface" | "flow" | "node" | "config";
      path: string;
      checksum: string;
      size: number;
    }> = [];

    // Create a placeholder file for the package
    const placeholderContent = JSON.stringify({
      message: "Package builder placeholder",
      organizationId,
      fileIds,
      createdAt: new Date().toISOString(),
    }, null, 2);
    
    const buffer = Buffer.from(placeholderContent);
    const crypto = await import("crypto");
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    
    const filePath = "config/package-info.json";
    files.set(filePath, buffer);
    manifestFiles.push({
      type: "config",
      path: filePath,
      checksum,
      size: buffer.length,
    });

    // Create package manifest
    const manifest = {
      packageId,
      version,
      releaseDate: new Date().toISOString(),
      updateType,
      minSystemVersion: "1.0.0",
      files: manifestFiles,
      description,
      changelog,
      author: req.user?.email || "founder",
    };

    // Build signed package
    const privateKeyPath = process.env.FOUNDER_PRIVATE_KEY_PATH || "./keys/private_key.pem";
    
    const packageBuffer = await offlineUpdatePackage.createPackage(
      manifest,
      files,
      privateKeyPath
    );

    log.info("Package built successfully", {
      packageId,
      version,
      size: packageBuffer.length,
    });

    // Send as downloadable file
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${packageId}-${version}.cbupdate"`);
    res.send(packageBuffer);
  } catch (error: any) {
    log.error("Failed to build package", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
