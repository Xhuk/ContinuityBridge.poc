import type { QueueProvider, QueueMessage, EnqueueOptions, QueueDelivery } from "./QueueProvider.js";
import { logger } from "../core/logger.js";
import { Kafka, type Producer, type Consumer } from "kafkajs";

const log = logger.child("KafkaQueue");

const DEFAULT_MAX_RETRIES = 7;
const DEFAULT_RETRY_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds

class KafkaDelivery implements QueueDelivery {
  private finalized = false;

  constructor(
    public payload: string,
    public message: QueueMessage,
    private topic: string,
    private queue: KafkaQueue,
    private commitFn: () => Promise<void>
  ) {}

  async ack(): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    await this.commitFn(); // Commit offset
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

    await this.commitFn(); // Commit original offset

    log.info(`Message requeued for retry ${this.message.retryCount + 1}/${this.message.maxRetries}`, {
      topic: this.topic,
      nextRetryAt: new Date(retryAt || Date.now() + this.message.retryInterval).toISOString(),
    });
  }

  async deadLetter(): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;

    this.queue.moveToDeadLetter(this.topic, this.message);
    await this.commitFn(); // Commit original offset
  }
}

export class KafkaQueue implements QueueProvider {
  private kafka?: Kafka;
  private producer?: Producer;
  private consumer?: Consumer;
  private connected: boolean = false;
  private isConsuming: boolean = false;
  private runInitialized: boolean = false;
  private deadLetterMessages: Map<string, QueueMessage[]> = new Map();

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

  async enqueue(topic: string, payload: string, options?: EnqueueOptions): Promise<void> {
    await this.ensureConnected();

    const kafkaTopic = process.env.KAFKA_TOPIC_IN || topic;

    const message: QueueMessage = {
      payload,
      timestamp: Date.now(),
      retryCount: options?.retryCount || 0,
      nextRetryAt: options?.nextRetryAt,
      maxRetries: options?.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryInterval: options?.retryInterval ?? DEFAULT_RETRY_INTERVAL,
    };

    await this.producer!.send({
      topic: kafkaTopic,
      messages: [{ value: JSON.stringify(message) }],
    });

    log.debug(`Enqueued message to ${kafkaTopic}`);
  }

  async consume(
    topic: string,
    handler: (delivery: QueueDelivery) => Promise<void>,
    options?: { concurrency?: number }
  ): Promise<() => void> {
    await this.ensureConnected();

    const kafkaTopic = process.env.KAFKA_TOPIC_IN || topic;
    const concurrency = options?.concurrency || 1;

    // Initialize dead-letter tracking
    if (!this.deadLetterMessages.has(topic)) {
      this.deadLetterMessages.set(topic, []);
    }

    // Initialize consumer run only once
    if (!this.runInitialized) {
      await this.consumer!.subscribe({ topic: kafkaTopic, fromBeginning: false });

      this.consumer!.run({
        partitionsConsumedConcurrently: concurrency,
        autoCommit: false, // Manual commit via delivery.ack/fail/deadLetter
        eachMessage: async ({ topic: kafkaTopic, partition, message: kafkaMessage, pause, heartbeat }) => {
          if (!this.isConsuming) return;

          try {
            const messageObj: QueueMessage = JSON.parse(kafkaMessage.value?.toString() || "{}");
            
            // Check if message should be delayed
            if (messageObj.nextRetryAt && messageObj.nextRetryAt > Date.now()) {
              // Message not ready yet - pause briefly
              const resumeTimeout = Math.min(messageObj.nextRetryAt - Date.now(), 5000);
              const resumeFn = pause();
              setTimeout(() => resumeFn(), resumeTimeout);
              return;
            }

            // Create delivery with manual commit that actually commits offsets
            let committed = false;
            const commitFn = async () => {
              if (committed) return;
              committed = true;
              await heartbeat();
              await this.consumer!.commitOffsets([{
                topic: kafkaTopic,
                partition,
                offset: (Number(kafkaMessage.offset) + 1).toString(),
              }]);
            };

            const delivery = new KafkaDelivery(
              messageObj.payload,
              messageObj,
              topic,
              this,
              commitFn
            );

            await handler(delivery);

            // If handler didn't commit, auto-commit
            if (!committed) {
              await delivery.ack();
            }
          } catch (error) {
            log.error(`Unhandled error processing message from ${kafkaTopic}`, error);
            // Don't commit on error - message will be redelivered
            throw error;
          }
        },
      });

      this.runInitialized = true;
      log.info(`Initialized consumer for topic: ${kafkaTopic} with concurrency: ${concurrency}`);
    } else {
      this.consumer!.resume([{ topic: kafkaTopic }]);
      log.info(`Resumed consumer for topic: ${kafkaTopic}`);
    }

    this.isConsuming = true;

    return () => {
      log.info(`Disposing consumer for topic: ${kafkaTopic}`);
      if (this.consumer) {
        this.consumer.pause([{ topic: kafkaTopic }]);
      }
      this.isConsuming = false;
    };
  }

  moveToDeadLetter(topic: string, message: QueueMessage): void {
    // Kafka doesn't have native DLQ support, store in-memory for MVP
    if (!this.deadLetterMessages.has(topic)) {
      this.deadLetterMessages.set(topic, []);
    }

    this.deadLetterMessages.get(topic)!.push(message);
    log.info(`Message moved to dead-letter queue for topic: ${topic}`, {
      retryCount: message.retryCount,
      maxRetries: message.maxRetries,
    });
  }

  async getDepth(topic: string): Promise<number> {
    // Kafka doesn't provide easy queue depth - return 0
    // In production, you'd query partition offsets
    return 0;
  }

  async getDeadLetterDepth(topic: string): Promise<number> {
    return this.deadLetterMessages.get(topic)?.length || 0;
  }

  async close(): Promise<void> {
    log.info("Closing Kafka connection");
    await this.producer?.disconnect();
    await this.consumer?.disconnect();
    this.connected = false;
  }
}
