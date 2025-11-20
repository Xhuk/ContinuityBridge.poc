import { pgTable, text, integer, boolean, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Users Table (for RBAC - superadmin vs contractors)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  
  role: text("role").notNull().$type<"superadmin" | "sales" | "consultant" | "customer_admin" | "customer_user">().default("customer_user"),
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

// Pricing Catalog Table (Founder-configurable pricing tiers)
export const pricingCatalog = pgTable("pricing_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Tier identification
  tierName: text("tier_name").notNull().unique(), // "starter", "professional", "enterprise", "custom"
  displayName: text("display_name").notNull(), // "Professional Plan"
  description: text("description"),
  
  // Pricing model
  currency: text("currency").notNull().default("USD"),
  annualPrice: integer("annual_price").notNull(), // In cents: $24,000 = 2400000
  monthlyPrice: integer("monthly_price").notNull(), // In cents: $2,000 = 200000
  
  // Resource limits
  maxInterfaces: integer("max_interfaces").notNull(),
  maxSystems: integer("max_systems").notNull(),
  maxFlows: integer("max_flows").notNull(),
  maxUsers: integer("max_users").notNull(),
  maxExecutionsPerMonth: integer("max_executions_per_month").notNull(),
  
  // Add-on pricing (per month, in cents)
  extraInterfacePrice: integer("extra_interface_price").notNull(), // $100 = 10000
  extraSystemPrice: integer("extra_system_price").notNull(), // $200 = 20000
  
  // Volume discounts & bundles (better than unlimited add-ons)
  volumeBundles: jsonb("volume_bundles").$type<{
    interfacePacks?: Array<{ quantity: number; price: number; discount: number }>, // e.g., [{quantity: 10, price: 800, discount: 20}]
    systemPacks?: Array<{ quantity: number; price: number; discount: number }>,
  }>(),
  
  // Features included
  features: jsonb("features").$type<{
    flowEditor: boolean;
    dataSources: boolean;
    interfaces: boolean;
    mappingGenerator: boolean;
    advancedSettings: boolean;
    customNodes: boolean;
    apiAccess: boolean;
    webhooks: boolean;
    canEditFlows: boolean;
    canAddInterfaces: boolean;
    canAddSystems: boolean;
    canDeleteResources: boolean;
    premiumSupport?: boolean;
    dedicatedConsultant?: boolean;
  }>().notNull(),
  
  // Visibility
  isActive: boolean("is_active").notNull().default(true),
  isPublic: boolean("is_public").notNull().default(true), // Show on pricing page
  sortOrder: integer("sort_order").notNull().default(0), // Display order
  
  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
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
    
    // Grandfathered pricing (frozen from catalog changes)
    isGrandfathered?: boolean;  // true = pricing locked, won't change with catalog updates
    grandfatheredAt?: string;   // ISO timestamp when pricing was locked
    grandfatheredReason?: string; // e.g., "Catalog update 2024-11-18"
    originalTierSnapshot?: {    // Original tier config at time of grandfathering
      tierName: string;
      displayName: string;
      monthlyPrice: number;
      extraInterfacePrice: number;
      extraSystemPrice: number;
    };
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

// Pricing Change Notifications (Internal Sales Team Alerts)
export const pricingChangeNotifications = pgTable("pricing_change_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Change tracking
  catalogTierName: text("catalog_tier_name").notNull(), // Which tier was changed
  changeType: text("change_type").notNull().$type<"price_increase" | "price_decrease" | "limit_change" | "feature_change" | "tier_deleted">(),
  changedBy: text("changed_by").notNull(), // Founder user ID
  changeDescription: text("change_description").notNull(),
  
  // Old vs New values
  oldValues: jsonb("old_values").$type<{
    monthlyPrice?: number;
    annualPrice?: number;
    extraInterfacePrice?: number;
    extraSystemPrice?: number;
    maxInterfaces?: number;
    maxSystems?: number;
    features?: Record<string, boolean>;
  }>(),
  newValues: jsonb("new_values").$type<{
    monthlyPrice?: number;
    annualPrice?: number;
    extraInterfacePrice?: number;
    extraSystemPrice?: number;
    maxInterfaces?: number;
    maxSystems?: number;
    features?: Record<string, boolean>;
  }>(),
  
  // Affected customers (for Sales Team reference)
  affectedCustomers: jsonb("affected_customers").$type<Array<{
    organizationId: string;
    organizationName: string;
    currentTier: string;
    grandfathered: boolean; // Was customer grandfathered?
    currentMonthlySpend: number; // For sales team context
    estimatedNewMonthlySpend: number;
    deploymentContactEmail?: string; // For sales team to reach out
    deploymentContactName?: string;
    salesRepAssigned?: string; // Which sales rep should handle this
  }>>(),
  
  // Sales Team Notification (INTERNAL ONLY)
  salesTeamNotified: boolean("sales_team_notified").notNull().default(false),
  salesTeamNotifiedAt: timestamp("sales_team_notified_at"),
  salesTeamEmails: jsonb("sales_team_emails").$type<string[]>(), // Internal sales team emails
  
  // Summary stats
  totalAffectedCustomers: integer("total_affected_customers").notNull().default(0),
  grandfatheredCount: integer("grandfathered_count").notNull().default(0),
  
  // Status
  status: text("status").notNull().$type<"pending" | "sales_notified" | "completed">().default("pending"),
  
  // Sales team notes
  salesNotes: text("sales_notes"), // For sales team to track customer outreach
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

// ============================================================================
// QA TESTING TABLES (TestSprite Integration)
// ============================================================================

// QA Test Sessions Table (Test runs)
export const qaTestSessions = pgTable("qa_test_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Session metadata
  sessionName: text("session_name").notNull(),
  flowId: text("flow_id"),
  flowName: text("flow_name"),
  
  // Test configuration
  testType: text("test_type").$type<"unit" | "integration" | "e2e" | "regression">().notNull(),
  browser: text("browser").$type<"chrome" | "firefox" | "safari" | "edge">(),
  device: text("device").$type<"desktop" | "mobile" | "tablet">(),
  
  // Status
  status: text("status").$type<"pending" | "running" | "passed" | "failed" | "skipped">().notNull().default("pending"),
  
  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  
  // Results summary
  totalTests: integer("total_tests").notNull().default(0),
  passedTests: integer("passed_tests").notNull().default(0),
  failedTests: integer("failed_tests").notNull().default(0),
  skippedTests: integer("skipped_tests").notNull().default(0),
  
  // Triggered by
  triggeredBy: text("triggered_by"),
  triggeredByEmail: text("triggered_by_email"),
  
  // Organization context
  organizationId: text("organization_id"),
  
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// QA Test Results Table (Individual test cases)
export const qaTestResults = pgTable("qa_test_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Session reference
  sessionId: text("session_id").notNull(),
  
  // Test identification
  testName: text("test_name").notNull(),
  testDescription: text("test_description"),
  testUrl: text("test_url"),
  
  // Test details
  expectedBehavior: text("expected_behavior"),
  actualBehavior: text("actual_behavior"),
  
  // Status
  status: text("status").$type<"passed" | "failed" | "skipped">().notNull(),
  
  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  
  // Evidence
  screenshotUrl: text("screenshot_url"),
  videoUrl: text("video_url"),
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  
  // Steps taken
  stepsToReproduce: jsonb("steps_to_reproduce").$type<string[]>(),
  
  // Browser/device context
  browser: text("browser"),
  device: text("device"),
  viewport: text("viewport"),
  userAgent: text("user_agent"),
  
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type QATestSession = typeof qaTestSessions.$inferSelect;
export type InsertQATestSession = typeof qaTestSessions.$inferInsert;
export type QATestResult = typeof qaTestResults.$inferSelect;
export type InsertQATestResult = typeof qaTestResults.$inferInsert;

// ============================================================================
// HIERARCHY TABLES (Account → Tenant → Ecosystem → Environment → Instance)
// ============================================================================

// Accounts Table (Monetization layer)
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  licenseTier: text("license_tier").notNull().default("free"),
  maxTenants: integer("max_tenants").notNull().default(1),
  maxEcosystems: integer("max_ecosystems").notNull().default(5),
  maxInstances: integer("max_instances").notNull().default(10),
  enabled: boolean("enabled").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Tenants Table (Organization/Client)
export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Ecosystems Table (Business domain)
export const ecosystems = pgTable("ecosystems", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  tags: jsonb("tags").$type<string[]>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Environments Table (DEV/PROD/STAGING)
export const environments = pgTable("environments", {
  id: text("id").primaryKey(),
  ecosystemId: text("ecosystem_id").notNull().references(() => ecosystems.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// System Instances Table (Billable endpoint)
export const systemInstances = pgTable("system_instances", {
  id: text("id").primaryKey(),
  environmentId: text("environment_id").notNull().references(() => environments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  endpoint: text("endpoint"),
  enabled: boolean("enabled").notNull().default(true),
  tags: jsonb("tags").$type<string[]>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// FLOW TABLES
// ============================================================================

// Flow Definitions Table
export const flowDefinitions = pgTable("flow_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  systemInstanceId: text("system_instance_id").references(() => systemInstances.id, { onDelete: "set null" }),
  nodes: jsonb("nodes").notNull(),
  edges: jsonb("edges").notNull(),
  version: text("version").notNull().default("1.0.0"),
  enabled: boolean("enabled").notNull().default(true),
  tags: jsonb("tags").$type<string[]>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Flow Runs Table
export const flowRuns = pgTable("flow_runs", {
  id: text("id").primaryKey(),
  flowId: text("flow_id").notNull().references(() => flowDefinitions.id, { onDelete: "cascade" }),
  flowName: text("flow_name").notNull(),
  flowVersion: text("flow_version").notNull(),
  traceId: text("trace_id").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  inputData: jsonb("input_data"),
  outputData: jsonb("output_data"),
  triggeredBy: text("triggered_by").notNull(),
  executedNodes: jsonb("executed_nodes"),
  nodeExecutions: jsonb("node_executions"),
  error: text("error"),
  errorNode: text("error_node"),
});

// Interfaces Table
export const interfaces = pgTable("interfaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  direction: text("direction").notNull(),
  protocol: text("protocol").notNull(),
  endpoint: text("endpoint"),
  authType: text("auth_type"),
  httpConfig: jsonb("http_config"),
  oauth2Config: jsonb("oauth2_config"),
  formats: jsonb("formats"),
  defaultFormat: text("default_format"),
  enabled: boolean("enabled").notNull().default(true),
  tags: jsonb("tags").$type<string[]>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Integration Events Table
export const integrationEvents = pgTable("integration_events", {
  id: text("id").primaryKey(),
  traceId: text("trace_id").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  sourceInterfaceId: text("source_interface_id").references(() => interfaces.id),
  targetInterfaceId: text("target_interface_id").references(() => interfaces.id),
  eventType: text("event_type").notNull(),
  status: text("status").notNull(),
  payload: jsonb("payload"),
  transformedPayload: jsonb("transformed_payload"),
  latencyMs: integer("latency_ms"),
  error: text("error"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

// Poller States Table (for tracking file/blob poller progress)
export const pollerStates = pgTable("poller_states", {
  id: text("id").primaryKey(),
  flowId: text("flow_id").notNull().references(() => flowDefinitions.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(),
  pollerType: text("poller_type").notNull().$type<"sftp" | "azure_blob" | "database">(),
  lastFile: text("last_file"),
  lastProcessedAt: timestamp("last_processed_at"),
  fileChecksums: jsonb("file_checksums").$type<Array<{ filename: string; checksum: string; processedAt: string }>>(),
  configSnapshot: jsonb("config_snapshot").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Secrets Master Keys Table
export const secretsMasterKeys = pgTable("secrets_master_keys", {
  id: text("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  argonMemory: integer("argon_memory").notNull().default(65536),
  argonIterations: integer("argon_iterations").notNull().default(3),
  argonParallelism: integer("argon_parallelism").notNull().default(4),
  recoveryCodeHash: text("recovery_code_hash"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  lastUnlocked: timestamp("last_unlocked"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

