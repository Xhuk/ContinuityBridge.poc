/**
 * Layered Storage Service - Inheritance & Override System
 * 
 * Implements a 3-layer architecture for deployment packages:
 * 
 * Layer 1 (BASE):     Foundation/Core standard product files (read-only fallback)
 * Layer 2 (CUSTOM):   Customer-specific customizations/add-ons (high priority)
 * Layer 3 (RUNTIME):  Consolidated view (BASE + CUSTOM with validations)
 * Layer 4 (REWORK):   Failed validations requiring consultant intervention
 * 
 * Override Rules:
 * - If file exists in CUSTOM and BASE → Use CUSTOM (override)
 * - If file exists only in BASE → Use BASE (default)
 * - If file exists only in CUSTOM → Use CUSTOM (add-on)
 * - If file is corrupted/invalid → Move to REWORK, alert consultant
 * 
 * Formula: Runtime = Custom ∪ (Base - Custom)
 */

import { logger } from "../core/logger.js";
import * as fs from "fs/promises";
import * as path from "path";
import { getStorageBackend } from "./storage-adapter.js";

const log = logger.child("LayeredStorage");

export interface LayeredStorageConfig {
  organizationId: string;
  deploymentProfile: "standalone" | "standard" | "cluster" | "kubernetes";
  
  // Storage paths
  basePath?: string;      // Default: Foundation/Core/DEV/customer/base
  customPath?: string;    // Default: /customer/customadhoc
  runtimePath?: string;   // Default: /customer/runtime
  reworkPath?: string;    // Default: /customer/rework_required
}

export interface MergeResult {
  success: boolean;
  runtimePath: string;
  filesProcessed: number;
  filesFromBase: number;
  filesFromCustom: number;
  filesOverridden: number;
  filesFailed: number;
  failedFiles: {
    fileName: string;
    reason: string;
    movedToRework: boolean;
  }[];
  warnings: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Layered Storage Service
 */
export class LayeredStorageService {
  private config: LayeredStorageConfig;
  private storagePath: string;

  constructor(config: LayeredStorageConfig) {
    this.config = config;
    this.storagePath = process.env.STORAGE_PATH || path.join(process.cwd(), "storage");
  }

  /**
   * Merge BASE + CUSTOM layers into RUNTIME
   * 
   * This is the core override logic implementing:
   * Runtime = Custom ∪ (Base - Custom)
   */
  async mergeLayersToRuntime(): Promise<MergeResult> {
    const {
      organizationId,
      deploymentProfile,
      basePath = path.join(this.storagePath, "Foundation", "Core", "DEV", "customer", "base"),
      customPath = path.join(this.storagePath, organizationId, "customadhoc"),
      runtimePath = path.join(this.storagePath, organizationId, "runtime"),
      reworkPath = path.join(this.storagePath, organizationId, "rework_required"),
    } = this.config;

    log.info("Starting layer merge", {
      organizationId,
      deploymentProfile,
      basePath,
      customPath,
      runtimePath,
    });

    const result: MergeResult = {
      success: true,
      runtimePath,
      filesProcessed: 0,
      filesFromBase: 0,
      filesFromCustom: 0,
      filesOverridden: 0,
      filesFailed: 0,
      failedFiles: [],
      warnings: [],
    };

    try {
      // Ensure directories exist
      await fs.mkdir(runtimePath, { recursive: true });
      await fs.mkdir(reworkPath, { recursive: true });

      // Clear previous runtime (fresh build)
      await this.clearDirectory(runtimePath);

      // Get all files from both layers
      const baseFiles = await this.listFilesRecursive(basePath);
      const customFiles = await this.listFilesRecursive(customPath);

      log.info("Files discovered", {
        baseCount: baseFiles.length,
        customCount: customFiles.length,
      });

      // Build file index
      const baseIndex = new Map(baseFiles.map((f) => [f.relativePath, f]));
      const customIndex = new Map(customFiles.map((f) => [f.relativePath, f]));

      // Get all unique file paths
      const allPaths = new Set([...baseIndex.keys(), ...customIndex.keys()]);

      // Process each file
      for (const filePath of allPaths) {
        const hasBase = baseIndex.has(filePath);
        const hasCustom = customIndex.has(filePath);

        try {
          if (hasCustom && hasBase) {
            // CASE 1: OVERRIDE - Custom wins
            await this.processFile(
              customIndex.get(filePath)!,
              runtimePath,
              "custom",
              result
            );
            result.filesOverridden++;
            log.debug(`Override: ${filePath} (custom wins)`);
          } else if (hasCustom) {
            // CASE 2: ADD-ON - Only in custom
            await this.processFile(
              customIndex.get(filePath)!,
              runtimePath,
              "custom",
              result
            );
            log.debug(`Add-on: ${filePath} (custom only)`);
          } else if (hasBase) {
            // CASE 3: DEFAULT - Only in base
            await this.processFile(
              baseIndex.get(filePath)!,
              runtimePath,
              "base",
              result
            );
            log.debug(`Default: ${filePath} (base only)`);
          }

          result.filesProcessed++;
        } catch (error: any) {
          // CASE 4: VALIDATION FAILED - Move to rework
          await this.handleFailedFile(
            filePath,
            hasCustom ? customIndex.get(filePath)! : baseIndex.get(filePath)!,
            reworkPath,
            error.message,
            result
          );
        }
      }

      // Generate runtime manifest
      await this.generateRuntimeManifest(runtimePath, result);

      log.info("Layer merge completed", {
        filesProcessed: result.filesProcessed,
        filesFromBase: result.filesFromBase,
        filesFromCustom: result.filesFromCustom,
        filesOverridden: result.filesOverridden,
        filesFailed: result.filesFailed,
      });

      return result;
    } catch (error: any) {
      log.error("Layer merge failed", error);
      result.success = false;
      result.warnings.push(`Critical error: ${error.message}`);
      return result;
    }
  }

  /**
   * Process a single file (copy + validate)
   */
  private async processFile(
    fileInfo: { fullPath: string; relativePath: string },
    targetBasePath: string,
    source: "base" | "custom",
    result: MergeResult
  ): Promise<void> {
    const targetPath = path.join(targetBasePath, fileInfo.relativePath);
    
    // Read file
    const content = await fs.readFile(fileInfo.fullPath);

    // Validate file
    const validation = await this.validateFile(fileInfo.relativePath, content);
    if (!validation.isValid) {
      throw new Error(validation.errors.join("; "));
    }

    // Create target directory
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Copy file
    await fs.writeFile(targetPath, content);

    // Update stats
    if (source === "base") {
      result.filesFromBase++;
    } else {
      result.filesFromCustom++;
    }
  }

  /**
   * Handle failed file (move to rework)
   */
  private async handleFailedFile(
    fileName: string,
    fileInfo: { fullPath: string; relativePath: string },
    reworkPath: string,
    reason: string,
    result: MergeResult
  ): Promise<void> {
    log.warn("File validation failed", { fileName, reason });

    result.filesFailed++;
    result.failedFiles.push({
      fileName,
      reason,
      movedToRework: false,
    });

    try {
      // Move to rework folder
      const reworkTarget = path.join(reworkPath, fileInfo.relativePath);
      await fs.mkdir(path.dirname(reworkTarget), { recursive: true });
      await fs.copyFile(fileInfo.fullPath, reworkTarget);

      // Create error report
      const errorReport = {
        fileName,
        originalPath: fileInfo.fullPath,
        reason,
        timestamp: new Date().toISOString(),
      };
      await fs.writeFile(
        `${reworkTarget}.error.json`,
        JSON.stringify(errorReport, null, 2)
      );

      result.failedFiles[result.failedFiles.length - 1].movedToRework = true;
      
      log.info("File moved to rework", { fileName, reworkTarget });
    } catch (error: any) {
      log.error("Failed to move file to rework", { fileName, error: error.message });
    }
  }

  /**
   * Validate file integrity
   */
  private async validateFile(
    fileName: string,
    content: Buffer
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    // Empty file check
    if (content.length === 0) {
      errors.push("File is empty");
    }

    // JSON validation
    if (fileName.endsWith(".json")) {
      try {
        JSON.parse(content.toString("utf-8"));
      } catch (e: any) {
        errors.push(`Invalid JSON: ${e.message}`);
      }
    }

    // YAML validation (docker-compose, k8s manifests)
    if (fileName.endsWith(".yml") || fileName.endsWith(".yaml")) {
      const text = content.toString("utf-8");
      if (!text.trim()) {
        errors.push("YAML file is empty");
      }
      // Basic YAML structure check
      if (!text.includes(":")) {
        errors.push("Invalid YAML structure (no key-value pairs)");
      }
    }

    // Environment file validation
    if (fileName === ".env" || fileName.endsWith(".env")) {
      const text = content.toString("utf-8");
      const lines = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
      
      for (const line of lines) {
        if (!line.includes("=")) {
          errors.push(`Invalid env line: ${line.substring(0, 50)}`);
        }
      }
    }

    // SQL file validation
    if (fileName.endsWith(".sql")) {
      const text = content.toString("utf-8");
      if (!text.trim()) {
        errors.push("SQL file is empty");
      }
    }

    // Dockerfile validation
    if (fileName === "Dockerfile" || fileName.endsWith(".dockerfile")) {
      const text = content.toString("utf-8");
      if (!text.includes("FROM")) {
        errors.push("Dockerfile missing FROM instruction");
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * List all files recursively in a directory
   */
  private async listFilesRecursive(
    dirPath: string,
    basePath: string = dirPath
  ): Promise<{ fullPath: string; relativePath: string }[]> {
    const files: { fullPath: string; relativePath: string }[] = [];

    try {
      await fs.access(dirPath);
    } catch {
      // Directory doesn't exist
      return [];
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectory
        const subFiles = await this.listFilesRecursive(fullPath, basePath);
        files.push(...subFiles);
      } else {
        // Add file
        files.push({
          fullPath,
          relativePath: path.relative(basePath, fullPath),
        });
      }
    }

    return files;
  }

  /**
   * Clear directory (but keep the directory itself)
   */
  private async clearDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath);
      for (const entry of entries) {
        await fs.rm(path.join(dirPath, entry), { recursive: true, force: true });
      }
    } catch {
      // Directory doesn't exist, no need to clear
    }
  }

  /**
   * Generate runtime manifest (tracks what was merged)
   */
  private async generateRuntimeManifest(
    runtimePath: string,
    result: MergeResult
  ): Promise<void> {
    const manifest = {
      generatedAt: new Date().toISOString(),
      organizationId: this.config.organizationId,
      deploymentProfile: this.config.deploymentProfile,
      summary: {
        filesProcessed: result.filesProcessed,
        filesFromBase: result.filesFromBase,
        filesFromCustom: result.filesFromCustom,
        filesOverridden: result.filesOverridden,
        filesFailed: result.filesFailed,
      },
      failedFiles: result.failedFiles,
      warnings: result.warnings,
    };

    await fs.writeFile(
      path.join(runtimePath, "RUNTIME_MANIFEST.json"),
      JSON.stringify(manifest, null, 2)
    );
  }

  /**
   * Get runtime deployment package
   * Returns path to consolidated runtime folder
   */
  async getRuntimePackage(): Promise<string> {
    const runtimePath = path.join(
      this.storagePath,
      this.config.organizationId,
      "runtime"
    );
    
    // Check if runtime exists
    try {
      await fs.access(runtimePath);
      return runtimePath;
    } catch {
      throw new Error("Runtime package not found. Run mergeLayersToRuntime() first.");
    }
  }

  /**
   * List files in rework (requiring consultant attention)
   */
  async listReworkFiles(): Promise<{
    fileName: string;
    reason: string;
    timestamp: string;
  }[]> {
    const reworkPath = path.join(
      this.storagePath,
      this.config.organizationId,
      "rework_required"
    );

    const reworkFiles: {
      fileName: string;
      reason: string;
      timestamp: string;
    }[] = [];

    try {
      const files = await this.listFilesRecursive(reworkPath);
      
      for (const file of files) {
        if (file.relativePath.endsWith(".error.json")) {
          const errorReport = JSON.parse(
            await fs.readFile(file.fullPath, "utf-8")
          );
          reworkFiles.push({
            fileName: errorReport.fileName,
            reason: errorReport.reason,
            timestamp: errorReport.timestamp,
          });
        }
      }

      return reworkFiles;
    } catch {
      return [];
    }
  }
}

/**
 * Convenience function to merge layers for an organization
 */
export async function mergeDeploymentLayers(
  organizationId: string,
  deploymentProfile: "standalone" | "standard" | "cluster" | "kubernetes"
): Promise<MergeResult> {
  const service = new LayeredStorageService({
    organizationId,
    deploymentProfile,
  });

  return service.mergeLayersToRuntime();
}
