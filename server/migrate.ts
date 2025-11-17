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
    // Create hierarchy tables (Account → Tenant → Ecosystem → Environment → System Instance)
    
    // Create accounts table (Monetization layer)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        license_tier TEXT NOT NULL DEFAULT 'free',
        max_tenants INTEGER NOT NULL DEFAULT 1,
        max_ecosystems INTEGER NOT NULL DEFAULT 5,
        max_instances INTEGER NOT NULL DEFAULT 10,
        enabled INTEGER NOT NULL DEFAULT 1,
        expires_at TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create tenants table (Organization/Client)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create ecosystems table (Business domain)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS ecosystems (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        tags TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create environments table (DEV/PROD/STAGING)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS environments (
        id TEXT PRIMARY KEY,
        ecosystem_id TEXT NOT NULL REFERENCES ecosystems(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create system_instances table (Billable endpoint)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS system_instances (
        id TEXT PRIMARY KEY,
        environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        endpoint TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        tags TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create flow_definitions table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS flow_definitions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        system_instance_id TEXT REFERENCES system_instances(id) ON DELETE SET NULL,
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

    // Create data_source_schemas table (for storing uploaded data structures)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS data_source_schemas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        identifier TEXT NOT NULL UNIQUE,
        source_type TEXT NOT NULL,
        format TEXT NOT NULL,
        sample_data TEXT,
        schema TEXT NOT NULL,
        system_instance_id TEXT REFERENCES system_instances(id) ON DELETE SET NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        tags TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create flow_join_states table (for Join node correlation)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS flow_join_states (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
        node_id TEXT NOT NULL,
        correlation_key TEXT NOT NULL,
        correlation_value TEXT NOT NULL,
        stream_a_payload TEXT,
        stream_b_payload TEXT,
        stream_a_name TEXT,
        stream_b_name TEXT,
        join_strategy TEXT DEFAULT 'inner',
        status TEXT NOT NULL,
        timeout_minutes INTEGER NOT NULL DEFAULT 1440,
        expires_at TEXT NOT NULL,
        matched_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create poller_states table (for SFTP/Blob poller tracking)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS poller_states (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
        node_id TEXT NOT NULL,
        poller_type TEXT NOT NULL,
        last_file TEXT,
        last_processed_at TEXT,
        file_checksums TEXT,
        config_snapshot TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_error TEXT,
        last_error_at TEXT,
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

    // Create indices for Join and Poller states
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_join_states_correlation ON flow_join_states(correlation_key, correlation_value)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_join_states_flow_node ON flow_join_states(flow_id, node_id)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_join_states_expires ON flow_join_states(expires_at)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_poller_states_flow_node ON poller_states(flow_id, node_id)
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

    // Create auth_adapters table (for inbound/outbound authentication)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS auth_adapters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        direction TEXT NOT NULL,
        user_id TEXT,
        secret_id TEXT REFERENCES secrets_vault(id) ON DELETE SET NULL,
        config TEXT NOT NULL,
        activated INTEGER NOT NULL DEFAULT 0,
        last_tested_at TEXT,
        last_used_at TEXT,
        tags TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create token_cache table (for OAuth2, JWT, Cookie token lifecycle)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS token_cache (
        id TEXT PRIMARY KEY,
        adapter_id TEXT NOT NULL REFERENCES auth_adapters(id) ON DELETE CASCADE,
        token_type TEXT NOT NULL,
        scope TEXT,
        access_token TEXT,
        refresh_token TEXT,
        session_data TEXT,
        expires_at TEXT,
        last_used_at TEXT,
        issued_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        refresh_in_flight INTEGER NOT NULL DEFAULT 0,
        refresh_started_at TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create inbound_auth_policies table (for Express middleware)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS inbound_auth_policies (
        id TEXT PRIMARY KEY,
        route_pattern TEXT NOT NULL UNIQUE,
        http_method TEXT DEFAULT 'ALL',
        adapter_id TEXT REFERENCES auth_adapters(id) ON DELETE SET NULL,
        enforcement_mode TEXT NOT NULL DEFAULT 'required',
        multi_tenant INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create queue_backend_config table (for swappable queue backends)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS queue_backend_config (
        id TEXT PRIMARY KEY,
        backend TEXT NOT NULL,
        concurrency INTEGER NOT NULL DEFAULT 3,
        rabbit_url TEXT,
        rabbit_queue_name TEXT,
        rabbit_dlq_name TEXT,
        rabbit_max_retries INTEGER,
        kafka_brokers TEXT,
        kafka_topic TEXT,
        kafka_group_id TEXT,
        kafka_dlq_topic TEXT,
        kafka_max_retries INTEGER,
        last_change_at TEXT,
        change_pending INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create system_instance_test_files table (for E2E testing and emulation)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS system_instance_test_files (
        id TEXT PRIMARY KEY,
        system_instance_id TEXT NOT NULL REFERENCES system_instances(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        media_type TEXT NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        file_size INTEGER NOT NULL,
        uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      )
    `);

    // Create system_instance_auth table (per-system auth configs)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS system_instance_auth (
        id TEXT PRIMARY KEY,
        system_instance_id TEXT NOT NULL REFERENCES system_instances(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        adapter_type TEXT NOT NULL,
        direction TEXT NOT NULL,
        secret_ref TEXT REFERENCES secrets_vault(id) ON DELETE SET NULL,
        config TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_tested_at TEXT,
        last_used_at TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(system_instance_id, name)
      )
    `);

    // Migration: Add system_instance_id column to flow_definitions if it doesn't exist
    try {
      sqlite.exec(`
        ALTER TABLE flow_definitions ADD COLUMN system_instance_id TEXT REFERENCES system_instances(id) ON DELETE SET NULL
      `);
      console.log("[Database] Added system_instance_id column to flow_definitions");
    } catch (e: any) {
      // Column already exists, which is fine
      if (!e.message?.includes("duplicate column name")) {
        throw e;
      }
    }

    // Create indices for hierarchy tables
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_tenants_account_id ON tenants(account_id)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_ecosystems_tenant_id ON ecosystems(tenant_id)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_ecosystems_type ON ecosystems(type)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_environments_ecosystem_id ON environments(ecosystem_id)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_environments_name ON environments(name)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_system_instances_environment_id ON system_instances(environment_id)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_flow_definitions_system_instance_id ON flow_definitions(system_instance_id)
    `);

    // Create indices for auth tables
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_auth_adapters_type ON auth_adapters(type)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_auth_adapters_direction ON auth_adapters(direction)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_token_cache_adapter_id ON token_cache(adapter_id)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_token_cache_expires_at ON token_cache(expires_at)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_inbound_auth_policies_route_pattern ON inbound_auth_policies(route_pattern)
    `);

    // Create indices for test files table
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_system_instance_test_files_system_instance_id ON system_instance_test_files(system_instance_id)
    `);

    // Create indices for system instance auth table
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_system_instance_auth_system_instance_id ON system_instance_auth(system_instance_id)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_system_instance_auth_direction ON system_instance_auth(system_instance_id, direction)
    `);

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_system_instance_auth_enabled ON system_instance_auth(system_instance_id, enabled)
    `);

    console.log("[Database] Tables initialized successfully");
  } catch (error) {
    console.error("[Database] Error creating tables:", error);
    throw error;
  }
}

/**
 * Seed default hierarchy data on first run
 * Creates: Account → Tenant → Ecosystem → Environment → System Instance
 */
export async function seedDefaultHierarchy() {
  if (!sqlite) {
    console.log("[Database] Skipping seed data (not using SQLite)");
    return;
  }

  try {
    // Check if default account already exists
    const existingAccount = sqlite.prepare("SELECT id FROM accounts WHERE id = ?").get("default");
    
    if (existingAccount) {
      console.log("[Database] Default hierarchy already exists, skipping seed");
      return;
    }

    const now = new Date().toISOString();

    // 1. Create default account
    sqlite.prepare(`
      INSERT INTO accounts (id, name, license_tier, max_tenants, max_ecosystems, max_instances, enabled, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "default",
      "Default Account",
      "free",
      1,
      5,
      10,
      1,
      JSON.stringify({}),
      now,
      now
    );

    // 2. Create default tenant
    sqlite.prepare(`
      INSERT INTO tenants (id, account_id, name, display_name, enabled, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "default-tenant",
      "default",
      "default-tenant",
      "Default Tenant",
      1,
      JSON.stringify({}),
      now,
      now
    );

    // 3. Create general ecosystem
    sqlite.prepare(`
      INSERT INTO ecosystems (id, tenant_id, name, display_name, description, type, enabled, tags, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "general",
      "default-tenant",
      "general",
      "General",
      "Default ecosystem for all integrations",
      "custom",
      1,
      JSON.stringify([]),
      JSON.stringify({}),
      now,
      now
    );

    // 4. Create DEV environment
    sqlite.prepare(`
      INSERT INTO environments (id, ecosystem_id, name, display_name, description, enabled, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "dev",
      "general",
      "dev",
      "Development",
      "Development environment for testing and iteration",
      1,
      JSON.stringify({}),
      now,
      now
    );

    // 5. Create default system instance
    sqlite.prepare(`
      INSERT INTO system_instances (id, environment_id, name, display_name, description, endpoint, enabled, tags, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "default-dev",
      "dev",
      "default-dev",
      "DEV Instance",
      "Default development system instance",
      null,
      1,
      JSON.stringify([]),
      JSON.stringify({}),
      now,
      now
    );

    console.log("[Database] Default hierarchy seeded successfully: Account → Tenant → Ecosystem(general) → Environment(dev) → SystemInstance(default-dev)");
  } catch (error) {
    console.error("[Database] Error seeding default hierarchy:", error);
    throw error;
  }
}
