/**
 * Deployment Download Routes
 * Serves deployment packages from local storage
 */

import { Router, Request, Response } from "express";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";
import * as fs from "fs/promises";
import * as path from "path";

const router = Router();
const log = logger.child("DeploymentDownload");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(process.cwd(), "storage", "deployments");

/**
 * GET /api/deployments/download/:path
 * Download deployment package or individual file
 * 🔒 Authenticated users only
 */
router.get("/download/*", authenticateUser, async (req: Request, res: Response) => {
  try {
    const requestedPath = req.params[0]; // Everything after /download/
    
    if (!requestedPath) {
      return res.status(400).json({ error: "Path required" });
    }

    // Decode and sanitize path
    const decodedPath = decodeURIComponent(requestedPath);
    
    // Security: prevent path traversal
    if (decodedPath.includes("..") || decodedPath.startsWith("/")) {
      log.warn("Path traversal attempt detected", {
        userId: req.user?.id,
        requestedPath: decodedPath,
      });
      return res.status(403).json({ error: "Invalid path" });
    }

    const fullPath = path.join(STORAGE_PATH, decodedPath);

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({ error: "File not found" });
    }

    // Get file stats
    const stats = await fs.stat(fullPath);

    // If it's a directory, return list of files
    if (stats.isDirectory()) {
      const files = await fs.readdir(fullPath);
      const fileDetails = await Promise.all(
        files.map(async (fileName) => {
          const filePath = path.join(fullPath, fileName);
          const fileStats = await fs.stat(filePath);
          return {
            name: fileName,
            size: fileStats.size,
            isDirectory: fileStats.isDirectory(),
            modified: fileStats.mtime,
          };
        })
      );

      return res.json({
        path: decodedPath,
        files: fileDetails,
      });
    }

    // Serve the file
    const fileName = path.basename(fullPath);
    const contentType = getContentType(fileName);

    log.info("Serving deployment file", {
      userId: req.user?.id,
      path: decodedPath,
      size: stats.size,
    });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", stats.size);

    const fileStream = await fs.readFile(fullPath);
    res.send(fileStream);
  } catch (error: any) {
    log.error("Download failed", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/deployments/list/:organizationId
 * List all deployments for an organization
 * 🔒 Authenticated users (own org only, unless superadmin)
 */
router.get("/list/:organizationId", authenticateUser, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    // Authorization: users can only see their own org deployments
    if (req.user?.role !== "superadmin" && req.user?.organizationId !== organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const orgPath = path.join(STORAGE_PATH, organizationId);

    // Check if org directory exists
    try {
      await fs.access(orgPath);
    } catch {
      return res.json({ deployments: [] });
    }

    const deployments: any[] = [];

    // List profiles
    const profiles = await fs.readdir(orgPath);

    for (const profile of profiles) {
      const profilePath = path.join(orgPath, profile);
      const stats = await fs.stat(profilePath);

      if (!stats.isDirectory()) continue;

      // List versions
      const versions = await fs.readdir(profilePath);

      for (const version of versions) {
        const versionPath = path.join(profilePath, version);
        const versionStats = await fs.stat(versionPath);

        if (!versionStats.isDirectory()) continue;

        // Read manifest if exists
        let manifest = null;
        try {
          const manifestPath = path.join(versionPath, "manifest.json");
          const manifestContent = await fs.readFile(manifestPath, "utf-8");
          manifest = JSON.parse(manifestContent);
        } catch {
          // No manifest
        }

        const relativePath = path.relative(STORAGE_PATH, versionPath);

        deployments.push({
          path: relativePath,
          profile,
          version,
          createdAt: versionStats.birthtime,
          manifest,
          downloadUrl: `/api/deployments/download/${encodeURIComponent(relativePath)}`,
        });
      }
    }

    // Sort by creation date (newest first)
    deployments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ deployments });
  } catch (error: any) {
    log.error("List deployments failed", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Helper: Get content type from file extension
 */
function getContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();

  const contentTypes: Record<string, string> = {
    ".json": "application/json",
    ".yml": "text/yaml",
    ".yaml": "text/yaml",
    ".sh": "application/x-sh",
    ".ps1": "text/plain",
    ".env": "text/plain",
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".sql": "text/plain",
    ".js": "application/javascript",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
  };

  return contentTypes[ext] || "application/octet-stream";
}

export default router;
