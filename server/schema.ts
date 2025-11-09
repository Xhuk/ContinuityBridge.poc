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

// Validation schema for SMTP settings
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
