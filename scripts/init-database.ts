import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../server/schema.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialize SQLite database with schema
 */

async function initDatabase() {
  try {
    const dbDir = path.join(__dirname, "..", "data");
    const dbPath = path.join(dbDir, "continuity.db");
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`\u2705 Created data directory: ${dbDir}`);
    }
    
    console.log(`\n\ud83d\udcc2 Database path: ${dbPath}`);
    
    // Check if database already exists
    const dbExists = fs.existsSync(dbPath);
    
    if (dbExists) {
      console.log(`\u2705 Database already exists`);
    } else {
      console.log(`\u2728 Creating new database...`);
    }
    
    // Open database connection
    const sqliteClient = new Database(dbPath);
    const db = drizzle(sqliteClient, { schema });
    
    // Create all tables from schema
    console.log(`\ud83d\udd27 Creating database schema...`);
    
    // Execute schema creation SQL
    const createTablesSQL = `
      -- Create users table
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'customer_user',
        api_key TEXT UNIQUE,
        organization_id TEXT,
        organization_name TEXT,
        assigned_customers TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);
      CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
    `;
    
    sqliteClient.exec(createTablesSQL);
    
    console.log(`\u2705 Database schema created successfully!`);
    console.log(`\n\ud83d\ude80 Database ready for use at: ${dbPath}\n`);
    
    sqliteClient.close();
    
  } catch (error: any) {
    console.error(`\n\u274c Error initializing database:`, error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run initialization
initDatabase()
  .then(() => {
    console.log(`\ud83c\udf89 Database initialization complete!\n`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n\ud83d\udca5 Database initialization failed:`, error);
    process.exit(1);
  });
