import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import Database from 'better-sqlite3';
import ws from "ws";
import path from "path";
import { fileURLToPath } from "url";
import * as schema from "./schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine database type from environment
const dbType = process.env.DB_TYPE || "sqlite"; // Default to SQLite for portability

// SQLite setup (portable, offline-capable)
let sqliteDb: ReturnType<typeof drizzleSqlite> | null = null;
let postgresDb: ReturnType<typeof drizzleNeon> | null = null;
let sqliteClient: Database.Database | null = null;

if (dbType === "sqlite") {
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "..", "data", "continuity.db");
  sqliteClient = new Database(dbPath);
  sqliteDb = drizzleSqlite(sqliteClient, { schema });
  console.log(`[Database] Using SQLite: ${dbPath}`);
} else if (dbType === "postgres") {
  neonConfig.webSocketConstructor = ws;
  
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set when using postgres database");
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  postgresDb = drizzleNeon({ client: pool, schema });
  console.log("[Database] Using PostgreSQL (Neon)");
}

export const db = (sqliteDb || postgresDb)!;
export const databaseType = dbType as "sqlite" | "postgres";
export const sqlite = sqliteClient;
