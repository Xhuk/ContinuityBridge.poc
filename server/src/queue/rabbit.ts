import type { QueueProvider, QueueMessage, EnqueueOptions, QueueDelivery } from "./QueueProvider.js";
import { logger } from "../core/logger.js";
import amqp from "amqplib";

const log = logger.child("RabbitQueue");

const DEFAULT_MAX_RETRIES = 7;
const DEFAULT_RETRY_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds

class RabbitDelivery implements QueueDelivery {
  private finalized = false;

  constructor(
    public payload: string,
    public message: QueueMessage,
    private topic: string,
    private rabbitMsg: amqp.ConsumeMessage,
    private channel: amqp.Channel,
    private queue: RabbitQueue
  ) {}

  async ack(): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    this.channel.ack(this.rabbitMsg);
    log.debug(`Message acknowledged for topic: ${this.topic}`);
  }

  async fail(retryAt?: number): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;

    // Requeue via queue.enqueue with delay
    await this.queue.enqueue(this.topic, this.payload, {
      ...this.message,
      retryCount: this.message.retryCount + 1,
      nextRetryAt: retryAt || Date.now() + this.message.retryInterval,
    });

    // ACK original message
    this.channel.ack(this.rabbitMsg);

    log.info(`Message requeued for retry ${this.message.retryCount + 1}/${this.message.maxRetries}`, {
      topic: this.topic,
      nextRetryAt: new Date(retryAt || Date.now() + this.message.retryInterval).toISOString(),
    });
  }

  async deadLetter(): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;

    await this.queue.moveToDeadLetter(this.topic, this.message);
    // ACK original message
    this.channel.ack(this.rabbitMsg);
  }
}

export class RabbitQueue implements QueueProvider {
  private connection?: any; // amqplib types have issues, use any for MVP
  private channel?: amqp.Channel;
  private connected: boolean = false;

  async connect(): Promise<void> {
    const url = process.env.RABBIT_URL || "amqp://localhost";

    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection!.createChannel();
      this.connected = true;
      log.info("Connected to RabbitMQ");
    } catch (error) {
      log.error("Failed to connect to RabbitMQ", error);
      throw error;
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected || !this.channel) {
      await this.connect();
    }
  }

  async enqueue(topic: string, payload: string, options?: EnqueueOptions): Promise<void> {
    await this.ensureConnected();

    const queue = process.env.RABBIT_QUEUE_IN || topic;
    const exchange = `${queue}.delayed`;
    await this.channel!.assertQueue(queue, { durable: true });

    const message: QueueMessage = {
      payload,
      timestamp: Date.now(),
      retryCount: options?.retryCount || 0,
      nextRetryAt: options?.nextRetryAt,
      maxRetries: options?.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryInterval: options?.retryInterval ?? DEFAULT_RETRY_INTERVAL,
    };

    const messageBuffer = Buffer.from(JSON.stringify(message));
    
    // If delayed, use delayed exchange (requires rabbitmq_delayed_message_exchange plugin)
    if (message.nextRetryAt) {
      const delay = Math.max(0, message.nextRetryAt - Date.now());
      
      try {
        // Assert delayed exchange (x-delayed-message type requires plugin)
        await this.channel!.assertExchange(exchange, "x-delayed-message", {
          durable: true,
          arguments: { "x-delayed-type": "direct" },
        });
        
        // Bind queue to exchange if not already bound
        await this.channel!.bindQueue(queue, exchange, queue);
        
        // Publish to exchange with x-delay header
        this.channel!.publish(exchange, queue, messageBuffer, {
          persistent: true,
          headers: { "x-delay": delay },
        });
        
        log.debug(`Enqueued delayed message to exchange ${exchange} (delay: ${delay}ms)`);
      } catch (error: any) {
        // Plugin not available - throw clear error
        log.error(`Failed to use delayed exchange - rabbitmq_delayed_message_exchange plugin required`, {
          error: error.message,
          recommendation: "Install plugin OR use InMemoryQueue for native delay support",
        });
        throw new Error(`RabbitMQ delayed messages require rabbitmq_delayed_message_exchange plugin. Install plugin OR use InMemoryQueue.`);
      }
    } else {
      // No delay - send directly to queue
      this.channel!.sendToQueue(queue, messageBuffer, { persistent: true });
      log.debug(`Enqueued message to ${queue}`);
    }
  }

  async consume(
    topic: string,
    handler: (delivery: QueueDelivery) => Promise<void>,
    options?: { concurrency?: number }
  ): Promise<() => void> {
    await this.ensureConnected();

    const queue = process.env.RABBIT_QUEUE_IN || topic;
    const dlq = `${queue}.dlq`;
    const concurrency = options?.concurrency || 1;

    await this.channel!.assertQueue(queue, { durable: true });
    await this.channel!.assertQueue(dlq, { durable: true });
    await this.channel!.prefetch(concurrency);

    log.info(`Starting consumer for queue: ${queue} with concurrency: ${concurrency}`);

    const result = await this.channel!.consume(queue, async (msg) => {
      if (!msg) return;

      try {
        const messageObj: QueueMessage = JSON.parse(msg.content.toString());
        
        // Check if message should be delayed
        // NOTE: RabbitMQ delay requires rabbitmq_delayed_message_exchange plugin (x-delay header)
        // Without plugin, delayed messages will tight-loop - use InMemoryQueue instead
        if (messageObj.nextRetryAt && messageObj.nextRetryAt > Date.now()) {
          // Reject delayed message without x-delay plugin support
          // This creates tight loop but ensures no message loss
          // Production deployments MUST either:
          // 1. Install rabbitmq_delayed_message_exchange plugin, OR
          // 2. Use InMemoryQueue (has native delay support)
          this.channel!.nack(msg, false, true); // Requeue for retry
          
          log.warn(`Delayed message requires rabbitmq_delayed_message_exchange plugin`, {
            topic,
            delayMs: messageObj.nextRetryAt - Date.now(),
            retryCount: messageObj.retryCount,
            recommendation: "Install plugin OR use InMemoryQueue for native delay support"
          });
          
          return;
        }

        // Create delivery and pass to handler
        const delivery = new RabbitDelivery(
          messageObj.payload,
          messageObj,
          topic,
          msg,
          this.channel!,
          this
        );

        await handler(delivery);
      } catch (error) {
        log.error(`Unhandled error processing message from ${queue}`, error);
        // Nack to requeue
        this.channel!.nack(msg, false, true);
      }
    });

    const consumerTag = result.consumerTag;

    // Return disposer function
    return () => {
      log.info(`Disposing consumer for queue: ${queue}`);
      this.channel?.cancel(consumerTag).catch((err) => {
        log.error("Error canceling consumer", err);
      });
    };
  }

  async moveToDeadLetter(topic: string, message: QueueMessage): Promise<void> {
    await this.ensureConnected();

    const dlq = `${process.env.RABBIT_QUEUE_IN || topic}.dlq`;
    await this.channel!.assertQueue(dlq, { durable: true });
    this.channel!.sendToQueue(dlq, Buffer.from(JSON.stringify(message)), { persistent: true });

    log.info(`Message moved to dead-letter queue: ${dlq}`, {
      retryCount: message.retryCount,
      maxRetries: message.maxRetries,
    });
  }

  async getDepth(topic: string): Promise<number> {
    await this.ensureConnected();

    const queue = process.env.RABBIT_QUEUE_IN || topic;
    const info = await this.channel!.assertQueue(queue, { durable: true });
    return info.messageCount;
  }

  async getDeadLetterDepth(topic: string): Promise<number> {
    await this.ensureConnected();

    const dlq = `${process.env.RABBIT_QUEUE_IN || topic}.dlq`;
    const info = await this.channel!.assertQueue(dlq, { durable: true });
    return info.messageCount;
  }

  async close(): Promise<void> {
    log.info("Closing RabbitMQ connection");
    await this.channel?.close();
    await this.connection?.close();
    this.connected = false;
  }
}
