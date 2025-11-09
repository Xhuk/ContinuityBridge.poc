import type { QueueProvider, QueueMessage, EnqueueOptions, QueueDelivery } from "./QueueProvider.js";
import { logger } from "../core/logger.js";

const log = logger.child("InMemoryQueue");

const DEFAULT_MAX_RETRIES = 7;
const DEFAULT_RETRY_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds

class InMemoryDelivery implements QueueDelivery {
  private finalized = false;

  constructor(
    public payload: string,
    public message: QueueMessage,
    private topic: string,
    private queue: InMemoryQueue
  ) {}

  async ack(): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    // Message already removed from queue - nothing to do
    log.debug(`Message acknowledged for topic: ${this.topic}`);
  }

  async fail(retryAt?: number): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;

    // Requeue with delay
    await this.queue.enqueue(this.topic, this.payload, {
      ...this.message,
      retryCount: this.message.retryCount + 1,
      nextRetryAt: retryAt || Date.now() + this.message.retryInterval,
    });

    log.info(`Message requeued for retry ${this.message.retryCount + 1}/${this.message.maxRetries}`, {
      topic: this.topic,
      nextRetryAt: new Date(retryAt || Date.now() + this.message.retryInterval).toISOString(),
    });
  }

  async deadLetter(): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;

    this.queue.moveToDeadLetter(this.topic, this.message);
  }
}

export class InMemoryQueue implements QueueProvider {
  private queues: Map<string, QueueMessage[]> = new Map();
  private deadLetterQueues: Map<string, QueueMessage[]> = new Map();
  private consumers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = true;

  async enqueue(topic: string, payload: string, options?: EnqueueOptions): Promise<void> {
    if (!this.queues.has(topic)) {
      this.queues.set(topic, []);
    }

    const message: QueueMessage = {
      payload,
      timestamp: Date.now(),
      retryCount: options?.retryCount || 0,
      nextRetryAt: options?.nextRetryAt,
      maxRetries: options?.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryInterval: options?.retryInterval ?? DEFAULT_RETRY_INTERVAL,
    };

    this.queues.get(topic)!.push(message);

    log.debug(`Enqueued message to ${topic}`, { queueDepth: this.queues.get(topic)!.length });
  }

  async consume(
    topic: string,
    handler: (delivery: QueueDelivery) => Promise<void>,
    options?: { concurrency?: number }
  ): Promise<() => void> {
    const concurrency = options?.concurrency || 1;
    log.info(`Starting consumer for topic: ${topic} with concurrency: ${concurrency}`);

    if (!this.queues.has(topic)) {
      this.queues.set(topic, []);
    }
    if (!this.deadLetterQueues.has(topic)) {
      this.deadLetterQueues.set(topic, []);
    }

    // Poll for messages
    const interval = setInterval(async () => {
      if (!this.isRunning) return;

      const queue = this.queues.get(topic)!;
      if (queue.length === 0) return;

      const now = Date.now();

      // Filter ready messages (no nextRetryAt or nextRetryAt <= now)
      const readyMessages: QueueMessage[] = [];
      const delayedMessages: QueueMessage[] = [];

      for (const msg of queue) {
        if (!msg.nextRetryAt || msg.nextRetryAt <= now) {
          readyMessages.push(msg);
        } else {
          delayedMessages.push(msg);
        }
      }

      // Process up to 'concurrency' ready messages in parallel
      const messagesToProcess = readyMessages.slice(0, concurrency);
      const remainingReady = readyMessages.slice(concurrency);

      // Remove processed messages from queue immediately
      // Handler will call delivery.ack/fail/deadLetter to finalize
      this.queues.set(topic, [...remainingReady, ...delayedMessages]);

      // Process all messages
      await Promise.allSettled(
        messagesToProcess.map(async (msg) => {
          const delivery = new InMemoryDelivery(msg.payload, msg, topic, this);
          try {
            await handler(delivery);
          } catch (error) {
            log.error(`Unhandled error processing message from ${topic}`, error);
            // If handler didn't finalize delivery, fail it with default retry
            await delivery.fail();
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

  moveToDeadLetter(topic: string, message: QueueMessage): void {
    if (!this.deadLetterQueues.has(topic)) {
      this.deadLetterQueues.set(topic, []);
    }

    this.deadLetterQueues.get(topic)!.push(message);
    log.info(`Message moved to dead-letter queue for topic: ${topic}`, {
      retryCount: message.retryCount,
      maxRetries: message.maxRetries,
    });
  }

  async getDepth(topic: string): Promise<number> {
    return this.queues.get(topic)?.length || 0;
  }

  async getDeadLetterDepth(topic: string): Promise<number> {
    return this.deadLetterQueues.get(topic)?.length || 0;
  }

  async close(): Promise<void> {
    log.info("Closing InMemoryQueue");
    this.isRunning = false;

    // Clear all consumer intervals
    this.consumers.forEach((interval) => {
      clearInterval(interval);
    });

    this.consumers.clear();
  }
}
