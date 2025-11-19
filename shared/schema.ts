import { z } from "zod";

// Canonical Item Schema (transformed from XML)
export const canonicalItemSchema = z.object({
  itemId: z.string(),
  sku: z.string(),
  description: z.string(),
  quantity: z.number(),
  weight: z.number().optional(),
  dimensions: z.object({
    length: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
  destination: z.object({
    address: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string(),
    lat: z.number().optional(),
    lon: z.number().optional(),
  }),
  metadata: z.record(z.unknown()).optional(),
});

export type CanonicalItem = z.infer<typeof canonicalItemSchema>;

// Event Schema (for event tracking)
export const eventSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  timestamp: z.string(),
  sku: z.string(),
  warehouse: z.string(),
  warehouseId: z.string(),
  reason: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  latencyMs: z.number().optional(),
  retryCount: z.number().optional(),
  error: z.string().optional(),
});

export type Event = z.infer<typeof eventSchema>;

// Decision Schema (warehouse routing decision)
export const decisionSchema = z.object({
  traceId: z.string(),
  timestamp: z.string(),
  selectedWarehouse: z.object({
    id: z.string(),
    name: z.string(),
    location: z.string(),
  }),
  reason: z.string(),
  alternatives: z.array(z.object({
    id: z.string(),
    name: z.string(),
    score: z.number(),
    reason: z.string(),
  })),
  decisionFactors: z.object({
    distance: z.number().optional(),
    sla: z.number().optional(),
    stock: z.number().optional(),
    cost: z.number().optional(),
  }),
});

export type Decision = z.infer<typeof decisionSchema>;

// Metrics Schema
export const metricsSchema = z.object({
  avgLatencyMs: z.number(),
  p95LatencyMs: z.number(),
  tps: z.number(),
  inDepth: z.number(),
  outDepth: z.number(),
  errors: z.number(),
  totalProcessed: z.number().optional(),
  lastUpdated: z.string(),
});

export type Metrics = z.infer<typeof metricsSchema>;

// Warehouse Schema
export const warehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.object({
    lat: z.number(),
    lon: z.number(),
    address: z.string(),
    city: z.string(),
    state: z.string(),
  }),
  sla: z.number(),
  stock: z.record(z.number()),
  costPerUnit: z.number(),
  capacity: z.number(),
  status: z.enum(["active", "inactive", "maintenance"]),
});

export type Warehouse = z.infer<typeof warehouseSchema>;

// Queue Config Schema
export const queueConfigSchema = z.object({
  backend: z.enum(["inmemory", "rabbit", "kafka"]),
  workerEnabled: z.boolean(),
  concurrency: z.number().min(1).max(100),
});

export type QueueConfig = z.infer<typeof queueConfigSchema>;

// Worker Status Schema
export const workerStatusSchema = z.object({
  enabled: z.boolean(),
  concurrency: z.number(),
  messagesProcessed: z.number(),
  currentThroughput: z.number(),
  status: z.enum(["running", "stopped", "error"]),
});

export type WorkerStatus = z.infer<typeof workerStatusSchema>;

// Advanced Throttling Configuration Schema
export const throttlingConfigSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  
  // Worker-level throttling
  workerConcurrency: z.number().min(1).max(100).default(3),
  
  // HTTP request throttling (per node)
  httpRequestsPerSecond: z.number().min(1).max(1000).default(50),
  httpMaxConcurrent: z.number().min(1).max(100).default(10),
  
  // CSV/Batch processing
  csvBatchSize: z.number().min(1).max(10000).default(100),
  csvProcessingDelay: z.number().min(0).max(5000).default(0), // ms between batches
  
  // Retry configuration
  maxRetries: z.number().min(0).max(10).default(3),
  retryDelayMs: z.number().min(100).max(30000).default(1000),
  retryBackoffMultiplier: z.number().min(1).max(5).default(2),
  
  // Queue-level settings
  queuePollInterval: z.number().min(100).max(10000).default(1000),
  deadLetterAfterRetries: z.number().min(1).max(20).default(5),
  
  // Metadata
  enabled: z.boolean().default(true),
  requiresRestart: z.boolean().default(false),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type ThrottlingConfig = z.infer<typeof throttlingConfigSchema>;

export const insertThrottlingConfigSchema = throttlingConfigSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  requiresRestart: true,
});
export type InsertThrottlingConfig = z.infer<typeof insertThrottlingConfigSchema>;

// System Restart Configuration
export const systemRestartSchema = z.object({
  requestedBy: z.string(),
  requestedAt: z.string(),
  reason: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "failed"]),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});

export type SystemRestart = z.infer<typeof systemRestartSchema>;

// ============================================================================
// DEPLOYMENT PROFILES - Architecture & Infrastructure Configuration
// ============================================================================

// Deployment Profile Schema
export const deploymentProfileSchema = z.enum([
  "standalone",     // Perfil A: Todo en un servidor (App + DB + Redis)
  "standard",       // Perfil B: App + Postgres/Redis en Docker Compose
  "cluster",        // Perfil C: 1 Servidor App (Stateless) + 1 Servidor DB/Queues
  "kubernetes",     // Perfil D: Full Kubernetes deployment
]);

export type DeploymentProfile = z.infer<typeof deploymentProfileSchema>;

// Deployment Configuration Schema
export const deploymentConfigSchema = z.object({
  profile: deploymentProfileSchema,
  
  // Cluster-specific configuration (Perfil C)
  cluster: z.object({
    appServerHost: z.string(),         // IP/hostname del servidor de aplicación
    dbServerHost: z.string(),          // IP/hostname del servidor de base de datos
    appServerPort: z.number().default(5000),
    dbServerPort: z.number().default(5432),
    redisServerPort: z.number().default(6379),
    
    // Network configuration
    privateNetwork: z.boolean().default(true),  // Usar red privada entre servidores
    sslEnabled: z.boolean().default(true),      // SSL entre app y db
  }).optional(),
  
  // Kubernetes-specific configuration (Perfil D)
  kubernetes: z.object({
    namespace: z.string().default("continuitybridge"),
    replicas: z.number().default(3),
    storageClass: z.string().default("standard"),
    ingressEnabled: z.boolean().default(true),
  }).optional(),
  
  // Common settings
  environment: z.enum(["development", "staging", "production"]).default("production"),
  organizationId: z.string(),
  organizationName: z.string(),
});

export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;

// XML IFD Request Schema
export const xmlIfdRequestSchema = z.object({
  xml: z.string(),
});

export type XmlIfdRequest = z.infer<typeof xmlIfdRequestSchema>;

// XML IFD Response Schema
export const xmlIfdResponseSchema = z.object({
  ok: z.boolean(),
  traceId: z.string(),
  canonical: canonicalItemSchema.optional(),
  error: z.string().optional(),
});

export type XmlIfdResponse = z.infer<typeof xmlIfdResponseSchema>;

// GraphQL Input Types
export const processItemIFDInputSchema = z.object({
  xml: z.string(),
});

export type ProcessItemIFDInput = z.infer<typeof processItemIFDInputSchema>;

export const setWorkerInputSchema = z.object({
  enabled: z.boolean(),
  concurrency: z.number().optional(),
});

export type SetWorkerInput = z.infer<typeof setWorkerInputSchema>;

export const setQueueBackendInputSchema = z.object({
  backend: z.enum(["inmemory", "rabbit", "kafka"]),
});

export type SetQueueBackendInput = z.infer<typeof setQueueBackendInputSchema>;

// Chart Data Point Schema
export const chartDataPointSchema = z.object({
  timestamp: z.string(),
  avgLatency: z.number(),
  p95Latency: z.number(),
  tps: z.number(),
  errors: z.number(),
});

export type ChartDataPoint = z.infer<typeof chartDataPointSchema>;

// Data Source Configuration Schemas

// SFTP Configuration
export const sftpConfigSchema = z.object({
  type: z.literal("sftp"),
  id: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number().default(22),
  username: z.string(),
  authType: z.enum(["password", "privateKey"]),
  remotePath: z.string().default("/"),
  filePattern: z.string().default("*.xml"),
  enabled: z.boolean().default(true),
});

export type SftpConfig = z.infer<typeof sftpConfigSchema>;

// Azure Blob Configuration
export const azureBlobConfigSchema = z.object({
  type: z.literal("azureBlob"),
  id: z.string(),
  name: z.string(),
  connectionType: z.enum(["connectionString", "http"]),
  containerName: z.string().optional(),
  blobPrefix: z.string().default(""),
  filePattern: z.string().default("*.xml"),
  enabled: z.boolean().default(true),
});

export type AzureBlobConfig = z.infer<typeof azureBlobConfigSchema>;

// Discriminated union for all data source types
export const dataSourceConfigSchema = z.discriminatedUnion("type", [
  sftpConfigSchema,
  azureBlobConfigSchema,
]);

export type DataSourceConfig = z.infer<typeof dataSourceConfigSchema>;

// Data Source Secret Schema
export const dataSourceSecretSchema = z.object({
  sourceId: z.string(),
  // SFTP secrets
  password: z.string().optional(),
  privateKey: z.string().optional(),
  // Azure secrets
  connectionString: z.string().optional(),
  httpUrl: z.string().optional(),
});

export type DataSourceSecret = z.infer<typeof dataSourceSecretSchema>;

// Pull History Schema
export const pullHistorySchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  fileHash: z.string(),
  pulledAt: z.string(),
  status: z.enum(["success", "failed", "partial"]),
  itemsProcessed: z.number().default(0),
  error: z.string().optional(),
  traceIds: z.array(z.string()).default([]),
});

export type PullHistory = z.infer<typeof pullHistorySchema>;

// Insert schemas for data sources
export const insertSftpConfigSchema = sftpConfigSchema.omit({ id: true });
export type InsertSftpConfig = z.infer<typeof insertSftpConfigSchema>;

export const insertAzureBlobConfigSchema = azureBlobConfigSchema.omit({ id: true });
export type InsertAzureBlobConfig = z.infer<typeof insertAzureBlobConfigSchema>;

export const insertDataSourceSecretSchema = dataSourceSecretSchema;
export type InsertDataSourceSecret = z.infer<typeof insertDataSourceSecretSchema>;

// ============================================================================
// INTERFACE REGISTRY - Universal Integration Hub
// ============================================================================

// Interface Type Enum (WMS, ERP, Marketplace, Logistics, etc.)
export const interfaceTypeSchema = z.enum([
  "wms",           // Warehouse Management System (JDA, Manhattan, etc.)
  "erp",           // Enterprise Resource Planning (Oracle, SAP)
  "marketplace",   // E-commerce Marketplaces (Amazon, MercadoLibre)
  "tms",           // Transportation Management System
  "3pl",           // Third-Party Logistics
  "lastmile",      // Last Mile Delivery/Carriers
  "custom",        // Custom integrations
]);

export type InterfaceType = z.infer<typeof interfaceTypeSchema>;

// Protocol/Connection Type
export const protocolTypeSchema = z.enum([
  "rest_api",      // REST API endpoint
  "soap",          // SOAP web service
  "sftp",          // SFTP file transfer
  "ftp",           // FTP file transfer
  "webhook",       // Webhook (receives HTTP POST)
  "graphql",       // GraphQL API
  "database",      // Direct database connection
  "message_queue", // RabbitMQ, Kafka, etc.
]);

export type ProtocolType = z.infer<typeof protocolTypeSchema>;

// Authentication Type
export const authTypeSchema = z.enum([
  "none",
  "api_key",
  "bearer_token",
  "basic_auth",
  "oauth2",
  "certificate",
  "ssh_key",
]);

export type AuthType = z.infer<typeof authTypeSchema>;

// Interface Direction
export const interfaceDirectionSchema = z.enum([
  "inbound",       // Only receives data (source)
  "outbound",      // Only sends data (destination)
  "bidirectional", // Both sends and receives
]);

export type InterfaceDirection = z.infer<typeof interfaceDirectionSchema>;

// Data Format
export const dataFormatSchema = z.enum([
  "xml",
  "json",
  "edi",
  "csv",
  "excel",
  "fixed_width",
]);

export type DataFormat = z.infer<typeof dataFormatSchema>;

// Protocol-specific configuration schemas
export const httpProtocolConfigSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  headers: z.record(z.string()).default({}),
  queryParams: z.record(z.string()).default({}),
  timeout: z.number().default(30000),          // 30 seconds
  retryAttempts: z.number().default(3),
  retryDelay: z.number().default(1000),        // 1 second
});

export type HttpProtocolConfig = z.infer<typeof httpProtocolConfigSchema>;

export const messageQueueConfigSchema = z.object({
  topic: z.string().optional(),
  queueName: z.string().optional(),
  exchange: z.string().optional(),
  routingKey: z.string().optional(),
});

export type MessageQueueConfig = z.infer<typeof messageQueueConfigSchema>;

export const databaseConfigSchema = z.object({
  databaseType: z.enum(["postgresql", "mysql", "sqlserver", "oracle"]),
  schema: z.string().optional(),
  table: z.string().optional(),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

// OAuth2 Configuration Schema
export const oauth2ConfigSchema = z.object({
  tokenUrl: z.string(),
  scope: z.string().optional(),
  grantType: z.enum(["client_credentials", "authorization_code", "password", "refresh_token"]).default("client_credentials"),
  refreshTokenUrl: z.string().optional(),
  expiresIn: z.number().optional(),            // Token expiration in seconds
});

export type OAuth2Config = z.infer<typeof oauth2ConfigSchema>;

// Interface Configuration Schema
export const interfaceConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: interfaceTypeSchema,
  direction: interfaceDirectionSchema,
  protocol: protocolTypeSchema,
  
  // Connection details (varies by protocol)
  endpoint: z.string().optional(),             // REST/SOAP/GraphQL URL
  host: z.string().optional(),                 // SFTP/FTP host
  port: z.number().optional(),                 // SFTP/FTP port
  path: z.string().optional(),                 // File path or API path
  
  // Protocol-specific configuration
  httpConfig: httpProtocolConfigSchema.optional(),
  messageQueueConfig: messageQueueConfigSchema.optional(),
  databaseConfig: databaseConfigSchema.optional(),
  
  // Authentication
  authType: authTypeSchema,
  authSecretId: z.string().optional(),         // Reference to secret storage (legacy)
  authAdapterId: z.string().optional(),        // Reference to auth_adapters table (new system)
  
  // OAuth2-specific configuration
  oauth2Config: oauth2ConfigSchema.optional(), // Required if authType is "oauth2"
  
  // Data formats supported
  formats: z.array(dataFormatSchema),
  defaultFormat: dataFormatSchema.optional(),
  
  // Metadata
  enabled: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
  
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type InterfaceConfig = z.infer<typeof interfaceConfigSchema>;

export const insertInterfaceConfigSchema = interfaceConfigSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertInterfaceConfig = z.infer<typeof insertInterfaceConfigSchema>;

// Interface Secrets Schema
export const interfaceSecretSchema = z.object({
  interfaceId: z.string(),
  
  // API Authentication
  apiKey: z.string().optional(),
  bearerToken: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  
  // OAuth2 Credentials
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.string().optional(),       // ISO timestamp
  
  // SSH/SFTP
  privateKey: z.string().optional(),
  
  // Certificate Authentication
  certificate: z.string().optional(),
  certificateKey: z.string().optional(),
  
  // Custom fields
  customAuth: z.record(z.string()).optional(),
});

export type InterfaceSecret = z.infer<typeof interfaceSecretSchema>;

// ============================================================================
// TRANSFORMATION MAPPINGS - Per Source-Destination Pair
// ============================================================================

// Mapping Rule Schema (field-level mapping)
export const mappingRuleSchema = z.object({
  targetField: z.string(),                   // e.g., "order.id"
  sourceExpression: z.string(),              // e.g., "$.OrderDocument.OrderNumber" (JSONPath/XPath)
  transform: z.string().optional(),          // Optional JS function name
  defaultValue: z.unknown().optional(),      // Default if source is null
  required: z.boolean().default(false),
});

export type MappingRule = z.infer<typeof mappingRuleSchema>;

// Transformation Configuration Schema
export const transformationConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  
  // Source and Target interfaces
  sourceInterfaceId: z.string(),
  targetInterfaceId: z.string(),
  
  // Format conversion
  sourceFormat: dataFormatSchema,
  targetFormat: dataFormatSchema,
  
  // Mapping rules
  mappingRules: z.array(mappingRuleSchema).default([]),
  
  // Custom transformation logic (JavaScript code)
  customTransformCode: z.string().optional(),
  
  // Validation
  validateInput: z.boolean().default(true),
  validateOutput: z.boolean().default(true),
  
  // Metadata
  enabled: z.boolean().default(true),
  version: z.string().default("1.0"),
  tags: z.array(z.string()).default([]),
  
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type TransformationConfig = z.infer<typeof transformationConfigSchema>;

export const insertTransformationConfigSchema = transformationConfigSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertTransformationConfig = z.infer<typeof insertTransformationConfigSchema>;

// ============================================================================
// ROUTING RULES - Dynamic Dispatch Logic
// ============================================================================

// Routing Condition Schema
export const routingConditionSchema = z.object({
  field: z.string(),                         // e.g., "item.category"
  operator: z.enum(["==", "!=", ">", "<", ">=", "<=", "contains", "matches", "in"]),
  value: z.unknown(),                        // Comparison value
});

export type RoutingCondition = z.infer<typeof routingConditionSchema>;

// Routing Target Schema
export const routingTargetSchema = z.object({
  targetInterfaceId: z.string(),
  transformationId: z.string().optional(),   // Which transformation to apply (optional for passthrough)
  passthrough: z.boolean().default(false),   // If true, send data as-is without transformation
  conditions: z.array(routingConditionSchema).default([]), // Empty = always route
  priority: z.number().default(100),         // Lower number = higher priority
  enabled: z.boolean().default(true),
});

export type RoutingTarget = z.infer<typeof routingTargetSchema>;

// Routing Rule Schema
export const routingRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  
  // Source interface (where data comes from)
  sourceInterfaceId: z.string(),
  
  // Target interfaces (where data goes to)
  targets: z.array(routingTargetSchema).default([]),
  
  // Global conditions (must pass before evaluating targets)
  globalConditions: z.array(routingConditionSchema).default([]),
  
  // Metadata
  enabled: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type RoutingRule = z.infer<typeof routingRuleSchema>;

export const insertRoutingRuleSchema = routingRuleSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertRoutingRule = z.infer<typeof insertRoutingRuleSchema>;

// ============================================================================
// INTEGRATION EVENT TRACKING
// ============================================================================

export const integrationEventSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  timestamp: z.string(),
  
  sourceInterfaceId: z.string(),
  sourceName: z.string(),
  
  targetInterfaceId: z.string().optional(),
  targetName: z.string().optional(),
  
  transformationId: z.string().optional(),
  
  status: z.enum(["pending", "processing", "completed", "failed"]),
  
  inputFormat: dataFormatSchema.optional(),
  outputFormat: dataFormatSchema.optional(),
  
  latencyMs: z.number().optional(),
  error: z.string().optional(),
  
  metadata: z.record(z.unknown()).optional(),
});

export type IntegrationEvent = z.infer<typeof integrationEventSchema>;

// ============================================================================
// VISUAL FLOW BUILDER - React Flow Based Transformation System
// ============================================================================

// Node Position Schema (React Flow position)
export const nodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type NodePosition = z.infer<typeof nodePositionSchema>;

// Flow Node Type Enum
export const flowNodeTypeSchema = z.enum([
  // Trigger/Input Nodes
  "webhook_trigger",        // HTTP webhook endpoint
  "interface_source",       // Pull from Interface Registry
  "timer_trigger",          // Scheduled execution
  "manual_trigger",         // Manual execution only
  
  // Parser Nodes (Input Format → Internal)
  "xml_parser",             // Parse XML to JSON
  "json_parser",            // Parse/validate JSON
  "csv_parser",             // Parse CSV to JSON
  "edi_parser",             // Parse EDI to JSON
  "excel_parser",           // Parse Excel to JSON
  
  // Transform Nodes
  "object_mapper",          // Map fields between objects (object-mapper)
  "custom_javascript",      // Custom JS transformation function
  "xslt_transform",         // XSLT for XML→XML
  "template_builder",       // Build output from template (Handlebars)
  "data_filter",            // Filter/validate data
  "data_merge",             // Merge multiple inputs
  "data_split",             // Split to multiple outputs
  
  // Builder Nodes (Internal → Output Format)
  "xml_builder",            // Build XML from JSON
  "json_builder",           // Build/format JSON
  "csv_builder",            // Build CSV from JSON
  "edi_builder",            // Build EDI from JSON
  
  // Output/Action Nodes
  "interface_destination",  // Send to Interface Registry
  "http_request",           // Make HTTP API call
  "sftp_upload",            // Upload file to SFTP
  "email_notification",     // Send email
  "webhook_call",           // Call external webhook
  
  // Logic/Control Nodes
  "conditional",            // If/else routing
  "switch",                 // Multi-branch routing
  "loop",                   // Iterate over array
  "delay",                  // Add delay/wait
  "error_handler",          // Catch and handle errors
  
  // Advanced Integration Nodes (Caso 4 support)
  "mqtt_publisher",         // Publish to MQTT broker
  "mqtt_subscriber",        // Subscribe to MQTT topic
  "wcs_connector",          // WCS/Conveyor integration
  "opc_ua_connector",       // OPC-UA industrial automation
  "distributor",            // Split order (Caso 1)
  "join",                   // Wait for multiple completions (Caso 1)
]);

export type FlowNodeType = z.infer<typeof flowNodeTypeSchema>;

// Flow Node Data Schema (configuration specific to each node)
export const flowNodeDataSchema = z.object({
  label: z.string(),                          // Display label
  
  // Interface references (for source/destination nodes)
  interfaceId: z.string().optional(),
  
  // Mapping configuration (for object_mapper)
  mappings: z.record(z.unknown()).optional(), // object-mapper mappings
  
  // Custom code (for custom_javascript)
  code: z.string().optional(),
  
  // HTTP configuration (for http_request, webhook_call)
  url: z.string().optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  
  // SFTP configuration
  host: z.string().optional(),
  port: z.number().optional(),
  remotePath: z.string().optional(),
  
  // Conditional logic
  condition: z.string().optional(),           // JS expression
  
  // Template configuration
  template: z.string().optional(),
  
  // Parser/Builder options
  format: dataFormatSchema.optional(),
  options: z.record(z.unknown()).optional(),
  
  // Webhook trigger configuration
  webhookSlug: z.string().optional(),         // Custom URL slug
  webhookMethod: z.enum(["POST", "GET", "PUT", "PATCH"]).optional(),
  
  // Timer trigger configuration
  cronExpression: z.string().optional(),
  
  // MQTT configuration (for mqtt_publisher/subscriber)
  mqttBroker: z.string().optional(),          // mqtt://broker:1883
  mqttTopic: z.string().optional(),
  mqttQos: z.enum(["0", "1", "2"]).optional(),
  mqttRetain: z.boolean().optional(),
  
  // WCS/Conveyor configuration
  wcsEndpoint: z.string().optional(),
  wcsProtocol: z.enum(["rest", "mqtt", "opc-ua"]).optional(),
  conveyorZone: z.string().optional(),
  sortingRules: z.record(z.unknown()).optional(),
  
  // Distributor configuration (Caso 1)
  splitStrategy: z.enum(["by_warehouse", "by_carrier", "by_item", "custom"]).optional(),
  distributionRules: z.array(z.unknown()).optional(),
  
  // Join configuration (Caso 1)
  joinStrategy: z.enum(["all", "any", "majority", "timeout"]).optional(),
  joinTimeout: z.number().optional(),           // ms to wait
  minimumJoins: z.number().optional(),
  
  // Throttling configuration (per-node)
  throttleEnabled: z.boolean().optional(),
  throttleRateLimit: z.number().optional(),     // requests per second
  throttleMaxConcurrent: z.number().optional(),
  
  // Generic configuration for extensibility
  config: z.record(z.unknown()).optional(),
});

export type FlowNodeData = z.infer<typeof flowNodeDataSchema>;

// Flow Node Schema
export const flowNodeSchema = z.object({
  id: z.string(),                             // Unique node ID (React Flow)
  type: flowNodeTypeSchema,
  position: nodePositionSchema,
  data: flowNodeDataSchema,
});

export type FlowNode = z.infer<typeof flowNodeSchema>;

// Flow Edge Schema (connections between nodes)
export const flowEdgeSchema = z.object({
  id: z.string(),                             // Unique edge ID
  source: z.string(),                         // Source node ID
  target: z.string(),                         // Target node ID
  sourceHandle: z.string().optional(),        // Source handle ID (for multi-output nodes)
  targetHandle: z.string().optional(),        // Target handle ID (for multi-input nodes)
  label: z.string().optional(),               // Edge label (e.g., "on success", "on error")
  animated: z.boolean().default(false),       // Animate edge in UI
});

export type FlowEdge = z.infer<typeof flowEdgeSchema>;

// Flow Definition Schema (complete flow configuration)
export const flowDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  
  // React Flow graph structure
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
  
  // Flow metadata
  version: z.string().default("1.0"),
  enabled: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  
  // Execution settings
  timeout: z.number().default(300000),        // 5 minutes default
  retryOnFailure: z.boolean().default(false),
  maxRetries: z.number().default(3),
  
  // Trigger configuration
  triggerType: z.enum(["webhook", "interface", "timer", "manual", "queue"]).default("manual"),
  webhookSlug: z.string().optional(),         // Custom webhook URL slug
  webhookEnabled: z.boolean().default(false),
  
  // Metadata
  createdBy: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type FlowDefinition = z.infer<typeof flowDefinitionSchema>;

export const insertFlowDefinitionSchema = flowDefinitionSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertFlowDefinition = z.infer<typeof insertFlowDefinitionSchema>;

// Flow Run Schema (execution history)
export const flowRunSchema = z.object({
  id: z.string(),
  flowId: z.string(),
  flowName: z.string(),
  flowVersion: z.string(),
  
  traceId: z.string(),                        // Unique trace ID for this execution
  
  status: z.enum(["pending", "running", "completed", "failed", "timeout", "cancelled", "skipped"]),
  
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().optional(),
  
  // Input/Output data
  inputData: z.unknown().optional(),          // Input payload
  outputData: z.unknown().optional(),         // Final output
  
  // Execution path (which nodes were executed)
  executedNodes: z.array(z.string()).default([]),
  
  // Node execution details
  nodeExecutions: z.array(z.object({
    nodeId: z.string(),
    nodeName: z.string(),
    status: z.enum(["pending", "running", "completed", "failed", "skipped"]),
    startedAt: z.string().optional(),        // Optional: nodes may never execute (pending/skipped)
    completedAt: z.string().optional(),
    durationMs: z.number().optional(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    error: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),  // ✅ Executor metadata (e.g., conditionMet, interfaceId)
  })).default([]),
  
  // Error information
  error: z.string().optional(),
  errorNode: z.string().optional(),            // Node ID where error occurred
  
  // Metadata
  triggeredBy: z.enum(["webhook", "interface", "timer", "manual", "queue"]),
  metadata: z.record(z.unknown()).optional(),
});

export type FlowRun = z.infer<typeof flowRunSchema>;

// Node Definition Catalog Schema (for available node types)
export const nodeDefinitionSchema = z.object({
  id: z.string(),                             // Node type ID (matches flowNodeTypeSchema)
  category: z.enum(["trigger", "parser", "transform", "builder", "output", "logic"]),
  label: z.string(),                          // Display name
  description: z.string(),
  icon: z.string(),                           // Icon name (lucide-react)
  
  // Input/Output handles
  inputs: z.number().default(1),              // Number of input handles
  outputs: z.number().default(1),             // Number of output handles
  
  // Configuration fields
  configFields: z.array(z.object({
    name: z.string(),
    label: z.string(),
    type: z.enum(["text", "password", "textarea", "number", "boolean", "checkbox", "select", "interface", "code", "json"]),
    required: z.boolean().default(false),
    default: z.unknown().optional(),
    options: z.array(z.string()).optional(), // For select fields
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    filterDirection: z.enum(["inbound", "outbound", "bidirectional"]).optional(), // Filter interfaces by direction
  })).default([]),
  
  // Validation
  validateConfig: z.string().optional(),      // JS validation function
  
  // Execution
  executor: z.string(),                       // Backend executor function name
});

export type NodeDefinition = z.infer<typeof nodeDefinitionSchema>;
