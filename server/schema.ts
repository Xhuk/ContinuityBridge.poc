import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// Users Table (for RBAC - superadmin vs contractors)
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),  // Hashed password
  
  // Role-Based Access Control (RBAC)
  // - superadmin: Full system access, can create consultants, manage all customers
  // - consultant: Customer-scoped admin, manages assigned customers only
  // - customer_admin: Self-service configuration, manages own company users
  // - customer_user: Read-only access, can only view error dashboard
  role: text("role").notNull().$type<"superadmin" | "consultant" | "customer_admin" | "customer_user">().default("customer_user"),
  
  // API key for programmatic access
  apiKey: text("api_key").unique(),
  
  // Organization scoping
  organizationId: text("organization_id"),
  organizationName: text("organization_name"),
  
  // Consultant-specific: Assigned customers (for multi-customer access)
  assignedCustomers: text("assigned_customers", { mode: "json" }).$type<string[]>(), // Array of organizationIds
  
  // Account status
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastLoginAt: text("last_login_at"),
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// System Logs Table (Professional logging with web portal access)
export const systemLogs = sqliteTable("system_logs", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  // Log metadata
  timestamp: text("timestamp").notNull().default(sql`CURRENT_TIMESTAMP`),
  level: text("level").notNull().$type<"debug" | "info" | "warn" | "error">(),
  
  // Logging scope (superadmin vs customer)
  scope: text("scope").notNull().$type<"superadmin" | "customer">().default("superadmin"),
  
  // Source information
  service: text("service").notNull(), // e.g., "FlowOrchestrator", "MagicLinkService"
  component: text("component"), // e.g., "executeLogger", "validateLicense"
  
  // Message
  message: text("message").notNull(),
  
  // Context data (JSON)
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  
  // Flow execution context (if applicable)
  flowId: text("flow_id"),
  flowName: text("flow_name"),
  runId: text("run_id"),
  traceId: text("trace_id"),
  
  // User/organization context
  userId: text("user_id"),
  organizationId: text("organization_id"), // NULL for superadmin logs
  
  // Error details (if level = error)
  errorStack: text("error_stack"),
  errorCode: text("error_code"),
  
  // Request context
  requestId: text("request_id"),
  httpMethod: text("http_method"),
  httpPath: text("http_path"),
  httpStatus: integer("http_status"),
  
  // Performance metrics
  durationMs: integer("duration_ms"),
  
  // Indexes for fast queries
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Log Configuration Table (Per-organization log settings)
export const logConfigurations = sqliteTable("log_configurations", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  // Scope configuration
  scope: text("scope").notNull().$type<"superadmin" | "customer">().default("customer"),
  organizationId: text("organization_id"), // NULL for superadmin config
  
  // Log levels
  minLevel: text("min_level").notNull().$type<"debug" | "info" | "warn" | "error">().default("info"),
  
  // Retention settings
  retentionDays: integer("retention_days").notNull().default(30), // How long to keep logs
  maxLogSize: integer("max_log_size_mb").notNull().default(100), // Max storage per org (MB)
  
  // File logging settings
  fileLoggingEnabled: integer("file_logging_enabled", { mode: "boolean" }).notNull().default(true),
  fileRotationDays: integer("file_rotation_days").notNull().default(7), // Daily rotation kept for N days
  
  // Database logging settings
  dbLoggingEnabled: integer("db_logging_enabled", { mode: "boolean" }).notNull().default(true),
  
  // What to log
  logFlowExecutions: integer("log_flow_executions", { mode: "boolean" }).notNull().default(true),
  logApiRequests: integer("log_api_requests", { mode: "boolean" }).notNull().default(true),
  logAuthEvents: integer("log_auth_events", { mode: "boolean" }).notNull().default(true),
  logErrors: integer("log_errors", { mode: "boolean" }).notNull().default(true),
  
  // Alert settings
  alertOnError: integer("alert_on_error", { mode: "boolean" }).notNull().default(false),
  alertEmail: text("alert_email"),
  
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// VERSIONED CONFIGURATION MANAGEMENT
// ============================================================================

// Configuration Versions Table (Track every customer config change)
export const configurationVersions = sqliteTable("configuration_versions", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  // Organization/Customer scoping
  organizationId: text("organization_id").notNull(),
  organizationName: text("organization_name").notNull(),
  
  // Environment targeting (DEV = mutable, PROD = immutable)
  targetEnvironment: text("target_environment").$type<"dev" | "staging" | "prod">().notNull().default("dev"),
  
  // Semantic versioning: MAJOR.MINOR.PATCH
  version: text("version").notNull(), // e.g., "1.2.3"
  versionMajor: integer("version_major").notNull().default(1),
  versionMinor: integer("version_minor").notNull().default(0),
  versionPatch: integer("version_patch").notNull().default(0),
  
  // Version metadata
  label: text("label"), // e.g., "Christmas Sale Mappings"
  description: text("description"), // Change description
  changeType: text("change_type").$type<"major" | "minor" | "patch">().notNull().default("patch"),
  
  // Status lifecycle (environment-dependent)
  // DEV: draft → deployed (no approval)
  // PROD: draft → pending_approval → approved → deployed
  status: text("status").$type<"draft" | "pending_approval" | "approved" | "deployed" | "archived">().notNull().default("draft"),
  
  // Immutability flag (PROD versions are immutable after deployment)
  isImmutable: integer("is_immutable", { mode: "boolean" }).notNull().default(false),
  
  // Configuration snapshot (JSON blob of all settings)
  configuration: text("configuration", { mode: "json" }).$type<{
    flows?: any[];
    interfaces?: any[];
    dataSources?: any[];
    mappings?: any[];
    settings?: Record<string, any>;
  }>().notNull(),
  
  // Delta from previous version (for changelog)
  changesSummary: text("changes_summary", { mode: "json" }).$type<{
    added?: string[];
    modified?: string[];
    deleted?: string[];
    details?: string;
  }>(),
  
  // Deployment information
  deployedAt: text("deployed_at"),
  deploymentMethod: text("deployment_method").$type<"docker" | "kubernetes" | "manual">(),
  dockerImageTag: text("docker_image_tag"), // e.g., "customer-xyz:1.2.3"
  dockerRegistryUrl: text("docker_registry_url"),
  
  // Rollback reference (nullable, string ID only - handled in app logic)
  previousVersionId: text("previous_version_id"), // References another version.id
  canRollback: integer("can_rollback", { mode: "boolean" }).notNull().default(true),
  
  // Audit trail
  createdBy: text("created_by").notNull(), // User ID
  createdByEmail: text("created_by_email").notNull(),
  approvedBy: text("approved_by"), // Superadmin ID
  approvedByEmail: text("approved_by_email"),
  approvedAt: text("approved_at"),
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Change Requests Table (Contractor proposes → Superadmin approves)
export const changeRequests = sqliteTable("change_requests", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  // Organization context
  organizationId: text("organization_id").notNull(),
  organizationName: text("organization_name").notNull(),
  
  // Request metadata
  title: text("title").notNull(), // e.g., "Add new product mapping for SKU-1234" or "Request SOW Amendment: +5 interfaces"
  description: text("description").notNull(), // Detailed explanation
  requestType: text("request_type").$type<"mapping_change" | "flow_update" | "interface_config" | "datasource_update" | "sow_amendment" | "license_upgrade" | "other">().notNull(),
  
  // Proposed changes (JSON diff)
  proposedChanges: text("proposed_changes", { mode: "json" }).$type<{
    resourceType: string; // "flow", "interface", "mapping", "license", "sow"
    resourceId: string;
    resourceName: string;
    oldValue?: any;
    newValue: any;
    action: "create" | "update" | "delete";
    
    // SOW Amendment-specific fields
    sowChanges?: {
      currentInterfaces: number;
      requestedInterfaces: number;
      currentSystems: number;
      requestedSystems: number;
      currentLicenseType: string;
      requestedLicenseType?: string;
      businessJustification: string;
      estimatedMonthlyCostIncrease: number;
    };
    
    // AI-generated suggestions
    aiSuggestions?: {
      recommendedPlan: string; // "professional" | "enterprise"
      costOptimization: string;
      alternativeOptions: string[];
      confidence: number;
    };
  }[]>().notNull(),
  
  // Impact assessment
  impactLevel: text("impact_level").$type<"low" | "medium" | "high" | "critical">().notNull().default("medium"),
  affectedFlows: text("affected_flows", { mode: "json" }).$type<string[]>(),
  testingNotes: text("testing_notes"), // How contractor tested changes
  
  // Approval workflow
  status: text("status").$type<"pending" | "reviewing" | "approved" | "rejected" | "deployed">().notNull().default("pending"),
  reviewNotes: text("review_notes"), // Superadmin feedback
  
  // Version association
  targetVersionId: text("target_version_id").references(() => configurationVersions.id),
  
  // Audit trail
  requestedBy: text("requested_by").notNull(), // Contractor user ID
  requestedByEmail: text("requested_by_email").notNull(),
  reviewedBy: text("reviewed_by"), // Superadmin ID
  reviewedByEmail: text("reviewed_by_email"),
  reviewedAt: text("reviewed_at"),
  deployedAt: text("deployed_at"),
  
  // Priority
  priority: text("priority").$type<"low" | "normal" | "high" | "urgent">().notNull().default("normal"),
  dueDate: text("due_date"),
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Deployment History Table (Track every release to Docker)
export const deploymentHistory = sqliteTable("deployment_history", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  // Organization context
  organizationId: text("organization_id").notNull(),
  organizationName: text("organization_name").notNull(),
  
  // Environment (dev, staging, prod)
  environment: text("environment").$type<"dev" | "staging" | "prod">().notNull().default("dev"),
  
  // Version reference
  versionId: text("version_id").notNull().references(() => configurationVersions.id),
  version: text("version").notNull(), // "1.2.3"
  
  // Deployment details
  deploymentType: text("deployment_type").$type<"initial" | "update" | "rollback" | "hotfix">().notNull(),
  deploymentMethod: text("deployment_method").$type<"docker" | "kubernetes" | "manual">().notNull(),
  
  // Docker/Container info
  dockerImageTag: text("docker_image_tag").notNull(),
  dockerRegistryUrl: text("docker_registry_url"),
  containerName: text("container_name"),
  
  // Deployment status
  status: text("status").$type<"pending" | "building" | "pushing" | "deploying" | "success" | "failed" | "rolled_back">().notNull().default("pending"),
  
  // Build information
  buildStartedAt: text("build_started_at"),
  buildCompletedAt: text("build_completed_at"),
  buildDurationMs: integer("build_duration_ms"),
  buildLogs: text("build_logs"),
  
  // Deployment information
  deployedAt: text("deployed_at"),
  deploymentDurationMs: integer("deployment_duration_ms"),
  deploymentLogs: text("deployment_logs"),
  
  // Error handling
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  
  // Rollback capability
  canRollback: integer("can_rollback", { mode: "boolean" }).notNull().default(true),
  rolledBackAt: text("rolled_back_at"),
  rolledBackBy: text("rolled_back_by"),
  
  // Audit trail
  deployedBy: text("deployed_by").notNull(), // User ID (superadmin or automated)
  deployedByEmail: text("deployed_by_email").notNull(),
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// RELEASE MANAGEMENT & PLANNING (Superadmin tracking)
// ============================================================================

// Release Plans Table (Superadmin tracks customer go-live schedules)
export const releasePlans = sqliteTable("release_plans", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  // Organization context
  organizationId: text("organization_id").notNull(),
  organizationName: text("organization_name").notNull(),
  
  // Release metadata
  releaseName: text("release_name").notNull(), // e.g., "Q1 2025 Integration Release"
  releaseType: text("release_type").$type<"initial_deployment" | "feature_release" | "hotfix" | "migration" | "upgrade">().notNull(),
  
  // Environment schedules
  devSchedule: text("dev_schedule", { mode: "json" }).$type<{
    plannedDate: string;
    actualDate?: string;
    status: "not_started" | "in_progress" | "completed" | "blocked" | "skipped";
    notes?: string;
  }>(),
  
  stagingSchedule: text("staging_schedule", { mode: "json" }).$type<{
    plannedDate: string; // UAT start date
    actualDate?: string;
    status: "not_started" | "in_progress" | "completed" | "blocked" | "skipped";
    uatDuration?: string; // e.g., "2 weeks"
    uatParticipants?: string[]; // Stakeholders
    notes?: string;
  }>(),
  
  prodSchedule: text("prod_schedule", { mode: "json" }).$type<{
    plannedGoLiveDate: string; // Expected go-live
    actualGoLiveDate?: string;
    status: "not_started" | "in_progress" | "completed" | "blocked" | "delayed";
    maintenanceWindow?: string; // e.g., "Saturday 2AM-6AM"
    rollbackPlan?: string;
    notes?: string;
  }>(),
  
  // Overall release status
  overallStatus: text("overall_status").$type<"planning" | "dev" | "uat" | "prod_ready" | "deployed" | "rolled_back" | "cancelled">().notNull().default("planning"),
  
  // Version associations
  devVersionId: text("dev_version_id"),
  stagingVersionId: text("staging_version_id"),
  prodVersionId: text("prod_version_id"),
  
  // Stakeholders
  projectManager: text("project_manager"), // Email or name
  technicalLead: text("technical_lead"),
  businessOwner: text("business_owner"),
  
  // Risk assessment
  riskLevel: text("risk_level").$type<"low" | "medium" | "high" | "critical">().notNull().default("medium"),
  risks: text("risks", { mode: "json" }).$type<{
    description: string;
    mitigation: string;
    severity: "low" | "medium" | "high" | "critical";
  }[]>(),
  
  // Audit trail
  createdBy: text("created_by").notNull(),
  createdByEmail: text("created_by_email").notNull(),
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Integration Notes Table (Consultant/Contractor notes for each customer)
export const integrationNotes = sqliteTable("integration_notes", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  // Organization context
  organizationId: text("organization_id").notNull(),
  organizationName: text("organization_name").notNull(),
  
  // Note metadata
  title: text("title").notNull(), // e.g., "WMS API Endpoint Configuration"
  category: text("category").$type<"architecture" | "mapping" | "api_config" | "data_model" | "business_logic" | "testing" | "deployment" | "troubleshooting" | "other">().notNull(),
  
  // Content
  content: text("content").notNull(), // Markdown supported
  
  // Associations
  relatedReleasePlanId: text("related_release_plan_id"), // Link to release
  relatedVersionId: text("related_version_id"), // Link to version
  relatedFlowId: text("related_flow_id"), // Link to flow
  relatedInterfaceId: text("related_interface_id"), // Link to interface
  
  // Tagging
  tags: text("tags", { mode: "json" }).$type<string[]>(), // ["SAP", "SFTP", "critical"]
  
  // Visibility
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false), // Visible to contractors?
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false), // Show at top?
  
  // Author
  authorId: text("author_id").notNull(),
  authorEmail: text("author_email").notNull(),
  authorRole: text("author_role").$type<"superadmin" | "contractor" | "viewer">(),
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// ERROR REPORTING & TRIAGE SYSTEM
// ============================================================================

// Error Reports Table (Production error capture with full context snapshot)
export const errorReports = sqliteTable("error_reports", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  // Organization context (for multi-tenant filtering)
  organizationId: text("organization_id").notNull(),
  organizationName: text("organization_name"),
  
  // Execution context ("Error Context Snapshot")
  flowId: text("flow_id").notNull(),
  flowName: text("flow_name").notNull(),
  flowVersion: text("flow_version").notNull(),
  runId: text("run_id").notNull(), // Unique execution ID
  traceId: text("trace_id").notNull(), // For distributed tracing
  
  // Failed node details
  nodeId: text("node_id").notNull(), // Which node failed
  nodeName: text("node_name"),
  nodeType: text("node_type"), // "validation", "transformation", "api_call", etc.
  
  // Error classification
  errorType: text("error_type").$type<"flow_execution" | "node_failure" | "validation" | "transformation" | "api_error" | "timeout" | "connection" | "authentication" | "data_format" | "business_logic" | "system" | "unknown">().notNull().default("unknown"),
  
  // Error messages (dual format for UI display)
  errorMessageSimple: text("error_message_simple").notNull(), // Human-readable: "Validation Node: order_id field is missing"
  errorMessageTechnical: text("error_message_technical").notNull(), // Full error message
  
  // Full context snapshot (for advanced debugging)
  payloadSnapshot: text("payload_snapshot", { mode: "json" }).$type<any>(), // The data that caused the failure
  stackTrace: text("stack_trace"), // Complete developer-level stack trace
  nodeConfig: text("node_config", { mode: "json" }).$type<any>(), // Node configuration at time of error
  
  // Environment context
  environment: text("environment").$type<"dev" | "staging" | "prod">().notNull().default("prod"),
  executionMode: text("execution_mode").$type<"test" | "production">().notNull().default("production"),
  
  // Triage status
  triageStatus: text("triage_status").$type<"new" | "investigating" | "resolved" | "ignored" | "escalated">().notNull().default("new"),
  
  // Severity (auto-calculated or manually set)
  severity: text("severity").$type<"low" | "medium" | "high" | "critical">().notNull().default("medium"),
  
  // Assignment & tracking
  assignedTo: text("assigned_to"), // User ID who's investigating
  assignedToEmail: text("assigned_to_email"),
  assignedAt: text("assigned_at"),
  
  // Resolution
  resolvedBy: text("resolved_by"),
  resolvedByEmail: text("resolved_by_email"),
  resolvedAt: text("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  
  // Additional context
  metadata: text("metadata", { mode: "json" }).$type<{
    httpStatus?: number;
    httpMethod?: string;
    endpoint?: string;
    retryAttempts?: number;
    relatedErrorIds?: string[]; // For error grouping
  }>(),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Error Comments/Notes Table (For tracking investigation progress)
export const errorComments = sqliteTable("error_comments", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  errorReportId: text("error_report_id").notNull().references(() => errorReports.id, { onDelete: "cascade" }),
  
  // Comment content
  content: text("content").notNull(),
  commentType: text("comment_type").$type<"investigation" | "workaround" | "root_cause" | "fix_applied" | "general">().notNull().default("general"),
  
  // Author
  authorId: text("author_id").notNull(),
  authorEmail: text("author_email").notNull(),
  authorRole: text("author_role").$type<"superadmin" | "consultant" | "customer_admin" | "customer_user">(),
  
  // Metadata
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Error Escalation Tickets (For creating external support tickets)
export const errorEscalationTickets = sqliteTable("error_escalation_tickets", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  errorReportId: text("error_report_id").notNull().references(() => errorReports.id, { onDelete: "cascade" }),
  
  // Ticket details
  ticketNumber: text("ticket_number").unique(), // External ticket system ID
  ticketSystem: text("ticket_system"), // "jira", "zendesk", "email", etc.
  ticketUrl: text("ticket_url"),
  
  // Ticket content (pre-filled from error report)
  title: text("title").notNull(),
  description: text("description").notNull(), // Includes simple + advanced context
  priority: text("priority").$type<"low" | "medium" | "high" | "urgent">().notNull().default("medium"),
  
  // Tracking
  status: text("status").$type<"open" | "in_progress" | "waiting_response" | "resolved" | "closed">().notNull().default("open"),
  
  // Created by
  createdBy: text("created_by").notNull(),
  createdByEmail: text("created_by_email").notNull(),
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// HIERARCHY TABLES
// ============================================================================

// Hierarchy Tables (Account → Tenant → Ecosystem → Environment → System Instance)

// Accounts Table (Monetization layer)
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  licenseTier: text("license_tier").notNull().$type<"free" | "professional" | "enterprise">().default("free"),
  
  // Limits based on tier
  maxTenants: integer("max_tenants").notNull().default(1),
  maxEcosystems: integer("max_ecosystems").notNull().default(5),
  maxInstances: integer("max_instances").notNull().default(10),
  
  // Status
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  expiresAt: text("expires_at"), // License expiration
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Tenants Table (Organization/Client)
export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  
  // Status
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Ecosystems Table (Business domain: ERP, Marketplace, WMS, etc.)
export const ecosystems = sqliteTable("ecosystems", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  
  // Ecosystem type
  type: text("type").notNull().$type<"erp" | "marketplace" | "wms" | "tms" | "3pl" | "last_mile" | "custom">(),
  
  // Status
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Environments Table (DEV/PROD/STAGING)
export const environments = sqliteTable("environments", {
  id: text("id").primaryKey(),
  ecosystemId: text("ecosystem_id").notNull().references(() => ecosystems.id, { onDelete: "cascade" }),
  
  name: text("name").notNull().$type<"dev" | "staging" | "prod">(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  
  // Status
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// System Instances Table (Billable endpoint: JDA_DEV_01, AMAZON_PROD_EU)
export const systemInstances = sqliteTable("system_instances", {
  id: text("id").primaryKey(),
  environmentId: text("environment_id").notNull().references(() => environments.id, { onDelete: "cascade" }),
  
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  
  // Connection details
  endpoint: text("endpoint"),
  
  // Status
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Flow Definitions Table
export const flowDefinitions = sqliteTable("flow_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  
  // Hierarchy scoping (NULLABLE for backward compatibility)
  systemInstanceId: text("system_instance_id").references(() => systemInstances.id, { onDelete: "set null" }),
  
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

// Data Source Schemas Table (stores uploaded data structures)
export const dataSourceSchemas = sqliteTable("data_source_schemas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // User-friendly name (e.g., "Order_XML", "Shipment_API")
  identifier: text("identifier").notNull().unique(), // Unique tag (e.g., "order_xml_v1")
  
  // Source type and format
  sourceType: text("source_type").notNull().$type<"upload" | "api" | "database" | "sftp" | "other">(),
  format: text("format").notNull().$type<"xml" | "json" | "csv" | "other">(),
  
  // Original sample data
  sampleData: text("sample_data"), // Original XML/JSON/CSV content
  
  // Parsed schema structure (JSON representation)
  schema: text("schema", { mode: "json" }).$type<{
    fields: Array<{
      name: string;
      path: string; // JSONPath or XPath
      type: string; // string, number, object, array, etc.
      required?: boolean;
      nested?: boolean;
    }>;
    relationships?: Array<{
      targetSchemaId: string;
      type: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
      foreignKey?: string;
      description?: string;
    }>;
  }>().notNull(),
  
  // System instance scoping
  systemInstanceId: text("system_instance_id").references(() => systemInstances.id, { onDelete: "set null" }),
  
  // Status
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  
  // Metadata
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type DataSourceSchema = typeof dataSourceSchemas.$inferSelect;
export type InsertDataSourceSchema = typeof dataSourceSchemas.$inferInsert;

// Flow Join State Table (for Join node correlation)
export const flowJoinStates = sqliteTable("flow_join_states", {
  id: text("id").primaryKey(),
  flowId: text("flow_id").notNull().references(() => flowDefinitions.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(), // The Join node ID
  
  // Correlation
  correlationKey: text("correlation_key").notNull(), // The field to match on (e.g., order_id)
  correlationValue: text("correlation_value").notNull(), // The actual value (e.g., "12345")
  
  // Payload storage
  streamAPayload: text("stream_a_payload", { mode: "json" }).$type<unknown>(),
  streamBPayload: text("stream_b_payload", { mode: "json" }).$type<unknown>(),
  
  // Metadata
  streamAName: text("stream_a_name"),
  streamBName: text("stream_b_name"),
  joinStrategy: text("join_strategy").$type<"inner" | "left" | "right">().default("inner"),
  
  // Status
  status: text("status").notNull().$type<"waiting_a" | "waiting_b" | "matched" | "timeout">(),
  
  // Timing
  timeoutMinutes: integer("timeout_minutes").notNull().default(1440), // 24 hours
  expiresAt: text("expires_at").notNull(),
  matchedAt: text("matched_at"),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type FlowJoinState = typeof flowJoinStates.$inferSelect;
export type InsertFlowJoinState = typeof flowJoinStates.$inferInsert;

// Poller State Table (for SFTP/Blob poller tracking)
export const pollerStates = sqliteTable("poller_states", {
  id: text("id").primaryKey(),
  flowId: text("flow_id").notNull().references(() => flowDefinitions.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(), // The Poller node ID
  
  pollerType: text("poller_type").notNull().$type<"sftp" | "azure_blob">(),
  
  // Last processed tracking
  lastFile: text("last_file"), // Last processed filename or blob name
  lastProcessedAt: text("last_processed_at"),
  
  // File checksums to avoid reprocessing (JSON array of {filename, checksum})
  fileChecksums: text("file_checksums", { mode: "json" }).$type<Array<{
    filename: string;
    checksum: string;
    processedAt: string;
  }>>(),
  
  // Configuration snapshot (for change detection)
  configSnapshot: text("config_snapshot", { mode: "json" }).$type<Record<string, unknown>>(),
  
  // Status
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastError: text("last_error"),
  lastErrorAt: text("last_error_at"),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type PollerState = typeof pollerStates.$inferSelect;
export type InsertPollerState = typeof pollerStates.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

export type Ecosystem = typeof ecosystems.$inferSelect;
export type InsertEcosystem = typeof ecosystems.$inferInsert;

export type Environment = typeof environments.$inferSelect;
export type InsertEnvironment = typeof environments.$inferInsert;

export type SystemInstance = typeof systemInstances.$inferSelect;
export type InsertSystemInstance = typeof systemInstances.$inferInsert;

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
  failedAttempts: integer("failed_attempts").notNull().default(0), // Failed unlock attempts counter
  lockedUntil: text("locked_until"), // Lockout timestamp if vault is locked
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

// ============================================================================
// AI QUOTA MANAGEMENT (Gemini API) - PER-PROJECT QUOTA
// ============================================================================

// AI Quota Settings Table (PER-PROJECT - each project has its own quota)
// Single Gemini API key used by entire application
// organizationId = projectId for per-project quota tracking
// Consultants can only use AI if enabled for their specific project
export const aiQuotaSettings = sqliteTable("ai_quota_settings", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  // Project context (organizationId = projectId for per-project tracking)
  organizationId: text("organization_id").notNull().unique(), // projectId
  organizationName: text("organization_name").notNull(), // projectName
  
  // Enablement (Superadmin-only control per project)
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false), // DISABLED by default
  
  // Trial period (30 days free per project)
  trialEnabled: integer("trial_enabled", { mode: "boolean" }).notNull().default(true),
  trialExpiresAt: text("trial_expires_at"), // Auto-disable after expiration
  
  // Per-PROJECT quota limits (15 req/day, 450 req/month per project)
  dailyRequestLimit: integer("daily_request_limit").notNull().default(15), // Free tier: 15 req/day per project
  monthlyRequestLimit: integer("monthly_request_limit").notNull().default(450), // 15 * 30 days
  
  // Audit trail
  enabledBy: text("enabled_by"), // Superadmin user ID who enabled AI
  enabledAt: text("enabled_at"),
  disabledAt: text("disabled_at"),
  disabledReason: text("disabled_reason"), // "Trial expired", "Quota exceeded", etc.
  
  // Metadata
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type AIQuotaSettings = typeof aiQuotaSettings.$inferSelect;
export type InsertAIQuotaSettings = typeof aiQuotaSettings.$inferInsert;

// AI Usage Tracking Table (Per-request tracking with project context)
// Tracks WHICH tenant/project made each request for analytics and AI improvement
// organizationId = projectId to match quota settings
export const aiUsageTracking = sqliteTable("ai_usage_tracking", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  // Project context (organizationId = projectId for per-project tracking)
  organizationId: text("organization_id").notNull(), // projectId - which project made the request
  
  // Consultant team pricing tier (for per-team billing)
  pricingTierId: text("pricing_tier_id"), // Links to aiPricingTiers.teamId
  
  // Feature type
  featureType: text("feature_type").notNull().$type<
    "mapping" | "diagnosis" | "flow_suggestion" | "test_data" | "explanation"
  >(),
  
  // Request details
  requestDate: text("request_date").notNull(), // YYYY-MM-DD for daily aggregation
  timestamp: text("timestamp").notNull(),
  
  // Extended metadata for AI improvement and project tracking
  metadata: text("metadata", { mode: "json" }).$type<{
    organizationName?: string;  // Tenant name
    projectId?: string;          // Project ID (redundant but useful)
    projectName?: string;        // Project name
    flowId?: string;             // Which flow (for context)
    flowName?: string;           // Flow name
    nodeType?: string;           // Node type being configured
    inputSize?: number;          // Request size in bytes
    outputSize?: number;         // Response size in bytes
    tokensUsed?: number;         // Tokens consumed (billing: see server/src/config/ai-billing.ts)
    durationMs?: number;         // Processing time
    success?: boolean;           // Did request succeed?
    errorType?: string;          // Error classification if failed
  }>(),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type AIUsageTracking = typeof aiUsageTracking.$inferSelect;
export type InsertAIUsageTracking = typeof aiUsageTracking.$inferInsert;

// AI Billing Pricing Tiers (Per-Team/Consultant Pricing)
// Allows different pricing models for different consultant teams
export const aiPricingTiers = sqliteTable("ai_pricing_tiers", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  // Team/Organization identifier
  teamId: text("team_id").notNull().unique(), // e.g., "consultant-team-1", "consultant-team-2"
  teamName: text("team_name").notNull(), // Display name
  
  // Pricing configuration
  tokensPerBillingUnit: integer("tokens_per_billing_unit").notNull(), // e.g., 2000, 10000
  pricePerUnit: real("price_per_unit").notNull(), // e.g., 250.00, 400.00
  currency: text("currency").notNull().default("USD"),
  
  // Status
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  
  // Metadata
  description: text("description"),
  createdBy: text("created_by").notNull(), // User ID who created
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type AIPricingTier = typeof aiPricingTiers.$inferSelect;
export type InsertAIPricingTier = typeof aiPricingTiers.$inferInsert;

// Organization Branding/Theme Configuration
// Allows customers to customize colors, logo, and UI theme
export const organizationBranding = sqliteTable("organization_branding", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
  // Organization
  organizationId: text("organization_id").notNull().unique(),
  organizationName: text("organization_name").notNull(),
  
  // Logo
  logoUrl: text("logo_url"), // Path to uploaded logo
  logoPosition: text("logo_position").$type<"left" | "center" | "right">().default("left"),
  showLogo: integer("show_logo", { mode: "boolean" }).notNull().default(true),
  
  // Colors (HSL format: "217 91% 35%")
  primaryColor: text("primary_color").default("217 91% 35%"), // Default blue
  secondaryColor: text("secondary_color").default("217 8% 90%"),
  accentColor: text("accent_color").default("217 12% 91%"),
  destructiveColor: text("destructive_color").default("0 84% 35%"),
  
  // Sidebar colors
  sidebarColor: text("sidebar_color").default("0 0% 96%"),
  sidebarPrimaryColor: text("sidebar_primary_color").default("217 91% 35%"),
  
  // Preset theme (if selected)
  presetTheme: text("preset_theme").$type<"default" | "corporate-blue" | "forest-green" | "sunset-orange" | "royal-purple" | "ocean-teal" | "custom">().default("default"),
  
  // Additional customizations
  applicationName: text("application_name").default("ContinuityBridge"),
  favicon: text("favicon"), // Path to favicon
  
  // Metadata
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type OrganizationBranding = typeof organizationBranding.$inferSelect;
export type InsertOrganizationBranding = typeof organizationBranding.$inferInsert;

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
      audience?: string;
      
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

// System Instance Test Files (for E2E testing and emulation)
export const systemInstanceTestFiles = sqliteTable("system_instance_test_files", {
  id: text("id").primaryKey(),
  systemInstanceId: text("system_instance_id").notNull().references(() => systemInstances.id, { onDelete: "cascade" }),
  
  filename: text("filename").notNull(),
  mediaType: text("media_type").notNull().$type<"application/xml" | "application/json" | "text/csv" | "text/plain">(),
  storageKey: text("storage_key").notNull().unique(), // Filesystem path: <instanceId>/<uuid>.<ext>
  fileSize: integer("file_size").notNull(), // Size in bytes
  
  uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  
  // Iteration notes (markdown format) for ML training - visible to consultants & founders
  // Structured as array of iterations tracking each consultant/founder update
  // Customers CANNOT see these notes
  notes: text("notes", { mode: "json" }).$type<Array<{
    iteration: number;
    author: string; // Email address
    authorRole: "superadmin" | "consultant";
    timestamp: string;
    content: string; // Markdown format
  }>>(),
  
  // Founder approval for ML training
  mlApproved: integer("ml_approved", { mode: "boolean" }).default(false),
  mlApprovedBy: text("ml_approved_by"), // Founder email who approved
  mlApprovedAt: text("ml_approved_at"),
  
  metadata: text("metadata", { mode: "json" }).$type<{
    originalName?: string;
    encoding?: string;
    description?: string;
  }>(),
});

export type SystemInstanceTestFile = typeof systemInstanceTestFiles.$inferSelect;
export type InsertSystemInstanceTestFile = typeof systemInstanceTestFiles.$inferInsert;

// System Instance Authentication (per-system auth configs)
export const systemInstanceAuth = sqliteTable("system_instance_auth", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  systemInstanceId: text("system_instance_id").notNull().references(() => systemInstances.id, { onDelete: "cascade" }),
  
  // Auth adapter configuration
  name: text("name").notNull(), // e.g., "JDA OAuth", "Customer API Auth"
  description: text("description"),
  adapterType: text("adapter_type").notNull().$type<"oauth2" | "jwt" | "cookie" | "apikey">(),
  direction: text("direction").notNull().$type<"inbound" | "outbound" | "bidirectional">(),
  
  // Vault secret reference (stores clientId, clientSecret, apiKey, etc.)
  secretRef: text("secret_ref").references(() => secretsVault.id, { onDelete: "set null" }),
  
  // Configuration for token requests and placement
  config: text("config", { mode: "json" }).notNull().$type<{
    // Inbound configuration (validate incoming requests)
    inbound?: {
      headerName?: string;           // e.g., "Authorization", "X-Auth-Token"
      headerPrefix?: string;          // e.g., "Bearer ", "Token "
      cookieName?: string;
      queryParam?: string;
      bodyField?: string;
      
      // OAuth2-specific
      introspectionUrl?: string;
      introspectionMethod?: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
      introspectionHeaders?: Record<string, string>;
      
      // JWT-specific
      jwtAlgorithm?: string;          // e.g., "HS256", "RS256"
      jwtIssuer?: string;
      jwtAudience?: string;
    };
    
    // Outbound configuration (attach auth to API calls)
    outbound?: {
      // Token endpoint configuration
      tokenUrl?: string;              // Full URL with path/query params
      tokenRequestMethod?: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
      tokenRequestHeaders?: Record<string, string>; // Custom headers for token request
      grantType?: "client_credentials" | "authorization_code" | "refresh_token";
      scope?: string;
      audience?: string;
      
      // Token placement in API calls
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
      bodyEncoding?: "json" | "form";
      
      // JWT-specific
      jwtAlgorithm?: string;
      jwtExpiresIn?: string;          // e.g., "1h", "30m"
      jwtClaims?: Record<string, unknown>;
    };
  }>(),
  
  // Status
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastTestedAt: text("last_tested_at"),
  lastUsedAt: text("last_used_at"),
  
  // Metadata
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type SystemInstanceAuth = typeof systemInstanceAuth.$inferSelect;
export type InsertSystemInstanceAuth = typeof systemInstanceAuth.$inferInsert;

// ============================================================================
// QA TESTING TABLES (TestSprite Integration)
// ============================================================================

// QA Test Sessions Table (Test runs)
export const qaTestSessions = sqliteTable("qa_test_sessions", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
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
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
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
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// QA Test Results Table (Individual test cases)
export const qaTestResults = sqliteTable("qa_test_results", {
  id: text("id").primaryKey().$default(() => randomUUID()),
  
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
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  durationMs: integer("duration_ms"),
  
  // Evidence
  screenshotUrl: text("screenshot_url"),
  videoUrl: text("video_url"),
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  
  // Steps taken
  stepsToReproduce: text("steps_to_reproduce", { mode: "json" }).$type<string[]>(),
  
  // Browser/device context
  browser: text("browser"),
  device: text("device"),
  viewport: text("viewport"),
  userAgent: text("user_agent"),
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type QATestSession = typeof qaTestSessions.$inferSelect;
export type InsertQATestSession = typeof qaTestSessions.$inferInsert;
export type QATestResult = typeof qaTestResults.$inferSelect;
export type InsertQATestResult = typeof qaTestResults.$inferInsert;
