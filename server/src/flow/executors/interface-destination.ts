import { NodeExecutor } from "./types";
import { interfaceManager } from "../../interfaces/manager";
import { logger } from "../../core/logger";

const log = logger.child("InterfaceDestinationExecutor");

/**
 * Interface Destination Executor
 * Sends data to an interface configured in the Interface Registry
 * Supports authentication via auth adapters (OAuth2, JWT, Cookie, API Key)
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

  // Check for emulation mode from context or node config
  const emulationMode = (context as any)?.emulationMode || node.data.config?.emulationMode || false;

  // For REST/SOAP/GraphQL interfaces
  if (["rest_api", "soap", "graphql"].includes(iface.protocol)) {
    const method = (node.data.method || iface.httpConfig?.method || "POST") as any;
    const path = (node.data.config?.path as string) || iface.path || "";
    const url = `${iface.endpoint}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(iface.httpConfig?.headers || {}),
      ...(node.data.headers || {}),
    };

    // Apply authentication (with optional emulation mode)
    await applyAuthentication(iface, headers, emulationMode);

    const timeout = (node.data.config?.timeout as number) || iface.httpConfig?.timeout || 30000;
    const retryAttempts = (node.data.config?.retryAttempts as number) || iface.httpConfig?.retryAttempts || 3;

    // Apply body template if provided
    let body = input;
    if (node.data.template) {
      // Simple template replacement (for now, just use JSON.stringify)
      // TODO: Implement proper Handlebars template rendering
      body = input;
    }

    log.info("Sending data to interface", { method, url, interfaceId });

    // Retry logic with auth error handling
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

        // Handle authentication errors
        if (response.status === 401 || response.status === 403) {
          log.warn("Authentication error, attempting to refresh token", {
            interfaceId,
            status: response.status,
            attempt: attempt + 1,
          });

          // Try to invalidate cached tokens and retry
          if (iface.authAdapterId && attempt < retryAttempts - 1) {
            try {
              const { getOutboundTokenProvider } = await import("../../auth/auth-service-factory");
              const tokenProvider = getOutboundTokenProvider();
              if (tokenProvider) {
                const shouldRetry = await tokenProvider.handleAuthError(iface.authAdapterId);
                if (shouldRetry) {
                  // Re-apply authentication with fresh token
                  await applyAuthentication(iface, headers);
                  // Continue to next retry
                  continue;
                }
              }
            } catch (error) {
              log.error("Failed to handle auth error", { error });
            }
          }
        }

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

/**
 * Apply authentication headers based on interface configuration
 * Supports emulation mode for testing without live auth
 */
async function applyAuthentication(
  iface: any,
  headers: Record<string, string>,
  emulationMode?: boolean
): Promise<void> {
  // Emulation mode: Mock successful authentication
  if (emulationMode) {
    log.info("Emulation mode: Using mocked authentication", { interfaceId: iface.id });
    
    // Add mock authorization header based on auth type
    if (iface.authType === "bearer_token" || iface.authType === "oauth2") {
      headers["Authorization"] = "Bearer MOCK_TOKEN_FOR_TESTING";
    } else if (iface.authType === "api_key") {
      headers["X-API-Key"] = "MOCK_API_KEY_FOR_TESTING";
    } else if (iface.authType === "basic_auth") {
      headers["Authorization"] = "Basic MOCK_BASIC_AUTH_FOR_TESTING";
    }
    
    // Add test headers to indicate emulation
    headers["X-ContinuityBridge-Emulation"] = "true";
    headers["X-ContinuityBridge-Test-Mode"] = "true";
    return;
  }

  // New auth adapter system (preferred)
  if (iface.authAdapterId) {
    try {
      // Dynamic import to avoid circular dependency
      const { getOutboundTokenProvider } = await import("../../auth/auth-service-factory.js");
      const tokenProvider = getOutboundTokenProvider();
      
      if (!tokenProvider) {
        log.warn("Auth adapter configured but OutboundTokenProvider not available", {
          interfaceId: iface.id,
          authAdapterId: iface.authAdapterId,
        });
        return;
      }

      const authResult = await tokenProvider.provideAuth(iface.authAdapterId, iface.endpoint);
      
      // Apply auth headers
      if (authResult.headers) {
        Object.assign(headers, authResult.headers);
      }
      
      log.info("Applied auth adapter authentication", {
        interfaceId: iface.id,
        authAdapterId: iface.authAdapterId,
      });
      return;
    } catch (error: any) {
      log.error("Failed to apply auth adapter", {
        interfaceId: iface.id,
        authAdapterId: iface.authAdapterId,
        error: error.message,
      });
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  // Legacy authentication (fallback)
  const secret = interfaceManager.getInterfaceSecret(iface.id);
  
  if (iface.authType === "api_key" && secret?.apiKey) {
    headers["X-API-Key"] = secret.apiKey;
    log.info("Applied API key authentication", { interfaceId: iface.id });
  } else if (iface.authType === "bearer_token" && secret?.bearerToken) {
    headers["Authorization"] = `Bearer ${secret.bearerToken}`;
    log.info("Applied bearer token authentication", { interfaceId: iface.id });
  } else if (iface.authType === "basic_auth" && secret?.username && secret?.password) {
    const credentials = Buffer.from(`${secret.username}:${secret.password}`).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
    log.info("Applied basic auth authentication", { interfaceId: iface.id });
  } else if (iface.authType !== "none") {
    log.warn("Auth type configured but no credentials available", {
      interfaceId: iface.id,
      authType: iface.authType,
    });
  }
}
