import { NodeExecutor, ExecutionContext, NodeExecutionResult } from "./types";
import { FlowNode } from "@shared/schema";

/**
 * Scheduler Node Executor - Cron-based flow triggers
 * 
 * Use Case:
 * - Daily inventory sync at 2 AM
 * - Hourly order polling
 * - Weekly reports every Monday
 * 
 * Configuration:
 * - schedule: Cron expression (e.g., "0 2 * * *" = daily at 2 AM)
 * - timezone: Timezone for schedule (e.g., "America/New_York")
 * - enabled: Whether scheduler is active
 * 
 * Mock Mode: Returns mock trigger event
 * Production Mode: Requires cron job scheduler (node-cron, bull)
 * 
 * NOTE: Scheduler nodes are passive - they don't execute during flow runs.
 * Instead, they define WHEN a flow should be triggered externally.
 */
export const executeScheduler: NodeExecutor = async (
  node: FlowNode,
  input: unknown,
  context: ExecutionContext
): Promise<NodeExecutionResult> => {
  const config = (node as any).config || {};
  const {
    schedule = "0 * * * *", // Default: Every hour
    timezone = "UTC",
    enabled = true,
  } = config;

  // Scheduler nodes don't process payloads - they trigger flows
  // In a real implementation, this would register the cron job
  
  if (context.emulationMode) {
    // Return mock schedule trigger event
    return {
      output: {
        trigger: "scheduler",
        schedule: {
          cron: schedule,
          timezone,
          nextRun: getNextCronTime(schedule, timezone),
          triggeredAt: new Date().toISOString(),
        },
        _metadata: {
          schedulerId: node.id,
          enabled,
          emulated: true,
        },
      },
      metadata: {
        triggerType: "scheduler",
        schedule,
        emulated: true,
      },
    };
  }

  // PRODUCTION MODE - TODO: Implement cron scheduler
  throw new Error(
    `Scheduler node not yet implemented for production. ` +
    `Schedule: ${schedule}, Timezone: ${timezone}. ` +
    `TODO: Install 'node-cron' or 'bull' and register cron job. ` +
    `Scheduler nodes should register jobs on flow save, not during execution. ` +
    `Use emulation mode for testing.`
  );

  /* PRODUCTION IMPLEMENTATION TEMPLATE:
  
  import cron from 'node-cron';
  import { db } from '../../../db';
  import { scheduledJobs } from '../../../schema';
  
  // This should happen on flow save/update, not during execution
  // Register cron job in global scheduler registry
  
  const jobId = `${context.flowId}:${node.id}`;
  
  // Check if job already exists
  const existingJob = await db.select().from(scheduledJobs)
    .where(eq(scheduledJobs.id, jobId)).get();
  
  if (existingJob) {
    // Update existing job
    if (enabled) {
      cron.schedule(schedule, async () => {
        // Trigger flow execution
        await triggerFlowExecution(context.flowId, {
          trigger: 'scheduler',
          scheduledTime: new Date().toISOString(),
        });
      }, { timezone });
    } else {
      // Disable job
      existingJob.task?.stop();
    }
  } else {
    // Create new job
    const task = cron.schedule(schedule, async () => {
      await triggerFlowExecution(context.flowId, {
        trigger: 'scheduler',
        scheduledTime: new Date().toISOString(),
      });
    }, { timezone, scheduled: enabled });
    
    await db.insert(scheduledJobs).values({
      id: jobId,
      flowId: context.flowId,
      nodeId: node.id,
      schedule,
      timezone,
      enabled,
      lastRun: null,
      nextRun: getNextCronTime(schedule, timezone),
      createdAt: new Date().toISOString(),
    }).run();
  }
  
  // Scheduler nodes pass through unchanged during manual execution
  return {
    output: input,
    metadata: { schedulerConfigured: true },
  };
  
  */
};

/**
 * Calculate next cron execution time (simplified mock)
 */
function getNextCronTime(cronExpression: string, timezone: string): string {
  // This is a simplified mock - real implementation would use cron-parser
  const now = new Date();
  const nextRun = new Date(now.getTime() + 60 * 60 * 1000); // Mock: +1 hour
  return nextRun.toISOString();
  
  /* PRODUCTION IMPLEMENTATION:
  import parser from 'cron-parser';
  
  const interval = parser.parseExpression(cronExpression, {
    currentDate: new Date(),
    tz: timezone,
  });
  return interval.next().toDate().toISOString();
  */
}
