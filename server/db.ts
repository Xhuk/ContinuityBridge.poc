import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import Database from 'better-sqlite3';
import ws from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine database type from environment
const dbType = process.env.DB_TYPE || "sqlite"; // Default to SQLite for portability
const isProd = process.env.NODE_ENV === "production";

// Conditionally import the correct schema
let schema: any;
if (dbType === "postgres") {
  schema = await import("./schema.pg.js");
} else {
  schema = await import("./schema.js");
}

// SQLite setup (portable, offline-capable)
let sqliteDb: ReturnType<typeof drizzleSqlite> | null = null;
let postgresDb: ReturnType<typeof drizzleNeon> | null = null;
let sqliteClient: Database.Database | null = null;
let postgresPool: Pool | null = null;

/**
 * Database Connection with Retry Logic
 * For production deployments with PostgreSQL
 */
async function connectWithRetry(maxRetries = 5, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (postgresPool) {
        // Test connection
        const client = await postgresPool.connect();
        client.release();
        console.log(`[Database] PostgreSQL connection successful (attempt ${attempt})`);
        return;
      }
    } catch (error: any) {
      console.error(`[Database] Connection attempt ${attempt}/${maxRetries} failed:`, error.message);
      
      if (attempt === maxRetries) {
        console.error("[Database] ❌ Max retries reached. Cannot connect to database.");
        if (isProd) {
          console.error("[Database] 💥 Exiting process in PRODUCTION mode.");
          process.exit(1);
        }
        throw error;
      }
      
      // Exponential backoff
      const delay = delayMs * Math.pow(1.5, attempt - 1);
      console.log(`[Database] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

if (dbType === "sqlite") {
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "..", "data", "continuity.db");
  
  try {
    sqliteClient = new Database(dbPath);
    sqliteDb = drizzleSqlite(sqliteClient, { schema });
    console.log(`[Database] ✅ Using SQLite: ${dbPath}`);
    
    // Enable WAL mode for better concurrency
    sqliteClient.pragma('journal_mode = WAL');
    sqliteClient.pragma('synchronous = NORMAL');
    
  } catch (error: any) {
    console.error("[Database] ❌ Failed to initialize SQLite:", error.message);
    if (isProd) {
      process.exit(1);
    }
    throw error;
  }
  
} else if (dbType === "postgres") {
  neonConfig.webSocketConstructor = ws;
  
  if (!process.env.DATABASE_URL) {
    console.error("[Database] ❌ DATABASE_URL must be set when using postgres database");
    if (isProd) {
      process.exit(1);
    }
    throw new Error("DATABASE_URL must be set when using postgres database");
  }
  
  // Create connection pool with production-grade settings
  postgresPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: parseInt(process.env.DB_POOL_MAX || "20", 10),
    min: parseInt(process.env.DB_POOL_MIN || "2", 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || "30000", 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || "10000", 10),
  });
  
  postgresDb = drizzleNeon({ client: postgresPool, schema });
  
  console.log(`[Database] ✅ PostgreSQL pool created (Neon serverless)`);
  console.log(`[Database] 📋 Using schema: public (default)`);
  console.log(`[Database] 🔗 Connection pooling: ${process.env.DB_POOL_MAX || 20} max connections`);
}

export const db = (sqliteDb || postgresDb)!;
export const databaseType = dbType as "sqlite" | "postgres";
export const sqlite = sqliteClient;
