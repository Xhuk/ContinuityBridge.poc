/**
 * System Restart Service
 * Manages graceful system restarts for configuration changes
 */

import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../core/logger.js";
import type { SystemRestart } from "../../../shared/schema.js";

const execAsync = promisify(exec);
const log = logger.child("SystemRestartService");

// Pending restart request
let pendingRestart: SystemRestart | null = null;

/**
 * Request a system restart
 */
export function requestSystemRestart(
  requestedBy: string,
  reason: string
): SystemRestart {
  const restart: SystemRestart = {
    requestedBy,
    requestedAt: new Date().toISOString(),
    reason,
    status: "pending",
  };

  pendingRestart = restart;
  log.warn("System restart requested", {
    requestedBy,
    reason,
  });

  return restart;
}

/**
 * Get pending restart request
 */
export function getPendingRestart(): SystemRestart | null {
  return pendingRestart;
}

/**
 * Clear pending restart
 */
export function clearPendingRestart(): void {
  pendingRestart = null;
  log.info("Pending restart cleared");
}

/**
 * Execute system restart (graceful shutdown + restart)
 */
export async function executeSystemRestart(
  requestedBy: string
): Promise<{ success: boolean; message: string }> {
  if (!pendingRestart) {
    return {
      success: false,
      message: "No pending restart request",
    };
  }

  try {
    log.warn("Executing system restart", {
      requestedBy,
      reason: pendingRestart.reason,
    });

    // Update restart status
    pendingRestart.status = "in_progress";

    // Stop worker gracefully
    try {
      const { getWorkerInstance } = await import("../workers/worker.js");
      const worker = getWorkerInstance();
      await worker.stop();
      log.info("Worker stopped gracefully");
    } catch (error: any) {
      log.warn("Worker stop failed (may not be running)", { error: error.message });
    }

    // Give time for connections to close
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mark restart as completed
    pendingRestart.status = "completed";
    pendingRestart.completedAt = new Date().toISOString();

    // Determine restart command based on environment
    const restartCommand = getRestartCommand();

    if (restartCommand) {
      log.info("Executing restart command", { command: restartCommand });

      // Execute restart in background (this process will terminate)
      exec(restartCommand, (error) => {
        if (error) {
          log.error("Restart command failed", { error: error.message });
        }
      });

      // Give the command time to spawn
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Exit current process (PM2/systemd/docker will restart it)
      process.exit(0);
    } else {
      // No restart command available - require manual restart
      return {
        success: false,
        message: "Automatic restart not available. Please manually restart the application.",
      };
    }

    return {
      success: true,
      message: "System restarting...",
    };
  } catch (error: any) {
    log.error("System restart failed", { error: error.message });

    if (pendingRestart) {
      pendingRestart.status = "failed";
      pendingRestart.error = error.message;
    }

    return {
      success: false,
      message: `Restart failed: ${error.message}`,
    };
  }
}

/**
 * Get appropriate restart command based on environment
 */
function getRestartCommand(): string | null {
  // Check if running under PM2
  if (process.env.PM2_HOME) {
    return "pm2 restart ecosystem.config.js";
  }

  // Check if running under systemd
  if (process.env.SYSTEMD_EXEC_PID) {
    return "systemctl restart continuitybridge";
  }

  // Check if running in Docker
  if (process.env.DOCKER_CONTAINER) {
    // Docker will automatically restart if restart policy is set
    return null;
  }

  // Check for custom restart script
  if (process.env.RESTART_COMMAND) {
    return process.env.RESTART_COMMAND;
  }

  // No automatic restart available
  return null;
}

/**
 * Check if restart is required based on configuration changes
 */
export function checkRestartRequired(changes: string[]): boolean {
  const restartRequiredChanges = [
    "workerConcurrency",
    "queuePollInterval",
    "deadLetterAfterRetries",
    "queueBackend",
    "rabbitmqUrl",
    "kafkaUrl",
  ];

  return changes.some((change) => restartRequiredChanges.includes(change));
}

/**
 * Get restart status for UI
 */
export function getRestartStatus(): {
  restartPending: boolean;
  canAutoRestart: boolean;
  restartCommand: string | null;
  pendingRestart: SystemRestart | null;
} {
  return {
    restartPending: !!pendingRestart && pendingRestart.status === "pending",
    canAutoRestart: !!getRestartCommand(),
    restartCommand: getRestartCommand(),
    pendingRestart,
  };
}
