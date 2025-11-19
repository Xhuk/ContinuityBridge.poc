import cron from "node-cron";
import { db } from "../../db.js";
import { pollerStates, flowDefinitions } from "../../schema.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../core/logger.js";
import type { FlowOrchestrator } from "../flow/orchestrator.js";

const log = logger.child("PollerDaemon");

/**
 * Poller Daemon - Background service that triggers SFTP/Blob pollers
 * 
 * Architecture:
 * 1. Runs every 1 minute (cron: "* * * * *")
 * 2. Queries `poller_states` table for enabled pollers
 * 3. Checks if poller should run based on pollInterval
 * 4. Executes flow with poller node as trigger
 * 5. Updates lastProcessedAt timestamp
 */
export class PollerDaemon {
  private cronJob?: cron.ScheduledTask;
  private orchestrator: FlowOrchestrator;
  private isRunning = false;
  private startTime: number | null = null;
  private lastRunTime: string | null = null;
  private activePolls = 0;

  constructor(orchestrator: FlowOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Start the poller daemon
   */
  start(): void {
    if (this.isRunning) {
      log.warn("Poller daemon already running");
      return;
    }

    log.info("Starting poller daemon (checks every 1 minute)");

    // Run every minute
    this.cronJob = cron.schedule("* * * * *", async () => {
      await this.checkPollers();
    });

    this.isRunning = true;
    this.startTime = Date.now();
    log.info("Poller daemon started successfully");
  }

  /**
   * Stop the poller daemon
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    log.info("Stopping poller daemon");
    this.cronJob?.stop();
    this.isRunning = false;
    this.startTime = null;
    log.info("Poller daemon stopped");
  }

  /**
   * Check all enabled pollers and trigger flows if needed
   */
  private async checkPollers(): Promise<void> {
    try {
      this.lastRunTime = new Date().toISOString();
      
      // Get all enabled pollers
      const pollers = await (db.select() as any)
        .from(pollerStates)
        .where(eq(pollerStates.enabled, true));

      if (pollers.length === 0) {
        return;
      }

      this.activePolls = pollers.length;
      log.debug(`Checking ${pollers.length} enabled pollers`);

      for (const poller of pollers) {
        try {
          await this.checkPoller(poller);
        } catch (error: any) {
          log.error(`Error checking poller ${poller.id}`, {
            flowId: poller.flowId,
            nodeId: poller.nodeId,
            error: error.message,
          });

          // Update error state
          await (db.update(pollerStates) as any)
            .set({
              lastError: error.message,
              lastErrorAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(pollerStates.id, poller.id));
        }
      }
    } catch (error: any) {
      log.error("Error in poller daemon check cycle", error);
    }
  }

  /**
   * Check individual poller and execute flow if ready
   */
  private async checkPoller(poller: any): Promise<void> {
    const config = poller.configSnapshot || {};
    const pollIntervalMinutes = config.pollInterval || config.pollIntervalMinutes || 5;
    const pollIntervalMs = pollIntervalMinutes * 60 * 1000;

    // Check if enough time has passed since last poll
    if (poller.lastProcessedAt) {
      const lastPoll = new Date(poller.lastProcessedAt).getTime();
      const now = Date.now();
      const timeSinceLastPoll = now - lastPoll;

      if (timeSinceLastPoll < pollIntervalMs) {
        // Not time yet
        return;
      }
    }

    log.info(`Triggering poller`, {
      flowId: poller.flowId,
      nodeId: poller.nodeId,
      pollerType: poller.pollerType,
      pollInterval: pollIntervalMinutes,
    });

    // Get flow definition
    const flows = await (db.select() as any)
      .from(flowDefinitions)
      .where(eq(flowDefinitions.id, poller.flowId));
    
    const flow = flows[0];

    if (!flow) {
      log.warn(`Flow not found for poller`, {
        flowId: poller.flowId,
        pollerId: poller.id,
      });
      return;
    }

    if (!flow.enabled) {
      log.debug(`Flow disabled, skipping poller`, {
        flowId: poller.flowId,
      });
      return;
    }

    // Execute flow (poller node will detect new files)
    try {
      const flowRun = await this.orchestrator.executeFlow(
        poller.flowId,
        { trigger: "poller", pollerId: poller.id },
        "timer",
        false // Production mode
      );

      log.info(`Poller execution completed`, {
        flowId: poller.flowId,
        runId: flowRun.id,
        status: flowRun.status,
      });

      // Update last processed time on success
      if (flowRun.status === "completed") {
        await (db.update(pollerStates) as any)
          .set({
            lastProcessedAt: new Date().toISOString(),
            lastError: null,
            lastErrorAt: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(pollerStates.id, poller.id));
      }
    } catch (error: any) {
      // If error is "No new files detected", don't treat as error
      if (error.message?.includes("No new files detected")) {
        log.debug(`No new files for poller`, {
          flowId: poller.flowId,
          nodeId: poller.nodeId,
        });

        // Still update lastProcessedAt
        await (db.update(pollerStates) as any)
          .set({
            lastProcessedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(pollerStates.id, poller.id));
      } else {
        throw error;
      }
    }
  }

  /**
   * Get daemon status
   */
  getStatus(): { running: boolean; pollerCount: number } {
    return {
      running: this.isRunning,
      pollerCount: 0, // Could query DB here if needed
    };
  }

  getUptime(): number {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  getLastRunTime(): string | null {
    return this.lastRunTime;
  }

  getNextRunTime(): string | null {
    // Runs every minute
    if (!this.lastRunTime) return null;
    const lastRun = new Date(this.lastRunTime);
    lastRun.setMinutes(lastRun.getMinutes() + 1);
    return lastRun.toISOString();
  }

  getStats() {
    return {
      activePolls: this.activePolls,
    };
  }
}

// Singleton instance
let pollerDaemonInstance: PollerDaemon | null = null;

export function getPollerDaemon(orchestrator?: FlowOrchestrator): PollerDaemon {
  if (!pollerDaemonInstance && orchestrator) {
    pollerDaemonInstance = new PollerDaemon(orchestrator);
  }
  if (!pollerDaemonInstance) {
    throw new Error("PollerDaemon not initialized - pass orchestrator on first call");
  }
  return pollerDaemonInstance;
}
