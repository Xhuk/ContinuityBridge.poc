import { Router } from "express";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { db, users } from "../../db.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);
const router = Router();

/**
 * Customer database registry
 * Tracks each customer's dedicated database
 */
interface CustomerDatabase {
  id: string;
  organizationId: string;
  organizationName: string;
  databaseName: string;
  databaseUrl: string;
  status: "pending" | "provisioning" | "active" | "failed";
  createdAt: string;
  createdBy: string;
  schemaVersion: string;
  lastMigration?: string;
}

// In-memory registry (should be persisted to main database)
const customerDatabases: Map<string, CustomerDatabase> = new Map();

/**
 * GET /api/customer-databases
 * List all customer databases
 * 🔒 Superadmin only
 */
router.get("/", authenticateUser, async (req, res) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const databases = Array.from(customerDatabases.values());

    res.json({
      databases,
      total: databases.length,
      active: databases.filter(d => d.status === "active").length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/customer-databases/provision
 * Provision a new database for a customer
 * 🔒 Superadmin only
 */
router.post("/provision", authenticateUser, async (req, res) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const { organizationId, organizationName, applySchema, applyData } = req.body;

    if (!organizationId || !organizationName) {
      return res.status(400).json({ 
        error: "organizationId and organizationName are required" 
      });
    }

    // Check if database already exists for this org
    const existing = Array.from(customerDatabases.values()).find(
      db => db.organizationId === organizationId
    );

    if (existing) {
      return res.status(400).json({ 
        error: `Database already exists for ${organizationName}`,
        database: existing,
      });
    }

    // Generate database name (sanitized)
    const dbName = `cb_${organizationId.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    
    // Get PostgreSQL connection details from main database
    const mainDbUrl = process.env.DATABASE_URL;
    if (!mainDbUrl || !mainDbUrl.startsWith('postgresql://')) {
      return res.status(500).json({ 
        error: "PostgreSQL DATABASE_URL not configured" 
      });
    }

    // Parse main database URL to get host/port
    const dbUrlObj = new URL(mainDbUrl);
    const adminUser = dbUrlObj.username;
    const adminPassword = dbUrlObj.password;
    const dbHost = dbUrlObj.hostname;
    const dbPort = dbUrlObj.port || '5432';

    console.log(`🗄️  Provisioning database for ${organizationName}...`);

    // Create database record
    const customerDb: CustomerDatabase = {
      id: randomUUID(),
      organizationId,
      organizationName,
      databaseName: dbName,
      databaseUrl: `postgresql://${adminUser}:${adminPassword}@${dbHost}:${dbPort}/${dbName}`,
      status: "provisioning",
      createdAt: new Date().toISOString(),
      createdBy: req.user?.email || "unknown",
      schemaVersion: "initial",
    };

    customerDatabases.set(customerDb.id, customerDb);

    // Start async provisioning
    provisionDatabaseAsync(customerDb, applySchema, applyData)
      .then(() => {
        console.log(`✅ Database provisioned: ${dbName}`);
      })
      .catch(error => {
        console.error(`❌ Provisioning failed: ${dbName}`, error);
        customerDb.status = "failed";
      });

    res.json({
      success: true,
      database: customerDb,
      message: `Database provisioning started for ${organizationName}`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/customer-databases/:id/apply-migration
 * Apply migration script to customer database
 * 🔒 Superadmin only
 */
router.post("/:id/apply-migration", authenticateUser, async (req, res) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const { id } = req.params;
    const { migrationScript, dryRun } = req.body;

    const customerDb = customerDatabases.get(id);
    if (!customerDb) {
      return res.status(404).json({ error: "Customer database not found" });
    }

    if (customerDb.status !== "active") {
      return res.status(400).json({ 
        error: `Database is ${customerDb.status}, must be active to apply migrations` 
      });
    }

    let executionLog = "";

    if (dryRun) {
      executionLog = `DRY RUN - Migration for ${customerDb.organizationName}\n`;
      executionLog += `Database: ${customerDb.databaseName}\n`;
      executionLog += `Script size: ${migrationScript?.length || 0} bytes\n`;
      executionLog += "\nNo changes made.\n";
    } else {
      executionLog = `APPLYING MIGRATION\n`;
      executionLog += `Customer: ${customerDb.organizationName}\n`;
      executionLog += `Database: ${customerDb.databaseName}\n`;
      executionLog += `Started: ${new Date().toISOString()}\n\n`;

      try {
        // Save script to temp file
        const tempScript = path.join(process.cwd(), `temp-migration-${id}.sql`);
        await fs.writeFile(tempScript, migrationScript);

        // Execute on customer database
        const { stdout, stderr } = await execAsync(
          `psql "${customerDb.databaseUrl}" -f ${tempScript}`,
          { maxBuffer: 1024 * 1024 * 10 }
        );

        executionLog += "STDOUT:\n" + stdout + "\n";
        if (stderr) {
          executionLog += "STDERR:\n" + stderr + "\n";
        }

        // Clean up
        await fs.unlink(tempScript);

        customerDb.lastMigration = new Date().toISOString();
        executionLog += "\n✅ Migration completed successfully\n";
      } catch (error: any) {
        executionLog += "\n❌ Migration failed\n";
        executionLog += error.message + "\n";
        if (error.stdout) executionLog += "STDOUT: " + error.stdout + "\n";
        if (error.stderr) executionLog += "STDERR: " + error.stderr + "\n";
      }

      executionLog += `Completed: ${new Date().toISOString()}\n`;
    }

    res.json({
      success: true,
      database: customerDb,
      executionLog,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/customer-databases/apply-to-all
 * Apply migration to all customer databases
 * 🔒 Superadmin only - USE WITH EXTREME CAUTION
 */
router.post("/apply-to-all", authenticateUser, async (req, res) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const { migrationScript, dryRun } = req.body;

    const activeDatabases = Array.from(customerDatabases.values()).filter(
      db => db.status === "active"
    );

    if (activeDatabases.length === 0) {
      return res.status(400).json({ error: "No active customer databases found" });
    }

    const results: any[] = [];

    for (const customerDb of activeDatabases) {
      let executionLog = "";

      if (dryRun) {
        executionLog = `DRY RUN - ${customerDb.organizationName}\n`;
      } else {
        executionLog = `APPLYING MIGRATION - ${customerDb.organizationName}\n`;

        try {
          const tempScript = path.join(process.cwd(), `temp-migration-${customerDb.id}.sql`);
          await fs.writeFile(tempScript, migrationScript);

          const { stdout, stderr } = await execAsync(
            `psql "${customerDb.databaseUrl}" -f ${tempScript}`,
            { maxBuffer: 1024 * 1024 * 10 }
          );

          executionLog += stdout + "\n";
          if (stderr) executionLog += stderr + "\n";

          await fs.unlink(tempScript);

          customerDb.lastMigration = new Date().toISOString();
          executionLog += "✅ Success\n";

          results.push({
            organizationName: customerDb.organizationName,
            databaseName: customerDb.databaseName,
            status: "success",
            log: executionLog,
          });
        } catch (error: any) {
          executionLog += "❌ Failed: " + error.message + "\n";
          
          results.push({
            organizationName: customerDb.organizationName,
            databaseName: customerDb.databaseName,
            status: "failed",
            log: executionLog,
            error: error.message,
          });
        }
      }
    }

    res.json({
      success: true,
      totalDatabases: activeDatabases.length,
      results,
      dryRun,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/customer-databases/:id
 * Drop customer database (DANGEROUS)
 * 🔒 Superadmin only
 */
router.delete("/:id", authenticateUser, async (req, res) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const { id } = req.params;
    const { confirmDrop } = req.body;

    if (!confirmDrop) {
      return res.status(400).json({ 
        error: "Must set confirmDrop=true to proceed" 
      });
    }

    const customerDb = customerDatabases.get(id);
    if (!customerDb) {
      return res.status(404).json({ error: "Customer database not found" });
    }

    console.log(`🗑️  Dropping database: ${customerDb.databaseName}`);

    try {
      // Get admin connection URL (connect to 'postgres' database)
      const mainDbUrl = new URL(process.env.DATABASE_URL || "");
      mainDbUrl.pathname = "/postgres";

      // Drop database
      await execAsync(
        `psql "${mainDbUrl.toString()}" -c "DROP DATABASE IF EXISTS ${customerDb.databaseName};"`
      );

      customerDatabases.delete(id);

      res.json({
        success: true,
        message: `Database ${customerDb.databaseName} dropped successfully`,
      });
    } catch (error: any) {
      res.status(500).json({ 
        error: `Failed to drop database: ${error.message}` 
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Helper: Provision database asynchronously
 */
async function provisionDatabaseAsync(
  customerDb: CustomerDatabase,
  applySchema: boolean,
  applyData: boolean
): Promise<void> {
  try {
    // Get admin connection URL
    const mainDbUrl = new URL(process.env.DATABASE_URL || "");
    mainDbUrl.pathname = "/postgres";

    // Create database
    console.log(`Creating database: ${customerDb.databaseName}`);
    await execAsync(
      `psql "${mainDbUrl.toString()}" -c "CREATE DATABASE ${customerDb.databaseName};"`
    );

    // Apply schema if requested
    if (applySchema) {
      console.log(`Applying schema to ${customerDb.databaseName}...`);
      
      // Generate schema using drizzle-kit
      const dbType = process.env.DB_TYPE || "postgres";
      const schemaPath = dbType === "postgres" ? "schema.pg.ts" : "schema.ts";
      const tempMigrationDir = path.join(process.cwd(), "temp-migrations", customerDb.id);
      
      await fs.mkdir(tempMigrationDir, { recursive: true });

      try {
        // Generate schema SQL
        await execAsync(
          `npx drizzle-kit generate --schema=server/${schemaPath} --out=${tempMigrationDir}`
        );

        // Find generated SQL file
        const files = await fs.readdir(tempMigrationDir);
        const sqlFile = files.find(f => f.endsWith('.sql'));

        if (sqlFile) {
          const schemaSQL = await fs.readFile(
            path.join(tempMigrationDir, sqlFile),
            'utf-8'
          );

          // Apply schema
          const tempScript = path.join(tempMigrationDir, 'schema.sql');
          await fs.writeFile(tempScript, schemaSQL);

          await execAsync(
            `psql "${customerDb.databaseUrl}" -f ${tempScript}`
          );

          console.log(`✅ Schema applied to ${customerDb.databaseName}`);
        }

        // Clean up temp directory
        await fs.rm(tempMigrationDir, { recursive: true, force: true });
      } catch (error) {
        console.error(`Schema generation failed:`, error);
        // Clean up on error
        await fs.rm(tempMigrationDir, { recursive: true, force: true });
      }
    }

    // Apply initial data if requested
    if (applyData) {
      console.log(`Applying initial data to ${customerDb.databaseName}...`);
      
      // Create initial superadmin user for this customer
      const initialData = `
-- Initial data for ${customerDb.organizationName}

-- Create customer admin user
INSERT INTO users (
  id, email, role, organization_id, organization_name,
  enabled, created_at, updated_at
) VALUES (
  '${randomUUID()}',
  'admin@${customerDb.organizationId}',
  'customer_admin',
  '${customerDb.organizationId}',
  '${customerDb.organizationName}',
  true,
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- Create default WAF configuration
INSERT INTO waf_config (
  id, organization_id, enabled, block_bots, block_suspicious,
  rate_limit_enabled, rate_limit_window_ms, rate_limit_max_requests, rate_limit_block_duration_ms,
  whitelist, created_at, updated_at
) VALUES (
  '${randomUUID()}',
  '${customerDb.organizationId}',
  true,
  true,
  true,
  true,
  60000,
  30,
  300000,
  '[]'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (organization_id) DO NOTHING;
      `;

      const tempDataScript = path.join(process.cwd(), `temp-data-${customerDb.id}.sql`);
      await fs.writeFile(tempDataScript, initialData);

      await execAsync(
        `psql "${customerDb.databaseUrl}" -f ${tempDataScript}`
      );

      await fs.unlink(tempDataScript);

      console.log(`✅ Initial data applied to ${customerDb.databaseName}`);
    }

    // Mark as active
    customerDb.status = "active";
    customerDb.schemaVersion = "1.0.0";

  } catch (error: any) {
    console.error(`Provisioning failed for ${customerDb.databaseName}:`, error);
    customerDb.status = "failed";
    throw error;
  }
}

export default router;
