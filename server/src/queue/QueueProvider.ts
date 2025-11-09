/**
 * QueueDelivery provides explicit lifecycle control over message processing.
 * Queues create delivery objects and pass to handlers.
 * Handlers (RetryManager) call ack/fail/deadLetter to finalize message disposition.
 */
export interface QueueDelivery {
  payload: string;
  message: QueueMessage;
  /**
   * Acknowledge successful processing. Removes message from queue.
   */
  ack(): Promise<void>;
  /**
   * Mark processing as failed. Requeues message with optional delay.
   * @param retryAt - Unix timestamp (ms) when message should be retried
   */
  fail(retryAt?: number): Promise<void>;
  /**
   * Move message to dead-letter queue after exhausting retries.
   */
  deadLetter(): Promise<void>;
}

export interface QueueProvider {
  enqueue(topic: string, payload: string, options?: EnqueueOptions): Promise<void>;
  consume(
    topic: string,
    handler: (delivery: QueueDelivery) => Promise<void>,
    options?: { concurrency?: number }
  ): Promise<() => void>; // Returns disposer function
  getDepth(topic: string): Promise<number>;
  getDeadLetterDepth(topic: string): Promise<number>;
  close(): Promise<void>;
}

export interface EnqueueOptions {
  retryCount?: number;
  nextRetryAt?: number; // Unix timestamp (milliseconds)
  maxRetries?: number;
  retryInterval?: number; // Milliseconds
}

export interface QueueMessage {
  payload: string;
  timestamp: number;
  retryCount: number;
  nextRetryAt?: number; // Unix timestamp when message should be processed
  maxRetries: number;
  retryInterval: number; // Milliseconds between retries
}
