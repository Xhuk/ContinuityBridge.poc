/**
 * Storage Adapter - Unified interface for deployment package storage
 * 
 * Automatically detects and uses available storage backend:
 * 1. Local Filesystem (Render Disk) - DEFAULT, $0 cost
 * 2. Google Cloud Storage (GCS) - Fallback if configured
 * 3. Azure Blob Storage - Future implementation
 * 
 * Environment Variables:
 * - STORAGE_TYPE: "local" | "gcs" | "azure" (auto-detect if not set)
 * - STORAGE_PATH: "/app/storage" (for local)
 * - GCP_PROJECT_ID, GCS_DEPLOYMENT_BUCKET (for GCS)
 */

import { logger } from "../core/logger.js";
import * as fs from "fs/promises";
import * as path from "path";

const log = logger.child("StorageAdapter");

export interface StorageBackend {
  upload(
    organizationId: string,
    deploymentProfile: string,
    files: { name: string; content: string | Buffer }[]
  ): Promise<{
    downloadUrl: string;
    expiresAt: Date;
    storagePath: string;
    filesUploaded: number;
  }>;

  getDownloadUrls(storagePath: string): Promise<{
    fileName: string;
    downloadUrl: string;
    expiresAt: Date;
  }[]>;

  delete(storagePath: string): Promise<boolean>;

  list(organizationId: string, deploymentProfile?: string): Promise<{
    path: string;
    createdAt: Date;
    profile: string;
  }[]>;

  isConfigured(): boolean;
}

/**
 * Local Filesystem Storage Backend (Render Disk)
 */
class LocalStorageBackend implements StorageBackend {
  private storagePath: string;

  constructor() {
    this.storagePath = process.env.STORAGE_PATH || path.join(process.cwd(), "storage", "deployments");
  }

  async upload(
    organizationId: string,
    deploymentProfile: string,
    files: { name: string; content: string | Buffer }[]
  ): Promise<{
    downloadUrl: string;
    expiresAt: Date;
    storagePath: string;
    filesUploaded: number;
  }> {
    const timestamp = new Date().toISOString().split("T")[0];
    const version = Date.now();
    const folderPath = path.join(
      this.storagePath,
      organizationId,
      deploymentProfile,
      `${timestamp}-v${version}`
    );

    log.info("Uploading to local filesystem", {
      organizationId,
      deploymentProfile,
      folderPath,
      filesCount: files.length,
    });

    // Create directory structure
    await fs.mkdir(folderPath, { recursive: true });

    // Write all files
    for (const file of files) {
      const filePath = path.join(folderPath, file.name);
      const content = Buffer.isBuffer(file.content)
        ? file.content
        : Buffer.from(file.content, "utf-8");

      await fs.writeFile(filePath, content);
      log.debug("File written", { filePath, size: content.length });
    }

    // Create manifest
    const manifestPath = path.join(folderPath, "manifest.json");
    const manifest = {
      organizationId,
      deploymentProfile,
      createdAt: new Date().toISOString(),
      files: files.map((f) => f.name),
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    // For local storage, downloadUrl is a relative path
    // Frontend will use /api/deployments/download/:path
    const relativePath = path.relative(this.storagePath, folderPath);
    const downloadUrl = `/api/deployments/download/${encodeURIComponent(relativePath)}`;
    
    // Local files don't expire
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

    log.info("Files uploaded to local storage", {
      folderPath,
      filesUploaded: files.length,
    });

    return {
      downloadUrl,
      expiresAt,
      storagePath: relativePath,
      filesUploaded: files.length,
    };
  }

  async getDownloadUrls(storagePath: string): Promise<{
    fileName: string;
    downloadUrl: string;
    expiresAt: Date;
  }[]> {
    const fullPath = path.join(this.storagePath, storagePath);
    const files = await fs.readdir(fullPath);

    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    return files.map((fileName) => ({
      fileName,
      downloadUrl: `/api/deployments/download/${encodeURIComponent(storagePath)}/${encodeURIComponent(fileName)}`,
      expiresAt,
    }));
  }

  async delete(storagePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.storagePath, storagePath);
      await fs.rm(fullPath, { recursive: true, force: true });
      log.info("Deployment deleted from local storage", { storagePath });
      return true;
    } catch (error: any) {
      log.error("Failed to delete deployment", error);
      return false;
    }
  }

  async list(organizationId: string, deploymentProfile?: string): Promise<{
    path: string;
    createdAt: Date;
    profile: string;
  }[]> {
    const orgPath = path.join(this.storagePath, organizationId);

    try {
      // Check if org directory exists
      await fs.access(orgPath);
    } catch {
      return [];
    }

    const deployments: { path: string; createdAt: Date; profile: string }[] = [];

    // List profiles
    const profiles = deploymentProfile
      ? [deploymentProfile]
      : await fs.readdir(orgPath);

    for (const profile of profiles) {
      const profilePath = path.join(orgPath, profile);

      try {
        const versions = await fs.readdir(profilePath);

        for (const version of versions) {
          const versionPath = path.join(profilePath, version);
          const stats = await fs.stat(versionPath);

          deployments.push({
            path: path.relative(this.storagePath, versionPath),
            createdAt: stats.birthtime,
            profile,
          });
        }
      } catch {
        continue;
      }
    }

    return deployments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  isConfigured(): boolean {
    // Local storage is always available
    return true;
  }
}

/**
 * GCS Storage Backend (wrapper around existing service)
 */
class GCSStorageBackend implements StorageBackend {
  async upload(
    organizationId: string,
    deploymentProfile: string,
    files: { name: string; content: string | Buffer }[]
  ): Promise<{
    downloadUrl: string;
    expiresAt: Date;
    storagePath: string;
    filesUploaded: number;
  }> {
    // Import dynamically to avoid issues if GCS is not configured
    const { uploadDeploymentPackage } = await import("./deployment-storage-service.js");
    return uploadDeploymentPackage(
      organizationId,
      deploymentProfile as any,
      files
    );
  }

  async getDownloadUrls(storagePath: string): Promise<{
    fileName: string;
    downloadUrl: string;
    expiresAt: Date;
  }[]> {
    const { getDeploymentDownloadUrls } = await import("./deployment-storage-service.js");
    return getDeploymentDownloadUrls(storagePath);
  }

  async delete(storagePath: string): Promise<boolean> {
    const { deleteDeploymentPackage } = await import("./deployment-storage-service.js");
    return deleteDeploymentPackage(storagePath);
  }

  async list(organizationId: string, deploymentProfile?: string): Promise<{
    path: string;
    createdAt: Date;
    profile: string;
  }[]> {
    const { listDeployments } = await import("./deployment-storage-service.js");
    return listDeployments(organizationId, deploymentProfile);
  }

  isConfigured(): boolean {
    return !!(
      process.env.GCP_PROJECT_ID &&
      (process.env.GCP_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS)
    );
  }
}

/**
 * Auto-detect and return appropriate storage backend
 */
export function getStorageBackend(): StorageBackend {
  const storageType = process.env.STORAGE_TYPE;

  // Explicit configuration
  if (storageType === "gcs") {
    const gcs = new GCSStorageBackend();
    if (!gcs.isConfigured()) {
      log.warn("GCS storage requested but not configured, falling back to local");
      return new LocalStorageBackend();
    }
    log.info("Using GCS storage backend");
    return gcs;
  }

  if (storageType === "local") {
    log.info("Using local filesystem storage backend");
    return new LocalStorageBackend();
  }

  // Auto-detect: prefer local, fallback to GCS if configured
  const gcs = new GCSStorageBackend();
  if (gcs.isConfigured()) {
    log.info("Auto-detected: Using GCS storage backend (configured)");
    return gcs;
  }

  log.info("Auto-detected: Using local filesystem storage backend (default)");
  return new LocalStorageBackend();
}

/**
 * Convenience wrapper functions
 */
export async function uploadDeploymentPackage(
  organizationId: string,
  deploymentProfile: "cluster" | "standard" | "standalone" | "kubernetes",
  files: { name: string; content: string | Buffer }[]
): Promise<{
  downloadUrl: string;
  expiresAt: Date;
  storagePath: string;
  filesUploaded: number;
}> {
  const backend = getStorageBackend();
  return backend.upload(organizationId, deploymentProfile, files);
}

export async function getDeploymentDownloadUrls(
  storagePath: string
): Promise<{ fileName: string; downloadUrl: string; expiresAt: Date }[]> {
  const backend = getStorageBackend();
  return backend.getDownloadUrls(storagePath);
}

export async function deleteDeploymentPackage(storagePath: string): Promise<boolean> {
  const backend = getStorageBackend();
  return backend.delete(storagePath);
}

export async function listDeployments(
  organizationId: string,
  deploymentProfile?: string
): Promise<{ path: string; createdAt: Date; profile: string }[]> {
  const backend = getStorageBackend();
  return backend.list(organizationId, deploymentProfile);
}

export function isStorageConfigured(): boolean {
  const backend = getStorageBackend();
  return backend.isConfigured();
}
