import pg from 'pg';

const { Pool } = pg;

// Embed SQL migration directly to avoid file path issues in production builds
const MIGRATION_SQL = `
-- Step 1: Add columns if they don't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS confirmation_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS confirmation_token_expires TIMESTAMP;

-- Step 2: Drop the unique constraint if it exists (to avoid conflict)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_confirmation_token_unique;

-- Step 3: Re-add unique constraint (this won't prompt for truncation)
ALTER TABLE users ADD CONSTRAINT users_confirmation_token_unique UNIQUE (confirmation_token);

-- Step 4: Mark existing users as confirmed (one-time data migration)
UPDATE users 
SET email_confirmed = true 
WHERE email_confirmed IS NULL OR email_confirmed = false;
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
    
    // Don't fail the deployment if columns already exist
    if (error.message.includes('already exists')) {
      console.log('[Migration] ℹ️  Columns already exist, continuing...');
      process.exit(0);
    }
    
    process.exit(1);
  }
}

runMigration();
