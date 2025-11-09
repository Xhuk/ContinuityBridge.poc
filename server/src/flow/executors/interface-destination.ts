import { NodeExecutor } from "./types";
import { interfaceManager } from "../../interfaces/manager";

/**
 * Interface Destination Executor
 * Sends data to an interface configured in the Interface Registry
 */
export const executeInterfaceDestination: NodeExecutor = async (node, input, context) => {
  const interfaceId = node.data.interfaceId;
  if (!interfaceId) {
    throw new Error("Interface Destination requires interfaceId configuration");
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
    const method = (node.data.method || iface.httpConfig?.method || "POST") as any;
    const path = (node.data.config?.path as string) || iface.path || "";
    const url = `${iface.endpoint}${path}`;

    const headers = {
      "Content-Type": "application/json",
      ...(iface.httpConfig?.headers || {}),
      ...(node.data.headers || {}),
    };

    const timeout = (node.data.config?.timeout as number) || iface.httpConfig?.timeout || 30000;
    const retryAttempts = (node.data.config?.retryAttempts as number) || iface.httpConfig?.retryAttempts || 3;

    // Apply body template if provided
    let body = input;
    if (node.data.template) {
      // Simple template replacement (for now, just use JSON.stringify)
      // TODO: Implement proper Handlebars template rendering
      body = input;
    }

    // Retry logic
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

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
          data = { status: "success", statusCode: response.status };
        }

        return {
          output: data,
          metadata: {
            interfaceId,
            interfaceName: iface.name,
            protocol: iface.protocol,
            statusCode: response.status,
            attempt: attempt + 1,
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // If not the last attempt, wait before retrying
        if (attempt < retryAttempts - 1) {
          const retryDelay = (iface.httpConfig?.retryDelay as number) || 1000;
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    // All retries failed
    throw new Error(`Failed after ${retryAttempts} attempts: ${lastError?.message}`);
  }

  // For other protocols (SFTP, Database, etc.)
  // TODO: Implement based on protocol type
  throw new Error(`Protocol not yet supported in Interface Destination: ${iface.protocol}`);
};
