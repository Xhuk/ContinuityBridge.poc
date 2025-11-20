import { neon } from "@neondatabase/serverless";
import { randomUUID } from "crypto";

/**
 * Complete Production Setup Script
 * 
 * This script performs all necessary setup tasks for production:
 * 1. Validates environment variables (DATABASE_URL, RESEND_API_KEY)
 * 2. Tests database connection
 * 3. Creates superadmin user if needed
 * 4. Provides clear next steps
 * 
 * Run with: npx tsx scripts/complete-production-setup.ts
 */

async function completeSetup() {
  console.log("\n🚀 ContinuityBridge Production Setup\n");
  console.log("═".repeat(60));

  // Step 1: Validate environment variables
  console.log("\n📋 Step 1: Environment Variables Check");
  console.log("─".repeat(60));

  const requiredEnvVars = {
    DATABASE_URL: process.env.DATABASE_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    APP_URL: process.env.APP_URL || process.env.APP_DOMAIN,
  };

  const optionalEnvVars = {
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    JWT_SECRET: process.env.JWT_SECRET,
    SMTP_ENCRYPTION_KEY: process.env.SMTP_ENCRYPTION_KEY,
  };

  let hasErrors = false;

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      console.log(`❌ ${key}: NOT SET (REQUIRED)`);
      hasErrors = true;
    } else {
      const displayValue = key.includes('KEY') || key.includes('SECRET') || key.includes('URL')
        ? `${value.substring(0, 20)}...`
        : value;
      console.log(`✅ ${key}: ${displayValue}`);
    }
  }

  for (const [key, value] of Object.entries(optionalEnvVars)) {
    if (!value) {
      console.log(`⚠️  ${key}: NOT SET (optional)`);
    } else {
      const displayValue = key.includes('KEY') || key.includes('SECRET')
        ? `${value.substring(0, 15)}...`
        : value;
      console.log(`✅ ${key}: ${displayValue}`);
    }
  }

  if (hasErrors) {
    console.log("\n❌ Missing required environment variables!");
    console.log("\n📖 Set these in Render Dashboard > Environment:");
    console.log("   1. DATABASE_URL      - Neon PostgreSQL connection string");
    console.log("   2. RESEND_API_KEY    - For sending magic link emails");
    console.log("   3. APP_URL           - https://networkvoid.xyz\n");
    process.exit(1);
  }

  // Step 2: Test database connection
  console.log("\n📊 Step 2: Database Connection Test");
  console.log("─".repeat(60));

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const result = await sql`SELECT current_database(), version()`;
    console.log(`✅ Connected to: ${result[0].current_database}`);
    console.log(`   PostgreSQL: ${result[0].version.split(',')[0]}`);
  } catch (error: any) {
    console.error(`❌ Database connection failed: ${error.message}`);
    process.exit(1);
  }

  // Step 3: Check for existing admin user
  console.log("\n👤 Step 3: Superadmin User Check");
  console.log("─".repeat(60));

  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    console.log("⚠️  ADMIN_EMAIL not provided");
    console.log("\n📖 To create a superadmin user, run:");
    console.log("   ADMIN_EMAIL=your-email@example.com npx tsx scripts/create-admin-user.ts\n");
    
    // Check if any users exist
    const userCount = await sql`SELECT COUNT(*) as count FROM users`;
    const count = parseInt(userCount[0].count);
    
    if (count === 0) {
      console.log("⚠️  No users found in database!");
      console.log("   You MUST create an admin user before using the system.\n");
    } else {
      console.log(`✅ ${count} user(s) exist in database`);
    }
  } else {
    // Check if admin user exists
    const existingUser = await sql`
      SELECT id, email, role, enabled, email_confirmed
      FROM users
      WHERE email = ${adminEmail}
    `;

    if (existingUser.length > 0) {
      const user = existingUser[0];
      console.log(`✅ User exists: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Enabled: ${user.enabled}`);
      console.log(`   Email Confirmed: ${user.email_confirmed}`);

      if (!user.enabled || !user.email_confirmed) {
        console.log("\n⚠️  User is not fully activated!");
        console.log("   Updating user status...");
        
        await sql`
          UPDATE users
          SET enabled = true,
              email_confirmed = true,
              updated_at = NOW()
          WHERE email = ${adminEmail}
        `;
        
        console.log("✅ User activated successfully");
      }
    } else {
      console.log(`⚠️  User not found: ${adminEmail}`);
      console.log("\n🔧 Creating superadmin user...");

      const userId = randomUUID();
      const apiKey = `cbk_${randomUUID().replace(/-/g, "")}`;

      await sql`
        INSERT INTO users (
          id, email, password_hash, role, api_key,
          organization_id, organization_name,
          enabled, email_confirmed,
          confirmation_token, confirmation_token_expires,
          metadata, created_at, updated_at
        ) VALUES (
          ${userId}, ${adminEmail}, NULL, 'superadmin', ${apiKey},
          NULL, NULL,
          true, true,
          NULL, NULL,
          '{"createdBy": "setup-script", "environment": "prod"}',
          NOW(), NOW()
        )
      `;

      console.log("✅ Superadmin user created!");
      console.log(`   Email: ${adminEmail}`);
      console.log(`   API Key: ${apiKey.substring(0, 12)}...${apiKey.substring(apiKey.length - 4)}`);
      console.log(`\n⚠️  IMPORTANT: Save this API key securely!`);
      
      // Store in env for retrieval
      process.env.OUTPUT_API_KEY = apiKey;
    }
  }

  // Step 4: Final summary and next steps
  console.log("\n✅ Setup Complete!");
  console.log("═".repeat(60));
  console.log("\n📋 Next Steps:\n");
  console.log("1. Test Login:");
  console.log(`   → Go to: ${process.env.APP_URL || 'https://networkvoid.xyz'}/sys/auth/bridge`);
  console.log(`   → Enter email: ${adminEmail || 'your-admin-email'}`);
  console.log("   → Click 'Send Magic Link'");
  console.log("   → Check your email for the login link\n");
  
  console.log("2. Verify Email Delivery:");
  console.log("   → Magic link emails sent via Resend");
  console.log("   → Check spam folder if not received");
  console.log(`   → Resend API Key: ${process.env.RESEND_API_KEY?.substring(0, 10)}...\n`);

  console.log("3. Monitor Logs:");
  console.log("   → Render Dashboard > Logs tab");
  console.log("   → Look for: [Auth] Magic link sent to...");
  console.log("   → Look for: [Auth] User exists in Neon DB: true\n");

  if (process.env.OUTPUT_API_KEY) {
    console.log("4. Retrieve API Key:");
    console.log(`   → Run: echo $OUTPUT_API_KEY`);
    console.log(`   → Full key stored in environment\n`);
  }

  console.log("═".repeat(60));
  console.log("🎉 Production system ready!\n");
}

completeSetup().catch((error) => {
  console.error("\n❌ Setup failed:", error.message);
  console.error("\nFull error:", error);
  process.exit(1);
});
