import type { QueueProvider } from "./queue/QueueProvider.js";
import { InMemoryQueue } from "./queue/inmemory.js";
import { RabbitQueue } from "./queue/rabbit.js";
import { KafkaQueue } from "./queue/kafka.js";
import { logger } from "./core/logger.js";

const log = logger.child("QueueManager");

let queueProvider: QueueProvider | null = null;
let currentBackend: string = "inmemory";

export async function initializeQueue(): Promise<QueueProvider> {
  const backend = process.env.QUEUE_BACKEND || "inmemory";

  if (queueProvider && currentBackend === backend) {
    return queueProvider;
  }

  // Close existing queue if switching backends
  if (queueProvider) {
    await queueProvider.close();
  }

  log.info(`Initializing queue backend: ${backend}`);

  switch (backend) {
    case "rabbit":
      queueProvider = new RabbitQueue();
      await (queueProvider as RabbitQueue).connect();
      break;

    case "kafka":
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
