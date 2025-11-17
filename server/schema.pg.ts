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
