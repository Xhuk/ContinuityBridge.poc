/**
 * BridgeScript - Fluent DSL for Building Integration Flows
 * 
 * Allows consultants to write flows using TypeScript instead of YAML/JSON
 * Generates valid flow definitions that comply with SOW constraints
 * 
 * Example:
 * ```typescript
 * const flow = new FlowBuilder("order-processing", "1.0.0")
 *   .forCustomer("cliente-a", "dev")
 *   .extendsBase("1.0.0")
 *   .receiveWebhook("/orders/create", { auth: "hmac" })
 *   .validate({ required: ["orderId", "total"] })
 *   .transform("order-to-erp")
 *   .sendTo("${ERP_API}/orders")
 *   .build();
 * ```
 */

import YAML from "yaml";
import { randomUUID } from "crypto";

export interface NodePosition {
  x: number;
  y: number;
}

export interface WebhookConfig {
  path: string;
  method?: "POST" | "GET" | "PUT" | "DELETE";
  auth?: "hmac" | "bearer" | "apikey" | "none";
  secret?: string;
  responseMode?: "sync" | "async";
  timeout?: number;
}

export interface ValidationConfig {
  required?: string[];
  schema?: Record<string, any>;
  mode?: "strict" | "lenient";
  onError?: "throw" | "warn" | "skip";
}

export interface HttpConfig {
  url: string;
  method?: "POST" | "GET" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface EmailConfig {
  to: string | string[];
  subject: string;
  template?: string;
  body?: string;
  cc?: string[];
  attachData?: boolean;
}

export interface ConditionConfig {
  expression: string;
  trueNode?: string;
  falseNode?: string;
}

export interface DistributorConfig {
  strategy: "by_warehouse" | "by_carrier" | "round_robin" | "by_field";
  splitField?: string;
  groupBy?: string;
  maxParallel?: number;
}

export interface JoinConfig {
  strategy: "all" | "any" | "timeout";
  timeout?: number;
  aggregateResults?: boolean;
}

export interface DatabaseConfig {
  connection: string;
  table?: string;
  operation?: "insert" | "update" | "upsert" | "delete";
  query?: string;
  data?: string;
}

export interface CustomScriptConfig {
  script: string;
  timeout?: number;
  allowedModules?: string[];
}

export class FlowBuilder {
  private flowName: string;
  private flowVersion: string;
  private baseVersion?: string;
  private organizationId?: string;
  private environment: "dev" | "staging" | "prod" = "dev";
  private changeType: "major" | "minor" | "patch" = "minor";
  private changeDescription: string = "";
  private tags: string[] = [];
  private description: string = "";
  
  private nodes: any[] = [];
  private edges: any[] = [];
  private customNodes: any[] = [];
  private customEdges: any[] = [];
  
  private currentNodeId: string | null = null;
  private previousNodeId: string | null = null;
  private nodeCounter = 0;
  private yPosition = 100;
  
  private allowedSystems: string[] = [];
  
  constructor(name: string, version: string) {
    this.flowName = name;
    this.flowVersion = version;
  }
  
  /**
   * Set customer and environment
   */
  forCustomer(orgId: string, env: "dev" | "staging" | "prod" = "dev"): this {
    this.organizationId = orgId;
    this.environment = env;
    return this;
  }
  
  /**
   * Set BASE version this extends
   */
  extendsBase(version: string): this {
    this.baseVersion = version;
    return this;
  }
  
  /**
   * Set change metadata
   */
  changes(type: "major" | "minor" | "patch", description: string): this {
    this.changeType = type;
    this.changeDescription = description;
    return this;
  }
  
  /**
   * Add metadata
   */
  withMetadata(opts: { tags?: string[]; description?: string }): this {
    if (opts.tags) this.tags = opts.tags;
    if (opts.description) this.description = opts.description;
    return this;
  }
  
  /**
   * Set allowed systems from SOW
   */
  allowSystems(systems: string[]): this {
    this.allowedSystems = systems;
    return this;
  }
  
  /**
   * Receive webhook trigger
   */
  receiveWebhook(path: string, config: Partial<WebhookConfig> = {}): this {
    const nodeId = this.generateNodeId("webhook");
    
    const node = {
      id: nodeId,
      type: "webhook_trigger",
      config: {
        path,
        method: config.method || "POST",
        authentication: config.auth ? {
          type: config.auth,
          secret: config.secret || "${WEBHOOK_SECRET}",
        } : undefined,
        responseMode: config.responseMode || "sync",
        timeout: config.timeout || 30000,
      },
      insertBefore: config.auth ? undefined : "validate",
    };
    
    this.addNode(node);
    return this;
  }
  
  /**
   * Add validation node
   */
  validate(config: ValidationConfig): this {
    const nodeId = this.generateNodeId("validate");
    
    const node = {
      id: nodeId,
      type: "validation",
      config: {
        schema: config.schema || {
          type: "object",
          required: config.required || [],
        },
        mode: config.mode || "strict",
        onError: config.onError || "throw",
      },
    };
    
    this.addNode(node);
    return this;
  }
  
  /**
   * Transform data using mapping
   */
  transform(mappingId: string): this {
    const nodeId = this.generateNodeId("transform");
    
    const node = {
      id: nodeId,
      type: "object_mapper",
      config: {
        mappingId: `\${${mappingId.toUpperCase()}_MAPPING_ID}`,
        mode: "strict",
      },
    };
    
    this.addNode(node);
    return this;
  }
  
  /**
   * Transform using custom JavaScript
   */
  transformWith(script: string, opts: Partial<CustomScriptConfig> = {}): this {
    const nodeId = this.generateNodeId("custom");
    
    const node = {
      id: nodeId,
      type: "custom_script",
      config: {
        script,
        timeout: opts.timeout || 5000,
        allowedModules: opts.allowedModules || [],
      },
    };
    
    this.addNode(node);
    return this;
  }
  
  /**
   * Send HTTP request
   */
  sendTo(url: string, config: Partial<HttpConfig> = {}): this {
    const nodeId = this.generateNodeId("http");
    
    // Validate system is in SOW
    if (this.allowedSystems.length > 0) {
      const systemName = this.extractSystemName(url);
      if (!this.allowedSystems.includes(systemName)) {
        throw new Error(
          `System "${systemName}" not in SOW. Allowed: ${this.allowedSystems.join(", ")}`
        );
      }
    }
    
    const node = {
      id: nodeId,
      type: config.method === "GET" ? "http_get" : "http_post",
      config: {
        url,
        method: config.method || "POST",
        headers: config.headers || {
          "Content-Type": "application/json",
        },
        body: config.body || "{{context.output}}",
        timeout: config.timeout || 30000,
        retries: config.retries || 3,
        retryDelay: config.retryDelay || 1000,
      },
    };
    
    this.addNode(node);
    return this;
  }
  
  /**
   * Send email notification
   */
  sendEmail(config: EmailConfig): this {
    const nodeId = this.generateNodeId("email");
    
    const node = {
      id: nodeId,
      type: "email",
      config: {
        to: Array.isArray(config.to) ? config.to : [config.to],
        cc: config.cc,
        subject: config.subject,
        template: config.template,
        body: config.body,
        attachData: config.attachData !== false,
      },
    };
    
    this.addNode(node);
    return this;
  }
  
  /**
   * Add conditional branching
   */
  when(condition: string): ConditionalBuilder {
    const nodeId = this.generateNodeId("condition");
    
    const node = {
      id: nodeId,
      type: "condition",
      config: {
        expression: condition,
      },
    };
    
    this.addNode(node);
    return new ConditionalBuilder(this, nodeId);
  }
  
  /**
   * Split into parallel branches
   */
  splitBy(config: DistributorConfig): this {
    const nodeId = this.generateNodeId("split");
    
    const node = {
      id: nodeId,
      type: "distributor",
      config,
    };
    
    this.addNode(node);
    return this;
  }
  
  /**
   * Join parallel branches
   */
  joinAll(config: Partial<JoinConfig> = {}): this {
    const nodeId = this.generateNodeId("join");
    
    const node = {
      id: nodeId,
      type: "join",
      config: {
        strategy: config.strategy || "all",
        timeout: config.timeout || 60000,
        aggregateResults: config.aggregateResults !== false,
      },
    };
    
    this.addNode(node);
    return this;
  }
  
  /**
   * Query database
   */
  queryDb(config: DatabaseConfig): this {
    const nodeId = this.generateNodeId("db_read");
    
    const node = {
      id: nodeId,
      type: "database_read",
      config: {
        connection: config.connection,
        query: config.query,
      },
    };
    
    this.addNode(node);
    return this;
  }
  
  /**
   * Write to database
   */
  saveToDb(config: DatabaseConfig): this {
    const nodeId = this.generateNodeId("db_write");
    
    const node = {
      id: nodeId,
      type: "database_write",
      config: {
        connection: config.connection,
        table: config.table,
        operation: config.operation || "insert",
        data: config.data || "{{context.output}}",
      },
    };
    
    this.addNode(node);
    return this;
  }
  
  /**
   * Add error handler
   */
  onError(handler: (builder: FlowBuilder) => void): this {
    // Create error handler branch
    const errorBuilder = new FlowBuilder(
      `${this.flowName}-error`,
      this.flowVersion
    );
    handler(errorBuilder);
    
    // Add error handler to last node
    if (this.currentNodeId) {
      const lastNode = this.findNode(this.currentNodeId);
      if (lastNode) {
        lastNode.errorHandler = errorBuilder.nodes[0];
      }
    }
    
    return this;
  }
  
  /**
   * Insert node before BASE node
   */
  insertBefore(baseNodeId: string): this {
    if (this.currentNodeId) {
      const node = this.findNode(this.currentNodeId);
      if (node) {
        node.insertBefore = baseNodeId;
      }
    }
    return this;
  }
  
  /**
   * Insert node after BASE node
   */
  insertAfter(baseNodeId: string): this {
    if (this.currentNodeId) {
      const node = this.findNode(this.currentNodeId);
      if (node) {
        node.insertAfter = baseNodeId;
      }
    }
    return this;
  }
  
  /**
   * Replace BASE node
   */
  replaces(baseNodeId: string): this {
    if (this.currentNodeId) {
      const node = this.findNode(this.currentNodeId);
      if (node) {
        node.replaceNode = baseNodeId;
      }
    }
    return this;
  }
  
  /**
   * Build and return YAML flow definition
   */
  build(): string {
    // Validate required fields
    if (!this.organizationId) {
      throw new Error("Must call .forCustomer() before building");
    }
    
    if (!this.baseVersion && this.customNodes.length > 0) {
      throw new Error("Must call .extendsBase() for CUSTOM flows");
    }
    
    // Auto-connect nodes if no manual edges
    if (this.edges.length === 0) {
      this.autoConnectNodes();
    }
    
    // Build flow definition
    const flow: any = {
      name: this.flowName,
      version: this.flowVersion,
      source: "custom",
    };
    
    // Add metadata
    flow.metadata = {
      baseVersion: this.baseVersion,
      organizationId: this.organizationId,
      environment: this.environment,
      description: this.description,
    };
    
    if (this.tags.length > 0) {
      flow.metadata.tags = this.tags;
    }
    
    // Add change info
    flow.changeType = this.changeType;
    flow.changeDescription = this.changeDescription;
    
    // Add nodes and edges
    if (this.customNodes.length > 0) {
      flow.customNodes = this.customNodes;
    } else {
      flow.nodes = this.nodes;
    }
    
    if (this.customEdges.length > 0) {
      flow.customEdges = this.customEdges;
    } else if (this.edges.length > 0) {
      flow.edges = this.edges;
    }
    
    // Convert to YAML
    return YAML.stringify(flow);
  }
  
  /**
   * Build and return JSON flow definition
   */
  buildJSON(): any {
    const yaml = this.build();
    return YAML.parse(yaml);
  }
  
  // ============================================================================
  // Private Helpers
  // ============================================================================
  
  private generateNodeId(prefix: string): string {
    this.nodeCounter++;
    return `${prefix}-${this.nodeCounter}`;
  }
  
  private addNode(node: any): void {
    this.previousNodeId = this.currentNodeId;
    this.currentNodeId = node.id;
    
    // Add position for visual editor
    node.position = {
      x: 250,
      y: this.yPosition,
    };
    this.yPosition += 100;
    
    // Determine if this is a customization
    if (node.insertBefore || node.insertAfter || node.replaceNode) {
      this.customNodes.push(node);
    } else {
      this.nodes.push(node);
    }
  }
  
  private addEdge(from: string, to: string, condition?: boolean): void {
    const edge: any = {
      id: `${from}-${to}`,
      source: from,
      target: to,
      animated: false,
    };
    
    if (condition !== undefined) {
      edge.label = condition ? "true" : "false";
    }
    
    if (this.customNodes.some(n => n.id === from || n.id === to)) {
      this.customEdges.push(edge);
    } else {
      this.edges.push(edge);
    }
  }
  
  private autoConnectNodes(): void {
    for (let i = 0; i < this.nodes.length - 1; i++) {
      this.addEdge(this.nodes[i].id, this.nodes[i + 1].id);
    }
    
    for (let i = 0; i < this.customNodes.length - 1; i++) {
      this.addEdge(this.customNodes[i].id, this.customNodes[i + 1].id);
    }
  }
  
  private findNode(id: string): any {
    return this.nodes.find(n => n.id === id) || 
           this.customNodes.find(n => n.id === id);
  }
  
  private extractSystemName(url: string): string {
    // Extract system name from env variable: ${ERP_API} -> ERP
    const match = url.match(/\$\{([A-Z_]+)_API/);
    return match ? match[1] : "UNKNOWN";
  }
}

/**
 * Helper class for conditional branching
 */
class ConditionalBuilder {
  constructor(
    private parent: FlowBuilder,
    private conditionNodeId: string
  ) {}
  
  then(builder: (flow: FlowBuilder) => void): this {
    const trueFlow = new FlowBuilder("", "");
    builder(trueFlow);
    
    // Add true branch nodes
    const trueNodes = (trueFlow as any).nodes;
    if (trueNodes.length > 0) {
      (this.parent as any).addEdge(this.conditionNodeId, trueNodes[0].id, true);
    }
    
    return this;
  }
  
  else(builder: (flow: FlowBuilder) => void): FlowBuilder {
    const falseFlow = new FlowBuilder("", "");
    builder(falseFlow);
    
    // Add false branch nodes
    const falseNodes = (falseFlow as any).nodes;
    if (falseNodes.length > 0) {
      (this.parent as any).addEdge(this.conditionNodeId, falseNodes[0].id, false);
    }
    
    return this.parent;
  }
}

/**
 * SOW-aware flow builder
 * Enforces SOW constraints automatically
 */
export class SOWFlowBuilder extends FlowBuilder {
  private sowSystems: string[];
  private sowInterfaces: number;
  private sowFlows: number;
  
  constructor(
    name: string,
    version: string,
    sow: {
      systems: string[];
      maxInterfaces: number;
      maxFlows: number;
    }
  ) {
    super(name, version);
    this.sowSystems = sow.systems;
    this.sowInterfaces = sow.maxInterfaces;
    this.sowFlows = sow.maxFlows;
    
    // Set allowed systems
    this.allowSystems(sow.systems);
  }
  
  /**
   * Validate flow against SOW before building
   */
  build(): string {
    // Count unique systems used
    const usedSystems = new Set<string>();
    const allNodes = [...(this as any).nodes, ...(this as any).customNodes];
    
    for (const node of allNodes) {
      if (node.type === "http_post" || node.type === "http_get") {
        const system = this.extractSystemFromUrl(node.config.url);
        usedSystems.add(system);
      }
    }
    
    // Validate against SOW
    const violations: string[] = [];
    
    for (const system of Array.from(usedSystems)) {
      if (!this.sowSystems.includes(system)) {
        violations.push(
          `System "${system}" not authorized in SOW. Allowed: ${this.sowSystems.join(", ")}`
        );
      }
    }
    
    if (violations.length > 0) {
      throw new Error(
        "SOW Violation:\n" + violations.join("\n") + "\n\n" +
        "Contact customer to update SOW or remove unauthorized systems."
      );
    }
    
    return super.build();
  }
  
  private extractSystemFromUrl(url: string): string {
    const match = url.match(/\$\{([A-Z_]+)_API/);
    return match ? match[1] : "UNKNOWN";
  }
}
