/**
 * Plugin Package Manager
 * 
 * For SOW Professional Services tier:
 * 1. Founder/Consultant creates custom node plugin
 * 2. Signs with RSA key
 * 3. Packages as .cbplugin file
 * 4. Customer uploads via UI
 * 5. Plugin installed to organization-specific registry
 * 
 * MULTI-TENANT: Plugins are isolated per organization
 */

import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../core/logger.js";
import AdmZip from "adm-zip";
import { nodeRegistry } from "../flow/node-registry.js";
import type { NodePlugin } from "../flow/node-registry.js";

const log = logger.child("PluginPackageManager");

export interface PluginManifest {
  // Plugin identity
  pluginId: string;
  version: string;
  name: string;
  description: string;
  author: string;
  
  // Organization binding (multi-tenant isolation)
  organizationId: string;
  
  // Node definition
  nodeType: string;
  category: "trigger" | "parser" | "transform" | "builder" | "output" | "logic";
  
  // Requirements
  minSystemVersion: string;
  requires?: {
    packages?: string[];
    permissions?: string[];
  };
  
  // Files
  files: Array<{
    path: string;
    checksum: string;
    size: number;
  }>;
  
  // Licensing
  licenseRequired?: string; // Feature flag required to use this plugin
  
  // Security
  signature: string;
  createdAt: string;
}

export class PluginPackageManager {
  private publicKeyPath: string;
  private pluginsDir: string;
  
  constructor(
    publicKeyPath: string = "./keys/public_key.pem",
    pluginsDir: string = "./data/plugins"
  ) {
    this.publicKeyPath = publicKeyPath;
    this.pluginsDir = pluginsDir;
  }
  
  /**
   * Get organization-specific plugin directory
   */
  private getOrgPluginDir(organizationId: string): string {
    return path.join(this.pluginsDir, organizationId);
  }
  
  /**
   * CREATE: Build signed .cbplugin package
   */
  async createPlugin(
    manifest: Omit<PluginManifest, "signature" | "createdAt">,
    files: Map<string, Buffer>,
    privateKeyPath: string
  ): Promise<Buffer> {
    try {
      log.info("Creating plugin package", {
        pluginId: manifest.pluginId,
        version: manifest.version,
        organizationId: manifest.organizationId,
      });
      
      // Create ZIP structure
      const zip = new AdmZip();
      
      // Add files
      for (const [filePath, content] of Array.from(files.entries())) {
        zip.addFile(filePath, content);
        
        // Verify checksum
        const checksum = crypto.createHash("sha256").update(content).digest("hex");
        const manifestFile = manifest.files.find(f => f.path === filePath);
        if (!manifestFile || manifestFile.checksum !== checksum) {
          throw new Error(`Checksum mismatch for file: ${filePath}`);
        }
      }
      
      // Add metadata
      const manifestWithTimestamp = {
        ...manifest,
        createdAt: new Date().toISOString(),
      };
      
      const manifestData = JSON.stringify(manifestWithTimestamp, null, 2);
      
      // Sign manifest
      const privateKey = await fs.readFile(privateKeyPath, "utf-8");
      const sign = crypto.createSign("SHA256");
      sign.update(manifestData);
      const signature = sign.sign(privateKey, "hex");
      
      // Add signed manifest
      const signedManifest: PluginManifest = {
        ...manifestWithTimestamp,
        signature,
      };
      
      zip.addFile("manifest.json", Buffer.from(JSON.stringify(signedManifest, null, 2)));
      
      log.info("Plugin package created", {
        pluginId: manifest.pluginId,
        signature: signature.substring(0, 16) + "...",
      });
      
      return zip.toBuffer();
    } catch (error: any) {
      log.error("Failed to create plugin package", error);
      throw error;
    }
  }
  
  /**
   * UPLOAD: Accept and validate plugin upload (MULTI-TENANT)
   */
  async uploadPlugin(
    packageBuffer: Buffer,
    uploadedBy: string,
    organizationId: string
  ): Promise<{
    success: boolean;
    pluginId?: string;
    version?: string;
    error?: string;
  }> {
    try {
      log.info("Processing plugin upload", {
        size: packageBuffer.length,
        uploadedBy,
        organizationId,
      });
      
      // Extract ZIP
      const zip = new AdmZip(packageBuffer);
      const manifestEntry = zip.getEntry("manifest.json");
      
      if (!manifestEntry) {
        return { success: false, error: "Invalid plugin: missing manifest.json" };
      }
      
      // Parse manifest
      const manifestData = manifestEntry.getData().toString("utf-8");
      const manifest: PluginManifest = JSON.parse(manifestData);
      
      // Verify organization match (security: can't upload plugins for other orgs)
      if (manifest.organizationId !== organizationId) {
        return { 
          success: false, 
          error: `Plugin is for organization ${manifest.organizationId}, cannot install to ${organizationId}` 
        };
      }
      
      // Verify signature
      const isValid = await this.verifyPluginSignature(manifest);
      if (!isValid) {
        return { success: false, error: "Invalid signature - plugin rejected" };
      }
      
      // Verify file checksums
      for (const fileInfo of manifest.files) {
        const fileEntry = zip.getEntry(fileInfo.path);
        if (!fileEntry) {
          return { success: false, error: `Missing file: ${fileInfo.path}` };
        }
        
        const fileContent = fileEntry.getData();
        const checksum = crypto.createHash("sha256").update(fileContent).digest("hex");
        
        if (checksum !== fileInfo.checksum) {
          return { success: false, error: `Checksum mismatch for ${fileInfo.path}` };
        }
      }
      
      // Check version compatibility
      const currentVersion = process.env.RUNTIME_VERSION || "1.0.0";
      if (!this.isVersionCompatible(currentVersion, manifest.minSystemVersion)) {
        return {
          success: false,
          error: `Incompatible version. Requires ${manifest.minSystemVersion}+, current: ${currentVersion}`,
        };
      }
      
      // Save plugin (organization-scoped)
      const orgDir = this.getOrgPluginDir(organizationId);
      await fs.mkdir(orgDir, { recursive: true });
      const pluginPath = path.join(orgDir, `${manifest.pluginId}-${manifest.version}.cbplugin`);
      await fs.writeFile(pluginPath, packageBuffer);
      
      log.info("Plugin uploaded successfully", {
        pluginId: manifest.pluginId,
        version: manifest.version,
        organizationId,
        path: pluginPath,
      });
      
      return {
        success: true,
        pluginId: manifest.pluginId,
        version: manifest.version,
      };
    } catch (error: any) {
      log.error("Failed to upload plugin", error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * INSTALL: Load plugin into runtime (organization-specific registry)
   */
  async installPlugin(
    pluginId: string,
    version: string,
    organizationId: string
  ): Promise<{
    success: boolean;
    nodeType?: string;
    error?: string;
  }> {
    try {
      log.info("Installing plugin", { pluginId, version, organizationId });
      
      // Load plugin file
      const orgDir = this.getOrgPluginDir(organizationId);
      const pluginPath = path.join(orgDir, `${pluginId}-${version}.cbplugin`);
      const packageBuffer = await fs.readFile(pluginPath);
      
      const zip = new AdmZip(packageBuffer);
      const manifestEntry = zip.getEntry("manifest.json");
      
      if (!manifestEntry) {
        return { success: false, error: "Invalid plugin package" };
      }
      
      const manifest: PluginManifest = JSON.parse(
        manifestEntry.getData().toString("utf-8")
      );
      
      // Load executor code
      const executorEntry = zip.getEntry("executor.js");
      if (!executorEntry) {
        return { success: false, error: "Missing executor.js" };
      }
      
      const executorCode = executorEntry.getData().toString("utf-8");
      
      // Dynamically evaluate executor (sandboxed)
      // TODO: Add proper sandboxing for security
      const executorModule = new Function("require", "exports", executorCode);
      const exports: any = {};
      executorModule(require, exports);
      
      if (!exports.execute) {
        return { success: false, error: "Executor missing execute function" };
      }
      
      // Register plugin in organization-specific registry
      const plugin: NodePlugin = {
        type: manifest.nodeType,
        category: manifest.category,
        label: manifest.name,
        description: manifest.description,
        icon: "Puzzle", // TODO: Support custom icons
        executor: exports.execute,
        requires: manifest.requires,
      };
      
      nodeRegistry.registerOrgPlugin(organizationId, plugin);
      
      log.info("Plugin installed successfully", {
        pluginId,
        version,
        organizationId,
        nodeType: manifest.nodeType,
      });
      
      return {
        success: true,
        nodeType: manifest.nodeType,
      };
    } catch (error: any) {
      log.error("Failed to install plugin", error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * LIST: Get uploaded plugins for organization
   */
  async listPlugins(organizationId: string): Promise<Array<{
    pluginId: string;
    version: string;
    name: string;
    description: string;
    uploadedAt: Date;
    installed: boolean;
  }>> {
    try {
      const orgDir = this.getOrgPluginDir(organizationId);
      await fs.mkdir(orgDir, { recursive: true });
      const files = await fs.readdir(orgDir);
      
      const plugins = await Promise.all(
        files
          .filter(f => f.endsWith(".cbplugin"))
          .map(async (filename) => {
            const filePath = path.join(orgDir, filename);
            const stats = await fs.stat(filePath);
            
            // Extract manifest
            const buffer = await fs.readFile(filePath);
            const zip = new AdmZip(buffer);
            const manifestEntry = zip.getEntry("manifest.json");
            
            if (!manifestEntry) return null;
            
            const manifest: PluginManifest = JSON.parse(
              manifestEntry.getData().toString("utf-8")
            );
            
            return {
              pluginId: manifest.pluginId,
              version: manifest.version,
              name: manifest.name,
              description: manifest.description,
              uploadedAt: stats.mtime,
              installed: false, // TODO: Track installation status
            };
          })
      );
      
      return plugins.filter(p => p !== null) as any;
    } catch (error: any) {
      log.error("Failed to list plugins", error);
      return [];
    }
  }
  
  // Private helpers
  
  private async verifyPluginSignature(manifest: PluginManifest): Promise<boolean> {
    try {
      const publicKey = await fs.readFile(this.publicKeyPath, "utf-8");
      
      const { signature, ...manifestData } = manifest;
      const payload = JSON.stringify(manifestData, null, 2);
      
      const verify = crypto.createVerify("SHA256");
      verify.update(payload);
      
      return verify.verify(publicKey, signature, "hex");
    } catch (error: any) {
      log.error("Signature verification failed", error);
      return false;
    }
  }
  
  private isVersionCompatible(current: string, min: string): boolean {
    const compareSemver = (a: string, b: string): number => {
      const aParts = a.split(".").map(Number);
      const bParts = b.split(".").map(Number);
      
      for (let i = 0; i < 3; i++) {
        if (aParts[i] > bParts[i]) return 1;
        if (aParts[i] < bParts[i]) return -1;
      }
      return 0;
    };
    
    return compareSemver(current, min) >= 0;
  }
}

// Global instance
export const pluginPackageManager = new PluginPackageManager();
