import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";
import * as dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seedHierarchy() {
  try {
    const now = new Date().toISOString();

    console.log("🌱 Seeding default hierarchy...\n");

    // Check if default account exists
    const accountCheck: any = await pool.query("SELECT id FROM accounts WHERE id = 'default'");
    
    if (accountCheck.rows.length > 0) {
      console.log("✅ Default hierarchy already exists");
      return;
    }

    // 1. Create default account
    await pool.query(`
      INSERT INTO accounts (id, name, license_tier, max_tenants, max_ecosystems, max_instances, enabled, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, ["default", "Default Account", "free", 1, 5, 10, true, JSON.stringify({}), now, now]);
    console.log("✅ Created account: default");

    // 2. Create default tenant
    await pool.query(`
      INSERT INTO tenants (id, account_id, name, display_name, enabled, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, ["default-tenant", "default", "default-tenant", "Default Tenant", true, JSON.stringify({}), now, now]);
    console.log("✅ Created tenant: default-tenant");

    // 3. Create general ecosystem
    await pool.query(`
      INSERT INTO ecosystems (id, tenant_id, name, display_name, description, type, enabled, tags, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, ["general", "default-tenant", "general", "General", "Default ecosystem for all integrations", "custom", true, JSON.stringify([]), JSON.stringify({}), now, now]);
    console.log("✅ Created ecosystem: general");

    // 4. Create DEV environment
    await pool.query(`
      INSERT INTO environments (id, ecosystem_id, name, display_name, description, enabled, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, ["dev", "general", "dev", "Development", "Development environment for testing and iteration", true, JSON.stringify({}), now, now]);
    console.log("✅ Created environment: dev");

    // 5. Create PROD environment
    await pool.query(`
      INSERT INTO environments (id, ecosystem_id, name, display_name, description, enabled, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, ["prod", "general", "prod", "Production", "Production environment", true, JSON.stringify({}), now, now]);
    console.log("✅ Created environment: prod");

    // 6. Create default system instance
    await pool.query(`
      INSERT INTO system_instances (id, environment_id, name, display_name, description, endpoint, enabled, tags, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, ["default-system", "dev", "default-system", "Default System", "Default system instance", null, true, JSON.stringify([]), JSON.stringify({}), now, now]);
    console.log("✅ Created system instance: default-system");

    console.log("\n🎉 Default hierarchy seeded successfully!");

  } catch (error: any) {
    console.error("❌ Error seeding hierarchy:", error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

seedHierarchy().catch((error) => {
  console.error(error);
  process.exit(1);
});
