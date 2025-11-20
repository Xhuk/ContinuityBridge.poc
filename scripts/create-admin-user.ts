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

  // User details - MUST be provided via environment variable
  const email = process.env.ADMIN_EMAIL;
  
  if (!email) {
    console.error("❌ ADMIN_EMAIL environment variable is required.");
    console.error("\nUsage:");
    console.error("  ADMIN_EMAIL=your-email@example.com npx tsx scripts/create-admin-user.ts\n");
    process.exit(1);
  }

  const userId = randomUUID();
  const apiKey = `cbk_${randomUUID().replace(/-/g, "")}`;

  console.log("\n🚀 Creating superadmin user in Neon database...\n");
  console.log(`📧 Email: ${email}`);
  console.log(`🆔 User ID: ${userId}\n`);

  try {
    // Check if user already exists
    const existingUser = await sql`
      SELECT id, email FROM users WHERE email = ${email}
    `;

    if (existingUser.length > 0) {
      console.log(`⚠️  User already exists: ${email}`);
      console.log(`   To retrieve API key, query database or contact administrator\n`);
      
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
    console.log(`🔑 API Key: ${apiKey.substring(0, 12)}...${apiKey.substring(apiKey.length - 4)}`);
    console.log(`\n⚠️  IMPORTANT: Full API key saved to environment variable OUTPUT_API_KEY`);
    console.log(`   Run: echo $OUTPUT_API_KEY to retrieve it\n`);
    console.log(`🌐 Login URL: ${process.env.APP_URL || 'https://your-domain.com'}/sys/auth/bridge`);
    console.log(`\n💡 Use magic link authentication (passwordless)`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    // Store API key in process for retrieval (not logged)
    process.env.OUTPUT_API_KEY = apiKey;

  } catch (error: any) {
    console.error("❌ Failed to create admin user:", error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  }
}

createAdminUser();
