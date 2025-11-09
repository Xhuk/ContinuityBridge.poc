import type { QueueProvider, QueueMessage } from "./QueueProvider.js";
import { logger } from "../core/logger.js";

const log = logger.child("InMemoryQueue");

export class InMemoryQueue implements QueueProvider {
  private queues: Map<string, QueueMessage[]> = new Map();
  private consumers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = true;

  async enqueue(topic: string, payload: string): Promise<void> {
    if (!this.queues.has(topic)) {
      this.queues.set(topic, []);
    }

    this.queues.get(topic)!.push({
      payload,
      timestamp: Date.now(),
    });

    log.debug(`Enqueued message to ${topic}`, { queueDepth: this.queues.get(topic)!.length });
  }

  async consume(
    topic: string,
    handler: (payload: string) => Promise<void>,
    options?: { concurrency?: number }
  ): Promise<() => void> {
    const concurrency = options?.concurrency || 1;
    log.info(`Starting consumer for topic: ${topic} with concurrency: ${concurrency}`);

    if (!this.queues.has(topic)) {
      this.queues.set(topic, []);
    }

    // Poll for messages
    const interval = setInterval(async () => {
      if (!this.isRunning) return;

      const queue = this.queues.get(topic)!;
      if (queue.length === 0) return;

      // Process up to 'concurrency' messages in parallel
      const messagesToProcess = queue.splice(0, concurrency);

      await Promise.all(
        messagesToProcess.map(async (msg) => {
          try {
            await handler(msg.payload);
          } catch (error) {
            log.error(`Error processing message from ${topic}`, error);
          }
        })
      );
    }, 100); // Poll every 100ms

    this.consumers.set(topic, interval);

    // Return disposer function
    return () => {
      log.info(`Disposing consumer for topic: ${topic}`);
      clearInterval(interval);
      this.consumers.delete(topic);
    };
  }

  async getDepth(topic: string): Promise<number> {
    return this.queues.get(topic)?.length || 0;
  }

  async close(): Promise<void> {
    log.info("Closing InMemoryQueue");
    this.isRunning = false;

    for (const interval of this.consumers.values()) {
      clearInterval(interval);
    }

    this.consumers.clear();
  }
}
