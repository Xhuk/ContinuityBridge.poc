import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";
import * as pgSchema from "./schema.pg.js";

const isProd = process.env.NODE_ENV === "production";

// PostgreSQL Connection Pool
let postgresPool: Pool | null = null;
let postgresDb: ReturnType<typeof drizzleNeon> | null = null;

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

// Initialize PostgreSQL connection
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error("[Database] ❌ DATABASE_URL must be set for PostgreSQL database");
  if (isProd) {
    process.exit(1);
  }
  throw new Error("DATABASE_URL must be set for PostgreSQL database");
}

// Create connection pool with production-grade settings
postgresPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX || "20", 10),
  min: parseInt(process.env.DB_POOL_MIN || "2", 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || "30000", 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || "10000", 10),
});

// Initialize Drizzle with PostgreSQL pool
postgresDb = drizzleNeon({ client: postgresPool });

console.log(`[Database] ✅ PostgreSQL pool created (Neon serverless)`);
console.log(`[Database] 📋 Using schema: public (default)`);
console.log(`[Database] 🔗 Connection pooling: ${process.env.DB_POOL_MAX || 20} max connections`);

export const db = postgresDb!;
export const databaseType = "postgres" as const;

// Export all PostgreSQL table definitions
export const {
  users,
  systemLogs,
  logConfigurations,
  magicLinks,
  smtpSettings,
  wafConfig,
  customerLicense,
  pricingCatalog,
  pricingChangeNotifications,
  qaTestSessions,
  qaTestResults,
  deploymentPackages,
  // Hierarchy tables
  accounts,
  tenants,
  ecosystems,
  environments,
  systemInstances,
  // Flow tables
  flowDefinitions,
  flowRuns,
  interfaces,
  integrationEvents,
} = pgSchema;
