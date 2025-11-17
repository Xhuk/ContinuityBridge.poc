import { Router } from "express";
import { db } from "../../db.js";
import { systemLogs, logConfigurations } from "../../schema.js";
import { desc, eq, and, gte, lte, like, or } from "drizzle-orm";
import { authenticateUser, requireSuperAdmin } from "../auth/rbac-middleware.js";
import { randomUUID } from "crypto";

const router = Router();

/**
 * GET /api/logs
 * Query system logs with filtering
 * 🔒 Superadmin sees all, Customers see only their logs
 */
router.get("/", authenticateUser, async (req, res) => {
  try {
    const {
      level,
      scope,
      service,
      flowId,
      traceId,
      organizationId,
      startDate,
      endDate,
      search,
      limit = "100",
      offset = "0",
    } = req.query;

    // Build query conditions
    const conditions: any[] = [];

    // Scope-based access control
    if (req.user?.role === "superadmin") {
      // Superadmin can filter by scope or see all
      if (scope) {
        conditions.push(eq(systemLogs.scope, scope as string));
      }
    } else {
      // Customers only see their own logs
      conditions.push(eq(systemLogs.scope, "customer"));
      conditions.push(eq(systemLogs.organizationId, req.user?.organizationId || ""));
    }

    if (level) {
      conditions.push(eq(systemLogs.level, level as string));
    }

    if (service) {
      conditions.push(eq(systemLogs.service, service as string));
    }

    if (flowId) {
      conditions.push(eq(systemLogs.flowId, flowId as string));
    }

    if (traceId) {
      conditions.push(eq(systemLogs.traceId, traceId as string));
    }

    // Superadmin can filter by any organizationId, customers already filtered
    if (organizationId && req.user?.role === "superadmin") {
      conditions.push(eq(systemLogs.organizationId, organizationId as string));
    }

    if (startDate) {
      conditions.push(gte(systemLogs.timestamp, startDate as string));
    }

    if (endDate) {
      conditions.push(lte(systemLogs.timestamp, endDate as string));
    }

    if (search) {
      conditions.push(
        or(
          like(systemLogs.message, `%${search}%`),
          like(systemLogs.component, `%${search}%`)
        )
      );
    }

    // Query logs
    let query = (db.select() as any).from(systemLogs);

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const logs = await query
      .orderBy(desc(systemLogs.timestamp))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string))
      .all();

    // Get total count (for pagination)
    let countQuery = (db.select({ count: systemLogs.id }) as any).from(systemLogs);
    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions));
    }
    const countResult = await countQuery.all();
    const total = countResult.length;

    res.json({
      logs,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: total > parseInt(offset as string) + parseInt(limit as string),
      },
    });
  } catch (error: any) {
    console.error("[LogsAPI] Query failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/logs/stats
 * Get log statistics
 * 🔒 SUPERADMIN ONLY
 */
router.get("/stats", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const conditions: any[] = [];

    if (startDate) {
      conditions.push(gte(systemLogs.timestamp, startDate as string));
    }

    if (endDate) {
      conditions.push(lte(systemLogs.timestamp, endDate as string));
    }

    // Query all logs matching filters
    let query = (db.select() as any).from(systemLogs);
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    const logs = await query.all();

    // Calculate stats
    const stats = {
      total: logs.length,
      byLevel: {
        debug: logs.filter((l: any) => l.level === "debug").length,
        info: logs.filter((l: any) => l.level === "info").length,
        warn: logs.filter((l: any) => l.level === "warn").length,
        error: logs.filter((l: any) => l.level === "error").length,
      },
      byService: {} as Record<string, number>,
      recentErrors: logs
        .filter((l: any) => l.level === "error")
        .slice(0, 10)
        .map((l: any) => ({
          timestamp: l.timestamp,
          service: l.service,
          message: l.message,
          traceId: l.traceId,
        })),
    };

    // Count by service
    logs.forEach((log: any) => {
      const service = log.service || "Unknown";
      stats.byService[service] = (stats.byService[service] || 0) + 1;
    });

    res.json(stats);
  } catch (error: any) {
    console.error("[LogsAPI] Stats failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/logs/:id
 * Get single log entry with full details
 * 🔒 SUPERADMIN ONLY
 */
router.get("/:id", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const log = await (db.select() as any)
      .from(systemLogs)
      .where(eq(systemLogs.id, id))
      .get();

    if (!log) {
      return res.status(404).json({ error: "Log not found" });
    }

    res.json({ log });
  } catch (error: any) {
    console.error("[LogsAPI] Get log failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/logs
 * Clear old logs (housekeeping)
 * 🔒 SUPERADMIN ONLY
 */
router.delete("/", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { olderThan } = req.query;

    if (!olderThan) {
      return res.status(400).json({ error: "olderThan parameter required (ISO date)" });
    }

    const result = await (db.delete(systemLogs) as any)
      .where(lte(systemLogs.timestamp, olderThan as string))
      .run();

    res.json({
      success: true,
      message: `Deleted logs older than ${olderThan}`,
      deleted: result.changes || 0,
    });
  } catch (error: any) {
    console.error("[LogsAPI] Delete logs failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/logs/services
 * Get list of all services (for filtering)
 * 🔒 SUPERADMIN ONLY
 */
router.get("/services/list", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const logs = await (db.select({ service: systemLogs.service }) as any)
      .from(systemLogs)
      .groupBy(systemLogs.service)
      .all();

    const services = [...new Set(logs.map((l: any) => l.service))].filter(Boolean);

    res.json({ services });
  } catch (error: any) {
    console.error("[LogsAPI] Get services failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/logs/config
 * Get log configuration for current user's scope
 * 🔒 Authenticated users
 */
router.get("/config", authenticateUser, async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === "superadmin";
    const organizationId = req.user?.organizationId;

    let config;

    if (isSuperadmin) {
      // Get superadmin config
      config = await (db.select() as any)
        .from(logConfigurations)
        .where(eq(logConfigurations.scope, "superadmin"))
        .get();
    } else {
      // Get customer config
      config = await (db.select() as any)
        .from(logConfigurations)
        .where(
          and(
            eq(logConfigurations.scope, "customer"),
            eq(logConfigurations.organizationId, organizationId || "")
          )
        )
        .get();
    }

    res.json({ config: config || null });
  } catch (error: any) {
    console.error("[LogsAPI] Get config failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/logs/config
 * Update log configuration
 * 🔒 Superadmin for global config, Customers for their own config
 */
router.put("/config", authenticateUser, async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === "superadmin";
    const organizationId = req.user?.organizationId;
    const { scope: requestedScope, ...configData } = req.body;

    // Validate scope access
    const scope = isSuperadmin && requestedScope === "superadmin" ? "superadmin" : "customer";

    if (scope === "customer" && !organizationId) {
      return res.status(400).json({ error: "Organization ID required for customer config" });
    }

    // Check if config exists
    let existing;
    if (scope === "superadmin") {
      existing = await (db.select() as any)
        .from(logConfigurations)
        .where(eq(logConfigurations.scope, "superadmin"))
        .get();
    } else {
      existing = await (db.select() as any)
        .from(logConfigurations)
        .where(
          and(
            eq(logConfigurations.scope, "customer"),
            eq(logConfigurations.organizationId, organizationId || "")
          )
        )
        .get();
    }

    const configUpdate = {
      ...configData,
      scope,
      organizationId: scope === "customer" ? organizationId : null,
      updatedAt: new Date().toISOString(),
    };

    let result;
    if (existing) {
      // Update
      result = await (db.update(logConfigurations) as any)
        .set(configUpdate)
        .where(eq(logConfigurations.id, existing.id))
        .run();
    } else {
      // Insert
      result = await (db.insert(logConfigurations) as any)
        .values({
          id: randomUUID(),
          ...configUpdate,
          createdAt: new Date().toISOString(),
        })
        .run();
    }

    // Reload logger configurations
    const { logger } = await import("../core/logger.js");
    await logger.reloadConfigurations();

    res.json({ success: true, message: "Log configuration updated" });
  } catch (error: any) {
    console.error("[LogsAPI] Update config failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/logs/cleanup/trigger
 * Manually trigger log cleanup job
 * 🔒 SUPERADMIN ONLY
 */
router.post("/cleanup/trigger", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { getLogCleanupJob } = await import("../core/log-cleanup-job.js");
    const cleanupJob = getLogCleanupJob();
    
    const result = await cleanupJob.triggerManualCleanup();
    
    res.json({
      success: result.success,
      message: result.success ? "Log cleanup completed" : "Log cleanup failed",
      deleted: result.deleted,
    });
  } catch (error: any) {
    console.error("[LogsAPI] Manual cleanup failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/logs/cleanup/status
 * Get log cleanup job status
 * 🔒 SUPERADMIN ONLY
 */
router.get("/cleanup/status", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { getLogCleanupJob } = await import("../core/log-cleanup-job.js");
    const cleanupJob = getLogCleanupJob();
    
    const status = cleanupJob.getStatus();
    
    res.json({
      ...status,
      message: status.running ? "Cleanup job is running" : "Cleanup job is stopped",
    });
  } catch (error: any) {
    console.error("[LogsAPI] Get cleanup status failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/logs/files
 * List all log files from the logs directory
 * 🔒 SUPERADMIN ONLY
 */
router.get("/files", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    
    const logsDir = path.join(process.cwd(), "logs");
    
    // Ensure logs directory exists
    try {
      await fs.access(logsDir);
    } catch {
      return res.json({ files: [] });
    }
    
    // Read all files recursively from superadmin and customer directories
    const files: any[] = [];
    
    const readDirectory = async (dir: string, prefix: string = "") => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
          // Recursively read subdirectories
          await readDirectory(fullPath, relativePath);
        } else if (entry.isFile() && (entry.name.endsWith(".log") || entry.name.endsWith(".json"))) {
          const stats = await fs.stat(fullPath);
          files.push({
            name: relativePath,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            path: fullPath,
          });
        }
      }
    };
    
    await readDirectory(logsDir);
    
    // Sort by modified date (newest first)
    files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    
    res.json({ files, count: files.length });
  } catch (error: any) {
    console.error("[LogsAPI] List files failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/logs/files/:filename
 * Download a specific log file
 * 🔒 SUPERADMIN ONLY
 */
router.get("/files/:filename(*)", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const path = await import("path");
    const fs = await import("fs/promises");
    
    const filename = decodeURIComponent(req.params.filename);
    const logsDir = path.join(process.cwd(), "logs");
    const filePath = path.join(logsDir, filename);
    
    // Security check: Ensure file is within logs directory
    if (!filePath.startsWith(logsDir)) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: "File not found" });
    }
    
    // Read and send file
    const fileContent = await fs.readFile(filePath);
    
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filename)}"`);
    res.send(fileContent);
  } catch (error: any) {
    console.error("[LogsAPI] Download file failed:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
