import cron from "node-cron";
import { db } from "../../db.js";
import { flowDefinitions } from "../../schema.js";
import { logger } from "../core/logger.js";
import type { FlowOrchestrator } from "../flow/orchestrator.js";

const log = logger.child("SchedulerDaemon");

interface ScheduledJob {
  flowId: string;
  schedule: string; // Cron expression
  timezone: string;
  nodeId: string;
  cronTask?: cron.ScheduledTask;
}

/**
 * Scheduler Daemon - Background service that triggers scheduled flows
 * 
 * Architecture:
 * 1. Scans flows with scheduler nodes on startup
 * 2. Registers cron jobs using node-cron
 * 3. Executes flow when cron triggers
 * 4. Supports dynamic add/remove of scheduled flows
 */
export class SchedulerDaemon {
  private orchestrator: FlowOrchestrator;
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private isRunning = false;

  constructor(orchestrator: FlowOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Start the scheduler daemon
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn("Scheduler daemon already running");
      return;
    }

    log.info("Starting scheduler daemon");

    // Scan all flows and register schedulers
    await this.scanAndRegisterSchedulers();

    this.isRunning = true;
    log.info(`Scheduler daemon started with ${this.scheduledJobs.size} scheduled jobs`);
  }

  /**
   * Stop the scheduler daemon
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    log.info("Stopping scheduler daemon");

    // Stop all cron jobs
    for (const [jobId, job] of this.scheduledJobs.entries()) {
      job.cronTask?.stop();
      log.debug(`Stopped scheduled job`, { jobId, flowId: job.flowId });
    }

    this.scheduledJobs.clear();
    this.isRunning = false;
    log.info("Scheduler daemon stopped");
  }

  /**
   * Scan flows and register scheduler nodes
   */
  private async scanAndRegisterSchedulers(): Promise<void> {
    try {
      // Get all enabled flows
      const flows = await (db.select() as any)
        .from(flowDefinitions);

      let registeredCount = 0;

      for (const flow of flows) {
        const nodes = flow.nodes as any[];
        
        // Find scheduler nodes
        const schedulerNodes = nodes.filter(n => n.type === "scheduler");

        for (const node of schedulerNodes) {
          const config = node.config || {};
          const schedule = config.schedule || "0 * * * *"; // Default: hourly
          const timezone = config.timezone || "UTC";
          const enabled = config.enabled !== false;

          if (!enabled || !flow.enabled) {
            continue;
          }

          // Validate cron expression
          if (!cron.validate(schedule)) {
            log.warn(`Invalid cron expression for scheduler`, {
              flowId: flow.id,
              nodeId: node.id,
              schedule,
            });
            continue;
          }

          // Register job
          this.registerScheduledJob({
            flowId: flow.id,
            schedule,
            timezone,
            nodeId: node.id,
          });

          registeredCount++;
        }
      }

      log.info(`Registered ${registeredCount} scheduled jobs from ${flows.length} flows`);
    } catch (error: any) {
      log.error("Error scanning flows for schedulers", error);
    }
  }

  /**
   * Register a scheduled job
   */
  private registerScheduledJob(job: Omit<ScheduledJob, "cronTask">): void {
    const jobId = `${job.flowId}-${job.nodeId}`;

    // Unregister existing if present
    if (this.scheduledJobs.has(jobId)) {
      this.unregisterScheduledJob(jobId);
    }

    try {
      // Create cron task
      const cronTask = cron.schedule(
        job.schedule,
        async () => {
          await this.executeScheduledFlow(job.flowId, job.nodeId);
        },
        {
          scheduled: true,
          timezone: job.timezone,
        }
      );

      this.scheduledJobs.set(jobId, {
        ...job,
        cronTask,
      });

      log.info(`Registered scheduled job`, {
        jobId,
        flowId: job.flowId,
        schedule: job.schedule,
        timezone: job.timezone,
      });
    } catch (error: any) {
      log.error(`Failed to register scheduled job`, {
        jobId,
        error: error.message,
      });
    }
  }

  /**
   * Unregister a scheduled job
   */
  private unregisterScheduledJob(jobId: string): void {
    const job = this.scheduledJobs.get(jobId);
    if (job) {
      job.cronTask?.stop();
      this.scheduledJobs.delete(jobId);
      log.info(`Unregistered scheduled job`, { jobId });
    }
  }

  /**
   * Execute a scheduled flow
   */
  private async executeScheduledFlow(flowId: string, nodeId: string): Promise<void> {
    try {
      log.info(`Executing scheduled flow`, { flowId, nodeId });

      const flowRun = await this.orchestrator.executeFlow(
        flowId,
        { trigger: "scheduler", nodeId, scheduledTime: new Date().toISOString() },
        "timer",
        false // Production mode
      );

      log.info(`Scheduled flow execution completed`, {
        flowId,
        runId: flowRun.id,
        status: flowRun.status,
      });
    } catch (error: any) {
      log.error(`Scheduled flow execution failed`, {
        flowId,
        nodeId,
        error: error.message,
      });
    }
  }

  /**
   * Refresh schedulers (call after flow updates)
   */
  async refresh(): Promise<void> {
    log.info("Refreshing scheduled jobs");
    
    // Stop all existing jobs
    for (const [jobId, job] of this.scheduledJobs.entries()) {
      job.cronTask?.stop();
    }
    this.scheduledJobs.clear();

    // Re-scan and register
    await this.scanAndRegisterSchedulers();

    log.info(`Refreshed schedulers: ${this.scheduledJobs.size} active jobs`);
  }

  /**
   * Get daemon status
   */
  getStatus(): { running: boolean; jobCount: number; jobs: Array<{ flowId: string; schedule: string; timezone: string }> } {
    const jobs = Array.from(this.scheduledJobs.values()).map(j => ({
      flowId: j.flowId,
      schedule: j.schedule,
      timezone: j.timezone,
    }));

    return {
      running: this.isRunning,
      jobCount: this.scheduledJobs.size,
      jobs,
    };
  }
}

// Singleton instance
let schedulerDaemonInstance: SchedulerDaemon | null = null;

export function getSchedulerDaemon(orchestrator?: FlowOrchestrator): SchedulerDaemon {
  if (!schedulerDaemonInstance && orchestrator) {
    schedulerDaemonInstance = new SchedulerDaemon(orchestrator);
  }
  if (!schedulerDaemonInstance) {
    throw new Error("SchedulerDaemon not initialized - pass orchestrator on first call");
  }
  return schedulerDaemonInstance;
}
