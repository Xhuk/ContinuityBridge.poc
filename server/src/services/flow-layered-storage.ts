/**
 * Flow Layered Storage Service
 * 
 * Manages BASE + CUSTOM + RUNTIME layers for integration flows
 * Integrates with existing FlowVersionManager for semantic versioning
 * 
 * Architecture:
 * - BASE: Foundation/Core flows (read-only, from Founder)
 * - CUSTOM: Customer-specific modifications (editable by Consultants)
 * - RUNTIME: Merged flows deployed to customer environments
 * 
 * Version Format:
 * - BASE: 1.0.0, 1.1.0, 1.2.0 (semantic versioning)
 * - CUSTOM: 1.0.0-custom.1, 1.0.0-custom.2 (incremental customizations)
 * - RUNTIME: Same as CUSTOM (deployed version)
 */

import path from "path";
import fs from "fs/promises";
import { logger } from "../core/logger.js";
import { FlowDefinition } from "@shared/schema";
import YAML from "yaml";

const log = logger.child("FlowLayeredStorage");

export interface FlowLayer {
  type: "base" | "custom" | "runtime";
  version: string;
  baseVersion?: string; // For custom layers, which BASE they extend
  flows: FlowDefinition[];
  source: "foundation" | "consultant" | "merged";
}

export interface FlowCustomization {
  flowName: string;
  baseVersion: string;
  customVersion: string;
  changeType: "add_nodes" | "modify_config" | "override_mapping";
  changeDescription: string;
  
  // Customization details
  addedNodes?: any[];
  modifiedConfig?: Record<string, any>;
  overriddenMappings?: Record<string, any>;
  
  createdBy: string;
  createdAt: string;
}

export interface FlowMergeResult {
  success: boolean;
  runtimeVersion: string;
  baseVersion: string;
  flowsProcessed: number;
  flowsFromBase: number;
  flowsFromCustom: number;
  flowsModified: number;
  warnings: string[];
  mergedFlows: FlowDefinition[];
}

export interface FlowLayerConfig {
  organizationId: string;
  environment: "dev" | "staging" | "prod";
  
  // Paths
  basePath?: string;    // Default: Foundation/Core/flows/base
  customPath?: string;  // Default: /customer/{orgId}/flows/custom
  runtimePath?: string; // Default: /customer/{orgId}/flows/runtime
  
  // Versioning
  baseVersion?: string;
  createSnapshot?: boolean;
}

export class FlowLayeredStorageService {
  private config: FlowLayerConfig;
  private storagePath: string;
  
  constructor(config: FlowLayerConfig) {
    this.config = config;
    this.storagePath = process.env.DEPLOYMENT_STORAGE_PATH || "./deployment-packages";
  }
  
  /**
   * Merge BASE + CUSTOM flows into RUNTIME
   * Similar to deployment layered storage, but for flows
   */
  async mergeFlowLayers(): Promise<FlowMergeResult> {
    const { organizationId, environment, baseVersion = "1.0.0" } = this.config;
    
    log.info("Merging flow layers", { organizationId, environment, baseVersion });
    
    const result: FlowMergeResult = {
      success: true,
      runtimeVersion: "",
      baseVersion,
      flowsProcessed: 0,
      flowsFromBase: 0,
      flowsFromCustom: 0,
      flowsModified: 0,
      warnings: [],
      mergedFlows: [],
    };
    
    try {
      // 1. Load BASE flows from Foundation/Core
      const baseFlows = await this.loadBaseFlows(baseVersion);
      
      // 2. Load CUSTOM flows for this organization
      const customFlows = await this.loadCustomFlows(organizationId, environment);
      
      // 3. Merge layers (CUSTOM overrides BASE)
      const mergedFlows = this.mergeLayers(baseFlows, customFlows, result);
      
      // 4. Calculate runtime version
      const runtimeVersion = await this.getNextRuntimeVersion(organizationId, baseVersion);
      result.runtimeVersion = runtimeVersion;
      
      // 5. Write merged flows to RUNTIME
      await this.writeRuntimeFlows(organizationId, environment, mergedFlows, runtimeVersion);
      
      // 6. Create snapshot if requested
      if (this.config.createSnapshot) {
        await this.createFlowSnapshot(organizationId, runtimeVersion, mergedFlows);
      }
      
      result.mergedFlows = mergedFlows;
      result.success = true;
      
      log.info("Flow layers merged successfully", {
        organizationId,
        runtimeVersion,
        flowsProcessed: result.flowsProcessed,
      });
      
      return result;
    } catch (error: any) {
      log.error("Flow merge failed", error);
      result.success = false;
      result.warnings.push(`Merge failed: ${error.message}`);
      return result;
    }
  }
  
  /**
   * Load BASE flows from Foundation/Core
   */
  private async loadBaseFlows(version: string): Promise<FlowDefinition[]> {
    const basePath = this.config.basePath || path.join(this.storagePath, "Foundation", "Core", "flows", "base", version);
    
    log.debug("Loading BASE flows", { basePath, version });
    
    try {
      const files = await fs.readdir(basePath);
      const flows: FlowDefinition[] = [];
      
      for (const file of files) {
        if (file.endsWith(".yaml") || file.endsWith(".yml") || file.endsWith(".json")) {
          const filePath = path.join(basePath, file);
          const content = await fs.readFile(filePath, "utf-8");
          
          const flow = file.endsWith(".json") 
            ? JSON.parse(content)
            : YAML.parse(content);
          
          flows.push(flow);
        }
      }
      
      log.info("BASE flows loaded", { count: flows.length, version });
      return flows;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        log.warn("BASE flows directory not found", { basePath, version });
        return [];
      }
      throw error;
    }
  }
  
  /**
   * Load CUSTOM flows for organization
   */
  private async loadCustomFlows(organizationId: string, environment: string): Promise<FlowDefinition[]> {
    const customPath = this.config.customPath || path.join(this.storagePath, organizationId, "flows", "custom", environment);
    
    log.debug("Loading CUSTOM flows", { customPath, organizationId, environment });
    
    try {
      const files = await fs.readdir(customPath);
      const flows: FlowDefinition[] = [];
      
      for (const file of files) {
        if (file.endsWith(".yaml") || file.endsWith(".yml") || file.endsWith(".json")) {
          const filePath = path.join(customPath, file);
          const content = await fs.readFile(filePath, "utf-8");
          
          const flow = file.endsWith(".json")
            ? JSON.parse(content)
            : YAML.parse(content);
          
          flows.push(flow);
        }
      }
      
      log.info("CUSTOM flows loaded", { count: flows.length, organizationId });
      return flows;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        log.info("No CUSTOM flows found (using BASE only)", { organizationId });
        return [];
      }
      throw error;
    }
  }
  
  /**
   * Merge BASE + CUSTOM flows
   * 
   * Rules:
   * 1. CUSTOM flow with same name overrides BASE flow
   * 2. CUSTOM-only flows are added (new flows)
   * 3. BASE-only flows are kept (no customization)
   */
  private mergeLayers(
    baseFlows: FlowDefinition[],
    customFlows: FlowDefinition[],
    result: FlowMergeResult
  ): FlowDefinition[] {
    const merged: FlowDefinition[] = [];
    const baseIndex = new Map(baseFlows.map(f => [f.name, f]));
    const customIndex = new Map(customFlows.map(f => [f.name, f]));
    
    // Get all unique flow names
    const allNames = new Set([
      ...Array.from(baseIndex.keys()),
      ...Array.from(customIndex.keys()),
    ]);
    
    for (const flowName of Array.from(allNames)) {
      const hasBase = baseIndex.has(flowName);
      const hasCustom = customIndex.has(flowName);
      
      result.flowsProcessed++;
      
      if (hasCustom && hasBase) {
        // CASE 1: OVERRIDE - Custom wins
        const customFlow = customIndex.get(flowName)!;
        merged.push(customFlow);
        result.flowsModified++;
        result.flowsFromCustom++;
        
        log.debug("Flow overridden by CUSTOM", { flowName });
      } else if (hasCustom) {
        // CASE 2: ADD-ON - Only in custom (new flow)
        const customFlow = customIndex.get(flowName)!;
        merged.push(customFlow);
        result.flowsFromCustom++;
        
        log.debug("Flow added from CUSTOM", { flowName });
      } else if (hasBase) {
        // CASE 3: DEFAULT - Only in base (no customization)
        const baseFlow = baseIndex.get(flowName)!;
        merged.push(baseFlow);
        result.flowsFromBase++;
        
        log.debug("Flow from BASE (no customization)", { flowName });
      }
    }
    
    return merged;
  }
  
  /**
   * Get next runtime version (auto-increment)
   */
  private async getNextRuntimeVersion(organizationId: string, baseVersion: string): Promise<string> {
    const snapshotsPath = path.join(this.storagePath, organizationId, "flows", "snapshots");
    
    try {
      const snapshots = await fs.readdir(snapshotsPath);
      
      // Find snapshots matching current BASE version
      const pattern = new RegExp(`^${baseVersion.replace(/\./g, "\\.")}-custom\\.(\\d+)$`);
      const matchingVersions = snapshots
        .map(name => {
          const match = name.match(pattern);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(num => num > 0);
      
      const maxIncrement = matchingVersions.length > 0 ? Math.max(...matchingVersions) : 0;
      const nextIncrement = maxIncrement + 1;
      
      return `${baseVersion}-custom.${nextIncrement}`;
    } catch {
      // No snapshots yet, start at custom.1
      return `${baseVersion}-custom.1`;
    }
  }
  
  /**
   * Write merged flows to RUNTIME directory
   */
  private async writeRuntimeFlows(
    organizationId: string,
    environment: string,
    flows: FlowDefinition[],
    version: string
  ): Promise<void> {
    const runtimePath = this.config.runtimePath || path.join(this.storagePath, organizationId, "flows", "runtime", environment);
    
    // Clear existing runtime
    await fs.rm(runtimePath, { recursive: true, force: true });
    await fs.mkdir(runtimePath, { recursive: true });
    
    // Write flows as YAML
    for (const flow of flows) {
      const fileName = `${flow.name}.yaml`;
      const filePath = path.join(runtimePath, fileName);
      const yamlContent = YAML.stringify(flow);
      
      await fs.writeFile(filePath, yamlContent, "utf-8");
    }
    
    // Write manifest
    const manifest = {
      version,
      environment,
      organizationId,
      flowCount: flows.length,
      generatedAt: new Date().toISOString(),
    };
    
    await fs.writeFile(
      path.join(runtimePath, "FLOW_MANIFEST.json"),
      JSON.stringify(manifest, null, 2)
    );
    
    log.info("Runtime flows written", { runtimePath, flowCount: flows.length });
  }
  
  /**
   * Create immutable snapshot of merged flows
   */
  private async createFlowSnapshot(
    organizationId: string,
    version: string,
    flows: FlowDefinition[]
  ): Promise<string> {
    const snapshotPath = path.join(this.storagePath, organizationId, "flows", "snapshots", version);
    
    await fs.mkdir(snapshotPath, { recursive: true });
    
    // Copy flows to snapshot
    for (const flow of flows) {
      const fileName = `${flow.name}.yaml`;
      const filePath = path.join(snapshotPath, fileName);
      const yamlContent = YAML.stringify(flow);
      
      await fs.writeFile(filePath, yamlContent, "utf-8");
    }
    
    // Write snapshot metadata
    const metadata = {
      version,
      organizationId,
      flowCount: flows.length,
      createdAt: new Date().toISOString(),
      immutable: true,
    };
    
    await fs.writeFile(
      path.join(snapshotPath, "snapshot.json"),
      JSON.stringify(metadata, null, 2)
    );
    
    log.info("Flow snapshot created", { snapshotPath, version });
    return snapshotPath;
  }
  
  /**
   * List all flow snapshots for organization
   */
  async listFlowSnapshots(): Promise<Array<{
    version: string;
    baseVersion: string;
    customIncrement: number;
    flowCount: number;
    createdAt: Date;
  }>> {
    const { organizationId } = this.config;
    const snapshotsPath = path.join(this.storagePath, organizationId, "flows", "snapshots");
    
    try {
      const snapshots = await fs.readdir(snapshotsPath);
      const results = [];
      
      for (const snapshotDir of snapshots) {
        const snapshotPath = path.join(snapshotsPath, snapshotDir);
        const stats = await fs.stat(snapshotPath);
        
        if (stats.isDirectory()) {
          // Parse version (format: "1.0.0-custom.3")
          const match = snapshotDir.match(/^(.+)-custom\.(\\d+)$/);
          if (match) {
            // Read metadata
            try {
              const metadataPath = path.join(snapshotPath, "snapshot.json");
              const metadata = JSON.parse(await fs.readFile(metadataPath, "utf-8"));
              
              results.push({
                version: snapshotDir,
                baseVersion: match[1],
                customIncrement: parseInt(match[2], 10),
                flowCount: metadata.flowCount || 0,
                createdAt: new Date(metadata.createdAt),
              });
            } catch {
              // Metadata not found, use directory stats
              results.push({
                version: snapshotDir,
                baseVersion: match[1],
                customIncrement: parseInt(match[2], 10),
                flowCount: 0,
                createdAt: stats.birthtime,
              });
            }
          }
        }
      }
      
      // Sort by version (newest first)
      return results.sort((a, b) => {
        if (a.baseVersion !== b.baseVersion) {
          return b.baseVersion.localeCompare(a.baseVersion);
        }
        return b.customIncrement - a.customIncrement;
      });
    } catch {
      return [];
    }
  }
}
