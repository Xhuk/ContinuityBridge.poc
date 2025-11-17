import * as fs from "fs/promises";
import * as path from "path";
import { ManifestManager } from "./manifest-manager";
import { LicenseManager } from "./license-manager";
import { db } from "../../db";
import { flowDefinitions } from "../../schema";

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
        const flow = await db.select().from(flowDefinitions)
          .where(flowDefinitions.id, asset.id)
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

      // Step 7: Generate Dockerfile
      console.log("🐳 Generating Dockerfile...");
      await this.generateDockerfile(exportDir, productionDeps);

      // Step 8: Generate README for deployment
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
}
