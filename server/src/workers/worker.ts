import { randomUUID } from "crypto";
import { Pipeline } from "../core/pipeline.js";
import { getQueueProvider } from "../serverQueue.js";
import { logger } from "../core/logger.js";
import { metricsCollector } from "../core/metrics.js";

const log = logger.child("Worker");

interface WorkerConfig {
  enabled: boolean;
  concurrency: number;
}

export class Worker {
  private pipeline: Pipeline;
  private config: WorkerConfig;
  private messagesProcessed: number = 0;
  private isRunning: boolean = false;
  private disposer: (() => void) | null = null;

  constructor(pipeline: Pipeline) {
    this.pipeline = pipeline;
    this.config = {
      enabled: true,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || "3", 10),
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn("Worker already running");
      return;
    }

    // Enable the worker and mark as running
    this.config.enabled = true;
    this.isRunning = true;
    log.info(`Starting worker with concurrency: ${this.config.concurrency}`);

    const queueProvider = getQueueProvider();

    try {
      this.disposer = await queueProvider.consume(
        "items.inbound",
        async (delivery) => {
          // Check if worker is still enabled before processing
          if (!this.config.enabled) {
            log.debug("Worker disabled, skipping message");
            await delivery.ack();
            return;
          }

          try {
            const data = JSON.parse(delivery.payload);
            log.debug("Processing message from queue", { 
              traceId: data.traceId,
              mode: data.mode,
              hasXml: !!data.xml,
              hasFlowId: !!data.flowId,
              retryCount: delivery.message.retryCount,
            });

            // Transform legacy payload format to discriminated union
            let pipelineInput;
            if (data.mode) {
              // New format with discriminated union
              pipelineInput = data;
            } else if (data.xml) {
              // Legacy XML format
              pipelineInput = {
                mode: 'xml' as const,
                xml: data.xml,
                traceId: data.traceId,
              };
            } else if (data.canonical) {
              // Legacy canonical format
              pipelineInput = {
                mode: 'canonical' as const,
                canonical: data.canonical,
                traceId: data.traceId,
              };
            } else {
              throw new Error("Invalid queue message format: missing mode, xml, or canonical");
            }

            const result = await this.pipeline.runItemPipeline(pipelineInput);
            this.messagesProcessed++;

            const { getEventStorage, getDecisionStorage, getPayloadStorage } = await import("../http/rest.js");
            const events = getEventStorage();
            const decisions = getDecisionStorage();
            const payloads = getPayloadStorage();

            // Store payload for replay (both success and failure)
            if (data.xml && !payloads.has(data.traceId)) {
              payloads.set(data.traceId, data.xml);
            }

            if (result.success) {
              // Store successful event
              events.push({
                id: randomUUID(),
                traceId: result.traceId,
                timestamp: new Date().toISOString(),
                sku: result.canonical?.sku || "",
                warehouse: result.decision?.warehouseName || "",
                warehouseId: result.decision?.warehouseId || "",
                reason: result.decision?.reason || "",
                status: "completed",
                latencyMs: result.latencyMs,
                retryCount: delivery.message.retryCount,
              });

              decisions.push({
                traceId: result.traceId,
                timestamp: new Date().toISOString(),
                selectedWarehouse: {
                  id: result.decision?.warehouseId || "",
                  name: result.decision?.warehouseName || "",
                  location: "",
                },
                reason: result.decision?.reason || "",
                alternatives: [],
                decisionFactors: {},
              });

              // Acknowledge successful processing
              await delivery.ack();
            } else {
              // Store failed event
              events.push({
                id: randomUUID(),
                traceId: result.traceId,
                timestamp: new Date().toISOString(),
                sku: result.canonical?.sku || "",
                warehouse: "",
                warehouseId: "",
                reason: result.error || "Processing failed",
                status: "failed",
                latencyMs: result.latencyMs,
                retryCount: delivery.message.retryCount,
                error: result.error,
              });

              // Throw error to trigger RetryManager's retry logic
              throw new Error(result.error || "Pipeline processing failed");
            }

            // Update queue depths
            const inDepth = await queueProvider.getDepth("items.inbound");
            const outDepth = await queueProvider.getDepth("items.outbound");
            metricsCollector.setQueueDepth(inDepth, outDepth);
          } catch (error: any) {
            log.error("Error processing message", {
              error: error.message,
              retryCount: delivery.message.retryCount,
              maxRetries: delivery.message.maxRetries,
            });
            
            // Re-throw to let RetryManager handle retry logic
            throw error;
          }
        },
        { concurrency: this.config.concurrency }
      );

      log.info("Worker started and consuming messages");
    } catch (error) {
      log.error("Failed to start worker", error);
      this.isRunning = false;
      this.config.enabled = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    log.info("Stopping worker");
    this.config.enabled = false;
    this.isRunning = false;

    // Dispose consumer subscription
    if (this.disposer) {
      this.disposer();
      this.disposer = null;
    }
  }

  setConfig(config: Partial<WorkerConfig>): void {
    this.config = { ...this.config, ...config };
    log.info("Worker config updated", this.config);
  }

  getStatus() {
    return {
      enabled: this.config.enabled,
      concurrency: this.config.concurrency,
      messagesProcessed: this.messagesProcessed,
      currentThroughput: 0, // Calculated from metrics
      status: this.isRunning ? "running" : "stopped",
    };
  }
}

// Global worker instance (initialized by composition root)
let workerInstance: Worker | null = null;

export function setWorkerInstance(worker: Worker): void {
  workerInstance = worker;
}

export function getWorkerInstance(): Worker {
  if (!workerInstance) {
    throw new Error("Worker not initialized. Call setWorkerInstance() first.");
  }
  return workerInstance;
}
