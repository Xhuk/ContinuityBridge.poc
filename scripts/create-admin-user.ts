import { neon } from "@neondatabase/serverless";
import { randomUUID } from "crypto";

/**
 * Create superadmin user in Neon PostgreSQL database
 * Run with: npx tsx scripts/create-admin-user.ts
 */

async function createAdminUser() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not set. Please configure Neon connection string.");
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  // User details
  const email = process.env.ADMIN_EMAIL || "admin@continuitybridge.local";
  const userId = randomUUID();
  const apiKey = `cbk_${randomUUID().replace(/-/g, "")}`;

  console.log("\n🚀 Creating superadmin user in Neon database...\n");
  console.log(`📧 Email: ${email}`);
  console.log(`🔑 API Key: ${apiKey}`);
  console.log(`🆔 User ID: ${userId}\n`);

  try {
    // Check if user already exists
    const existingUser = await sql`
      SELECT id, email FROM users WHERE email = ${email}
    `;

    if (existingUser.length > 0) {
      console.log(`⚠️  User already exists: ${email}`);
      console.log(`🔑 Existing API Key: Retrieve from database or reset password\n`);
      
      // Update to ensure enabled
      await sql`
        UPDATE users 
        SET enabled = true, 
            email_confirmed = true,
            updated_at = NOW()
        WHERE email = ${email}
      `;
      console.log(`✅ User re-enabled and confirmed\n`);
      return;
    }

    // Create superadmin user
    await sql`
      INSERT INTO users (
        id,
        email,
        password_hash,
        role,
        api_key,
        organization_id,
        organization_name,
        enabled,
        email_confirmed,
        confirmation_token,
        confirmation_token_expires,
        last_login_at,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        ${userId},
        ${email},
        NULL,
        'superadmin',
        ${apiKey},
        NULL,
        NULL,
        true,
        true,
        NULL,
        NULL,
        NULL,
        '{"createdBy": "setup-script", "environment": "prod"}',
        NOW(),
        NOW()
      )
    `;

    console.log("✅ Superadmin user created successfully!\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 LOGIN CREDENTIALS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`\n📧 Email:   ${email}`);
    console.log(`🔑 API Key: ${apiKey}`);
    console.log(`\n🌐 Login URL: https://networkvoid.xyz/sys/auth/bridge`);
    console.log(`\n💡 Use magic link authentication (passwordless)`);
    console.log(`\n⚠️  SAVE THIS API KEY - You won't see it again!\n`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  } catch (error: any) {
    console.error("❌ Failed to create admin user:", error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  }
}

createAdminUser();
