import { neon } from "@neondatabase/serverless";

/**
 * Test Neon PostgreSQL query for users table
 * Run with: npx tsx scripts/test-neon-query.ts
 */

async function testNeonQuery() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not set. Please configure Neon connection string.");
    process.exit(1);
  }

  console.log("\n🔍 Testing Neon PostgreSQL Connection...\n");
  console.log(`📊 Database URL: ${databaseUrl.substring(0, 30)}...`);

  const sql = neon(databaseUrl);

  try {
    // Test 1: Query specific user
    const testEmail = "jesus.cruzado@gmail.com";
    console.log(`\n1️⃣ Querying user: ${testEmail}`);
    console.log("━".repeat(60));

    const userResult = await sql`
      SELECT 
        id,
        email,
        role,
        enabled,
        email_confirmed,
        organization_id,
        organization_name,
        api_key,
        last_login_at,
        created_at
      FROM users 
      WHERE email = ${testEmail}
    `;

    if (userResult.length > 0) {
      const user = userResult[0];
      console.log("\n✅ User Found:");
      console.log(`   ID:              ${user.id}`);
      console.log(`   Email:           ${user.email}`);
      console.log(`   Role:            ${user.role}`);
      console.log(`   Enabled:         ${user.enabled}`);
      console.log(`   Email Confirmed: ${user.email_confirmed}`);
      console.log(`   Organization:    ${user.organization_name || 'N/A'}`);
      console.log(`   API Key:         ${user.api_key?.substring(0, 20)}...`);
      console.log(`   Last Login:      ${user.last_login_at || 'Never'}`);
      console.log(`   Created:         ${user.created_at}`);
    } else {
      console.log(`\n⚠️  User NOT found: ${testEmail}`);
      console.log(`   The user does not exist in the database.`);
    }

    // Test 2: List all users
    console.log(`\n\n2️⃣ Listing all users in database`);
    console.log("━".repeat(60));

    const allUsers = await sql`
      SELECT 
        email,
        role,
        enabled,
        email_confirmed,
        created_at
      FROM users 
      ORDER BY created_at DESC
      LIMIT 10
    `;

    if (allUsers.length > 0) {
      console.log(`\n📋 Found ${allUsers.length} user(s):\n`);
      allUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.email}`);
        console.log(`      Role: ${user.role} | Enabled: ${user.enabled} | Confirmed: ${user.email_confirmed}`);
        console.log(`      Created: ${user.created_at}`);
        console.log("");
      });
    } else {
      console.log("\n⚠️  No users found in database");
      console.log("   Run: npx tsx scripts/create-admin-user.ts");
    }

    // Test 3: Database connection info
    console.log(`\n3️⃣ Database Connection Test`);
    console.log("━".repeat(60));

    const dbInfo = await sql`
      SELECT 
        current_database() as database_name,
        current_schema() as schema_name,
        version() as postgres_version
    `;

    console.log(`\n✅ Connection successful:`);
    console.log(`   Database: ${dbInfo[0].database_name}`);
    console.log(`   Schema:   ${dbInfo[0].schema_name}`);
    console.log(`   Version:  ${dbInfo[0].postgres_version.split(',')[0]}`);

    // Test 4: Check users table structure
    console.log(`\n\n4️⃣ Users Table Structure`);
    console.log("━".repeat(60));

    const tableInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `;

    console.log(`\n📊 Table 'users' has ${tableInfo.length} columns:\n`);
    tableInfo.forEach((col) => {
      console.log(`   • ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)'}`);
    });

    console.log("\n" + "━".repeat(60));
    console.log("✅ All tests completed successfully!\n");

  } catch (error: any) {
    console.error("\n❌ Database query failed:");
    console.error(`   Error: ${error.message}`);
    console.error(`\n   Full error:`, error);
    process.exit(1);
  }
}

testNeonQuery();
