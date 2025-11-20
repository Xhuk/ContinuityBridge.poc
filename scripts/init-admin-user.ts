import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";
import { randomUUID } from "crypto";
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createAdminUser() {
  try {
    const adminEmail = "admin@continuitybridge.local";
    const apiKey = `cb_prod_${randomUUID().replace(/-/g, "")}`;
    const userId = randomUUID();
    const now = new Date().toISOString();

    console.log("🔧 Creating default admin user...");

    // Check if user already exists
    const existingUsers: any = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [adminEmail]
    );

    if (existingUsers.rows.length > 0) {
      console.log(`✅ Admin user already exists: ${adminEmail}`);
      console.log(`🔑 API Key: [REDACTED - Query database securely]`);
      return;
    }

    // Insert admin user
    await pool.query(
      `
        INSERT INTO users (
          id, email, password_hash, role, api_key,
          organization_id, organization_name,
          assigned_customers, max_customers,
          enabled, email_confirmed,
          confirmation_token, confirmation_token_expires,
          last_login_at, metadata,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7,
          $8, $9,
          $10, $11,
          $12, $13,
          $14, $15,
          $16, $17
        )
      `,
      [
        userId,
        adminEmail,
        null, // password_hash - magic link only
        "superadmin",
        apiKey,
        "continuitybridge",
        "ContinuityBridge",
        null, // assigned_customers
        null, // max_customers
        true, // enabled
        true, // email_confirmed
        null, // confirmation_token
        null, // confirmation_token_expires
        null, // last_login_at
        JSON.stringify({ initialSetup: true, environment: "prod" }),
        now,
        now,
      ]
    );

    console.log("✅ Admin user created successfully!");
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔑 API Key: [REDACTED - Stored in database]`);
    console.log(`   ⚠️  For security: Query database securely when needed`);
    console.log(`🎭 Role: superadmin`);
    console.log(`\n💡 Use /onboarding page to generate magic link for login`);
  } catch (error: any) {
    console.error("❌ Error creating admin user:", error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

createAdminUser().catch((error) => {
  console.error(error);
  process.exit(1);
});
