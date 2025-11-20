import pg from 'pg';

const { Pool } = pg;

// Embed SQL migration directly to avoid file path issues in production builds
const MIGRATION_SQL = `
-- Core Application Tables (Forge Database Schema)

-- Hierarchy tables
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  license_tier TEXT NOT NULL DEFAULT 'free',
  max_tenants INTEGER NOT NULL DEFAULT 1,
  max_ecosystems INTEGER NOT NULL DEFAULT 5,
  max_instances INTEGER NOT NULL DEFAULT 10,
  enabled BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ecosystems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  tags JSONB,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ecosystem_id UUID NOT NULL REFERENCES ecosystems(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  endpoint TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  tags JSONB,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Flow tables
CREATE TABLE IF NOT EXISTS flow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  system_instance_id UUID REFERENCES system_instances(id) ON DELETE SET NULL,
  nodes JSONB NOT NULL,
  edges JSONB NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  enabled BOOLEAN NOT NULL DEFAULT true,
  tags JSONB,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
  flow_name TEXT NOT NULL,
  flow_version TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  input_data JSONB,
  output_data JSONB,
  triggered_by TEXT NOT NULL,
  executed_nodes JSONB,
  node_executions JSONB,
  error TEXT,
  error_node TEXT
);

CREATE TABLE IF NOT EXISTS flow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN ('dev', 'staging', 'prod')),
  version TEXT NOT NULL,
  definition JSONB NOT NULL,
  change_description TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK(change_type IN ('major', 'minor', 'patch')),
  status TEXT NOT NULL CHECK(status IN ('draft', 'pending_approval', 'approved', 'deployed', 'deprecated')),
  deployed_at TIMESTAMP,
  is_immutable BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  approved_by TEXT,
  approved_by_email TEXT,
  approved_at TIMESTAMP,
  previous_version_id UUID REFERENCES flow_versions(id),
  rollback_available BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(flow_id, organization_id, environment, version)
);

CREATE TABLE IF NOT EXISTS webhook_registrations (
  slug TEXT NOT NULL,
  flow_id UUID NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
  organization_id TEXT,
  method TEXT NOT NULL CHECK(method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  registered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_triggered_at TIMESTAMP,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (slug, organization_id)
);

-- Interface tables
CREATE TABLE IF NOT EXISTS interfaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  direction TEXT NOT NULL,
  protocol TEXT NOT NULL,
  endpoint TEXT,
  auth_type TEXT,
  http_config JSONB,
  oauth2_config JSONB,
  formats JSONB,
  default_format TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  tags JSONB,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  source_interface_id UUID REFERENCES interfaces(id),
  target_interface_id UUID REFERENCES interfaces(id),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB,
  transformed_payload JSONB,
  latency_ms INTEGER,
  error TEXT,
  metadata JSONB
);

-- Supporting tables
CREATE TABLE IF NOT EXISTS data_source_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  identifier TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL,
  format TEXT NOT NULL,
  sample_data JSONB,
  schema JSONB NOT NULL,
  system_instance_id UUID REFERENCES system_instances(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  tags JSONB,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flow_join_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  correlation_key TEXT NOT NULL,
  correlation_value TEXT NOT NULL,
  stream_a_payload JSONB,
  stream_b_payload JSONB,
  stream_a_name TEXT,
  stream_b_name TEXT,
  join_strategy TEXT DEFAULT 'inner',
  status TEXT NOT NULL,
  timeout_minutes INTEGER NOT NULL DEFAULT 1440,
  expires_at TIMESTAMP NOT NULL,
  matched_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poller_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flow_definitions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  poller_type TEXT NOT NULL,
  last_file TEXT,
  last_processed_at TIMESTAMP,
  file_checksums JSONB,
  config_snapshot JSONB,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_error TEXT,
  last_error_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Logging tables (for web portal access)
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL CHECK(level IN ('debug', 'info', 'warn', 'error')),
  scope TEXT NOT NULL CHECK(scope IN ('superadmin', 'customer')) DEFAULT 'superadmin',
  service TEXT NOT NULL,
  component TEXT,
  message TEXT NOT NULL,
  metadata JSONB,
  flow_id TEXT,
  flow_name TEXT,
  run_id TEXT,
  trace_id TEXT,
  user_id TEXT,
  organization_id TEXT,
  error_stack TEXT,
  error_code TEXT,
  request_id TEXT,
  http_method TEXT,
  http_path TEXT,
  http_status INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS log_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK(scope IN ('superadmin', 'customer')) DEFAULT 'customer',
  organization_id TEXT,
  min_level TEXT NOT NULL CHECK(min_level IN ('debug', 'info', 'warn', 'error')) DEFAULT 'info',
  retention_days INTEGER NOT NULL DEFAULT 30,
  max_log_size_mb INTEGER NOT NULL DEFAULT 100,
  file_logging_enabled BOOLEAN NOT NULL DEFAULT true,
  file_rotation_days INTEGER NOT NULL DEFAULT 7,
  db_logging_enabled BOOLEAN NOT NULL DEFAULT true,
  log_flow_executions BOOLEAN NOT NULL DEFAULT true,
  log_api_requests BOOLEAN NOT NULL DEFAULT true,
  log_auth_events BOOLEAN NOT NULL DEFAULT true,
  log_errors BOOLEAN NOT NULL DEFAULT true,
  alert_on_error BOOLEAN NOT NULL DEFAULT false,
  alert_email TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_flow_definitions_system_instance_id ON flow_definitions(system_instance_id);
CREATE INDEX IF NOT EXISTS idx_flow_runs_flow_id ON flow_runs(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_runs_trace_id ON flow_runs(trace_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_trace_id ON integration_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_timestamp ON integration_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_flow_versions_flow_id ON flow_versions(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_versions_organization_id ON flow_versions(organization_id);
CREATE INDEX IF NOT EXISTS idx_flow_versions_environment ON flow_versions(environment);
CREATE INDEX IF NOT EXISTS idx_webhook_registrations_flow_id ON webhook_registrations(flow_id);
CREATE INDEX IF NOT EXISTS idx_webhook_registrations_organization_id ON webhook_registrations(organization_id);

-- Logging table indices
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_scope ON system_logs(scope);
CREATE INDEX IF NOT EXISTS idx_system_logs_service ON system_logs(service);
CREATE INDEX IF NOT EXISTS idx_system_logs_organization_id ON system_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_trace_id ON system_logs(trace_id);

-- Email confirmation columns (if they don't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='email_confirmed') THEN
    ALTER TABLE users ADD COLUMN email_confirmed BOOLEAN NOT NULL DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='confirmation_token') THEN
    ALTER TABLE users ADD COLUMN confirmation_token TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='confirmation_token_expires') THEN
    ALTER TABLE users ADD COLUMN confirmation_token_expires TIMESTAMP;
  END IF;
END $$;

-- Unique constraint for confirmation tokens
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_confirmation_token_unique;
ALTER TABLE users ADD CONSTRAINT users_confirmation_token_unique UNIQUE (confirmation_token);

-- Mark existing users as confirmed
UPDATE users 
SET email_confirmed = true 
WHERE email_confirmed = false;
`;

/**
 * Run SQL migrations before Drizzle Kit push
 * This handles schema changes that need manual SQL (like adding columns to existing tables)
 */

async function runMigration() {
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    console.log('[Migration] ⏭️  Skipping SQL migration (DATABASE_URL not set)');
    process.exit(0);
  }

  // Skip if using SQLite
  if (DATABASE_URL.includes('sqlite') || DATABASE_URL.startsWith('file:')) {
    console.log('[Migration] ⏭️  Skipping SQL migration (SQLite detected)');
    process.exit(0);
  }

  try {
    console.log('[Migration] 🔧 Running PostgreSQL migrations...');
    
    const pool = new Pool({ connectionString: DATABASE_URL });
    
    console.log('[Migration] 📄 Executing embedded SQL migration...');
    
    // Execute the embedded migration
    await pool.query(MIGRATION_SQL);
    
    console.log('[Migration] ✅ SQL migrations completed successfully');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('[Migration] ❌ Migration failed:', error.message);
    
    // Don't fail the deployment if columns/constraints already exist
    if (error.message.includes('already exists') || 
        error.message.includes('cannot be implemented') ||
        error.message.includes('duplicate key')) {
      console.log('[Migration] ℹ️  Schema already exists (likely from Drizzle), continuing...');
      process.exit(0);
    }
    
    process.exit(1);
  }
}

runMigration();
