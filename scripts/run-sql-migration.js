import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    
    // Read the SQL migration file
    const migrationSQL = readFileSync(
      join(__dirname, 'add-confirmation-columns.sql'),
      'utf-8'
    );
    
    // Execute the migration
    await pool.query(migrationSQL);
    
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
