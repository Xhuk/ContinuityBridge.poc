import { sqlite } from "./db";

/**
 * Create tables for SQLite database
 * This runs automatically on startup to ensure tables exist
 */
export async function ensureTables() {
  if (!sqlite) {
    // PostgreSQL would use Drizzle migrations instead
    console.log("[Database] Skipping table creation (not using SQLite)");
    return;
  }

  try {
    // Create flow_definitions table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS flow_definitions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        nodes TEXT NOT NULL,
        edges TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '1.0.0',
        enabled INTEGER NOT NULL DEFAULT 1,
        tags TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create flow_runs table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS flow_runs (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
        flow_name TEXT NOT NULL,
        flow_version TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER,
        input_data TEXT,
        output_data TEXT,
        triggered_by TEXT NOT NULL,
        executed_nodes TEXT,
        node_executions TEXT,
        error TEXT,
        error_node TEXT
      )
    `);

    // Create interfaces table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS interfaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        direction TEXT NOT NULL,
        protocol TEXT NOT NULL,
        endpoint TEXT,
        auth_type TEXT,
        http_config TEXT,
        oauth2_config TEXT,
        formats TEXT,
        default_format TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        tags TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create integration_events table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS integration_events (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        source_interface_id TEXT REFERENCES interfaces(id),
        target_interface_id TEXT REFERENCES interfaces(id),
        event_type TEXT NOT NULL,
        status TEXT NOT NULL,
        payload TEXT,
        transformed_payload TEXT,
        latency_ms INTEGER,
        error TEXT,
        metadata TEXT
      )
    `);

    // Create smtp_settings table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS smtp_settings (
        id TEXT PRIMARY KEY,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 587,
        secure INTEGER NOT NULL DEFAULT 0,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        from_address TEXT NOT NULL,
        from_name TEXT,
        notify_on_flow_error INTEGER NOT NULL DEFAULT 1,
        notify_on_validation_error INTEGER NOT NULL DEFAULT 0,
        notify_on_ack_failure INTEGER NOT NULL DEFAULT 1,
        alert_recipients TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_tested_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create adapter_licenses table (for marketplace licensing)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS adapter_licenses (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL DEFAULT 'default',
        adapter_id TEXT NOT NULL,
        license_type TEXT NOT NULL,
        subscription_status TEXT,
        expires_at TEXT,
        purchased_at TEXT NOT NULL,
        purchase_price REAL,
        billing_interval TEXT,
        payment_provider TEXT,
        payment_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(customer_id, adapter_id)
      )
    `);

    // Create secrets_master_keys table (for unified secrets vault)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS secrets_master_keys (
        id TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        argon_memory INTEGER NOT NULL DEFAULT 65536,
        argon_iterations INTEGER NOT NULL DEFAULT 3,
        argon_parallelism INTEGER NOT NULL DEFAULT 4,
        recovery_code_hash TEXT,
        last_unlocked TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create secrets_vault table (for all integration secrets)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS secrets_vault (
        id TEXT PRIMARY KEY,
        master_key_id TEXT NOT NULL DEFAULT 'default' REFERENCES secrets_master_keys(id) ON DELETE CASCADE,
        integration_type TEXT NOT NULL,
        label TEXT NOT NULL,
        encrypted_payload TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        metadata TEXT,
        last_rotated_at TEXT,
        rotation_due_at TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indices for common queries
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_flow_runs_flow_id ON flow_runs(flow_id)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_flow_runs_trace_id ON flow_runs(trace_id)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_integration_events_trace_id ON integration_events(trace_id)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_integration_events_timestamp ON integration_events(timestamp)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_adapter_licenses_adapter_id ON adapter_licenses(adapter_id)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_adapter_licenses_customer_id ON adapter_licenses(customer_id)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_secrets_vault_integration_type ON secrets_vault(integration_type)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_secrets_vault_master_key_id ON secrets_vault(master_key_id)
    `);

    // Create audit_logs table (for compliance and security tracking)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        operation TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        user_ip TEXT,
        success INTEGER NOT NULL DEFAULT 1,
        error_message TEXT,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_operation ON audit_logs(operation)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)
    `);

    console.log("[Database] Tables initialized successfully");
  } catch (error) {
    console.error("[Database] Error creating tables:", error);
    throw error;
  }
}
