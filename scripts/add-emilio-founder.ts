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
 * Add Emilio Navarro as Founder (Superadmin)
 * Role: QA Manager
 */

const EMILIO_EMAIL = "navarropadilla@gmail.com";
const EMILIO_NAME = "Emilio Navarro";
const EMILIO_ROLE_TITLE = "QA Manager";

async function addEmilioFounder() {
  let sqliteClient: Database.Database | null = null;
  
  try {
    // Initialize SQLite database
    const dbPath = path.join(__dirname, "..", "data", "continuity.db");
    console.log(`\n📂 Database path: ${dbPath}`);
    
    sqliteClient = new Database(dbPath);
    const db = drizzle(sqliteClient);
    
    console.log(`🔍 Checking if ${EMILIO_EMAIL} already exists...`);

    // Check if user already exists
    const existing = await db.select()
      .from(users)
      .where(eq(users.email, EMILIO_EMAIL))
      .get();

    if (existing) {
      console.log(`⚠️  User already exists!`);
      console.log(`   Email: ${existing.email}`);
      console.log(`   Role: ${existing.role}`);
      console.log(`   API Key: ${existing.apiKey?.substring(0, 15)}...`);
      console.log(`\n✅ No action needed - Emilio is already in the system.\n`);
      return;
    }

    console.log(`✨ Creating new superadmin account for ${EMILIO_NAME}...`);

    // Generate API key
    const apiKey = `cb_${randomUUID().replace(/-/g, "")}`;

    // Create superadmin user
    await db.insert(users).values({
      id: randomUUID(),
      email: EMILIO_EMAIL,
      passwordHash: null, // No password - API key auth only
      role: "superadmin",
      apiKey,
      organizationId: null,
      organizationName: "ContinuityBridge Founders Team",
      enabled: true,
      metadata: {
        roleTitle: EMILIO_ROLE_TITLE,
        team: "Founders",
        addedBy: "system-script",
        addedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    console.log(`\n✅ Emilio Navarro added successfully!`);
    console.log(`\n📋 Account Details:`);
    console.log(`   Name: ${EMILIO_NAME}`);
    console.log(`   Email: ${EMILIO_EMAIL}`);
    console.log(`   Role: Superadmin (Founder)`);
    console.log(`   Title: ${EMILIO_ROLE_TITLE}`);
    console.log(`   Team: Founders`);
    console.log(`\n🔑 API Key (save securely):`);
    console.log(`   ${apiKey}`);
    console.log(`\n📧 Next Steps:`);
    console.log(`   1. Share the API key with Emilio securely`);
    console.log(`   2. Emilio can authenticate using X-API-Key header`);
    console.log(`   3. Access all superadmin features (export, license, user mgmt)`);
    console.log(`\n`);
  } catch (error: any) {
    console.error(`\n❌ Error adding Emilio:`, error.message);
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
addEmilioFounder()
  .then(() => {
    console.log(`🎉 Script completed successfully!\n`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n💥 Script failed:`, error);
    process.exit(1);
  });
