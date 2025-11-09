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

    console.log("[Database] Tables initialized successfully");
  } catch (error) {
    console.error("[Database] Error creating tables:", error);
    throw error;
  }
}
