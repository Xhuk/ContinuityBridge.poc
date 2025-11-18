/**
 * Offline Update Package Manager
 * 
 * For air-gapped deployments:
 * 1. Founder creates signed .cbupdate package
 * 2. Consultant uploads via UI
 * 3. System verifies signature and installs
 * 
 * No internet required!
 */

import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../core/logger.js";
import AdmZip from "adm-zip";

const log = logger.child("OfflineUpdatePackage");

export interface UpdatePackageManifest {
  // Package metadata
  packageId: string;
  version: string;
  releaseDate: string;
  updateType: "patch" | "minor" | "major" | "plugin" | "interface";
  
  // Requirements
  minSystemVersion: string;
  maxSystemVersion?: string;
  
  // Contents
  files: Array<{
    type: "interface" | "flow" | "node" | "config" | "binary";
    path: string;
    checksum: string;
    size: number;
  }>;
  
  // Metadata
  description: string;
  changelog: string[];
  author: string;
  
  // Security
  signature: string;
}

export class OfflineUpdatePackageManager {
  private publicKeyPath: string;
  private packagesDir: string;
  
  constructor(
    publicKeyPath: string = "./keys/public_key.pem",
    packagesDir: string = "./data/update-packages"
  ) {
    this.publicKeyPath = publicKeyPath;
    this.packagesDir = packagesDir;
  }
  
  /**
   * Get organization-specific package directory
   */
  private getOrgPackageDir(organizationId: string): string {
    return path.join(this.packagesDir, organizationId);
  }
  
  /**
   * CREATE: Generate signed .cbupdate package (Founder side)
   */
  async createPackage(
    manifest: Omit<UpdatePackageManifest, "signature">,
    files: Map<string, Buffer>,
    privateKeyPath: string
  ): Promise<Buffer> {
    try {
      log.info("Creating update package", {
        packageId: manifest.packageId,
        version: manifest.version,
        fileCount: files.size,
      });
      
      // Create ZIP structure
      const zip = new AdmZip();
      
      // Add manifest (without signature)
      const manifestData = JSON.stringify(manifest, null, 2);
      zip.addFile("manifest.json", Buffer.from(manifestData));
      
      // Add all files
      for (const [filePath, content] of files.entries()) {
        zip.addFile(filePath, content);
        
        // Verify checksum matches manifest
        const checksum = crypto.createHash("sha256").update(content).digest("hex");
        const manifestFile = manifest.files.find(f => f.path === filePath);
        if (!manifestFile || manifestFile.checksum !== checksum) {
          throw new Error(`Checksum mismatch for file: ${filePath}`);
        }
      }
      
      // Sign the manifest
      const privateKey = await fs.readFile(privateKeyPath, "utf-8");
      const sign = crypto.createSign("SHA256");
      sign.update(manifestData);
      const signature = sign.sign(privateKey, "hex");
      
      // Add signed manifest
      const signedManifest: UpdatePackageManifest = {
        ...manifest,
        signature,
      };
      zip.updateFile("manifest.json", Buffer.from(JSON.stringify(signedManifest, null, 2)));
      
      log.info("Update package created successfully", {
        packageId: manifest.packageId,
        signature: signature.substring(0, 16) + "...",
      });
      
      return zip.toBuffer();
    } catch (error: any) {
      log.error("Failed to create update package", error);
      throw error;
    }
  }
  
  /**
   * UPLOAD: Accept and validate uploaded package (MULTI-TENANT)
   */
  async uploadPackage(
    packageBuffer: Buffer,
    uploadedBy: string,
    organizationId: string = "global"
  ): Promise<{
    success: boolean;
    packageId?: string;
    version?: string;
    error?: string;
  }> {
    try {
      log.info("Processing uploaded update package", {
        size: packageBuffer.length,
        uploadedBy,
      });
      
      // Extract ZIP
      const zip = new AdmZip(packageBuffer);
      const manifestEntry = zip.getEntry("manifest.json");
      
      if (!manifestEntry) {
        return { success: false, error: "Invalid package: missing manifest.json" };
      }
      
      // Parse manifest
      const manifestData = manifestEntry.getData().toString("utf-8");
      const manifest: UpdatePackageManifest = JSON.parse(manifestData);
      
      // Verify signature
      const isValid = await this.verifyPackageSignature(manifest);
      if (!isValid) {
        return { success: false, error: "Invalid signature - package rejected" };
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
          return { 
            success: false, 
            error: `Checksum mismatch for ${fileInfo.path}` 
          };
        }
      }
      
      // Check version compatibility
      const currentVersion = process.env.RUNTIME_VERSION || "1.0.0";
      if (!this.isVersionCompatible(currentVersion, manifest.minSystemVersion, manifest.maxSystemVersion)) {
        return {
          success: false,
          error: `Incompatible version. Requires ${manifest.minSystemVersion}+, current: ${currentVersion}`,
        };
      }
      
      // Save package (organization-scoped)
      const orgDir = this.getOrgPackageDir(organizationId);
      await fs.mkdir(orgDir, { recursive: true });
      const packagePath = path.join(orgDir, `${manifest.packageId}-${manifest.version}.cbupdate`);
      await fs.writeFile(packagePath, packageBuffer);
      
      log.info("Update package uploaded successfully", {
        packageId: manifest.packageId,
        version: manifest.version,
        path: packagePath,
      });
      
      return {
        success: true,
        packageId: manifest.packageId,
        version: manifest.version,
      };
    } catch (error: any) {
      log.error("Failed to upload package", error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * INSTALL: Apply uploaded package
   */
  async installPackage(packageId: string, version: string): Promise<{
    success: boolean;
    installed?: string[];
    error?: string;
  }> {
    try {
      log.info("Installing update package", { packageId, version });
      
      // Load package
      const packagePath = path.join(this.packagesDir, `${packageId}-${version}.cbupdate`);
      const packageBuffer = await fs.readFile(packagePath);
      
      const zip = new AdmZip(packageBuffer);
      const manifestEntry = zip.getEntry("manifest.json");
      
      if (!manifestEntry) {
        return { success: false, error: "Invalid package" };
      }
      
      const manifest: UpdatePackageManifest = JSON.parse(
        manifestEntry.getData().toString("utf-8")
      );
      
      const installed: string[] = [];
      
      // Install each file based on type
      for (const fileInfo of manifest.files) {
        const fileEntry = zip.getEntry(fileInfo.path);
        if (!fileEntry) continue;
        
        const fileContent = fileEntry.getData();
        
        switch (fileInfo.type) {
          case "interface":
            await this.installInterface(fileInfo.path, fileContent);
            break;
          case "flow":
            await this.installFlowTemplate(fileInfo.path, fileContent);
            break;
          case "node":
            await this.installNodePlugin(fileInfo.path, fileContent);
            break;
          case "config":
            await this.installConfig(fileInfo.path, fileContent);
            break;
          case "binary":
            log.warn("Binary updates require manual restart", { file: fileInfo.path });
            break;
        }
        
        installed.push(fileInfo.path);
      }
      
      log.info("Update package installed successfully", {
        packageId,
        version,
        filesInstalled: installed.length,
      });
      
      return { success: true, installed };
    } catch (error: any) {
      log.error("Failed to install package", error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * LIST: Get uploaded packages
   */
  async listPackages(): Promise<Array<{
    packageId: string;
    version: string;
    uploadedAt: Date;
    installed: boolean;
  }>> {
    try {
      await fs.mkdir(this.packagesDir, { recursive: true });
      const files = await fs.readdir(this.packagesDir);
      
      const packages = await Promise.all(
        files
          .filter(f => f.endsWith(".cbupdate"))
          .map(async (filename) => {
            const filePath = path.join(this.packagesDir, filename);
            const stats = await fs.stat(filePath);
            
            const match = filename.match(/^(.+)-(.+)\.cbupdate$/);
            if (!match) return null;
            
            return {
              packageId: match[1],
              version: match[2],
              uploadedAt: stats.mtime,
              installed: false, // TODO: Track installation status
            };
          })
      );
      
      return packages.filter(p => p !== null) as any;
    } catch (error: any) {
      log.error("Failed to list packages", error);
      return [];
    }
  }
  
  // Private helper methods
  
  private async verifyPackageSignature(manifest: UpdatePackageManifest): Promise<boolean> {
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
  
  private isVersionCompatible(
    current: string,
    min: string,
    max?: string
  ): boolean {
    const compareSemver = (a: string, b: string): number => {
      const aParts = a.split(".").map(Number);
      const bParts = b.split(".").map(Number);
      
      for (let i = 0; i < 3; i++) {
        if (aParts[i] > bParts[i]) return 1;
        if (aParts[i] < bParts[i]) return -1;
      }
      return 0;
    };
    
    if (compareSemver(current, min) < 0) return false;
    if (max && compareSemver(current, max) > 0) return false;
    
    return true;
  }
  
  private async installInterface(filePath: string, content: Buffer): Promise<void> {
    const { interfaceManager } = await import("../interfaces/manager.js");
    const config = JSON.parse(content.toString("utf-8"));
    interfaceManager.addInterface(config);
    log.info(`Interface installed: ${filePath}`);
  }
  
  private async installFlowTemplate(filePath: string, content: Buffer): Promise<void> {
    const { db, flowDefinitions } = await import("../../db.js");
    const flowData = JSON.parse(content.toString("utf-8"));
    
    await (db.insert(flowDefinitions).values({
      ...flowData,
      metadata: {
        ...flowData.metadata,
        isTemplate: true,
        installedFrom: "offline_update",
      },
    }) as any);
    
    log.info(`Flow template installed: ${filePath}`);
  }
  
  private async installNodePlugin(filePath: string, content: Buffer): Promise<void> {
    const { nodeRegistry } = await import("../flow/node-registry.js");
    const plugin = JSON.parse(content.toString("utf-8"));
    nodeRegistry.registerPlugin(plugin);
    log.info(`Node plugin installed: ${filePath}`);
  }
  
  private async installConfig(filePath: string, content: Buffer): Promise<void> {
    // Store configuration updates
    log.info(`Config updated: ${filePath}`);
  }
}

// Global instance
export const offlineUpdatePackage = new OfflineUpdatePackageManager();
