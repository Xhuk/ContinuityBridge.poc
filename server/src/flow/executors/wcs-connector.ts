/**
 * WCS (Warehouse Control System) Connector Executor (Caso 4)
 * Communicates with conveyor/sorter control systems via REST/MQTT/OPC-UA
 * Example: Send sorting instructions, pallet routing, label printing commands
 */

import { NodeExecutor } from "./types.js";
import { logger } from "../../core/logger.js";

const log = logger.child("WCSConnectorExecutor");

export const executeWcsConnector: NodeExecutor = async (node, input, context) => {
  const wcsEndpoint = node.data.wcsEndpoint;
  const wcsProtocol = node.data.wcsProtocol || "rest";
  const conveyorZone = node.data.conveyorZone;
  const sortingRules = node.data.sortingRules || {};

  log.info("Executing WCS connector", {
    nodeId: node.id,
    protocol: wcsProtocol,
    endpoint: wcsEndpoint,
    zone: conveyorZone,
  });

  try {
    if (!wcsEndpoint) {
      throw new Error("WCS endpoint is required");
    }

    // Prepare WCS command from input
    const command = prepareWcsCommand(input, sortingRules, conveyorZone);

    let result: any;

    // Execute based on protocol
    switch (wcsProtocol) {
      case "rest":
        result = await sendRestCommand(wcsEndpoint, command);
        break;
      
      case "mqtt":
        result = await sendMqttCommand(wcsEndpoint, command);
        break;
      
      case "opc-ua":
        result = await sendOpcUaCommand(wcsEndpoint, command);
        break;
      
      default:
        throw new Error(`Unsupported WCS protocol: ${wcsProtocol}`);
    }

    log.info("WCS command sent successfully", {
      nodeId: node.id,
      commandType: command.type,
      conveyorZone,
    });

    return {
      success: true,
      output: {
        wcsResponse: result,
        command,
        timestamp: new Date().toISOString(),
      },
      metadata: {
        wcs: {
          protocol: wcsProtocol,
          zone: conveyorZone,
          commandType: command.type,
        },
      },
    };
  } catch (error: any) {
    log.error("WCS connector failed", {
      nodeId: node.id,
      error: error.message,
    });

    return {
      success: false,
      output: null,
      error: `WCS connector failed: ${error.message}`,
    };
  }
};

/**
 * Prepare WCS command from input data
 */
function prepareWcsCommand(input: any, sortingRules: any, zone?: string): any {
  const data = typeof input === "string" ? JSON.parse(input) : input;

  // Extract relevant data
  const order = data.order || data;
  const items = order.items || [];
  const carrier = order.carrier || data.carrier;
  const destination = order.shippingAddress || data.destination;

  // Determine sorting destination
  const sortDestination = determineSortDestination(
    carrier,
    destination,
    sortingRules
  );

  // Build WCS command
  return {
    type: "SORT_COMMAND",
    zone: zone || "main",
    orderId: order.id || order.orderId,
    sortDestination,
    carrier,
    priority: order.priority || "normal",
    items: items.map((item: any) => ({
      sku: item.sku,
      quantity: item.quantity,
      barcode: item.barcode,
    })),
    labelData: {
      trackingNumber: order.trackingNumber,
      carrierCode: carrier,
      destination: destination?.zipCode,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Determine sorting destination based on carrier and rules
 */
function determineSortDestination(
  carrier: string,
  destination: any,
  rules: any
): string {
  // Check custom rules first
  if (rules.destinations) {
    for (const [ruleCarrier, dest] of Object.entries(rules.destinations)) {
      if (carrier?.toLowerCase() === ruleCarrier.toLowerCase()) {
        return dest as string;
      }
    }
  }

  // Default mapping
  const carrierMap: Record<string, string> = {
    fedex: "LANE_A",
    ups: "LANE_B",
    usps: "LANE_C",
    dhl: "LANE_D",
    own_fleet: "LANE_LOCAL",
    local_courier: "LANE_LOCAL",
  };

  return carrierMap[carrier?.toLowerCase()] || "LANE_DEFAULT";
}

/**
 * Send command via REST API
 */
async function sendRestCommand(endpoint: string, command: any): Promise<any> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`WCS REST API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Send command via MQTT
 */
async function sendMqttCommand(brokerUrl: string, command: any): Promise<any> {
  // Use MQTT publisher executor
  const { executeMqttPublisher } = await import("./mqtt-publisher.js");

  const result = await executeMqttPublisher(
    {
      id: "wcs-mqtt",
      type: "mqtt_publisher",
      position: { x: 0, y: 0 },
      data: {
        label: "WCS MQTT",
        mqttBroker: brokerUrl,
        mqttTopic: "wcs/commands",
        mqttQos: "1",
      },
    },
    command,
    {} as any
  );

  if (!result.success) {
    throw new Error(result.error || "MQTT publish failed");
  }

  return result.output;
}

/**
 * Send command via OPC-UA
 */
async function sendOpcUaCommand(endpoint: string, command: any): Promise<any> {
  // OPC-UA implementation requires node-opcua library
  // For now, throw error indicating it's not implemented
  throw new Error(
    "OPC-UA protocol not yet implemented. " +
    "Install node-opcua and implement OPC-UA client logic."
  );

  // Future implementation:
  // const opcua = await import("node-opcua");
  // const client = opcua.OPCUAClient.create({...});
  // await client.connect(endpoint);
  // // Write to PLC variables
  // await client.disconnect();
}

/**
 * Get WCS status (for monitoring)
 */
export async function getWcsStatus(endpoint: string, protocol: string): Promise<any> {
  try {
    if (protocol === "rest") {
      const response = await fetch(`${endpoint}/status`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`WCS status check failed: ${response.status}`);
      }

      return await response.json();
    } else {
      return {
        status: "unknown",
        message: "Status check not implemented for this protocol",
      };
    }
  } catch (error: any) {
    log.error("WCS status check failed", { error: error.message });
    return {
      status: "error",
      error: error.message,
    };
  }
}
