/**
 * Binary Release API
 * 
 * Founder UI: Generate customer-specific binaries
 * POST /api/releases/binary → Download standalone executable
 */

import { Router } from "express";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";
import { binaryBuildQueue } from "../queues/binary-build-queue.js";
import fs from "fs/promises";
import path from "path";
import archiver from "archiver";

const router = Router();
const log = logger.child("BinaryReleaseAPI");

/**
 * POST /api/releases/binary
 * Queue customer-specific binary build (async)
 * 🔒 Superadmin only
 */
router.post("/binary", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;
    const userEmail = (req as any).user?.email;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const {
      organizationId,
      organizationName,
      licenseType = "professional",
      platforms = ["linux", "windows"],
      version = "1.0.0",
    } = req.body;

    if (!organizationId || !organizationName) {
      return res.status(400).json({
        error: "Missing required fields: organizationId, organizationName",
      });
    }

    log.info("Queueing binary build", {
      organizationId,
      organizationName,
      platforms,
    });

    // Add to queue (async)
    const job = await binaryBuildQueue.add({
      organizationId,
      organizationName,
      licenseType,
      platforms,
      version,
      requestedBy: userEmail || "unknown",
    });

    log.info("Binary build queued", {
      jobId: job.id,
      organizationId,
    });

    res.json({
      success: true,
      jobId: job.id,
      status: "queued",
      estimatedTime: "10-15 minutes",
      statusUrl: `/api/releases/binary/${job.id}/status`,
      downloadUrl: `/api/releases/binary/${job.id}/download`,
    });
  } catch (error: any) {
    log.error("Failed to queue binary build", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/releases/binary/:jobId/status
 * Check binary build status
 */
router.get("/binary/:jobId/status", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const job = await binaryBuildQueue.getJob(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const state = await job.getState();
    const progress = job.progress();

    res.json({
      jobId: job.id,
      status: state,
      progress: progress || 0,
      data: job.data,
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      finishedAt: job.finishedOn,
      downloadUrl: state === "completed" ? `/api/releases/binary/${job.id}/download` : null,
    });
  } catch (error: any) {
    log.error("Failed to get job status", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/releases/binary/:jobId/download
 * Download completed binary package
 */
router.get("/binary/:jobId/download", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const job = await binaryBuildQueue.getJob(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const state = await job.getState();

    if (state !== "completed") {
      return res.status(400).json({
        error: "Build not complete",
        status: state,
        progress: job.progress(),
      });
    }

    const result = job.returnvalue;
    const { organizationId, organizationName, licenseType, version } = job.data;

    // Create deployment package
    const binariesDir = path.join(process.cwd(), "dist", "binaries");
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    // Set response headers
    const filename = `continuitybridge-binary-${organizationId}-${version}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Pipe archive to response
    archive.pipe(res);

    // Add binaries
    for (const binary of result.binaries) {
      archive.file(binary.path, { name: `bin/${binary.filename}` });
    }

    // Add .env template
    const envTemplate = `# ContinuityBridge Configuration
# Organization: ${organizationName}

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/continuitybridge

# Server
PORT=5000
NODE_ENV=production

# License (embedded in binary)
ORGANIZATION_ID=${organizationId}
LICENSE_TYPE=${licenseType}

# Optional: Valkey
VALKEY_ENABLED=false
# VALKEY_URL=valkey://localhost:6379
`;

    archive.append(envTemplate, { name: ".env.example" });

    // Add README
    const readme = `# ContinuityBridge Binary Deployment

Organization: ${organizationName}
Version: ${version}
License: ${licenseType}

## Installation

### Linux:
1. Extract: unzip ${filename}
2. Make executable: chmod +x bin/continuitybridge-*-linux-x64
3. Configure: cp .env.example .env && nano .env
4. Run: ./bin/continuitybridge-${organizationId}-linux-x64

### Windows:
1. Extract package
2. Copy .env.example to .env and edit
3. Run: bin\\continuitybridge-${organizationId}-win-x64.exe

## Support: support@continuitybridge.com
`;

    archive.append(readme, { name: "README.txt" });

    // Finalize
    await archive.finalize();

    log.info("Binary package downloaded", {
      jobId: job.id,
      organizationId,
      filename,
    });
  } catch (error: any) {
    log.error("Failed to download binary package", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/releases/binary/platforms
 * Get available platforms for binary builds
 */
router.get("/binary/platforms", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const platforms = [
      {
        id: "windows",
        name: "Windows",
        arch: "x64",
        extension: ".exe",
        size: "~80MB",
      },
      {
        id: "linux",
        name: "Linux",
        arch: "x64",
        extension: "",
        size: "~80MB",
      },
      {
        id: "macos",
        name: "macOS",
        arch: "x64",
        extension: "",
        size: "~80MB",
      },
    ];

    res.json(platforms);
  } catch (error: any) {
    log.error("Failed to get platforms", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
