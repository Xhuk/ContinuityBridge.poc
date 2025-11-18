/**
 * System Health & Daemon Management Routes
 * 
 * Access Control:
 * - View Health: Superadmin, Consultant, Customer Admin
 * - Manage Daemons: Superadmin, Consultant, Customer Admin only
 */

import { Router, type Request, type Response } from "express";
import { logger } from "../core/logger.js";
import { getHealthMonitor } from "../core/health-monitor.js";
import { getSchedulerDaemon } from "../schedulers/scheduler-daemon.js";
import { getPollerDaemon } from "../schedulers/poller-daemon.js";
import { getLogCleanupJob } from "../core/log-cleanup-job.js";

const router = Router();
const log = logger.child("SystemHealthRoutes");

// ============================================================================
// Helper: Check if user can manage daemons
// ============================================================================

function canManageDaemons(user: any): boolean {
  const allowedRoles = ["superadmin", "consultant", "customer_admin"];
  return allowedRoles.includes(user?.role);
}

function canViewHealth(user: any): boolean {
  const allowedRoles = ["superadmin", "consultant", "customer_admin"];
  return allowedRoles.includes(user?.role);
}

// ============================================================================
// GET /api/admin/system-health - Get system health and daemon status
// ============================================================================

router.get("/", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Check permissions
    if (!canViewHealth(user)) {
      return res.status(403).json({
        error: "Access denied",
        message: "Only superadmin, consultant, and customer admin can view system health",
      });
    }

    // Get health monitor
    const healthMonitor = getHealthMonitor();
    const healthMetrics = healthMonitor.getHealthStatus();

    // Get daemon statuses
    const schedulerDaemon = getSchedulerDaemon();
    const pollerDaemon = getPollerDaemon();
    const logCleanupJob = getLogCleanupJob();

    const daemons = [
      {
        name: "Scheduler Daemon",
        type: "scheduler",
        status: schedulerDaemon.isRunning() ? "running" : "stopped",
        uptime: schedulerDaemon.getUptime(),
        lastRun: schedulerDaemon.getLastRunTime(),
        nextRun: schedulerDaemon.getNextRunTime(),
        stats: schedulerDaemon.getStats(),
      },
      {
        name: "Poller Daemon",
        type: "poller",
        status: pollerDaemon.isRunning() ? "running" : "stopped",
        uptime: pollerDaemon.getUptime(),
        lastRun: pollerDaemon.getLastRunTime(),
        nextRun: pollerDaemon.getNextRunTime(),
        stats: pollerDaemon.getStats(),
      },
      {
        name: "Log Cleanup Job",
        type: "log-cleanup",
        status: logCleanupJob.isRunning() ? "running" : "stopped",
        uptime: logCleanupJob.getUptime(),
        lastRun: logCleanupJob.getLastRunTime(),
        nextRun: logCleanupJob.getNextRunTime(),
        stats: {
          totalJobs: logCleanupJob.getRunCount(),
          completedJobs: logCleanupJob.getRunCount(),
          failedJobs: 0,
        },
      },
      {
        name: "Health Monitor",
        type: "health-monitor",
        status: healthMonitor.isRunning() ? "running" : "stopped",
        uptime: healthMonitor.getUptime(),
        lastRun: healthMonitor.getLastCheckTime(),
        nextRun: healthMonitor.getNextCheckTime(),
        stats: {
          totalJobs: healthMonitor.getCheckCount(),
          completedJobs: healthMonitor.getCheckCount(),
          failedJobs: 0,
        },
      },
    ];

    res.json({
      health: healthMetrics,
      daemons,
      permissions: {
        canManageDaemons: canManageDaemons(user),
        canViewHealth: canViewHealth(user),
      },
    });
  } catch (error: any) {
    log.error("Failed to get system health", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// POST /api/admin/system-health/daemon/:daemonType/:action - Control daemon
// Actions: start, stop, restart
// ============================================================================

router.post("/daemon/:daemonType/:action", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { daemonType, action } = req.params;

    // Check permissions
    if (!canManageDaemons(user)) {
      return res.status(403).json({
        error: "Access denied",
        message: "Only superadmin, consultant, and customer admin can manage daemons",
      });
    }

    // Validate action
    if (!["start", "stop", "restart"].includes(action)) {
      return res.status(400).json({
        error: "Invalid action",
        message: "Action must be 'start', 'stop', or 'restart'",
      });
    }

    // Get the appropriate daemon
    let daemon: any;
    let daemonName: string;

    switch (daemonType) {
      case "scheduler":
        daemon = getSchedulerDaemon();
        daemonName = "Scheduler Daemon";
        break;
      case "poller":
        daemon = getPollerDaemon();
        daemonName = "Poller Daemon";
        break;
      case "log-cleanup":
        daemon = getLogCleanupJob();
        daemonName = "Log Cleanup Job";
        break;
      case "health-monitor":
        daemon = getHealthMonitor();
        daemonName = "Health Monitor";
        break;
      default:
        return res.status(400).json({
          error: "Invalid daemon type",
          message: `Unknown daemon type: ${daemonType}`,
        });
    }

    // Execute action
    let result: any;
    switch (action) {
      case "start":
        if (daemon.isRunning()) {
          return res.status(400).json({
            error: "Daemon already running",
            message: `${daemonName} is already running`,
          });
        }
        daemon.start();
        result = { status: "started" };
        log.info(`${daemonName} started by ${user.email} (${user.role})`);
        break;

      case "stop":
        if (!daemon.isRunning()) {
          return res.status(400).json({
            error: "Daemon not running",
            message: `${daemonName} is not running`,
          });
        }
        daemon.stop();
        result = { status: "stopped" };
        log.warn(`${daemonName} stopped by ${user.email} (${user.role})`);
        break;

      case "restart":
        if (!daemon.isRunning()) {
          return res.status(400).json({
            error: "Daemon not running",
            message: `${daemonName} is not running. Use 'start' instead.`,
          });
        }
        daemon.stop();
        // Wait 2 seconds before restart
        await new Promise((resolve) => setTimeout(resolve, 2000));
        daemon.start();
        result = { status: "restarted" };
        log.info(`${daemonName} restarted by ${user.email} (${user.role})`);
        break;
    }

    res.json({
      success: true,
      daemon: daemonName,
      action,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    log.error("Failed to control daemon", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
/**
 * System Health & Daemon Management Routes
 * 
 * Access Control:
 * - View Health: Superadmin, Consultant, Customer Admin
 * - Manage Daemons: Superadmin, Consultant, Customer Admin only
 */

import { Router, type Request, type Response } from "express";
import { logger } from "../core/logger.js";
import { getHealthMonitor } from "../core/health-monitor.js";
import { getSchedulerDaemon } from "../schedulers/scheduler-daemon.js";
import { getPollerDaemon } from "../schedulers/poller-daemon.js";
import { getLogCleanupJob } from "../core/log-cleanup-job.js";

const router = Router();
const log = logger.child("SystemHealthRoutes");

// ============================================================================
// Helper: Check if user can manage daemons
// ============================================================================

function canManageDaemons(user: any): boolean {
  const allowedRoles = ["superadmin", "consultant", "customer_admin"];
  return allowedRoles.includes(user?.role);
}

function canViewHealth(user: any): boolean {
  const allowedRoles = ["superadmin", "consultant", "customer_admin"];
  return allowedRoles.includes(user?.role);
}

// ============================================================================
// GET /api/admin/system-health - Get system health and daemon status
// ============================================================================

router.get("/", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Check permissions
    if (!canViewHealth(user)) {
      return res.status(403).json({
        error: "Access denied",
        message: "Only superadmin, consultant, and customer admin can view system health",
      });
    }

    // Get health monitor
    const healthMonitor = getHealthMonitor();
    const healthMetrics = healthMonitor.getHealthStatus();

    // Get daemon statuses
    const schedulerDaemon = getSchedulerDaemon();
    const pollerDaemon = getPollerDaemon();
    const logCleanupJob = getLogCleanupJob();

    const daemons = [
      {
        name: "Scheduler Daemon",
        type: "scheduler",
        status: schedulerDaemon.isRunning() ? "running" : "stopped",
        uptime: schedulerDaemon.getUptime(),
        lastRun: schedulerDaemon.getLastRunTime(),
        nextRun: schedulerDaemon.getNextRunTime(),
        stats: schedulerDaemon.getStats(),
      },
      {
        name: "Poller Daemon",
        type: "poller",
        status: pollerDaemon.isRunning() ? "running" : "stopped",
        uptime: pollerDaemon.getUptime(),
        lastRun: pollerDaemon.getLastRunTime(),
        nextRun: pollerDaemon.getNextRunTime(),
        stats: pollerDaemon.getStats(),
      },
      {
        name: "Log Cleanup Job",
        type: "log-cleanup",
        status: logCleanupJob.isRunning() ? "running" : "stopped",
        uptime: logCleanupJob.getUptime(),
        lastRun: logCleanupJob.getLastRunTime(),
        nextRun: logCleanupJob.getNextRunTime(),
        stats: {
          totalJobs: logCleanupJob.getRunCount(),
          completedJobs: logCleanupJob.getRunCount(),
          failedJobs: 0,
        },
      },
      {
        name: "Health Monitor",
        type: "health-monitor",
        status: healthMonitor.isRunning() ? "running" : "stopped",
        uptime: healthMonitor.getUptime(),
        lastRun: healthMonitor.getLastCheckTime(),
        nextRun: healthMonitor.getNextCheckTime(),
        stats: {
          totalJobs: healthMonitor.getCheckCount(),
          completedJobs: healthMonitor.getCheckCount(),
          failedJobs: 0,
        },
      },
    ];

    res.json({
      health: healthMetrics,
      daemons,
      permissions: {
        canManageDaemons: canManageDaemons(user),
        canViewHealth: canViewHealth(user),
      },
    });
  } catch (error: any) {
    log.error("Failed to get system health", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// POST /api/admin/system-health/daemon/:daemonType/:action - Control daemon
// Actions: start, stop, restart
// ============================================================================

router.post("/daemon/:daemonType/:action", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { daemonType, action } = req.params;

    // Check permissions
    if (!canManageDaemons(user)) {
      return res.status(403).json({
        error: "Access denied",
        message: "Only superadmin, consultant, and customer admin can manage daemons",
      });
    }

    // Validate action
    if (!["start", "stop", "restart"].includes(action)) {
      return res.status(400).json({
        error: "Invalid action",
        message: "Action must be 'start', 'stop', or 'restart'",
      });
    }

    // Get the appropriate daemon
    let daemon: any;
    let daemonName: string;

    switch (daemonType) {
      case "scheduler":
        daemon = getSchedulerDaemon();
        daemonName = "Scheduler Daemon";
        break;
      case "poller":
        daemon = getPollerDaemon();
        daemonName = "Poller Daemon";
        break;
      case "log-cleanup":
        daemon = getLogCleanupJob();
        daemonName = "Log Cleanup Job";
        break;
      case "health-monitor":
        daemon = getHealthMonitor();
        daemonName = "Health Monitor";
        break;
      default:
        return res.status(400).json({
          error: "Invalid daemon type",
          message: `Unknown daemon type: ${daemonType}`,
        });
    }

    // Execute action
    let result: any;
    switch (action) {
      case "start":
        if (daemon.isRunning()) {
          return res.status(400).json({
            error: "Daemon already running",
            message: `${daemonName} is already running`,
          });
        }
        daemon.start();
        result = { status: "started" };
        log.info(`${daemonName} started by ${user.email} (${user.role})`);
        break;

      case "stop":
        if (!daemon.isRunning()) {
          return res.status(400).json({
            error: "Daemon not running",
            message: `${daemonName} is not running`,
          });
        }
        daemon.stop();
        result = { status: "stopped" };
        log.warn(`${daemonName} stopped by ${user.email} (${user.role})`);
        break;

      case "restart":
        if (!daemon.isRunning()) {
          return res.status(400).json({
            error: "Daemon not running",
            message: `${daemonName} is not running. Use 'start' instead.`,
          });
        }
        daemon.stop();
        // Wait 2 seconds before restart
        await new Promise((resolve) => setTimeout(resolve, 2000));
        daemon.start();
        result = { status: "restarted" };
        log.info(`${daemonName} restarted by ${user.email} (${user.role})`);
        break;
    }

    res.json({
      success: true,
      daemon: daemonName,
      action,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    log.error("Failed to control daemon", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
