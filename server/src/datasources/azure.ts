import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { createHash } from "crypto";
import type { AzureBlobConfig, DataSourceSecret } from "@shared/schema.js";
import type { DataSourceAdapter, PullResult, PulledFile, TestConnectionResult } from "./types.js";
import { logger } from "../core/logger.js";

const log = logger.child("AzureBlobSource");

export class AzureBlobSource implements DataSourceAdapter {
  config: AzureBlobConfig;
  secret: DataSourceSecret;
  private containerClient?: ContainerClient;

  constructor(config: AzureBlobConfig, secret: DataSourceSecret) {
    this.config = config;
    this.secret = secret;
  }

  private async getContainerClient(): Promise<ContainerClient> {
    if (this.containerClient) {
      return this.containerClient;
    }

    if (this.config.connectionType === "connectionString") {
      if (!this.secret.connectionString) {
        throw new Error("Connection string is required");
      }
      if (!this.config.containerName) {
        throw new Error("Container name is required for connection string mode");
      }
      
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        this.secret.connectionString
      );
      this.containerClient = blobServiceClient.getContainerClient(this.config.containerName);
    } else if (this.config.connectionType === "http") {
      if (!this.secret.httpUrl) {
        throw new Error("HTTP URL is required for HTTP mode");
      }
      
      // Use the full URL including SAS token and query parameters
      // The URL should be in the format: https://account.blob.core.windows.net/container?sas_token
      this.containerClient = new ContainerClient(this.secret.httpUrl);
    }

    if (!this.containerClient) {
      throw new Error("Failed to initialize container client");
    }

    return this.containerClient;
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const containerClient = await this.getContainerClient();
      const exists = await containerClient.exists();
      
      if (!exists) {
        return {
          success: false,
          message: "Container not found",
          error: "The specified container does not exist",
        };
      }

      let count = 0;
      for await (const blob of containerClient.listBlobsFlat({ prefix: this.config.blobPrefix })) {
        count++;
        if (count >= 10) break; // Just count first 10
      }
      
      return {
        success: true,
        message: `Connected successfully. Found ${count}+ blobs with prefix '${this.config.blobPrefix}'`,
      };
    } catch (error: any) {
      log.error("Connection test failed", error);
      return {
        success: false,
        message: "Connection failed",
        error: error.message,
      };
    }
  }

  async fetchFiles(): Promise<PullResult> {
    try {
      const containerClient = await this.getContainerClient();
      const files: PulledFile[] = [];
      
      // Filter files by pattern (simple wildcard matching)
      const pattern = this.config.filePattern.replace("*", ".*");
      const regex = new RegExp(`^${pattern}$`);
      
      for await (const blob of containerClient.listBlobsFlat({ prefix: this.config.blobPrefix })) {
        const fileName = blob.name.split("/").pop() || blob.name;
        
        if (regex.test(fileName)) {
          const blobClient = containerClient.getBlobClient(blob.name);
          const downloadResponse = await blobClient.download();
          
          if (!downloadResponse.readableStreamBody) {
            log.warn(`No content for blob: ${blob.name}`);
            continue;
          }

          const content = await streamToString(downloadResponse.readableStreamBody);
          const hash = createHash("md5").update(content).digest("hex");
          
          files.push({
            fileName: blob.name,
            content,
            size: blob.properties.contentLength || 0,
            hash,
          });
          
          log.info(`Pulled blob: ${blob.name} (${blob.properties.contentLength} bytes)`);
        }
      }
      
      return {
        success: true,
        files,
      };
    } catch (error: any) {
      log.error("File fetch failed", error);
      return {
        success: false,
        files: [],
        error: error.message,
      };
    }
  }

  async disconnect(): Promise<void> {
    // Azure SDK doesn't require explicit disconnect
    this.containerClient = undefined;
    log.info("Azure Blob client disconnected");
  }
}

async function streamToString(
  readableStream: NodeJS.ReadableStream
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on("data", (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    readableStream.on("error", reject);
  });
}
