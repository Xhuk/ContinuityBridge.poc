import * as fs from "fs/promises";
import * as path from "path";
import { db } from "../../db";
import { flowDefinitions } from "../../db";

/**
 * Manifest Manager - Tracks active assets and contractor work for export
 * 
 * The manifest.json file is the "brain" of the export process:
 * - Identifies which flows/configs are production-ready (status: "active")
 * - Tracks who built each asset (author field)
 * - Maintains version history and dependencies
 */

export interface ManifestAsset {
  id: string;
  type: "flow" | "schema" | "mapping" | "interface" | "credential";
  name: string;
  version: string;
  status: "active" | "inactive" | "testing" | "deprecated";
  author: string;
  createdAt: string;
  updatedAt: string;
  dependencies?: string[]; // IDs of other assets this depends on
  tags?: string[];
  path: string; // Relative path in config folder
}

export interface Manifest {
  version: string;
  generatedAt: string;
  environment: "development" | "staging" | "production";
  organizationId: string;
  assets: ManifestAsset[];
  metadata: {
    totalAssets: number;
    activeAssets: number;
    contributors: string[];
    lastExportedAt?: string;
    runtimeVersion: string;
  };
}

export class ManifestManager {
  private manifestPath: string;

  constructor(configDir: string = "./config") {
    this.manifestPath = path.join(configDir, "manifest.json");
  }

  /**
   * Generate manifest from database (scans all active flows/assets)
   */
  async generateManifest(environment: "development" | "staging" | "production" = "production"): Promise<Manifest> {
    const assets: ManifestAsset[] = [];

    // Scan flows from database
    const flows = await db.select().from(flowDefinitions).all();
    
    for (const flow of flows) {
      // Determine status based on flow metadata
      const status = this.inferFlowStatus(flow);
      
      // Extract author from flow metadata or default
      const author = (flow as any).metadata?.author || "system";

      assets.push({
        id: flow.id,
        type: "flow",
        name: flow.name,
        version: (flow as any).version || "1.0.0",
        status,
        author,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt,
        dependencies: this.extractDependencies(flow),
        tags: (flow as any).tags || [],
        path: `flows/${flow.id}.json`,
      });
    }

    // TODO: Add schema assets scan
    // TODO: Add mapping assets scan
    // TODO: Add interface configs scan

    const activeAssets = assets.filter(a => a.status === "active");
    const contributors = [...new Set(assets.map(a => a.author))];

    const manifest: Manifest = {
      version: "2.0",
      generatedAt: new Date().toISOString(),
      environment,
      organizationId: process.env.ORGANIZATION_ID || "default-org",
      assets,
      metadata: {
        totalAssets: assets.length,
        activeAssets: activeAssets.length,
        contributors,
        runtimeVersion: process.env.RUNTIME_VERSION || "1.0.0",
      },
    };

    return manifest;
  }

  /**
   * Save manifest to disk
   */
  async saveManifest(manifest: Manifest): Promise<void> {
    const dir = path.dirname(this.manifestPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  }

  /**
   * Load existing manifest
   */
  async loadManifest(): Promise<Manifest | null> {
    try {
      const content = await fs.readFile(this.manifestPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Update asset status in manifest
   */
  async updateAssetStatus(assetId: string, status: ManifestAsset["status"]): Promise<void> {
    const manifest = await this.loadManifest();
    if (!manifest) {
      throw new Error("Manifest not found. Generate manifest first.");
    }

    const asset = manifest.assets.find(a => a.id === assetId);
    if (!asset) {
      throw new Error(`Asset ${assetId} not found in manifest`);
    }

    asset.status = status;
    asset.updatedAt = new Date().toISOString();
    manifest.generatedAt = new Date().toISOString();

    await this.saveManifest(manifest);
  }

  /**
   * Get only active assets (for export)
   */
  async getActiveAssets(): Promise<ManifestAsset[]> {
    const manifest = await this.loadManifest();
    if (!manifest) {
      return [];
    }
    return manifest.assets.filter(a => a.status === "active");
  }

  /**
   * Infer flow status from metadata
   */
  private inferFlowStatus(flow: any): ManifestAsset["status"] {
    // Check if flow has explicit status in metadata
    if (flow.metadata?.status) {
      return flow.metadata.status;
    }

    // Check if flow has been executed successfully (production-ready)
    if (flow.metadata?.lastSuccessfulRun) {
      return "active";
    }

    // Check if flow is being tested
    if (flow.metadata?.testRuns > 0) {
      return "testing";
    }

    // Default to inactive for new/untested flows
    return "inactive";
  }

  /**
   * Extract dependencies from flow definition
   */
  private extractDependencies(flow: any): string[] {
    const deps: string[] = [];

    // Check flow nodes for references to other assets
    if (flow.definition?.nodes) {
      for (const node of flow.definition.nodes) {
        // Interface dependencies
        if (node.type === "interface_source" || node.type === "interface_destination") {
          if (node.data?.config?.interfaceId) {
            deps.push(node.data.config.interfaceId);
          }
        }

        // Mapping dependencies
        if (node.type === "object_mapper") {
          if (node.data?.config?.mappingId) {
            deps.push(node.data.config.mappingId);
          }
        }

        // Schema dependencies
        if (node.type === "validation") {
          if (node.data?.config?.schemaId) {
            deps.push(node.data.config.schemaId);
          }
        }
      }
    }

    return [...new Set(deps)]; // Remove duplicates
  }
}
