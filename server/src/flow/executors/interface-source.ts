import { NodeExecutor } from "./types";
import { interfaceManager } from "../../interfaces/manager";

/**
 * Interface Source Executor
 * Pulls data from an interface configured in the Interface Registry
 */
export const executeInterfaceSource: NodeExecutor = async (node, input, context) => {
  const interfaceId = node.data.interfaceId;
  if (!interfaceId) {
    throw new Error("Interface Source requires interfaceId configuration");
  }

  const iface = await interfaceManager.getInterface(interfaceId);
  if (!iface) {
    throw new Error(`Interface not found: ${interfaceId}`);
  }

  if (!iface.enabled) {
    throw new Error(`Interface is disabled: ${iface.name}`);
  }

  // For REST/SOAP/GraphQL interfaces
  if (["rest_api", "soap", "graphql"].includes(iface.protocol)) {
    const method = (node.data.method || iface.httpConfig?.method || "GET") as any;
    const path = (node.data.config?.path as string) || iface.path || "";
    const url = `${iface.endpoint}${path}`;

    const headers = {
      ...(iface.httpConfig?.headers || {}),
      ...(node.data.headers || {}),
    };

    const queryParams = (node.data.config?.queryParams as Record<string, unknown>) || {};
    const body = node.data.body;

    // Build query string
    const queryString = Object.entries(queryParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");

    const fullUrl = queryString ? `${url}?${queryString}` : url;

    // Make HTTP request
    const response = await fetch(fullUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    let data: unknown;

    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else if (contentType?.includes("text/")) {
      data = await response.text();
    } else {
      data = await response.text();
    }

    return {
      output: data,
      metadata: {
        interfaceId,
        interfaceName: iface.name,
        protocol: iface.protocol,
        statusCode: response.status,
      },
    };
  }

  // For other protocols (SFTP, Database, etc.)
  // TODO: Implement based on protocol type
  throw new Error(`Protocol not yet supported in Interface Source: ${iface.protocol}`);
};
