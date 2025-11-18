import { Router } from "express";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { db, flowDefinitions, interfaces, users } from "../../db.js";
import { eq } from "drizzle-orm";
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

    // Fetch flows for this organization
    const flowsResult = await (db.select()
      .from(flowDefinitions)
      .where(eq(flowDefinitions.systemInstanceId, organizationId)) as any);

    // Fetch interfaces for this organization  
    const interfacesResult = await (db.select()
      .from(interfaces) as any);

    res.json({
      flows: flowsResult || [],
      interfaces: interfacesResult || [],
      nodes: [], // TODO: Fetch custom nodes when plugin system is ready
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

    // Fetch actual file content for selected resources
    const files = new Map<string, Buffer>();
    const manifestFiles: Array<{
      type: "interface" | "flow" | "node" | "config";
      path: string;
      checksum: string;
      size: number;
    }> = [];

    // Fetch flows
    for (const fileId of fileIds) {
      const flowResult = await (db.select()
        .from(flowDefinitions)
        .where(eq(flowDefinitions.id, fileId))
        .limit(1) as any);

      if (flowResult && flowResult.length > 0) {
        const flow = flowResult[0];
        const flowContent = JSON.stringify(flow, null, 2);
        const buffer = Buffer.from(flowContent);
        
        const crypto = await import("crypto");
        const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
        
        const filePath = `flows/${flow.id}.json`;
        files.set(filePath, buffer);
        manifestFiles.push({
          type: "flow",
          path: filePath,
          checksum,
          size: buffer.length,
        });
      }
    }

    // TODO: Fetch interfaces, nodes similarly

    if (files.size === 0) {
      return res.status(400).json({ error: "No files found for selected IDs" });
    }

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
