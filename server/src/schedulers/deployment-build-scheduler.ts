/**
 * Deployment Build Scheduler
 * 
 * Runs daily at 2 AM to generate deployment packages for consultants
 * with scheduled updates enabled.
 * 
 * Uses Bull queue to prevent blocking - adds jobs to queue asynchronously.
 */

import cron from "node-cron";
import { logger } from "../core/logger.js";
import { db } from "../../db.js";
import { users } from "../../schema.pg.js";
import { eq } from "drizzle-orm";
import { getQueueProvider } from "../serverQueue.js";

const log = logger.child("DeploymentBuildScheduler");

export class DeploymentBuildScheduler {
  private cronJob?: cron.ScheduledTask;
  private isRunning = false;
  private startTime: number | null = null;
  private lastRunTime: string | null = null;
  private totalBuildsScheduled = 0;

  /**
   * Start the deployment build scheduler
   * Runs daily at 2:00 AM UTC
   */
  start(): void {
    if (this.isRunning) {
      log.warn("Deployment build scheduler already running");
      return;
    }

    log.info("Starting deployment build scheduler (daily at 2:00 AM UTC)");

    // Schedule daily at 2:00 AM UTC
    // Cron format: minute hour day month dayOfWeek
    // "0 2 * * *" = At 02:00 (2 AM) every day
    this.cronJob = cron.schedule("0 2 * * *", async () => {
      await this.scheduleDeploymentBuilds();
    }, {
      timezone: "UTC",
    });

    this.isRunning = true;
    this.startTime = Date.now();
    log.info("Deployment build scheduler started successfully");
  }

  /**
   * Stop the deployment build scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    log.info("Stopping deployment build scheduler");
    this.cronJob?.stop();
    this.isRunning = false;
    this.startTime = null;
    log.info("Deployment build scheduler stopped");
  }

  /**
   * Schedule deployment builds for all consultants with scheduled updates enabled
   */
  private async scheduleDeploymentBuilds(): Promise<void> {
    try {
      this.lastRunTime = new Date().toISOString();
      log.info("Starting scheduled deployment build check", { time: this.lastRunTime });

      // Get all consultants
      const consultants = await (db.select() as any)
        .from(users)
        .where(eq(users.role, "consultant"));

      let scheduledCount = 0;
      const queue = getQueueProvider();

      for (const consultant of consultants) {
        const metadata = consultant.metadata || {};
        const scheduledUpdates = metadata.scheduledUpdates;

        // Check if scheduled updates are enabled for this consultant
        if (!scheduledUpdates?.enabled) {
          continue;
        }

        // Get customers to build for
        const customers = scheduledUpdates.customers || [];
        
        if (customers.length === 0) {
          log.debug("No customers configured for scheduled updates", {
            consultantId: consultant.id,
            consultantEmail: consultant.email,
          });
          continue;
        }

        // Queue deployment builds for each customer (non-blocking)
        for (const customerId of customers) {
          try {
            const payload = JSON.stringify({
              consultantId: consultant.id,
              consultantEmail: consultant.email,
              customerId,
              type: "scheduled",
              scheduledAt: this.lastRunTime,
            });

            await queue.enqueue("deployment-package-build", payload);

            scheduledCount++;
            this.totalBuildsScheduled++;

            log.info("Deployment build queued", {
              consultantId: consultant.id,
              customerId,
              queuePosition: scheduledCount,
            });
          } catch (error: any) {
            log.error("Failed to queue deployment build", {
              consultantId: consultant.id,
              customerId,
              error: error.message,
            });
          }
        }
      }

      log.info("Scheduled deployment builds completed", {
        consultantsChecked: consultants.length,
        buildsScheduled: scheduledCount,
        duration: Date.now() - new Date(this.lastRunTime).getTime(),
      });

    } catch (error: any) {
      log.error("Error scheduling deployment builds", {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Manually trigger deployment build scheduling (for testing)
   */
  async triggerNow(): Promise<void> {
    log.info("Manually triggering deployment build scheduling");
    await this.scheduleDeploymentBuilds();
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    running: boolean;
    lastRun: string | null;
    totalBuildsScheduled: number;
    uptime: number;
  } {
    return {
      running: this.isRunning,
      lastRun: this.lastRunTime,
      totalBuildsScheduled: this.totalBuildsScheduled,
      uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
    };
  }
}

// Singleton instance
let deploymentBuildSchedulerInstance: DeploymentBuildScheduler | null = null;

export function getDeploymentBuildScheduler(): DeploymentBuildScheduler {
  if (!deploymentBuildSchedulerInstance) {
    deploymentBuildSchedulerInstance = new DeploymentBuildScheduler();
  }
  return deploymentBuildSchedulerInstance;
}