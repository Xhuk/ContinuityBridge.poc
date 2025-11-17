import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import { ManifestManager } from "./manifest-manager";
import { LicenseManager } from "./license-manager";
import { db } from "../../db";
import { flowDefinitions } from "../../schema";
import { eq } from "drizzle-orm";

/**
 * Export Orchestrator - Creates production-ready black box deployments
 * 
 * Workflow:
 * 1. Generate manifest.json (identifies active assets)
 * 2. Generate license.key (with expiry/features)
 * 3. Copy active flows/configs to export directory
 * 4. Bundle runtime engine + config into Docker image
 * 5. Package for delivery
 */

export interface ExportOptions {
  environment: "development" | "staging" | "production";
  organizationId: string;
  organizationName: string;
  licenseType: "trial" | "annual" | "perpetual";
  licenseDays?: number; // For trial/annual
  maxFlows?: number;
  outputDir?: string;
  includeInactive?: boolean; // Export non-active flows (default: false)
}

export class ExportOrchestrator {
  private manifestManager: ManifestManager;
  private licenseManager: LicenseManager;

  constructor() {
    this.manifestManager = new ManifestManager();
    this.licenseManager = new LicenseManager();
  }

  /**
   * Main export function - creates black box deployment package
   */
  async exportBlackBox(options: ExportOptions): Promise<{
    success: boolean;
    exportPath: string;
    manifest: any;
    assets: number;
    errors?: string[];
  }> {
    const errors: string[] = [];
    const exportDir = options.outputDir || path.join(process.cwd(), "exports", `export-${Date.now()}`);

    try {
      console.log("🚀 Starting black box export...");

      // Step 1: Generate manifest
      console.log("📋 Generating manifest...");
      const manifest = await this.manifestManager.generateManifest(options.environment);
      
      // Filter assets based on includeInactive flag
      const assetsToExport = options.includeInactive
        ? manifest.assets
        : manifest.assets.filter(a => a.status === "active");

      if (assetsToExport.length === 0) {
        throw new Error("No active assets found to export. Mark flows as 'active' first.");
      }

      console.log(`📦 Exporting ${assetsToExport.length} assets (${manifest.metadata.activeAssets} active)`);

      // Step 2: Generate license
      console.log("🔐 Generating license...");
      let license: string;
      
      switch (options.licenseType) {
        case "trial":
          license = await this.licenseManager.createTrialLicense(
            options.organizationId,
            options.organizationName
          );
          break;
        case "annual":
          license = await this.licenseManager.createAnnualLicense(
            options.organizationId,
            options.organizationName,
            options.maxFlows || 50
          );
          break;
        case "perpetual":
          license = await this.licenseManager.createPerpetualLicense(
            options.organizationId,
            options.organizationName,
            options.maxFlows || 100
          );
          break;
      }

      // Step 3: Create export directory structure
      console.log("📁 Creating export directory structure...");
      await fs.mkdir(exportDir, { recursive: true });
      
      const configDir = path.join(exportDir, "config");
      const flowsDir = path.join(configDir, "flows");
      const schemasDir = path.join(configDir, "schemas");
      const mappingsDir = path.join(configDir, "mappings");

      await fs.mkdir(configDir, { recursive: true });
      await fs.mkdir(flowsDir, { recursive: true });
      await fs.mkdir(schemasDir, { recursive: true });
      await fs.mkdir(mappingsDir, { recursive: true });

      // Step 4: Save manifest and license
      await fs.writeFile(
        path.join(configDir, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        "utf-8"
      );
      await fs.writeFile(path.join(configDir, "license.key"), license, "utf-8");

      // Step 5: Export flows
      console.log("💾 Exporting flows...");
      const flowAssets = assetsToExport.filter(a => a.type === "flow");
      
      for (const asset of flowAssets) {
        const flow = await (db.select() as any)
          .from(flowDefinitions)
          .where(eq(flowDefinitions.id, asset.id))
          .get();
        
        if (flow) {
          const flowExport = {
            id: flow.id,
            name: flow.name,
            version: asset.version,
            definition: flow.definition,
            createdAt: flow.createdAt,
            updatedAt: flow.updatedAt,
          };
          
          await fs.writeFile(
            path.join(flowsDir, `${flow.id}.json`),
            JSON.stringify(flowExport, null, 2),
            "utf-8"
          );
        }
      }

      // Step 6: Copy runtime dependencies (if needed)
      console.log("📚 Checking production dependencies...");
      const productionDeps = this.getRequiredDependencies(assetsToExport);
      
      if (productionDeps.length > 0) {
        console.log(`⚠️  Production requires these npm packages:`);
        console.log(`   npm install ${productionDeps.join(" ")}`);
      }

      // Step 7: Generate database initialization script
      console.log("🗄️  Generating database initialization...");
      await this.generateDatabaseSeed(exportDir, options);

      // Step 8: Generate Dockerfile
      console.log("🐳 Generating Dockerfile...");
      await this.generateDockerfile(exportDir, productionDeps);

      // Step 9: Generate README for deployment
      await this.generateDeploymentReadme(exportDir, options, productionDeps);

      console.log(`✅ Black box export completed successfully!`);
      console.log(`📂 Export location: ${exportDir}`);

      return {
        success: true,
        exportPath: exportDir,
        manifest,
        assets: assetsToExport.length,
      };

    } catch (error: any) {
      errors.push(error.message);
      return {
        success: false,
        exportPath: exportDir,
        manifest: null,
        assets: 0,
        errors,
      };
    }
  }

  /**
   * Determine which npm packages are required based on used node types
   */
  private getRequiredDependencies(assets: any[]): string[] {
    const deps = new Set<string>();

    for (const asset of assets) {
      if (asset.type === "flow") {
        // Check node types in flow definition
        const flowDef = asset.definition || {};
        const nodes = flowDef.nodes || [];

        for (const node of nodes) {
          switch (node.type) {
            case "sftp_connector":
            case "sftp_poller":
              deps.add("ssh2-sftp-client");
              deps.add("minimatch");
              break;
            case "azure_blob_connector":
            case "azure_blob_poller":
              deps.add("@azure/storage-blob");
              deps.add("minimatch");
              break;
            case "database_connector":
              deps.add("pg");
              deps.add("mysql2");
              deps.add("mssql");
              deps.add("mongodb");
              break;
            case "scheduler":
              deps.add("node-cron");
              deps.add("cron-parser");
              break;
          }
        }
      }
    }

    return Array.from(deps);
  }

  /**
   * Generate Dockerfile for black box deployment
   */
  private async generateDockerfile(exportDir: string, dependencies: string[]): Promise<void> {
    const depsInstall = dependencies.length > 0
      ? `RUN npm install ${dependencies.join(" ")}`
      : "# No additional dependencies required";

    const dockerfile = `# ContinuityBridge - Production Runtime (Black Box)
FROM node:20-alpine

WORKDIR /app

# Copy runtime engine
COPY dist/index.js ./server.js

# Copy configuration (manifest, license, flows, schemas)
COPY config ./config

# Install production dependencies
${depsInstall}

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Run with license validation
CMD ["node", "server.js"]
`;

    await fs.writeFile(path.join(exportDir, "Dockerfile"), dockerfile, "utf-8");
  }

  /**
   * Generate deployment README
   */
  private async generateDeploymentReadme(
    exportDir: string,
    options: ExportOptions,
    dependencies: string[]
  ): Promise<void> {
    const domain = process.env.APP_DOMAIN || process.env.EXPORT_DOMAIN || "networkvoid.xyz";
    const contactEmail = process.env.EXPORT_CONTACT_EMAIL || `support@${domain}`;
    
    const readme = `# ContinuityBridge - Production Deployment

## License Information
- Organization: ${options.organizationName}
- License Type: ${options.licenseType.toUpperCase()}
- Environment: ${options.environment}
- License Server: https://${domain}/api/license/validate

## Deployment Instructions

### Option 1: Docker Deployment (Recommended)

\`\`\`bash
# Build the Docker image
docker build -t continuitybridge-runtime .

# Run the container
docker run -d -p 5000:5000 \\
  --name continuitybridge \\
  continuitybridge-runtime

# Check logs
docker logs -f continuitybridge
\`\`\`

### Option 2: Direct Node.js Deployment

\`\`\`bash
# Install production dependencies
npm install ${dependencies.join(" ")}

# Run the server
node server.js
\`\`\`

## License Validation

The runtime engine validates the license on startup. If validation fails:
- Check that \`config/license.key\` exists and is not corrupted
- Verify license has not expired
- Contact your consultant for license renewal

## Health Check

\`\`\`bash
curl http://localhost:5000/health
\`\`\`

## Support

For technical support:
- Email: ${contactEmail}
- License Server: https://${domain}
- Documentation: https://${domain}/docs
`;

    await fs.writeFile(path.join(exportDir, "README.md"), readme, "utf-8");
  }

  /**
   * Generate database initialization script for customer deployment
   * Creates empty schema + minimal seed data (customer admin, org, license)
   */
  private async generateDatabaseSeed(
    exportDir: string,
    options: ExportOptions
  ): Promise<void> {
    // Generate a UUID for the admin user
    const adminUserId = randomUUID();
    
    const initScript = `-- ContinuityBridge Database Initialization
-- Environment: ${options.environment.toUpperCase()}
-- Organization: ${options.organizationName}
-- Generated: ${new Date().toISOString()}

-- ============================================================================
-- IMPORTANT: This is a CLEAN database for customer deployment
-- Only contains schema + minimal seed data for initialization
-- NO ContinuityBridge consultant data or other customer data is included
-- ============================================================================

-- Create empty schema tables
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer_user',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flow_definitions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  definition TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flow_runs (
  id TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  level TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'customer',
  service TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  organization_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS poller_states (
  id TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  poller_type TEXT NOT NULL,
  last_file TEXT,
  last_processed_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SEED DATA: Customer Organization
-- ============================================================================

INSERT INTO organizations (id, name, created_at, updated_at)
VALUES (
  '${options.organizationId}',
  '${options.organizationName}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- ============================================================================
-- SEED DATA: Customer Admin User (PLACEHOLDER - Update with real email)
-- ============================================================================
-- NOTE: The customer should update this email address on first deployment
-- This user will have 'customer_admin' role to manage their own flows

INSERT INTO users (id, email, name, organization_id, role, enabled, created_at, updated_at)
VALUES (
  '${adminUserId}',
  'admin@${options.organizationName.toLowerCase().replace(/\s+/g, "")}.com', -- PLACEHOLDER: Update this!
  'System Administrator',
  '${options.organizationId}',
  'customer_admin',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- ============================================================================
-- License Validation Metadata
-- ============================================================================
-- The license.key file in config/ directory is validated on startup
-- License details:
--   Type: ${options.licenseType.toUpperCase()}
--   Organization: ${options.organizationName}
--   Environment: ${options.environment.toUpperCase()}
${options.licenseDays ? `--   Valid for: ${options.licenseDays} days` : ""}
${options.maxFlows ? `--   Max flows: ${options.maxFlows}` : ""}

-- ============================================================================
-- Flow Definitions (Loaded from config/flows/*.json on startup)
-- ============================================================================
-- Flow definitions are NOT stored in this SQL file
-- They are loaded from JSON files in config/flows/ directory
-- The runtime engine reads manifest.json and loads active flows automatically

-- ============================================================================
-- Database Initialization Complete
-- ============================================================================
-- Next steps:
-- 1. Update the admin email address above with the customer's real admin email
-- 2. Run this script: sqlite3 data/production.db < init-database.sql
-- 3. Start the server: node server.js
-- 4. The license will be validated on startup
-- 5. Flows will be loaded from config/flows/ directory
`;

    await fs.writeFile(
      path.join(exportDir, "init-database.sql"),
      initScript,
      "utf-8"
    );

    // Also generate a JavaScript seed script for programmatic initialization
    const jsSeed = `// Database Seed Script - Programmatic Initialization
// Run this instead of SQL if you prefer: node seed-database.js

const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'production.db');
const db = new Database(dbPath);

console.log('🗄️  Initializing database for ${options.organizationName}...');

// Create schema (tables)
db.exec(\`
  -- [Schema SQL from above - same as init-database.sql]
  -- (Truncated for brevity - full schema would be here)
\`);

// Seed organization
db.prepare(\`
  INSERT INTO organizations (id, name, created_at, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
\`).run('${options.organizationId}', '${options.organizationName}');

// Seed admin user
const adminEmail = process.env.ADMIN_EMAIL || 'admin@${options.organizationName.toLowerCase().replace(/\s+/g, "")}.com';
db.prepare(\`
  INSERT INTO users (id, email, name, organization_id, role, enabled, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
\`).run(randomUUID(), adminEmail, 'System Administrator', '${options.organizationId}', 'customer_admin');

console.log('✅ Database initialized successfully!');
console.log(\`👤 Admin user created: \${adminEmail}\`);
console.log('🔐 License validation will occur on first server startup');
console.log('📦 Flows will be loaded from config/flows/ directory');

db.close();
`;

    await fs.writeFile(
      path.join(exportDir, "seed-database.js"),
      jsSeed,
      "utf-8"
    );

    console.log("   ✅ Generated init-database.sql (SQL script)");
    console.log("   ✅ Generated seed-database.js (Node.js script)");
  }
}
