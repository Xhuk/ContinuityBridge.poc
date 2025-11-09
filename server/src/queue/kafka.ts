import type { QueueProvider } from "./QueueProvider.js";
import { logger } from "../core/logger.js";
import { Kafka, type Producer, type Consumer } from "kafkajs";

const log = logger.child("KafkaQueue");

export class KafkaQueue implements QueueProvider {
  private kafka?: Kafka;
  private producer?: Producer;
  private consumer?: Consumer;
  private connected: boolean = false;
  private isConsuming: boolean = false;
  private runInitialized: boolean = false;

  async connect(): Promise<void> {
    const brokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
    const user = process.env.KAFKA_USER;
    const pass = process.env.KAFKA_PASS;

    this.kafka = new Kafka({
      clientId: "continuitybridge",
      brokers,
      ...(user &&
        pass && {
          sasl: {
            mechanism: "plain",
            username: user,
            password: pass,
          },
          ssl: true,
        }),
    });

    this.producer = this.kafka.producer();
    await this.producer.connect();

    this.consumer = this.kafka.consumer({
      groupId: process.env.KAFKA_GROUP_ID || "continuitybridge",
    });
    await this.consumer.connect();

    this.connected = true;
    log.info("Connected to Kafka");
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected || !this.producer || !this.consumer) {
      await this.connect();
    }
  }

  async enqueue(topic: string, payload: string): Promise<void> {
    await this.ensureConnected();

    const kafkaTopic = process.env.KAFKA_TOPIC_IN || topic;
    await this.producer!.send({
      topic: kafkaTopic,
      messages: [{ value: payload }],
    });

    log.debug(`Enqueued message to ${kafkaTopic}`);
  }

  async consume(
    topic: string,
    handler: (payload: string) => Promise<void>,
    options?: { concurrency?: number }
  ): Promise<() => void> {
    await this.ensureConnected();

    const kafkaTopic = process.env.KAFKA_TOPIC_IN || topic;
    const concurrency = options?.concurrency || 1;

    // Initialize consumer run only once
    if (!this.runInitialized) {
      await this.consumer!.subscribe({ topic: kafkaTopic, fromBeginning: false });

      this.consumer!.run({
        partitionsConsumedConcurrently: concurrency,
        eachMessage: async ({ message }) => {
          if (!this.isConsuming) return;

          try {
            const payload = message.value?.toString() || "";
            await handler(payload);
          } catch (error) {
            log.error(`Error processing message from ${kafkaTopic}`, error);
          }
        },
      });

      this.runInitialized = true;
      log.info(`Initialized consumer for topic: ${kafkaTopic} with concurrency: ${concurrency}`);
    } else {
      // Resume paused consumer
      this.consumer!.resume([{ topic: kafkaTopic }]);
      log.info(`Resumed consumer for topic: ${kafkaTopic}`);
    }

    // Mark as actively consuming
    this.isConsuming = true;

    // Return disposer function
    return () => {
      log.info(`Disposing consumer for topic: ${kafkaTopic}`);
      
      // Pause consumption FIRST to minimize race window
      if (this.consumer) {
        this.consumer.pause([{ topic: kafkaTopic }]);
      }
      
      // Then disable consuming
      // Note: Small race window exists where messages delivered between pause
      // and flag flip may auto-commit without processing. Production implementation
      // should use manual commits and await pause completion.
      this.isConsuming = false;
    };
  }

  async getDepth(topic: string): Promise<number> {
    // Kafka doesn't provide easy queue depth - return 0
    // In production, you'd query partition offsets
    return 0;
  }

  async close(): Promise<void> {
    log.info("Closing Kafka connection");
    await this.producer?.disconnect();
    await this.consumer?.disconnect();
    this.connected = false;
  }
}
