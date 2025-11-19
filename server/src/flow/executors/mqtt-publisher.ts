/**
 * MQTT Publisher Executor (Caso 4: PLC/Conveyor via MQTT)
 * Publishes messages to MQTT broker for IoT/industrial devices
 * Example: Send conveyor sorting instructions, sensor data, PLC commands
 */

import { NodeExecutor } from "./types.js";
import { logger } from "../../core/logger.js";

const log = logger.child("MQTTPublisherExecutor");

// MQTT clients cache (lazy loaded)
const mqttClients = new Map<string, any>();

export const executeMqttPublisher: NodeExecutor = async (node, input, context) => {
  const brokerUrl = node.data.mqttBroker;
  const topic = node.data.mqttTopic;
  const qos = parseInt(node.data.mqttQos || "1") as 0 | 1 | 2;
  const retain = node.data.mqttRetain || false;

  log.info("Executing MQTT publisher", {
    nodeId: node.id,
    broker: brokerUrl,
    topic,
  });

  try {
    if (!brokerUrl || !topic) {
      throw new Error("MQTT broker URL and topic are required");
    }

    // Get or create MQTT client
    const client = await getMqttClient(brokerUrl);

    // Prepare message payload
    const payload = preparePayload(input);

    // Publish message
    await publishMessage(client, topic, payload, { qos, retain });

    log.info("MQTT message published", {
      nodeId: node.id,
      topic,
      payloadSize: payload.length,
    });

    return {
      success: true,
      output: {
        published: true,
        broker: brokerUrl,
        topic,
        timestamp: new Date().toISOString(),
        payloadSize: payload.length,
      },
      metadata: {
        mqtt: {
          topic,
          qos,
          retain,
        },
      },
    };
  } catch (error: any) {
    log.error("MQTT publish failed", {
      nodeId: node.id,
      error: error.message,
    });

    return {
      success: false,
      output: null,
      error: `MQTT publish failed: ${error.message}`,
    };
  }
};

/**
 * Get or create MQTT client for broker
 */
async function getMqttClient(brokerUrl: string): Promise<any> {
  // Check if client exists and is connected
  if (mqttClients.has(brokerUrl)) {
    const client = mqttClients.get(brokerUrl);
    if (client.connected) {
      return client;
    }
  }

  // Import MQTT library dynamically (optional dependency)
  let mqtt: any;
  try {
    mqtt = await import("mqtt");
  } catch (error) {
    throw new Error(
      "MQTT library not installed. Run: npm install mqtt"
    );
  }

  // Create new client
  log.info("Connecting to MQTT broker", { broker: brokerUrl });

  const client = mqtt.connect(brokerUrl, {
    keepalive: 60,
    clean: true,
    reconnectPeriod: 5000,
  });

  // Wait for connection
  await new Promise<void>((resolve, reject) => {
    client.on("connect", () => {
      log.info("MQTT connected", { broker: brokerUrl });
      resolve();
    });

    client.on("error", (err: Error) => {
      log.error("MQTT connection error", { broker: brokerUrl, error: err.message });
      reject(err);
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!client.connected) {
        reject(new Error("MQTT connection timeout"));
      }
    }, 10000);
  });

  // Cache client
  mqttClients.set(brokerUrl, client);

  return client;
}

/**
 * Publish message to MQTT broker
 */
function publishMessage(
  client: any,
  topic: string,
  payload: Buffer | string,
  options: { qos: 0 | 1 | 2; retain: boolean }
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.publish(topic, payload, options, (err?: Error) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Prepare payload for MQTT
 */
function preparePayload(input: any): Buffer {
  if (Buffer.isBuffer(input)) {
    return input;
  }

  if (typeof input === "string") {
    return Buffer.from(input, "utf-8");
  }

  if (typeof input === "object") {
    return Buffer.from(JSON.stringify(input), "utf-8");
  }

  return Buffer.from(String(input), "utf-8");
}

/**
 * Disconnect all MQTT clients (cleanup)
 */
export async function disconnectAllMqttClients(): Promise<void> {
  log.info("Disconnecting all MQTT clients");

  for (const [broker, client] of mqttClients.entries()) {
    try {
      await new Promise<void>((resolve) => {
        client.end(false, () => {
          log.info("MQTT client disconnected", { broker });
          resolve();
        });
      });
    } catch (error: any) {
      log.warn("Failed to disconnect MQTT client", {
        broker,
        error: error.message,
      });
    }
  }

  mqttClients.clear();
}
