import type { QueueProvider, EnqueueOptions, QueueDelivery } from "./QueueProvider";
import { logger } from "../core/logger.js";

const log = logger.child("RetryManager");

const DEFAULT_MAX_RETRIES = 7; // 7 retries
const DEFAULT_RETRY_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds

export class RetryManager {
  constructor(private queueProvider: QueueProvider) {}
  
  // Note: Queue providers handle their own connection lifecycle
  // RetryManager delegates to underlying provider without managing connections

  async enqueue(topic: string, payload: string, options?: EnqueueOptions): Promise<void> {
    // Stamp initial retry metadata if not present
    const enrichedOptions: EnqueueOptions = {
      retryCount: options?.retryCount ?? 0,
      maxRetries: options?.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryInterval: options?.retryInterval ?? DEFAULT_RETRY_INTERVAL,
      nextRetryAt: options?.nextRetryAt,
    };

    log.debug(`Enqueuing message with retry metadata`, {
      topic,
      maxRetries: enrichedOptions.maxRetries,
      retryInterval: enrichedOptions.retryInterval,
    });

    return this.queueProvider.enqueue(topic, payload, enrichedOptions);
  }

  async consume(
    topic: string,
    handler: (delivery: QueueDelivery) => Promise<void>,
    options?: { concurrency?: number }
  ): Promise<() => void> {
    // Wrap handler to enforce retry policy
    const wrappedHandler = async (delivery: QueueDelivery) => {
      try {
        await handler(delivery);
      } catch (error: any) {
        log.error(`Handler failed for message`, {
          topic,
          retryCount: delivery.message.retryCount,
          maxRetries: delivery.message.maxRetries,
          error: error.message,
        });

        // Check if retries exhausted
        if (delivery.message.retryCount >= delivery.message.maxRetries) {
          log.warn(`Message exhausted all retries - moving to DLQ`, {
            topic,
            retryCount: delivery.message.retryCount,
            maxRetries: delivery.message.maxRetries,
          });

          // Move to dead-letter queue
          await delivery.deadLetter();
          return;
        }

        // Calculate next retry time (linear backoff)
        const nextRetryAt = Date.now() + delivery.message.retryInterval;

        log.info(`Scheduling retry`, {
          topic,
          currentRetry: delivery.message.retryCount,
          nextRetry: delivery.message.retryCount + 1,
          maxRetries: delivery.message.maxRetries,
          nextRetryAt: new Date(nextRetryAt).toISOString(),
          retryInterval: delivery.message.retryInterval,
        });

        // Fail with retry (QueueDelivery.fail will increment retryCount)
        await delivery.fail(nextRetryAt);
      }
    };

    return this.queueProvider.consume(topic, wrappedHandler, options);
  }

  async getDeadLetterDepth(topic: string): Promise<number> {
    return this.queueProvider.getDeadLetterDepth(topic);
  }

  async close(): Promise<void> {
    return this.queueProvider.close();
  }
}
