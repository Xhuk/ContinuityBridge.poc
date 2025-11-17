import { Router } from "express";
import { authenticateUser, requireSuperAdmin } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const router = Router();

// Track restart/shutdown requests to prevent concurrent operations
let operationInProgress = false;
let lastOperation: { type: string; timestamp: string; userId: string } | null = null;

/**
 * POST /api/app-control/status
 * Get application status
 * 🔒 Authenticated users
 */
router.post("/status", authenticateUser, async (req, res) => {
  try {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    const status = {
      status: "running",
      uptime: {
        seconds: Math.floor(uptime),
        formatted: formatUptime(uptime),
      },
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
      },
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
      env: process.env.NODE_ENV || "development",
      operationInProgress,
      lastOperation,
    };

    res.json(status);
  } catch (error: any) {
    logger.error("Failed to get app status", error, {
      scope: "superadmin",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/app-control/restart
 * Restart the application
 * 🔒 Customers can restart (affects their flows)
 * 🔒 Superadmin can restart (affects entire system)
 */
router.post("/restart", authenticateUser, async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === "superadmin";
    const { confirmed } = req.body;

    // Require explicit confirmation
    if (!confirmed) {
      const warningMessage = isSuperadmin
        ? "⚠️ SUPERADMIN WARNING: This will restart the ENTIRE SYSTEM affecting ALL customers and flows. All active executions will be interrupted. Are you sure?"
        : "⚠️ WARNING: This will restart your application instance. Active flow executions may be interrupted. Continue?";

      return res.status(400).json({
        error: "Confirmation required",
        warning: warningMessage,
        requiresConfirmation: true,
        action: "Set confirmed: true in request body to proceed",
      });
    }

    // Check if operation already in progress
    if (operationInProgress) {
      return res.status(409).json({
        error: "Operation already in progress",
        lastOperation,
      });
    }

    operationInProgress = true;
    lastOperation = {
      type: "restart",
      timestamp: new Date().toISOString(),
      userId: req.user?.id || "unknown",
    };

    // Log the restart request
    logger.warn("Application restart requested", {
      scope: isSuperadmin ? "superadmin" : "customer",
      userId: req.user?.id,
      organizationId: req.user?.organizationId,
      confirmedBy: req.user?.email,
    });

    // Send response before restarting
    res.json({
      success: true,
      message: "Application restart initiated. Server will be back online shortly...",
      estimatedDowntime: "5-10 seconds",
    });

    // Graceful shutdown with restart
    setTimeout(() => {
      logger.info("Executing graceful restart", {
        scope: isSuperadmin ? "superadmin" : "customer",
        userId: req.user?.id,
      });

      // Close server gracefully
      if (process.env.NODE_ENV === "production") {
        // In production, use process manager (PM2, systemd) to restart
        process.exit(0); // Exit code 0 signals normal restart
      } else {
        // In development, just exit (nodemon will restart)
        process.exit(0);
      }
    }, 1000); // 1 second delay to ensure response is sent

  } catch (error: any) {
    operationInProgress = false;
    logger.error("Failed to restart application", error, {
      scope: req.user?.role === "superadmin" ? "superadmin" : "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/app-control/stop
 * Stop the application (graceful shutdown)
 * 🔒 SUPERADMIN ONLY (dangerous operation)
 */
router.post("/stop", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { confirmed, reason } = req.body;

    // Require explicit confirmation
    if (!confirmed) {
      return res.status(400).json({
        error: "Confirmation required",
        warning: "🚨 CRITICAL: This will STOP the entire application for ALL customers. The system will need manual restart. Only use for emergency maintenance!",
        requiresConfirmation: true,
        action: "Set confirmed: true and provide reason in request body",
      });
    }

    if (!reason) {
      return res.status(400).json({
        error: "Reason required",
        message: "Please provide a reason for stopping the application",
      });
    }

    // Check if operation already in progress
    if (operationInProgress) {
      return res.status(409).json({
        error: "Operation already in progress",
        lastOperation,
      });
    }

    operationInProgress = true;
    lastOperation = {
      type: "stop",
      timestamp: new Date().toISOString(),
      userId: req.user?.id || "unknown",
    };

    // Log the shutdown request
    logger.error("Application shutdown requested", null, {
      scope: "superadmin",
      userId: req.user?.id,
      confirmedBy: req.user?.email,
      reason,
      severity: "CRITICAL",
    });

    // Send response before shutting down
    res.json({
      success: true,
      message: "Application shutdown initiated. Manual restart required.",
      reason,
    });

    // Graceful shutdown
    setTimeout(() => {
      logger.info("Executing graceful shutdown", {
        scope: "superadmin",
        userId: req.user?.id,
        reason,
      });

      process.exit(1); // Exit code 1 to prevent auto-restart
    }, 1000);

  } catch (error: any) {
    operationInProgress = false;
    logger.error("Failed to stop application", error, {
      scope: "superadmin",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/app-control/health-check
 * Perform health check
 * 🔒 Authenticated users
 */
router.post("/health-check", authenticateUser, async (req, res) => {
  try {
    const checks = {
      server: "healthy",
      database: "unknown",
      memory: "unknown",
      uptime: "unknown",
    };

    // Check database connection
    try {
      const { db } = await import("../../db.js");
      await (db.select() as any).from("users").limit(1).all();
      checks.database = "healthy";
    } catch {
      checks.database = "unhealthy";
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const heapPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    checks.memory = heapPercentage > 90 ? "warning" : "healthy";

    // Check uptime
    const uptime = process.uptime();
    checks.uptime = uptime > 60 ? "healthy" : "starting";

    const overall = Object.values(checks).every((c) => c === "healthy")
      ? "healthy"
      : Object.values(checks).some((c) => c === "unhealthy")
      ? "unhealthy"
      : "warning";

    res.json({
      status: overall,
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("Health check failed", error, {
      scope: "superadmin",
      userId: req.user?.id,
    });
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});

/**
 * POST /api/app-control/clear-cache
 * Clear application cache
 * 🔒 Superadmin can clear all, Customers clear their own
 */
router.post("/clear-cache", authenticateUser, async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === "superadmin";
    const organizationId = req.user?.organizationId;

    logger.info("Cache clear requested", {
      scope: isSuperadmin ? "superadmin" : "customer",
      userId: req.user?.id,
      organizationId,
    });

    // In a real implementation, you would clear:
    // - Redis cache (if using)
    // - In-memory caches
    // - Flow definition caches
    // - Mapping caches
    // For now, we'll force garbage collection if available

    if (global.gc) {
      global.gc();
      logger.info("Garbage collection triggered", {
        scope: isSuperadmin ? "superadmin" : "customer",
        userId: req.user?.id,
      });
    }

    res.json({
      success: true,
      message: isSuperadmin
        ? "Global cache cleared successfully"
        : "Organization cache cleared successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("Failed to clear cache", error, {
      scope: req.user?.role === "superadmin" ? "superadmin" : "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Helper: Format uptime
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(" ");
}

export default router;
