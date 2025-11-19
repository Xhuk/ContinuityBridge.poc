import { pgTable, text, integer, boolean, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Users Table (for RBAC - superadmin vs contractors)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  
  role: text("role").notNull().$type<"superadmin" | "consultant" | "customer_admin" | "customer_user">().default("customer_user"),
  apiKey: text("api_key").unique(),
  
  organizationId: text("organization_id"),
  organizationName: text("organization_name"),
  assignedCustomers: jsonb("assigned_customers").$type<string[]>(),
  maxCustomers: integer("max_customers"),
  
  // Email confirmation
  emailConfirmed: boolean("email_confirmed").notNull().default(false),
  confirmationToken: text("confirmation_token").unique(),
  confirmationTokenExpires: timestamp("confirmation_token_expires"),
  
  enabled: boolean("enabled").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// System Logs Table
export const systemLogs = pgTable("system_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  level: text("level").notNull().$type<"debug" | "info" | "warn" | "error">(),
  scope: text("scope").notNull().$type<"superadmin" | "customer">().default("superadmin"),
  
  service: text("service").notNull(),
  component: text("component"),
  message: text("message").notNull(),
  
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  
  flowId: text("flow_id"),
  flowName: text("flow_name"),
  runId: text("run_id"),
  traceId: text("trace_id"),
  
  userId: text("user_id"),
  organizationId: text("organization_id"),
  
  errorStack: text("error_stack"),
  errorCode: text("error_code"),
  
  requestId: text("request_id"),
  httpMethod: text("http_method"),
  httpPath: text("http_path"),
  httpStatus: integer("http_status"),
  
  durationMs: integer("duration_ms"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Log Configuration Table
export const logConfigurations = pgTable("log_configurations", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  scope: text("scope").notNull().$type<"superadmin" | "customer">().default("customer"),
  organizationId: text("organization_id"),
  
  minLevel: text("min_level").notNull().$type<"debug" | "info" | "warn" | "error">().default("info"),
  
  retentionDays: integer("retention_days").notNull().default(30),
  maxLogSize: integer("max_log_size_mb").notNull().default(100),
  
  fileLoggingEnabled: boolean("file_logging_enabled").notNull().default(true),
  fileRotationDays: integer("file_rotation_days").notNull().default(7),
  
  dbLoggingEnabled: boolean("db_logging_enabled").notNull().default(true),
  
  logFlowExecutions: boolean("log_flow_executions").notNull().default(true),
  logApiRequests: boolean("log_api_requests").notNull().default(true),
  logAuthEvents: boolean("log_auth_events").notNull().default(true),
  logErrors: boolean("log_errors").notNull().default(true),
  
  alertOnError: boolean("alert_on_error").notNull().default(false),
  alertEmail: text("alert_email"),
  
  enabled: boolean("enabled").notNull().default(true),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Magic Links Table
export const magicLinks = pgTable("magic_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  usedAt: timestamp("used_at"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// SMTP Settings Table
export const smtpSettings = pgTable("smtp_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // SMTP Configuration
  host: text("host").notNull(),
  port: integer("port").notNull().default(587),
  secure: boolean("secure").notNull().default(false),
  
  // Authentication
  username: text("username").notNull(),
  password: text("password").notNull(),
  
  // Email Settings
  fromAddress: text("from_address").notNull(),
  fromName: text("from_name"),
  
  // Notification Rules
  notifyOnFlowError: boolean("notify_on_flow_error").notNull().default(true),
  notifyOnValidationError: boolean("notify_on_validation_error").notNull().default(false),
  notifyOnAckFailure: boolean("notify_on_ack_failure").notNull().default(true),
  
  // Recipients for alerts
  alertRecipients: text("alert_recipients").notNull(),
  
  // Status
  enabled: boolean("enabled").notNull().default(true),
  lastTestedAt: timestamp("last_tested_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// WAF (Web Application Firewall) Configuration Table
export const wafConfig = pgTable("waf_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").unique(), // null = global/default config
  
  enabled: boolean("enabled").notNull().default(true),
  blockBots: boolean("block_bots").notNull().default(true),
  blockSuspicious: boolean("block_suspicious").notNull().default(true),
  
  // Rate limiting
  rateLimitEnabled: boolean("rate_limit_enabled").notNull().default(true),
  rateLimitWindowMs: integer("rate_limit_window_ms").notNull().default(60000),
  rateLimitMaxRequests: integer("rate_limit_max_requests").notNull().default(30),
  rateLimitBlockDurationMs: integer("rate_limit_block_duration_ms").notNull().default(300000),
  
  // IP whitelist (JSON array of IP addresses)
  whitelist: jsonb("whitelist").$type<string[]>().default([]),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Customer License/Contract Configuration
export const customerLicense = pgTable("customer_license", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull().unique(),
  organizationName: text("organization_name").notNull(),
  
  // Deployment Contact Information (for notifications)
  deploymentContactEmail: text("deployment_contact_email"),
  deploymentContactName: text("deployment_contact_name"),
  technicalContactEmail: text("technical_contact_email"),
  technicalContactName: text("technical_contact_name"),
  
  // License type
  licenseType: text("license_type").notNull().$type<"trial" | "basic" | "professional" | "enterprise">().default("trial"),
  
  // Feature flags - what features are enabled for this customer
  features: jsonb("features").$type<{
    flowEditor: boolean;        // Flow Builder access
    dataSources: boolean;       // Data Sources configuration
    interfaces: boolean;        // Interfaces (REST, GraphQL, etc)
    mappingGenerator: boolean;  // AI Mapping Generator
    advancedSettings: boolean;  // Advanced system settings
    customNodes: boolean;       // Custom node creation
    apiAccess: boolean;         // Direct API access
    webhooks: boolean;          // Webhook endpoints
    
    // Self-service permissions (Forger model)
    canEditFlows?: boolean;      // Can edit flows in production
    canAddInterfaces?: boolean;  // Can add new interfaces
    canAddSystems?: boolean;     // Can add new systems
    canDeleteResources?: boolean;// Can delete resources
  }>().default({
    flowEditor: false,
    dataSources: false,
    interfaces: false,
    mappingGenerator: false,
    advancedSettings: false,
    customNodes: false,
    apiAccess: true,
    webhooks: true,
    canEditFlows: false,
    canAddInterfaces: false,
    canAddSystems: false,
    canDeleteResources: false,
  }),
  
  // Resource limits
  limits: jsonb("limits").$type<{
    maxFlows: number;           // Maximum number of flows
    maxDataSources: number;     // Maximum data sources
    maxInterfaces: number;      // Maximum interfaces (count-based pricing)
    maxSystems: number;         // Maximum systems (count-based pricing)
    maxUsers: number;           // Maximum users in organization
    maxExecutionsPerMonth: number; // Monthly execution limit
  }>().default({
    maxFlows: 5,
    maxDataSources: 2,
    maxInterfaces: 2,
    maxSystems: 1,
    maxUsers: 5,
    maxExecutionsPerMonth: 10000,
  }),
  
  // Custom pricing (Forger model: Base + per-interface + per-system)
  pricing: jsonb("pricing").$type<{
    basePlatform: number;       // Base platform fee/month
    perInterface: number;       // Cost per interface/month
    perSystem: number;          // Cost per system/month
    currency?: string;          // USD, EUR, etc
    billingCycle?: string;      // monthly, yearly, etc
  }>().default({
    basePlatform: 500,
    perInterface: 100,
    perSystem: 200,
    currency: "USD",
    billingCycle: "monthly",
  }),
  
  // License validity
  validFrom: timestamp("valid_from").notNull().defaultNow(),
  validUntil: timestamp("valid_until"), // null = perpetual
  
  // Status
  active: boolean("active").notNull().default(true),
  
  // Metadata
  contractNumber: text("contract_number"),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: text("created_by"),
});

// Deployment Packages Table (for tracking generated builds)
export const deploymentPackages = pgTable("deployment_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull(),
  organizationName: text("organization_name").notNull(),
  
  // Deployment Configuration
  deploymentProfile: text("deployment_profile").notNull().$type<"standalone" | "standard" | "cluster" | "kubernetes">(),
  deploymentVersion: text("deployment_version").notNull(),
  
  // Storage Information
  storagePath: text("storage_path").notNull(), // Path in GCS/Azure Blob
  downloadUrl: text("download_url"), // Signed URL (temporary)
  downloadUrlExpiresAt: timestamp("download_url_expires_at"),
  
  // Files included in package
  filesIncluded: jsonb("files_included").$type<string[]>(),
  packageSizeBytes: integer("package_size_bytes"),
  
  // Notification Status
  notificationSent: boolean("notification_sent").notNull().default(false),
  notificationSentAt: timestamp("notification_sent_at"),
  notificationRecipient: text("notification_recipient"),
  
  // Download Tracking
  downloadCount: integer("download_count").notNull().default(0),
  lastDownloadedAt: timestamp("last_downloaded_at"),
  
  // Deployment Status
  deployed: boolean("deployed").notNull().default(false),
  deployedAt: timestamp("deployed_at"),
  deployedBy: text("deployed_by"),
  
  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  notes: text("notes"),
  
  // Auto-deletion (based on lifecycle policy)
  expiresAt: timestamp("expires_at"), // When GCS will auto-delete
  deleted: boolean("deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by").notNull(), // Founder/Consultant who generated it
});
