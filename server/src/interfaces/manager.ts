import { randomUUID } from "crypto";
import type { 
  InterfaceConfig, 
  InsertInterfaceConfig,
  InterfaceSecret,
  IntegrationEvent 
} from "@shared/schema.js";
import { logger } from "../core/logger.js";

const log = logger.child("InterfaceManager");

// In-memory storage
const interfaceConfigs = new Map<string, InterfaceConfig>();
const interfaceSecrets = new Map<string, InterfaceSecret>();
const integrationEvents: IntegrationEvent[] = [];

export interface TestConnectionResult {
  success: boolean;
  message: string;
  error?: string;
  details?: any;
}

export class InterfaceManager {
  // ============================================================================
  // CRUD Operations
  // ============================================================================

  addInterface(config: InsertInterfaceConfig, secret?: InterfaceSecret): InterfaceConfig {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    const fullConfig: InterfaceConfig = {
      ...config,
      id,
      createdAt: now,
      updatedAt: now,
    };

    interfaceConfigs.set(id, fullConfig);
    
    if (secret) {
      interfaceSecrets.set(id, { ...secret, interfaceId: id });
    }

    log.info(`Interface added: ${fullConfig.name} (${fullConfig.type})`);
    return fullConfig;
  }

  getInterface(id: string): InterfaceConfig | undefined {
    return interfaceConfigs.get(id);
  }

  getAllInterfaces(): InterfaceConfig[] {
    return Array.from(interfaceConfigs.values());
  }

  updateInterface(id: string, updates: Partial<InsertInterfaceConfig>): InterfaceConfig | null {
    const existing = interfaceConfigs.get(id);
    if (!existing) {
      log.warn(`Interface not found for update: ${id}`);
      return null;
    }

    const updated: InterfaceConfig = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    interfaceConfigs.set(id, updated);
    log.info(`Interface updated: ${updated.name}`);
    return updated;
  }

  deleteInterface(id: string): boolean {
    const config = interfaceConfigs.get(id);
    if (!config) {
      log.warn(`Interface not found for deletion: ${id}`);
      return false;
    }

    interfaceConfigs.delete(id);
    interfaceSecrets.delete(id);
    log.info(`Interface deleted: ${config.name}`);
    return true;
  }

  // ============================================================================
  // Secret Management
  // ============================================================================

  setInterfaceSecret(interfaceId: string, secret: InterfaceSecret): boolean {
    const config = interfaceConfigs.get(interfaceId);
    if (!config) {
      log.warn(`Cannot set secret: interface not found ${interfaceId}`);
      return false;
    }

    interfaceSecrets.set(interfaceId, { ...secret, interfaceId });
    log.info(`Secret set for interface: ${config.name}`);
    return true;
  }

  getInterfaceSecret(interfaceId: string): InterfaceSecret | undefined {
    return interfaceSecrets.get(interfaceId);
  }

  // ============================================================================
  // Test Connectivity
  // ============================================================================

  async testConnection(interfaceId: string): Promise<TestConnectionResult> {
    const config = interfaceConfigs.get(interfaceId);
    const secret = interfaceSecrets.get(interfaceId);

    if (!config) {
      return {
        success: false,
        message: "Interface not found",
        error: "Configuration not found for this interface ID",
      };
    }

    if (!secret && config.authType !== "none") {
      return {
        success: false,
        message: "Credentials not found",
        error: "Secret required for this authentication type",
      };
    }

    try {
      // Test based on protocol
      switch (config.protocol) {
        case "rest_api":
        case "soap":
        case "graphql":
          return await this.testHttpEndpoint(config, secret);
        
        case "sftp":
        case "ftp":
          return await this.testFileTransfer(config, secret);
        
        case "webhook":
          return this.testWebhook(config);
        
        case "database":
          return await this.testDatabase(config, secret);
        
        case "message_queue":
          return await this.testMessageQueue(config, secret);
        
        default:
          return {
            success: false,
            message: "Unsupported protocol",
            error: `Protocol ${config.protocol} is not yet implemented`,
          };
      }
    } catch (error: any) {
      log.error(`Connection test failed for ${config.name}:`, error);
      return {
        success: false,
        message: "Connection test failed",
        error: error.message,
      };
    }
  }

  // ============================================================================
  // Protocol-Specific Test Methods
  // ============================================================================

  private async testHttpEndpoint(config: InterfaceConfig, secret?: InterfaceSecret): Promise<TestConnectionResult> {
    if (!config.endpoint) {
      return {
        success: false,
        message: "Missing endpoint URL",
        error: "Endpoint URL is required for HTTP-based protocols",
      };
    }

    try {
      const headers: Record<string, string> = {
        ...config.httpConfig?.headers,
      };

      // Add authentication headers
      if (config.authType === "api_key" && secret?.apiKey) {
        headers["X-API-Key"] = secret.apiKey;
      } else if (config.authType === "bearer_token" && secret?.bearerToken) {
        headers["Authorization"] = `Bearer ${secret.bearerToken}`;
      } else if (config.authType === "basic_auth" && secret?.username && secret?.password) {
        const credentials = Buffer.from(`${secret.username}:${secret.password}`).toString("base64");
        headers["Authorization"] = `Basic ${credentials}`;
      }

      const timeout = config.httpConfig?.timeout || 30000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(config.endpoint, {
        method: config.httpConfig?.method || "GET",
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return {
          success: true,
          message: `Connected successfully (${response.status} ${response.statusText})`,
          details: {
            status: response.status,
            statusText: response.statusText,
          },
        };
      } else {
        return {
          success: false,
          message: `HTTP ${response.status} ${response.statusText}`,
          error: `Endpoint returned non-success status`,
          details: {
            status: response.status,
            statusText: response.statusText,
          },
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: "Connection failed",
        error: error.message,
      };
    }
  }

  private async testFileTransfer(config: InterfaceConfig, secret?: InterfaceSecret): Promise<TestConnectionResult> {
    // For SFTP/FTP, we'll need to use the existing adapters or create new ones
    // For now, return a placeholder
    return {
      success: true,
      message: "File transfer test not yet implemented",
      details: {
        note: "This would use SFTP/FTP adapters similar to data sources",
      },
    };
  }

  private testWebhook(config: InterfaceConfig): TestConnectionResult {
    // Webhooks are inbound only - just verify configuration
    if (!config.endpoint) {
      return {
        success: false,
        message: "Missing webhook endpoint path",
        error: "Webhook endpoint path is required",
      };
    }

    return {
      success: true,
      message: "Webhook configuration valid",
      details: {
        endpoint: config.endpoint,
        note: "Webhook will be registered at this path",
      },
    };
  }

  private async testDatabase(config: InterfaceConfig, secret?: InterfaceSecret): Promise<TestConnectionResult> {
    // Database connection test would require database drivers
    return {
      success: true,
      message: "Database test not yet implemented",
      details: {
        note: "This would test database connectivity using the configured driver",
      },
    };
  }

  private async testMessageQueue(config: InterfaceConfig, secret?: InterfaceSecret): Promise<TestConnectionResult> {
    // Message queue test would use existing queue providers
    return {
      success: true,
      message: "Message queue test not yet implemented",
      details: {
        note: "This would test queue connectivity (RabbitMQ, Kafka, etc.)",
      },
    };
  }

  // ============================================================================
  // Integration Event Tracking
  // ============================================================================

  addEvent(event: Omit<IntegrationEvent, "id">): IntegrationEvent {
    const fullEvent: IntegrationEvent = {
      id: randomUUID(),
      ...event,
    };
    
    integrationEvents.push(fullEvent);
    
    // Keep only last 1000 events
    if (integrationEvents.length > 1000) {
      integrationEvents.shift();
    }

    return fullEvent;
  }

  getEvents(filters?: { 
    sourceInterfaceId?: string;
    targetInterfaceId?: string;
    status?: string;
    limit?: number;
  }): IntegrationEvent[] {
    let filtered = [...integrationEvents];

    if (filters?.sourceInterfaceId) {
      filtered = filtered.filter(e => e.sourceInterfaceId === filters.sourceInterfaceId);
    }

    if (filters?.targetInterfaceId) {
      filtered = filtered.filter(e => e.targetInterfaceId === filters.targetInterfaceId);
    }

    if (filters?.status) {
      filtered = filtered.filter(e => e.status === filters.status);
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (filters?.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  // ============================================================================
  // Query Helpers
  // ============================================================================

  getInterfacesByType(type: string): InterfaceConfig[] {
    return Array.from(interfaceConfigs.values()).filter(i => i.type === type);
  }

  getInterfacesByDirection(direction: string): InterfaceConfig[] {
    return Array.from(interfaceConfigs.values()).filter(i => 
      i.direction === direction || i.direction === "bidirectional"
    );
  }

  getEnabledInterfaces(): InterfaceConfig[] {
    return Array.from(interfaceConfigs.values()).filter(i => i.enabled);
  }
}

// Export singleton instance
export const interfaceManager = new InterfaceManager();
