import { randomUUID } from "crypto";
import type { InterfaceConfig, InterfaceSecret, FlowDefinition } from "@shared/schema.js";
import { interfaceManager } from "../interfaces/manager.js";
import { logger } from "../core/logger.js";

const log = logger.child("PostmanGenerator");

/**
 * Postman Collection v2.1 Schema Types
 */
interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
}

interface PostmanAuth {
  type: string;
  [key: string]: any;
}

interface PostmanHeader {
  key: string;
  value: string;
  type?: string;
}

interface PostmanRequest {
  method: string;
  header: PostmanHeader[];
  body?: {
    mode: string;
    raw?: string;
    options?: any;
  };
  url: {
    raw: string;
    protocol?: string;
    host?: string[];
    path?: string[];
    query?: Array<{ key: string; value: string; disabled?: boolean }>;
  };
  auth?: PostmanAuth;
  description?: string;
}

interface PostmanItem {
  name: string;
  request: PostmanRequest;
  response?: any[];
  event?: any[];
}

interface PostmanFolder {
  name: string;
  item: Array<PostmanItem | PostmanFolder>;
  description?: string;
}

interface PostmanCollection {
  info: {
    name: string;
    description: string;
    schema: string;
    _postman_id: string;
  };
  variable: PostmanVariable[];
  item: Array<PostmanItem | PostmanFolder>;
  auth?: PostmanAuth;
  event?: any[];
}

export interface PostmanGeneratorOptions {
  environment?: "dev" | "staging" | "prod";
  includeSecrets?: boolean; // Include actual credentials vs placeholders
  includeFlowTriggers?: boolean; // Include webhook/manual trigger endpoints
  includeSamplePayloads?: boolean; // Include sample request/response bodies
  organizationName?: string;
}

export class PostmanCollectionGenerator {
  /**
   * Generate Postman Collection from interfaces and flows
   */
  async generateCollection(
    interfaces: InterfaceConfig[],
    flows: FlowDefinition[],
    secrets: Map<string, InterfaceSecret>,
    options: PostmanGeneratorOptions = {}
  ): Promise<PostmanCollection> {
    const {
      environment = "dev",
      includeSecrets = false,
      includeFlowTriggers = true,
      includeSamplePayloads = true,
      organizationName = "ContinuityBridge",
    } = options;

    log.info(`Generating Postman collection for ${environment}`, {
      interfaceCount: interfaces.length,
      flowCount: flows.length,
    });

    const collection: PostmanCollection = {
      info: {
        name: `${organizationName} - ${environment.toUpperCase()} API Collection`,
        description: `API testing collection for ${organizationName} integrations\nEnvironment: ${environment.toUpperCase()}\nGenerated: ${new Date().toISOString()}`,
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        _postman_id: randomUUID(),
      },
      variable: this.generateEnvironmentVariables(environment, interfaces),
      item: [],
    };

    // Add interface folders
    const inboundFolder = this.generateInterfaceFolder(
      "Inbound Interfaces (Sources)",
      interfaces.filter(i => i.direction === "inbound" || i.direction === "bidirectional"),
      secrets,
      includeSecrets,
      includeSamplePayloads
    );

    const outboundFolder = this.generateInterfaceFolder(
      "Outbound Interfaces (Destinations)",
      interfaces.filter(i => i.direction === "outbound" || i.direction === "bidirectional"),
      secrets,
      includeSecrets,
      includeSamplePayloads
    );

    collection.item.push(inboundFolder);
    collection.item.push(outboundFolder);

    // Add flow trigger endpoints
    if (includeFlowTriggers) {
      const flowFolder = this.generateFlowTriggerFolder(flows, includeSamplePayloads);
      collection.item.push(flowFolder);
    }

    // Add ContinuityBridge internal endpoints
    const internalFolder = this.generateInternalEndpointsFolder();
    collection.item.push(internalFolder);

    return collection;
  }

  /**
   * Generate environment variables for collection
   */
  private generateEnvironmentVariables(
    environment: string,
    interfaces: InterfaceConfig[]
  ): PostmanVariable[] {
    const variables: PostmanVariable[] = [
      {
        key: "base_url",
        value: environment === "prod" 
          ? "https://api.production.com" 
          : environment === "staging"
          ? "https://api.staging.com"
          : "http://localhost:5000",
        type: "string",
      },
      {
        key: "environment",
        value: environment,
        type: "string",
      },
    ];

    // Add interface-specific variables
    interfaces.forEach(iface => {
      if (iface.endpoint) {
        variables.push({
          key: `${iface.name.toLowerCase().replace(/\s+/g, "_")}_endpoint`,
          value: iface.endpoint,
          type: "string",
        });
      }
    });

    return variables;
  }

  /**
   * Generate folder for interfaces
   */
  private generateInterfaceFolder(
    folderName: string,
    interfaces: InterfaceConfig[],
    secrets: Map<string, InterfaceSecret>,
    includeSecrets: boolean,
    includeSamplePayloads: boolean
  ): PostmanFolder {
    const items: PostmanItem[] = [];

    interfaces.forEach(iface => {
      const secret = secrets.get(iface.id);
      const request = this.generateInterfaceRequest(iface, secret, includeSecrets, includeSamplePayloads);
      
      items.push({
        name: `${iface.name} (${iface.type.toUpperCase()})`,
        request,
        response: [],
      });
    });

    return {
      name: folderName,
      description: `${folderName} for testing external system integrations`,
      item: items,
    };
  }

  /**
   * Generate Postman request for an interface
   */
  private generateInterfaceRequest(
    iface: InterfaceConfig,
    secret: InterfaceSecret | undefined,
    includeSecrets: boolean,
    includeSamplePayloads: boolean
  ): PostmanRequest {
    const headers: PostmanHeader[] = [];
    let auth: PostmanAuth | undefined;
    
    // Add protocol-specific headers
    if (iface.protocol === "rest_api" || iface.protocol === "graphql") {
      headers.push({
        key: "Content-Type",
        value: iface.defaultFormat === "xml" ? "application/xml" : "application/json",
        type: "text",
      });
      
      // Add custom headers from httpConfig
      if (iface.httpConfig?.headers) {
        Object.entries(iface.httpConfig.headers).forEach(([key, value]) => {
          headers.push({ key, value, type: "text" });
        });
      }
    }

    // Add authentication
    switch (iface.authType) {
      case "api_key":
        if (secret?.apiKey || !includeSecrets) {
          headers.push({
            key: "X-API-Key",
            value: includeSecrets && secret?.apiKey ? secret.apiKey : "{{api_key}}",
            type: "text",
          });
        }
        break;

      case "bearer_token":
        auth = {
          type: "bearer",
          bearer: [
            {
              key: "token",
              value: includeSecrets && secret?.bearerToken ? secret.bearerToken : "{{bearer_token}}",
              type: "string",
            },
          ],
        };
        break;

      case "basic_auth":
        auth = {
          type: "basic",
          basic: [
            {
              key: "username",
              value: includeSecrets && secret?.username ? secret.username : "{{username}}",
              type: "string",
            },
            {
              key: "password",
              value: includeSecrets && secret?.password ? secret.password : "{{password}}",
              type: "string",
            },
          ],
        };
        break;

      case "oauth2":
        auth = {
          type: "oauth2",
          oauth2: [
            {
              key: "tokenUrl",
              value: iface.oauth2Config?.tokenUrl || "{{oauth_token_url}}",
              type: "string",
            },
            {
              key: "clientId",
              value: includeSecrets && secret?.clientId ? secret.clientId : "{{oauth_client_id}}",
              type: "string",
            },
            {
              key: "clientSecret",
              value: includeSecrets && secret?.clientSecret ? secret.clientSecret : "{{oauth_client_secret}}",
              type: "string",
            },
            {
              key: "grant_type",
              value: iface.oauth2Config?.grantType || "client_credentials",
              type: "string",
            },
          ],
        };
        break;
    }

    // Generate sample payload
    let body: any = undefined;
    if (includeSamplePayloads && (iface.httpConfig?.method === "POST" || iface.httpConfig?.method === "PUT")) {
      const samplePayload = this.generateSamplePayload(iface);
      body = {
        mode: "raw",
        raw: samplePayload,
        options: {
          raw: {
            language: iface.defaultFormat === "xml" ? "xml" : "json",
          },
        },
      };
    }

    return {
      method: iface.httpConfig?.method || "POST",
      header: headers,
      body,
      url: {
        raw: iface.endpoint || "{{base_url}}/api/interface",
        protocol: iface.endpoint?.startsWith("https") ? "https" : "http",
        host: iface.endpoint ? [new URL(iface.endpoint).hostname] : ["{{base_url}}"],
        path: iface.endpoint ? new URL(iface.endpoint).pathname.split("/").filter(Boolean) : ["api", "interface"],
      },
      auth,
      description: `${iface.description || iface.name}

Type: ${iface.type}
Protocol: ${iface.protocol}
Auth: ${iface.authType}
Formats: ${iface.formats.join(", ")}`,
    };
  }

  /**
   * Generate sample payload based on interface format
   */
  private generateSamplePayload(iface: InterfaceConfig): string {
    if (iface.defaultFormat === "xml") {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Request>
  <Header>
    <Timestamp>${new Date().toISOString()}</Timestamp>
    <InterfaceId>${iface.id}</InterfaceId>
  </Header>
  <Payload>
    <Item>
      <Id>SAMPLE-001</Id>
      <Name>Sample Item</Name>
      <Quantity>10</Quantity>
    </Item>
  </Payload>
</Request>`;
    } else if (iface.defaultFormat === "json") {
      return JSON.stringify({
        header: {
          timestamp: new Date().toISOString(),
          interfaceId: iface.id,
        },
        payload: {
          items: [
            {
              id: "SAMPLE-001",
              name: "Sample Item",
              quantity: 10,
            },
          ],
        },
      }, null, 2);
    }
    return "{}";
  }

  /**
   * Generate folder for flow triggers
   */
  private generateFlowTriggerFolder(
    flows: FlowDefinition[],
    includeSamplePayloads: boolean
  ): PostmanFolder {
    const items: PostmanItem[] = [];

    flows.forEach(flow => {
      // Find webhook trigger node
      const webhookNode = flow.nodes.find(n => n.type === "webhook_trigger");
      
      if (webhookNode || flow.triggerType === "webhook") {
        const webhookSlug = webhookNode?.data.webhookSlug || flow.webhookSlug || flow.id;
        const method = webhookNode?.data.webhookMethod || "POST";

        const samplePayload = includeSamplePayloads ? JSON.stringify({
          traceId: randomUUID(),
          timestamp: new Date().toISOString(),
          data: {
            message: "Sample webhook payload",
          },
        }, null, 2) : undefined;

        items.push({
          name: `Trigger: ${flow.name}`,
          request: {
            method,
            header: [
              {
                key: "Content-Type",
                value: "application/json",
                type: "text",
              },
            ],
            body: samplePayload ? {
              mode: "raw",
              raw: samplePayload,
              options: {
                raw: {
                  language: "json",
                },
              },
            } : undefined,
            url: {
              raw: `{{base_url}}/api/webhook/${webhookSlug}`,
              host: ["{{base_url}}"],
              path: ["api", "webhook", webhookSlug],
            },
            description: `Webhook trigger for flow: ${flow.name}\n\n${flow.description || "No description"}`,
          },
          response: [],
        });
      }

      // Add manual trigger endpoint
      items.push({
        name: `Manual Trigger: ${flow.name}`,
        request: {
          method: "POST",
          header: [
            {
              key: "Content-Type",
              value: "application/json",
              type: "text",
            },
          ],
          body: includeSamplePayloads ? {
            mode: "raw",
            raw: JSON.stringify({
              input: { message: "Manual execution" },
              emulationMode: false,
            }, null, 2),
            options: {
              raw: {
                language: "json",
              },
            },
          } : undefined,
          url: {
            raw: `{{base_url}}/api/flows/${flow.id}/execute`,
            host: ["{{base_url}}"],
            path: ["api", "flows", flow.id, "execute"],
          },
          description: `Manual trigger for flow: ${flow.name}\n\nFlow ID: ${flow.id}\n${flow.description || ""}`,
        },
        response: [],
      });
    });

    return {
      name: "Flow Triggers",
      description: "Webhook and manual trigger endpoints for flows",
      item: items,
    };
  }

  /**
   * Generate ContinuityBridge internal API endpoints
   */
  private generateInternalEndpointsFolder(): PostmanFolder {
    return {
      name: "ContinuityBridge Internal APIs",
      description: "System health, metrics, and management endpoints",
      item: [
        {
          name: "Health Check",
          request: {
            method: "GET",
            header: [],
            url: {
              raw: "{{base_url}}/health",
              host: ["{{base_url}}"],
              path: ["health"],
            },
            description: "Check system health status",
          },
          response: [],
        },
        {
          name: "Metrics Snapshot",
          request: {
            method: "GET",
            header: [],
            url: {
              raw: "{{base_url}}/api/metrics",
              host: ["{{base_url}}"],
              path: ["api", "metrics"],
            },
            description: "Get current metrics snapshot",
          },
          response: [],
        },
        {
          name: "Recent Events",
          request: {
            method: "GET",
            header: [],
            url: {
              raw: "{{base_url}}/api/events/recent",
              host: ["{{base_url}}"],
              path: ["api", "events", "recent"],
            },
            description: "Get recent integration events",
          },
          response: [],
        },
      ],
    };
  }
}

export const postmanGenerator = new PostmanCollectionGenerator();
