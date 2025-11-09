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

  constructor() {
    this.pipeline = new Pipeline();
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
        async (payload) => {
          // Check if worker is still enabled before processing
          if (!this.config.enabled) {
            log.debug("Worker disabled, skipping message");
            return;
          }

          try {
            const data = JSON.parse(payload);
            log.debug("Processing message from queue", { traceId: data.traceId });

            const result = await this.pipeline.runItemPipeline(data);
            this.messagesProcessed++;

            // Store event, decision, and payload for successful processing
            if (result.success) {
              const { getEventStorage, getDecisionStorage, getPayloadStorage } = await import("../http/rest.js");
              const events = getEventStorage();
              const decisions = getDecisionStorage();
              const payloads = getPayloadStorage();

              // Ensure payload is stored for replay (in case of worker restart)
              if (data.xml && !payloads.has(data.traceId)) {
                payloads.set(data.traceId, data.xml);
              }

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
            }

            // Update queue depths
            const inDepth = await queueProvider.getDepth("items.inbound");
            const outDepth = await queueProvider.getDepth("items.outbound");
            metricsCollector.setQueueDepth(inDepth, outDepth);
          } catch (error) {
            log.error("Error processing message", error);
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

// Global worker instance
let workerInstance: Worker | null = null;

export function getWorkerInstance(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker();
  }
  return workerInstance;
}
