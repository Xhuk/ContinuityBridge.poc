import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Flow Definitions Table
export const flowDefinitions = sqliteTable("flow_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  
  // React Flow graph stored as JSON
  nodes: text("nodes", { mode: "json" }).notNull().$type<any[]>(),
  edges: text("edges", { mode: "json" }).notNull().$type<any[]>(),
  
  version: text("version").notNull().default("1.0.0"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  
  // Metadata
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  
  // Timestamps
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Flow Runs Table (execution history)
export const flowRuns = sqliteTable("flow_runs", {
  id: text("id").primaryKey(),
  flowId: text("flow_id").notNull().references(() => flowDefinitions.id, { onDelete: "cascade" }),
  flowName: text("flow_name").notNull(),
  flowVersion: text("flow_version").notNull(),
  
  traceId: text("trace_id").notNull(),
  
  status: text("status").notNull().$type<"running" | "completed" | "failed">(),
  
  // Timing
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  durationMs: integer("duration_ms"),
  
  // Data
  inputData: text("input_data", { mode: "json" }).$type<unknown>(),
  outputData: text("output_data", { mode: "json" }).$type<unknown>(),
  
  // Execution details
  triggeredBy: text("triggered_by").notNull().$type<"manual" | "schedule" | "webhook" | "interface">(),
  executedNodes: text("executed_nodes", { mode: "json" }).$type<string[]>(),
  nodeExecutions: text("node_executions", { mode: "json" }).$type<any[]>(),
  
  error: text("error"),
  errorNode: text("error_node"),
});

// Interfaces Table
export const interfaces = sqliteTable("interfaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  
  type: text("type").notNull().$type<"wms" | "erp" | "marketplace" | "tms" | "3pl" | "last_mile" | "custom">(),
  direction: text("direction").notNull().$type<"inbound" | "outbound" | "bidirectional">(),
  protocol: text("protocol").notNull().$type<"rest_api" | "soap" | "graphql" | "sftp" | "ftp" | "webhook" | "database" | "message_queue">(),
  
  endpoint: text("endpoint"),
  authType: text("auth_type").$type<"none" | "basic" | "bearer" | "api_key" | "oauth2" | "custom">(),
  
  httpConfig: text("http_config", { mode: "json" }).$type<Record<string, unknown>>(),
  oauth2Config: text("oauth2_config", { mode: "json" }).$type<Record<string, unknown>>(),
  
  formats: text("formats", { mode: "json" }).$type<string[]>(),
  defaultFormat: text("default_format"),
  
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Integration Events Table
export const integrationEvents = sqliteTable("integration_events", {
  id: text("id").primaryKey(),
  traceId: text("trace_id").notNull(),
  timestamp: text("timestamp").notNull(),
  
  sourceInterfaceId: text("source_interface_id").references(() => interfaces.id),
  targetInterfaceId: text("target_interface_id").references(() => interfaces.id),
  
  eventType: text("event_type").notNull().$type<"request" | "response" | "transformation" | "decision" | "error">(),
  status: text("status").notNull().$type<"pending" | "processing" | "completed" | "failed">(),
  
  payload: text("payload", { mode: "json" }).$type<unknown>(),
  transformedPayload: text("transformed_payload", { mode: "json" }).$type<unknown>(),
  
  latencyMs: integer("latency_ms"),
  error: text("error"),
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
});

export type FlowDefinition = typeof flowDefinitions.$inferSelect;
export type InsertFlowDefinition = typeof flowDefinitions.$inferInsert;

export type FlowRun = typeof flowRuns.$inferSelect;
export type InsertFlowRun = typeof flowRuns.$inferInsert;

export type Interface = typeof interfaces.$inferSelect;
export type InsertInterface = typeof interfaces.$inferInsert;

export type IntegrationEvent = typeof integrationEvents.$inferSelect;
export type InsertIntegrationEvent = typeof integrationEvents.$inferInsert;

// SMTP Settings Table (customer-configurable email settings)
export const smtpSettings = sqliteTable("smtp_settings", {
  id: text("id").primaryKey(),
  
  // SMTP Configuration
  host: text("host").notNull(),
  port: integer("port").notNull().default(587),
  secure: integer("secure", { mode: "boolean" }).notNull().default(false), // true for 465, false for other ports
  
  // Authentication
  username: text("username").notNull(),
  password: text("password").notNull(), // Encrypted in application layer
  
  // Email Settings
  fromAddress: text("from_address").notNull(),
  fromName: text("from_name"),
  
  // Notification Rules
  notifyOnFlowError: integer("notify_on_flow_error", { mode: "boolean" }).notNull().default(true),
  notifyOnValidationError: integer("notify_on_validation_error", { mode: "boolean" }).notNull().default(false),
  notifyOnAckFailure: integer("notify_on_ack_failure", { mode: "boolean" }).notNull().default(true),
  
  // Recipients for alerts (comma-separated emails)
  alertRecipients: text("alert_recipients").notNull(),
  
  // Test/enabled status
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastTestedAt: text("last_tested_at"),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type SmtpSettings = typeof smtpSettings.$inferSelect;
export type InsertSmtpSettings = typeof smtpSettings.$inferInsert;

import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Validation schema for SMTP settings (create)
export const insertSmtpSettingsSchema = createInsertSchema(smtpSettings, {
  host: z.string().min(1, "SMTP host is required"),
  port: z.number().int().min(1).max(65535, "Port must be between 1 and 65535"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  fromAddress: z.string().email("Invalid from address"),
  fromName: z.string().optional(),
  alertRecipients: z.string().min(1, "At least one alert recipient is required").refine(
    (val) => {
      const emails = val.split(',').map(e => e.trim()).filter(e => e.length > 0);
      return emails.length > 0 && emails.every(email => z.string().email().safeParse(email).success);
    },
    { message: "All alert recipients must be valid email addresses" }
  ),
}).omit({ id: true, createdAt: true, updatedAt: true });

// Validation schema for SMTP settings (update - password optional)
export const updateSmtpSettingsSchema = insertSmtpSettingsSchema.extend({
  password: z.string().optional(), // Password is optional on update
});

// Adapter Licenses Table (for marketplace business model)
export const adapterLicenses = sqliteTable("adapter_licenses", {
  id: text("id").primaryKey(),
  
  // Customer/organization identifier (for multi-tenancy in future)
  customerId: text("customer_id").notNull().default("default"),
  
  // Adapter/template ID (e.g., "amazon-sp-api", "mercadolibre-api")
  adapterId: text("adapter_id").notNull(),
  
  // License type
  licenseType: text("license_type").notNull().$type<"free" | "subscription" | "lifetime">(),
  
  // Subscription details
  subscriptionStatus: text("subscription_status").$type<"active" | "expired" | "canceled" | "trial">(),
  expiresAt: text("expires_at"), // null for lifetime licenses
  
  // Purchase metadata
  purchasedAt: text("purchased_at").notNull(),
  purchasePrice: real("purchase_price"), // in USD
  billingInterval: text("billing_interval").$type<"monthly" | "yearly" | "lifetime">(),
  
  // External payment system reference
  paymentProvider: text("payment_provider").$type<"stripe" | "manual" | "trial">(),
  paymentId: text("payment_id"), // Stripe subscription/payment ID
  
  // Status
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  
  // Metadata
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type AdapterLicense = typeof adapterLicenses.$inferSelect;
export type InsertAdapterLicense = typeof adapterLicenses.$inferInsert;

// ============================================================================
// Secrets Vault System (Master Seed-Based Encryption)
// ============================================================================

// Master Keys Table - Stores Argon2id hash of user's master seed
export const secretsMasterKeys = sqliteTable("secrets_master_keys", {
  id: text("id").primaryKey(),
  
  // Argon2id hash parameters
  passwordHash: text("password_hash").notNull(), // Argon2id hash of master seed
  salt: text("salt").notNull(), // Random salt for Argon2id
  
  // Key derivation parameters (for verification/migration)
  argonMemory: integer("argon_memory").notNull().default(65536), // 64 MB
  argonIterations: integer("argon_iterations").notNull().default(3),
  argonParallelism: integer("argon_parallelism").notNull().default(4),
  
  // Recovery and audit
  recoveryCodeHash: text("recovery_code_hash"), // Optional recovery code hash
  lastUnlocked: text("last_unlocked"),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type SecretsMasterKey = typeof secretsMasterKeys.$inferSelect;
export type InsertSecretsMasterKey = typeof secretsMasterKeys.$inferInsert;

// Secrets Vault Table - Encrypted secrets for all integrations
export const secretsVault = sqliteTable("secrets_vault", {
  id: text("id").primaryKey(),
  
  // Master key reference (for future key rotation support)
  masterKeyId: text("master_key_id").notNull().default("default"),
  
  // Integration type and label
  integrationType: text("integration_type").notNull().$type<
    "smtp" | "azure_blob" | "sftp" | "ftp" | "database" | "api_key" | "rabbitmq" | "kafka" | "oauth2" | "jwt" | "cookie" | "custom"
  >(),
  label: text("label").notNull(), // User-friendly name (e.g., "Production SMTP")
  
  // Encrypted payload (AES-256-GCM)
  encryptedPayload: text("encrypted_payload").notNull(), // Base64-encoded ciphertext
  iv: text("iv").notNull(), // Initialization vector
  authTag: text("auth_tag").notNull(), // Authentication tag for GCM
  
  // Metadata (unencrypted, for display/filtering - NO SENSITIVE DATA)
  metadata: text("metadata", { mode: "json" }).$type<{
    host?: string; // For SMTP/SFTP/FTP (safe: publicly known)
    username?: string; // For SMTP/SFTP/FTP (safe: public identifier)
    accountName?: string; // For Azure Blob (safe: account identifier)
    serviceName?: string; // For API keys (safe: service name)
    description?: string; // User-provided description (safe)
  }>(),
  
  // Rotation and audit
  lastRotatedAt: text("last_rotated_at"),
  rotationDueAt: text("rotation_due_at"), // Optional auto-rotation schedule
  
  // Status
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type SecretsVaultEntry = typeof secretsVault.$inferSelect;
export type InsertSecretsVaultEntry = typeof secretsVault.$inferInsert;

// Decrypted secret payloads (type-safe interfaces, never stored)
export interface SmtpSecretPayload {
  password: string;
}

export interface AzureBlobSecretPayload {
  accountName: string;
  accountKey: string;
  sasUrl?: string;
}

export interface SftpSecretPayload {
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface DatabaseSecretPayload {
  connectionString?: string;
  password?: string;
}

export interface FtpSecretPayload {
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface ApiKeySecretPayload {
  apiKey: string;
  apiSecret?: string;
  additionalHeaders?: Record<string, string>;
}

export interface RabbitMQSecretPayload {
  url: string; // amqp://user:pass@host:port
  queueIn?: string;
  queueOut?: string;
}

export interface KafkaSecretPayload {
  brokers: string; // Comma-separated list: host1:9092,host2:9092
  user?: string;
  password?: string;
  groupId?: string;
  topicIn?: string;
  topicOut?: string;
}

export interface CustomSecretPayload {
  [key: string]: string;
}

export type SecretPayload = 
  | SmtpSecretPayload 
  | AzureBlobSecretPayload 
  | SftpSecretPayload 
  | FtpSecretPayload
  | DatabaseSecretPayload 
  | ApiKeySecretPayload 
  | RabbitMQSecretPayload
  | KafkaSecretPayload
  | CustomSecretPayload;

// Validation schemas for secret creation
export const createSmtpSecretSchema = z.object({
  label: z.string().min(1, "Label is required"),
  metadata: z.object({
    host: z.string().optional(),
    username: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  payload: z.object({
    password: z.string().min(1, "Password is required"),
  }),
});

export const createAzureBlobSecretSchema = z.object({
  label: z.string().min(1, "Label is required"),
  metadata: z.object({
    accountName: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  payload: z.object({
    accountName: z.string().min(1, "Account name is required"),
    accountKey: z.string().min(1, "Account key is required"),
    sasUrl: z.string().optional(),
  }),
});

export const createSftpSecretSchema = z.object({
  label: z.string().min(1, "Label is required"),
  metadata: z.object({
    host: z.string().optional(),
    username: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  payload: z.object({
    password: z.string().optional(),
    privateKey: z.string().optional(),
    passphrase: z.string().optional(),
  }).refine(
    (data) => data.password || data.privateKey,
    { message: "Either password or private key is required" }
  ),
});

export const createFtpSecretSchema = z.object({
  label: z.string().min(1, "Label is required"),
  metadata: z.object({
    host: z.string().optional(),
    username: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  payload: z.object({
    password: z.string().optional(),
    privateKey: z.string().optional(),
    passphrase: z.string().optional(),
  }).refine(
    (data) => data.password || data.privateKey,
    { message: "Either password or private key is required" }
  ),
});

export const createDatabaseSecretSchema = z.object({
  label: z.string().min(1, "Label is required"),
  metadata: z.object({
    host: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  payload: z.object({
    connectionString: z.string().optional(),
    password: z.string().optional(),
  }).refine(
    (data) => data.connectionString || data.password,
    { message: "Either connection string or password is required" }
  ),
});

export const createApiKeySecretSchema = z.object({
  label: z.string().min(1, "Label is required"),
  metadata: z.object({
    serviceName: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  payload: z.object({
    apiKey: z.string().min(1, "API key is required"),
    apiSecret: z.string().optional(),
    additionalHeaders: z.record(z.string()).optional(),
  }),
});

export const createRabbitMQSecretSchema = z.object({
  label: z.string().min(1, "Label is required"),
  metadata: z.object({
    host: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  payload: z.object({
    url: z.string().min(1, "RabbitMQ URL is required (e.g., amqp://user:pass@localhost:5672)"),
    queueIn: z.string().optional(),
    queueOut: z.string().optional(),
  }),
});

export const createKafkaSecretSchema = z.object({
  label: z.string().min(1, "Label is required"),
  metadata: z.object({
    description: z.string().optional(),
  }).optional(),
  payload: z.object({
    brokers: z.string().min(1, "Kafka brokers are required (e.g., localhost:9092,host2:9092)"),
    user: z.string().optional(),
    password: z.string().optional(),
    groupId: z.string().optional(),
    topicIn: z.string().optional(),
    topicOut: z.string().optional(),
  }),
});

export const createOAuth2SecretSchema = z.object({
  label: z.string().min(1, "Label is required"),
  metadata: z.object({
    serviceName: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  payload: z.object({
    clientId: z.string().min(1, "Client ID is required"),
    clientSecret: z.string().min(1, "Client Secret is required"),
    tokenUrl: z.string().url("Token URL must be a valid URL").optional(),
    authorizationUrl: z.string().url("Authorization URL must be a valid URL").optional(),
    scope: z.string().optional(),
    redirectUri: z.string().url("Redirect URI must be a valid URL").optional(),
  }),
});

export const createJWTSecretSchema = z.object({
  label: z.string().min(1, "Label is required"),
  metadata: z.object({
    serviceName: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  payload: z.object({
    secret: z.string().optional(),           // For HS256/HS512
    privateKey: z.string().optional(),       // For RS256/RS512 (PEM format)
    publicKey: z.string().optional(),        // For RS256/RS512 verification (PEM format)
    algorithm: z.enum(["HS256", "HS512", "RS256", "RS512"]).default("HS256"),
    issuer: z.string().optional(),
    audience: z.string().optional(),
  }).refine(
    (data) => data.secret || data.privateKey,
    { message: "Either secret (for HMAC) or private key (for RSA) is required" }
  ),
});

export const createCookieSecretSchema = z.object({
  label: z.string().min(1, "Label is required"),
  metadata: z.object({
    serviceName: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  payload: z.object({
    cookieName: z.string().min(1, "Cookie name is required"),
    cookieSecret: z.string().optional(),     // For signing cookies
    sessionSecret: z.string().optional(),    // For session validation
    domain: z.string().optional(),
    path: z.string().optional().default("/"),
  }),
});

export const createCustomSecretSchema = z.object({
  label: z.string().min(1, "Label is required"),
  metadata: z.object({
    description: z.string().optional(),
  }).optional(),
  payload: z.record(z.string().min(1)),
});

// Queue Backend Configuration Table (tracks current + previous for rollback)
export const queueBackendConfig = sqliteTable("queue_backend_config", {
  id: text("id").primaryKey().default("singleton"), // Always single row
  
  // Current backend
  currentBackend: text("current_backend").notNull().$type<"inmemory" | "rabbitmq" | "kafka">().default("inmemory"),
  currentSecretId: text("current_secret_id"), // Reference to secretsVault entry
  
  // Previous backend (for rollback)
  previousBackend: text("previous_backend").$type<"inmemory" | "rabbitmq" | "kafka">(),
  previousSecretId: text("previous_secret_id"), // Reference to secretsVault entry
  
  // Status flags
  lastChangeAt: text("last_change_at"),
  changePending: integer("change_pending", { mode: "boolean" }).notNull().default(false),
  lastError: text("last_error"),
  
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type QueueBackendConfig = typeof queueBackendConfig.$inferSelect;
export type InsertQueueBackendConfig = typeof queueBackendConfig.$inferInsert;

// Audit Logs Table (for compliance and security tracking)
export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  operation: text("operation").notNull(), // e.g., "VAULT_INITIALIZED", "SECRET_CREATED", "AUTH_ADAPTER_ACTIVATED"
  resource_type: text("resource_type").$type<
    "vault" | "secret" | "smtp" | "queue" | "flow" | "interface" | "auth_adapter"
  >(),
  resource_id: text("resource_id"), // ID of affected resource
  user_ip: text("user_ip"),
  success: integer("success", { mode: "boolean" }).notNull().default(true),
  error_message: text("error_message"),
  details: text("details", { mode: "json" }).$type<Record<string, unknown>>(),
  created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// Auth Adapters Table (for inbound/outbound authentication)
export const authAdapters = sqliteTable("auth_adapters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  
  // Adapter type and direction
  type: text("type").notNull().$type<"oauth2" | "jwt" | "cookie">(),
  direction: text("direction").notNull().$type<"inbound" | "outbound" | "bidirectional">(),
  
  // User ownership (for user-level secrets)
  userId: text("user_id"), // Optional: tracks which user created/owns this adapter
  
  // Vault secret reference
  secretId: text("secret_id").references(() => secretsVault.id, { onDelete: "set null" }),
  
  // Configuration for token placement/extraction
  config: text("config", { mode: "json" }).notNull().$type<{
    // Inbound configuration (where to find tokens)
    inbound?: {
      headerName?: string;           // e.g., "Authorization", "X-Auth-Token"
      headerPrefix?: string;          // e.g., "Bearer ", "Token "
      cookieName?: string;            // e.g., "session_token"
      queryParam?: string;            // e.g., "access_token"
      bodyField?: string;             // e.g., "token" for form-encoded
      
      // JWT-specific
      jwtAlgorithm?: string;          // e.g., "HS256", "RS256"
      jwtIssuer?: string;
      jwtAudience?: string;
      
      // OAuth2-specific
      introspectionUrl?: string;
      introspectionClientId?: string;
    };
    
    // Outbound configuration (where to place tokens)
    outbound?: {
      placement: "header" | "cookie" | "query" | "body";
      headerName?: string;            // e.g., "Authorization"
      headerPrefix?: string;          // e.g., "Bearer "
      cookieName?: string;
      cookieOptions?: {
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: "strict" | "lax" | "none";
      };
      queryParam?: string;
      bodyField?: string;
      bodyEncoding?: "json" | "form";  // application/json vs application/x-www-form-urlencoded
      
      // OAuth2-specific
      tokenUrl?: string;
      grantType?: "client_credentials" | "authorization_code" | "refresh_token";
      scope?: string;
      
      // JWT-specific
      jwtAlgorithm?: string;
      jwtExpiresIn?: string;          // e.g., "1h", "30m"
      jwtClaims?: Record<string, unknown>;
    };
  }>(),
  
  // Status
  activated: integer("activated", { mode: "boolean" }).notNull().default(false),
  lastTestedAt: text("last_tested_at"),
  lastUsedAt: text("last_used_at"),
  
  // Metadata
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type AuthAdapter = typeof authAdapters.$inferSelect;
export type InsertAuthAdapter = typeof authAdapters.$inferInsert;

// Token Cache Table (for OAuth2, JWT, Cookie token lifecycle management)
export const tokenCache = sqliteTable("token_cache", {
  id: text("id").primaryKey(),
  
  // Composite key: adapterId + tokenType + scope
  adapterId: text("adapter_id").notNull().references(() => authAdapters.id, { onDelete: "cascade" }),
  tokenType: text("token_type").notNull().$type<"access" | "refresh" | "session">(),
  scope: text("scope"), // For OAuth2 scopes or JWT audiences
  
  // Encrypted token data (encrypted via SecretsService)
  accessToken: text("access_token"), // Encrypted
  refreshToken: text("refresh_token"), // Encrypted (OAuth2 only)
  sessionData: text("session_data", { mode: "json" }).$type<Record<string, unknown>>(), // Cookie session data
  
  // Lifecycle tracking
  expiresAt: text("expires_at"), // ISO timestamp when token expires
  lastUsedAt: text("last_used_at"), // For cookie idle timeout tracking
  issuedAt: text("issued_at").notNull(), // When token was obtained
  
  // Optimistic locking for concurrent refresh prevention
  version: integer("version").notNull().default(1), // Incremented on each update
  refreshInFlight: integer("refresh_in_flight", { mode: "boolean" }).notNull().default(false),
  refreshStartedAt: text("refresh_started_at"), // Heartbeat for detecting stuck refreshes
  
  // Metadata
  metadata: text("metadata", { mode: "json" }).$type<{
    grantType?: string; // OAuth2 grant type used
    audience?: string; // JWT audience
    issuer?: string; // JWT issuer
    cookieDomain?: string; // Cookie domain
    lastRefreshError?: string; // Last refresh error message
  }>(),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type TokenCache = typeof tokenCache.$inferSelect;
export type InsertTokenCache = typeof tokenCache.$inferInsert;

// Inbound Auth Policies (for Express middleware)
export const inboundAuthPolicies = sqliteTable("inbound_auth_policies", {
  id: text("id").primaryKey(),
  
  // Route configuration
  routePattern: text("route_pattern").notNull().unique(), // e.g., "/api/interfaces/:id/execute"
  httpMethod: text("http_method").$type<"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL">().default("ALL"),
  
  // Auth configuration
  adapterId: text("adapter_id").references(() => authAdapters.id, { onDelete: "set null" }), // NULL = bypass
  enforcementMode: text("enforcement_mode").$type<"bypass" | "optional" | "required">().notNull().default("required"),
  
  // Multi-tenant support
  multiTenant: integer("multi_tenant", { mode: "boolean" }).notNull().default(false), // Allow X-Auth-Adapter-ID override
  
  // Metadata
  description: text("description"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type InboundAuthPolicy = typeof inboundAuthPolicies.$inferSelect;
export type InsertInboundAuthPolicy = typeof inboundAuthPolicies.$inferInsert;
