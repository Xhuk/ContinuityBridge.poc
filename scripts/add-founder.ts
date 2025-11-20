import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { users } from "../server/schema.js";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Add Founder (Superadmin)
 * Role: QA Manager
 * 
 * SECURITY: Email must be provided via environment variable
 * Usage: FOUNDER_EMAIL=email@example.com FOUNDER_NAME="Full Name" npm run add:founder
 */

const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL;
const FOUNDER_NAME = process.env.FOUNDER_NAME || "QA Manager";
const FOUNDER_ROLE_TITLE = process.env.FOUNDER_ROLE_TITLE || "QA Manager";

if (!FOUNDER_EMAIL) {
  console.error(`\n❌ ERROR: FOUNDER_EMAIL environment variable is required`);
  console.error(`   Usage: FOUNDER_EMAIL=email@example.com FOUNDER_NAME="Full Name" npm run add:founder\n`);
  process.exit(1);
}

async function addFounder() {
  // Type guard to ensure FOUNDER_EMAIL is defined
  if (!FOUNDER_EMAIL) {
    console.error(`\n❌ ERROR: FOUNDER_EMAIL environment variable is required`);
    console.error(`   Usage: FOUNDER_EMAIL=email@example.com FOUNDER_NAME="Full Name" npm run add:founder\n`);
    process.exit(1);
  }

  const founderEmail: string = FOUNDER_EMAIL;
  const founderName: string = FOUNDER_NAME || "QA Manager";
  const founderRoleTitle: string = FOUNDER_ROLE_TITLE || "QA Manager";

  let sqliteClient: Database.Database | null = null;
  
  try {
    // Initialize SQLite database
    const dbPath = path.join(__dirname, "..", "data", "continuity.db");
    console.log(`\n📂 Database path: ${dbPath}`);
    
    sqliteClient = new Database(dbPath);
    const db = drizzle(sqliteClient);
    
    console.log(`🔍 Checking if ${founderEmail} already exists...`);

    // Check if user already exists
    const existing = await db.select()
      .from(users)
      .where(eq(users.email, founderEmail))
      .get();

    if (existing) {
      console.log(`⚠️  User already exists!`);
      console.log(`   Email: ${existing.email}`);
      console.log(`   Role: ${existing.role}`);
      console.log(`   API Key: ${existing.apiKey?.substring(0, 15)}...`);
      console.log(`\n✅ No action needed - Founder is already in the system.\n`);
      return;
    }

    console.log(`✨ Creating new superadmin account for ${founderName}...`);

    // Generate API key
    const apiKey = `cb_${randomUUID().replace(/-/g, "")}`;

    // Create superadmin user
    await db.insert(users).values({
      id: randomUUID(),
      email: founderEmail,
      passwordHash: null, // No password - API key auth only
      role: "superadmin",
      apiKey,
      organizationId: null,
      organizationName: "ContinuityBridge Founders Team",
      enabled: true,
      metadata: {
        roleTitle: founderRoleTitle,
        team: "Founders",
        addedBy: "system-script",
        addedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    console.log(`\n✅ Founder added successfully!`);
    console.log(`\n📋 Account Details:`);
    console.log(`   Name: ${founderName}`);
    console.log(`   Email: ${founderEmail}`);
    console.log(`   Role: Superadmin (Founder)`);
    console.log(`   Title: ${founderRoleTitle}`);
    console.log(`   Team: Founders`);
    console.log(`\n🔑 API Key:`);
    console.log(`   [REDACTED - Stored securely in database]`);
    console.log(`   ⚠️  For security: Query database directly when needed`);
    console.log(`\n📧 Next Steps:`);
    console.log(`   1. Retrieve API key from database via secure admin tools`);
    console.log(`   2. Founder can authenticate using X-API-Key header`);
    console.log(`   3. Access all superadmin features (export, license, user mgmt)`);
    console.log(`\n`);
  } catch (error: any) {
    console.error(`\n❌ Error adding founder:`, error.message);
    console.error(error);
    process.exit(1);
  } finally {
    // Close database connection
    if (sqliteClient) {
      sqliteClient.close();
    }
  }
}

// Run the script
addFounder()
  .then(() => {
    console.log(`🎉 Script completed successfully!\n`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n💥 Script failed:`, error);
    process.exit(1);
  });
