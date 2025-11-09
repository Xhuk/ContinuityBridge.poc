import type { QueueProvider } from "./queue/QueueProvider.js";
import { InMemoryQueue } from "./queue/inmemory.js";
import { RabbitQueue } from "./queue/rabbit.js";
import { KafkaQueue } from "./queue/kafka.js";
import { logger } from "./core/logger.js";

const log = logger.child("QueueManager");

let queueProvider: QueueProvider | null = null;
let currentBackend: string = "inmemory";

export async function initializeQueue(storage?: any, secretsService?: any): Promise<QueueProvider> {
  let backend = process.env.QUEUE_BACKEND || "inmemory";
  let credentials: any = null;

  // Read persisted queue backend config (takes precedence over env var)
  if (storage?.getQueueBackendConfig) {
    try {
      const config = await storage.getQueueBackendConfig();
      if (config && config.currentBackend) {
        backend = config.currentBackend;
        log.info(`Using persisted queue backend: ${backend}`);

        // Decrypt credentials from secrets vault if needed
        if ((backend === "rabbitmq" || backend === "kafka") && config.currentSecretId) {
          if (storage.getSecret && secretsService?.retrieveSecret) {
            const secretEntry = await storage.getSecret(config.currentSecretId);
            if (secretEntry) {
              credentials = await secretsService.retrieveSecret(secretEntry);
              log.info(`Decrypted ${backend} credentials from vault`);
            } else {
              log.warn(`Secret ${config.currentSecretId} not found - falling back to InMemory`);
              backend = "inmemory";
            }
          } else {
            log.warn(`Cannot decrypt secrets (vault locked?) - falling back to InMemory`);
            backend = "inmemory";
          }
        }
      }
    } catch (error) {
      log.error("Error reading queue backend config:", error);
      // Fall back to env var or inmemory
    }
  }

  if (queueProvider && currentBackend === backend) {
    return queueProvider;
  }

  // Close existing queue if switching backends
  if (queueProvider) {
    await queueProvider.close();
  }

  log.info(`Initializing queue backend: ${backend}`);

  try {
    switch (backend) {
      case "rabbitmq":
      case "rabbit":
        if (credentials && credentials.connectionUrl) {
          // Set credentials as environment variables for RabbitQueue
          process.env.RABBIT_URL = credentials.connectionUrl;
          if (credentials.queueIn) process.env.RABBIT_QUEUE_IN = credentials.queueIn;
          if (credentials.queueOut) process.env.RABBIT_QUEUE_OUT = credentials.queueOut;
        }
        queueProvider = new RabbitQueue();
        await (queueProvider as RabbitQueue).connect();
        break;

      case "kafka":
        if (credentials && credentials.brokers) {
          // Set credentials as environment variables for KafkaQueue
          process.env.KAFKA_BROKERS = credentials.brokers;
          if (credentials.username) process.env.KAFKA_USER = credentials.username;
          if (credentials.password) process.env.KAFKA_PASS = credentials.password;
          if (credentials.saslMechanism) process.env.KAFKA_SASL_MECHANISM = credentials.saslMechanism;
          if (credentials.groupId) process.env.KAFKA_GROUP_ID = credentials.groupId;
          if (credentials.topicIn) process.env.KAFKA_TOPIC_IN = credentials.topicIn;
          if (credentials.topicOut) process.env.KAFKA_TOPIC_OUT = credentials.topicOut;
        }
        queueProvider = new KafkaQueue();
        await (queueProvider as KafkaQueue).connect();
        break;

      case "inmemory":
      default:
        queueProvider = new InMemoryQueue();
        break;
    }

    currentBackend = backend;
    log.info(`Queue backend initialized: ${backend}`);

  } catch (error: any) {
    log.error(`Failed to initialize ${backend} backend:`, error);
    
    // Save error to config if storage available
    if (storage?.saveQueueBackendConfig) {
      const config = await storage.getQueueBackendConfig?.();
      if (config) {
        await storage.saveQueueBackendConfig({
          ...config,
          lastError: error.message,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // Fallback to InMemory on failure
    log.warn("Falling back to InMemory queue backend");
    queueProvider = new InMemoryQueue();
    currentBackend = "inmemory";
  }

  return queueProvider;
}

export function getQueueProvider(): QueueProvider {
  if (!queueProvider) {
    throw new Error("Queue provider not initialized");
  }
  return queueProvider;
}

export function getCurrentBackend(): string {
  return currentBackend;
}
