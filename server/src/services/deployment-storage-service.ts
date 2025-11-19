import { Storage } from "@google-cloud/storage";
import { logger } from "../core/logger.js";
import * as path from "path";

const log = logger.child("DeploymentStorage");

// Initialize Google Cloud Storage client
let storage: Storage | null = null;

function getStorageClient(): Storage {
  if (!storage) {
    // Initialize with service account credentials
    const credentials = process.env.GCP_SERVICE_ACCOUNT_KEY 
      ? JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY)
      : undefined;

    storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID,
      credentials,
    });
  }
  return storage;
}

const BUCKET_NAME = process.env.GCS_DEPLOYMENT_BUCKET || "continuitybridge-deployments";
const LINK_EXPIRY_DAYS = parseInt(process.env.DEPLOYMENT_LINK_EXPIRY_DAYS || "7");
const AUTO_DELETE_DAYS = parseInt(process.env.DEPLOYMENT_AUTO_DELETE_DAYS || "90");

/**
 * Upload deployment package to Google Cloud Storage
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
  try {
    const client = getStorageClient();
    const bucket = client.bucket(BUCKET_NAME);

    // Create folder path: {orgId}/{profile}/{timestamp}/
    const timestamp = new Date().toISOString().split("T")[0];
    const version = new Date().getTime();
    const folderPath = `${organizationId}/${deploymentProfile}/${timestamp}-v${version}`;

    log.info("Uploading deployment package to GCS", {
      organizationId,
      deploymentProfile,
      folderPath,
      filesCount: files.length,
    });

    // Upload each file
    const uploadPromises = files.map(async (file) => {
      const filePath = `${folderPath}/${file.name}`;
      const fileBuffer = Buffer.isBuffer(file.content)
        ? file.content
        : Buffer.from(file.content, "utf-8");

      const blob = bucket.file(filePath);
      
      await blob.save(fileBuffer, {
        metadata: {
          contentType: getContentType(file.name),
          metadata: {
            organizationId,
            deploymentProfile,
            uploadedAt: new Date().toISOString(),
          },
        },
      });

      log.info("File uploaded to GCS", { filePath, size: fileBuffer.length });
      return filePath;
    });

    await Promise.all(uploadPromises);

    // Generate signed URL for the folder (create a manifest file as entry point)
    const manifestFile = `${folderPath}/manifest.json`;
    const manifestBlob = bucket.file(manifestFile);
    
    // Check if manifest exists, if not create a simple one
    const [exists] = await manifestBlob.exists();
    if (!exists) {
      const manifestContent = {
        organizationId,
        deploymentProfile,
        createdAt: new Date().toISOString(),
        files: files.map(f => f.name),
      };
      await manifestBlob.save(JSON.stringify(manifestContent, null, 2));
    }

    // Generate signed URL (expires in X days)
    const expiresAt = new Date(Date.now() + LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    
    const [signedUrl] = await manifestBlob.getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });

    // Set lifecycle policy for auto-deletion
    await setLifecyclePolicy(bucket, AUTO_DELETE_DAYS);

    log.info("Deployment package uploaded successfully", {
      organizationId,
      folderPath,
      filesUploaded: files.length,
      expiresAt,
    });

    return {
      downloadUrl: signedUrl,
      expiresAt,
      storagePath: folderPath,
      filesUploaded: files.length,
    };
  } catch (error: any) {
    log.error("Failed to upload deployment package to GCS", error);
    throw new Error(`GCS upload failed: ${error.message}`);
  }
}

/**
 * Generate signed URLs for all files in a deployment
 */
export async function getDeploymentDownloadUrls(
  storagePath: string
): Promise<{ fileName: string; downloadUrl: string; expiresAt: Date }[]> {
  try {
    const client = getStorageClient();
    const bucket = client.bucket(BUCKET_NAME);

    // List all files in the folder
    const [files] = await bucket.getFiles({ prefix: storagePath });

    const expiresAt = new Date(Date.now() + LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Generate signed URL for each file
    const urlPromises = files.map(async (file) => {
      const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: expiresAt,
      });

      return {
        fileName: path.basename(file.name),
        downloadUrl: signedUrl,
        expiresAt,
      };
    });

    const urls = await Promise.all(urlPromises);

    log.info("Generated signed URLs for deployment", {
      storagePath,
      filesCount: urls.length,
    });

    return urls;
  } catch (error: any) {
    log.error("Failed to generate download URLs", error);
    throw new Error(`Failed to get download URLs: ${error.message}`);
  }
}

/**
 * Delete deployment package from storage
 */
export async function deleteDeploymentPackage(storagePath: string): Promise<boolean> {
  try {
    const client = getStorageClient();
    const bucket = client.bucket(BUCKET_NAME);

    // Delete all files in the folder
    await bucket.deleteFiles({ prefix: storagePath });

    log.info("Deployment package deleted from GCS", { storagePath });

    return true;
  } catch (error: any) {
    log.error("Failed to delete deployment package", error);
    return false;
  }
}

/**
 * List all deployments for an organization
 */
export async function listDeployments(
  organizationId: string,
  deploymentProfile?: string
): Promise<{ path: string; createdAt: Date; profile: string }[]> {
  try {
    const client = getStorageClient();
    const bucket = client.bucket(BUCKET_NAME);

    const prefix = deploymentProfile
      ? `${organizationId}/${deploymentProfile}/`
      : `${organizationId}/`;

    const [files] = await bucket.getFiles({ 
      prefix,
      delimiter: "/",
    });

    // Group by deployment folder
    const deployments = new Map<string, Date>();

    for (const file of files) {
      const parts = file.name.split("/");
      if (parts.length >= 3) {
        const deploymentPath = parts.slice(0, 3).join("/");
        
        if (!deployments.has(deploymentPath)) {
          const metadata = file.metadata;
          const createdAt = metadata.timeCreated 
            ? new Date(metadata.timeCreated)
            : new Date();
          
          deployments.set(deploymentPath, createdAt);
        }
      }
    }

    const result = Array.from(deployments.entries()).map(([path, createdAt]) => ({
      path,
      createdAt,
      profile: path.split("/")[1],
    }));

    log.info("Listed deployments for organization", {
      organizationId,
      count: result.length,
    });

    return result;
  } catch (error: any) {
    log.error("Failed to list deployments", error);
    return [];
  }
}

/**
 * Set lifecycle policy for automatic deletion of old files
 */
async function setLifecyclePolicy(bucket: any, deleteAfterDays: number): Promise<void> {
  try {
    const [metadata] = await bucket.getMetadata();
    
    // Check if lifecycle rule already exists
    const existingRules = metadata.lifecycle?.rule || [];
    const hasDeleteRule = existingRules.some((rule: any) => 
      rule.action?.type === "Delete" && rule.condition?.age === deleteAfterDays
    );

    if (!hasDeleteRule) {
      await bucket.setMetadata({
        lifecycle: {
          rule: [
            ...existingRules,
            {
              action: { type: "Delete" },
              condition: { age: deleteAfterDays },
            },
          ],
        },
      });

      log.info("Lifecycle policy set for bucket", {
        bucket: bucket.name,
        deleteAfterDays,
      });
    }
  } catch (error: any) {
    log.warn("Failed to set lifecycle policy (non-critical)", error);
  }
}

/**
 * Get content type based on file extension
 */
function getContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  
  const contentTypes: Record<string, string> = {
    ".yml": "text/yaml",
    ".yaml": "text/yaml",
    ".json": "application/json",
    ".sh": "application/x-sh",
    ".env": "text/plain",
    ".md": "text/markdown",
    ".txt": "text/plain",
  };

  return contentTypes[ext] || "application/octet-stream";
}

/**
 * Check if GCS is properly configured
 */
export function isStorageConfigured(): boolean {
  return !!(
    process.env.GCP_PROJECT_ID &&
    (process.env.GCP_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS)
  );
}
