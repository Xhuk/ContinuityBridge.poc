import type { QueueProvider } from "./QueueProvider.js";
import { logger } from "../core/logger.js";
import amqp from "amqplib";

const log = logger.child("RabbitQueue");

export class RabbitQueue implements QueueProvider {
  private connection?: amqp.Connection;
  private channel?: amqp.Channel;
  private connected: boolean = false;

  async connect(): Promise<void> {
    const url = process.env.RABBIT_URL || "amqp://localhost";

    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
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

  async enqueue(topic: string, payload: string): Promise<void> {
    await this.ensureConnected();

    const queue = process.env.RABBIT_QUEUE_IN || topic;
    await this.channel!.assertQueue(queue, { durable: true });
    this.channel!.sendToQueue(queue, Buffer.from(payload), { persistent: true });

    log.debug(`Enqueued message to ${queue}`);
  }

  async consume(
    topic: string,
    handler: (payload: string) => Promise<void>,
    options?: { concurrency?: number }
  ): Promise<() => void> {
    await this.ensureConnected();

    const queue = process.env.RABBIT_QUEUE_IN || topic;
    const concurrency = options?.concurrency || 1;

    await this.channel!.assertQueue(queue, { durable: true });
    await this.channel!.prefetch(concurrency);

    log.info(`Starting consumer for queue: ${queue} with concurrency: ${concurrency}`);

    const result = await this.channel!.consume(queue, async (msg) => {
      if (!msg) return;

      try {
        const payload = msg.content.toString();
        await handler(payload);
        this.channel!.ack(msg);
      } catch (error) {
        log.error(`Error processing message from ${queue}`, error);
        this.channel!.nack(msg, false, false);
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

  async getDepth(topic: string): Promise<number> {
    await this.ensureConnected();

    const queue = process.env.RABBIT_QUEUE_IN || topic;
    const info = await this.channel!.assertQueue(queue, { durable: true });
    return info.messageCount;
  }

  async close(): Promise<void> {
    log.info("Closing RabbitMQ connection");
    await this.channel?.close();
    await this.connection?.close();
    this.connected = false;
  }
}
