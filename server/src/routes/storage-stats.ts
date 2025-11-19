/**
 * Storage Statistics API (Founder Only)
 * 
 * Provides disk usage stats, file listings, and cleanup operations
 */

import { Router, Request, Response } from "express";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";
import * as fs from "fs/promises";
import * as path from "path";
import { db } from "../../db.js";
import { sql } from "drizzle-orm";

const router = Router();
const log = logger.child("StorageStats");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(process.cwd(), "storage", "deployments");
const DB_PATH = process.env.DATABASE_URL || path.join(process.cwd(), "data", "continuity.db");
const LOGS_PATH = path.join(process.cwd(), "logs");

const ONE_GB = 1024 * 1024 * 1024; // 1GB in bytes
const WARNING_THRESHOLD = ONE_GB * 0.8; // 800MB
const CRITICAL_THRESHOLD = ONE_GB * 0.95; // 950MB

/**
 * GET /api/admin/storage/stats
 * Get comprehensive storage statistics
 * 🔒 Superadmin only
 */
router.get("/stats", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    // Calculate total storage usage
    const deploymentSize = await getDirectorySize(STORAGE_PATH);
    const databaseSize = await getFileSize(DB_PATH);
    const logsSize = await getDirectorySize(LOGS_PATH);
    const tempSize = await getDirectorySize(path.join(process.cwd(), "tmp"));
    const backupSize = await getDirectorySize(path.join(process.cwd(), "backups"));

    const totalUsed = deploymentSize + databaseSize + logsSize + tempSize + backupSize;
    const totalAvailable = ONE_GB;
    const percentUsed = (totalUsed / totalAvailable) * 100;

    // Get large files (>10MB)
    const largeFiles = await findLargeFiles(STORAGE_PATH, 10 * 1024 * 1024);

    const stats = {
      total: totalAvailable,
      used: totalUsed,
      available: totalAvailable - totalUsed,
      percentUsed,
      breakdown: {
        deployments: deploymentSize,
        database: databaseSize,
        logs: logsSize,
        backups: backupSize,
        temp: tempSize,
      },
      files: largeFiles,
      threshold: {
        warning: WARNING_THRESHOLD,
        critical: CRITICAL_THRESHOLD,
      },
    };

    log.info("Storage stats retrieved", {
      userId: req.user?.id,
      totalUsed,
      percentUsed: percentUsed.toFixed(2),
    });

    res.json(stats);
  } catch (error: any) {
    log.error("Failed to get storage stats", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/storage/delete
 * Delete specific files/directories
 * 🔒 Superadmin only
 */
router.post("/delete", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const { paths } = req.body;

    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: "paths array required" });
    }

    let deletedCount = 0;
    let freedSpace = 0;

    for (const relativePath of paths) {
      // Security: prevent path traversal
      if (relativePath.includes("..") || relativePath.startsWith("/")) {
        continue;
      }

      const fullPath = path.join(STORAGE_PATH, relativePath);

      try {
        const stats = await fs.stat(fullPath);
        freedSpace += stats.size;

        await fs.rm(fullPath, { recursive: true, force: true });
        deletedCount++;

        log.info("File deleted", {
          userId: req.user?.id,
          path: relativePath,
          size: stats.size,
        });
      } catch (error: any) {
        log.warn("Failed to delete file", {
          path: relativePath,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      deletedCount,
      freedSpace,
    });
  } catch (error: any) {
    log.error("Delete operation failed", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/storage/cleanup
 * Auto-cleanup old files (>90 days for deployments, >30 days for logs)
 * 🔒 Superadmin only
 */
router.post("/cleanup", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    let filesDeleted = 0;
    let freedSpace = 0;

    const now = Date.now();
    const deploymentCutoff = 90 * 24 * 60 * 60 * 1000; // 90 days
    const logCutoff = 30 * 24 * 60 * 60 * 1000; // 30 days

    // Cleanup old deployments
    const deploymentFiles = await findOldFiles(STORAGE_PATH, deploymentCutoff);
    for (const file of deploymentFiles) {
      try {
        freedSpace += file.size;
        await fs.rm(file.path, { recursive: true, force: true });
        filesDeleted++;
      } catch (error: any) {
        log.warn("Failed to delete old deployment", {
          path: file.path,
          error: error.message,
        });
      }
    }

    // Cleanup old logs
    const logFiles = await findOldFiles(LOGS_PATH, logCutoff);
    for (const file of logFiles) {
      try {
        freedSpace += file.size;
        await fs.rm(file.path, { recursive: true, force: true });
        filesDeleted++;
      } catch (error: any) {
        log.warn("Failed to delete old log", {
          path: file.path,
          error: error.message,
        });
      }
    }

    log.info("Storage cleanup completed", {
      userId: req.user?.id,
      filesDeleted,
      freedSpace,
    });

    res.json({
      success: true,
      filesDeleted,
      freedSpace,
    });
  } catch (error: any) {
    log.error("Cleanup operation failed", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Helper: Calculate directory size recursively
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  try {
    await fs.access(dirPath);
  } catch {
    return 0; // Directory doesn't exist
  }

  let totalSize = 0;

  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(dirPath, file.name);

      if (file.isDirectory()) {
        totalSize += await getDirectorySize(filePath);
      } else {
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }
    }
  } catch (error: any) {
    log.warn("Failed to calculate directory size", {
      path: dirPath,
      error: error.message,
    });
  }

  return totalSize;
}

/**
 * Helper: Get file size
 */
async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Helper: Find files larger than minSize
 */
async function findLargeFiles(
  dirPath: string,
  minSize: number
): Promise<
  Array<{
    path: string;
    size: number;
    type: string;
    createdAt: string;
    organizationId?: string;
  }>
> {
  const largeFiles: Array<{
    path: string;
    size: number;
    type: string;
    createdAt: string;
    organizationId?: string;
  }> = [];

  try {
    await fs.access(dirPath);
  } catch {
    return largeFiles;
  }

  async function scan(currentPath: string) {
    const files = await fs.readdir(currentPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(currentPath, file.name);

      if (file.isDirectory()) {
        await scan(filePath);
      } else {
        const stats = await fs.stat(filePath);

        if (stats.size >= minSize) {
          const relativePath = path.relative(dirPath, filePath);
          const pathParts = relativePath.split(path.sep);
          const organizationId = pathParts[0] || undefined;

          largeFiles.push({
            path: relativePath,
            size: stats.size,
            type: getFileType(filePath),
            createdAt: stats.birthtime.toISOString(),
            organizationId,
          });
        }
      }
    }
  }

  try {
    await scan(dirPath);
  } catch (error: any) {
    log.warn("Failed to scan for large files", {
      path: dirPath,
      error: error.message,
    });
  }

  // Sort by size (largest first)
  return largeFiles.sort((a, b) => b.size - a.size);
}

/**
 * Helper: Find files older than cutoff
 */
async function findOldFiles(
  dirPath: string,
  cutoffMs: number
): Promise<Array<{ path: string; size: number }>> {
  const oldFiles: Array<{ path: string; size: number }> = [];

  try {
    await fs.access(dirPath);
  } catch {
    return oldFiles;
  }

  const now = Date.now();

  async function scan(currentPath: string) {
    const files = await fs.readdir(currentPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(currentPath, file.name);

      if (file.isDirectory()) {
        await scan(filePath);
      } else {
        const stats = await fs.stat(filePath);
        const age = now - stats.birthtimeMs;

        if (age > cutoffMs) {
          oldFiles.push({
            path: filePath,
            size: stats.size,
          });
        }
      }
    }
  }

  try {
    await scan(dirPath);
  } catch (error: any) {
    log.warn("Failed to scan for old files", {
      path: dirPath,
      error: error.message,
    });
  }

  return oldFiles;
}

/**
 * Helper: Determine file type from extension
 */
function getFileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  const types: Record<string, string> = {
    ".json": "JSON",
    ".yml": "YAML",
    ".yaml": "YAML",
    ".sql": "SQL",
    ".log": "Log",
    ".db": "Database",
    ".tar": "Archive",
    ".gz": "Archive",
    ".zip": "Archive",
    ".env": "Config",
    ".sh": "Script",
    ".ps1": "Script",
  };

  return types[ext] || "File";
}

export default router;
