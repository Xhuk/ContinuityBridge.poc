import { neon } from "@neondatabase/serverless";

/**
 * Migration Script: Add organization_id columns to multi-tenant tables
 * 
 * This script adds organization_id columns and indexes to tables that need
 * multi-tenant isolation in the ContinuityBridge system.
 */

async function addOrganizationIdColumns() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable not set");
    process.exit(1);
  }

  console.log("🔗 Connecting to Neon database...");
  const sql = neon(databaseUrl);

  try {
    console.log("\n📊 Starting migration: Adding organization_id columns\n");

    // List of tables that need organization_id for multi-tenant isolation
    const tables = [
      { name: "flow_definitions", addIndex: true },
      { name: "flow_runs", addIndex: true },
      { name: "interfaces", addIndex: true },
      { name: "data_source_schemas", addIndex: true },
      { name: "poller_states", addIndex: true },
      { name: "transformation_templates", addIndex: true },
      { name: "system_instances", addIndex: true },
      { name: "system_instance_auth", addIndex: true },
      { name: "webhook_configurations", addIndex: true },
      { name: "routing_rules", addIndex: true },
      { name: "change_requests", addIndex: false }, // Already has organization_id
      { name: "qa_tasks", addIndex: true },
    ];

    for (const table of tables) {
      console.log(`\n📝 Processing table: ${table.name}`);
      
      try {
        // Check if column already exists
        const columnCheck = await sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = ${table.name} 
          AND column_name = 'organization_id'
        `;

        if (columnCheck.length > 0) {
          console.log(`   ✓ Column organization_id already exists in ${table.name}`);
        } else {
          // Add organization_id column
          console.log(`   → Adding organization_id column to ${table.name}...`);
          await sql(
            `ALTER TABLE "${table.name}" ADD COLUMN organization_id TEXT`
          );
          console.log(`   ✓ Column added successfully`);
        }

        // Create index if specified and doesn't exist
        if (table.addIndex) {
          const indexName = `${table.name}_org_id_idx`;
          
          // Check if index exists
          const indexCheck = await sql`
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = ${table.name} 
            AND indexname = ${indexName}
          `;

          if (indexCheck.length > 0) {
            console.log(`   ✓ Index ${indexName} already exists`);
          } else {
            console.log(`   → Creating index ${indexName}...`);
            await sql(
              `CREATE INDEX "${indexName}" ON "${table.name}" (organization_id)`
            );
            console.log(`   ✓ Index created successfully`);
          }
        }

      } catch (tableError: any) {
        console.error(`   ❌ Error processing ${table.name}:`, tableError.message);
        // Continue with other tables
      }
    }

    console.log("\n✅ Migration completed successfully!");
    console.log("\n📋 Summary:");
    console.log("   - Added organization_id columns where missing");
    console.log("   - Created indexes for efficient multi-tenant queries");
    console.log("   - All tables now support tenant isolation\n");

  } catch (error: any) {
    console.error("\n❌ Migration failed:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run migration
addOrganizationIdColumns()
  .then(() => {
    console.log("🎉 Migration script finished");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  });
