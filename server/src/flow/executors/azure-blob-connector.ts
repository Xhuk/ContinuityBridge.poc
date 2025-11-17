import { NodeExecutor, ExecutionContext, NodeExecutionResult } from "./types";
import { FlowNode } from "@shared/schema";
import { randomUUID } from "crypto";

/**
 * Azure Blob Connector Node Executor - Upload/Download blobs to Azure Storage
 * 
 * Use Case:
 * - Upload shipping label PDF to blob storage
 * - Download proof of delivery image
 * - Get public URL for uploaded files
 * 
 * Configuration:
 * - operation: "upload" | "download" | "delete"
 * - connectionString: Azure Storage connection string
 * - containerName: Container name (e.g., "shipping-labels")
 * - blobName: Blob name with templates (e.g., "order_{{order_id}}.pdf")
 * - sourceField: JSONPath to file content in payload (for upload)
 * 
 * Mock Mode: Returns mock blob URL
 * Production Mode: Uses @azure/storage-blob library
 */
export const executeAzureBlobConnector: NodeExecutor = async (
  node: FlowNode,
  input: unknown,
  context: ExecutionContext
): Promise<NodeExecutionResult> => {
  const config = (node as any).config || {};
  const {
    operation = "upload",
    connectionString = "",
    containerName = "",
    blobName = "",
    sourceField = "fileContent",
  } = config;

  // Validation
  if (!connectionString) {
    throw new Error("Azure Storage connection string is required");
  }
  if (!containerName) {
    throw new Error("Container name is required");
  }
  if (!blobName) {
    throw new Error("Blob name is required");
  }

  // Replace template variables in blob name
  // Example: "order_{{order_id}}.pdf" -> "order_12345.pdf"
  const processedBlobName = blobName.replace(/\{\{([^}]+)\}\}/g, (_match: string, path: string) => {
    const value = (input as any)[path] || path;
    return String(value);
  });

  // MOCK MODE - For testing without Azure Storage account
  if (context.emulationMode) {
    const mockBlobUrl = `https://mockstorageaccount.blob.core.windows.net/${containerName}/${processedBlobName}`;
    
    const mockResult = {
      operation,
      blobName: processedBlobName,
      containerName,
      url: mockBlobUrl,
      timestamp: new Date().toISOString(),
      success: true,
      contentLength: operation === "upload" ? 2048 : operation === "download" ? 1024 : 0,
      mockContent: operation === "download" ? "Mock blob content from Azure Storage" : undefined,
    };

    if (operation === "upload") {
      // Return payload with blob URL
      return {
        output: {
          ...input as any,
          blobUrl: mockBlobUrl,
          azureMetadata: mockResult,
        },
        metadata: {
          azureOperation: operation,
          blobUrl: mockBlobUrl,
          emulated: true,
        },
      };
    }

    if (operation === "download") {
      // Add downloaded blob to payload
      return {
        output: {
          ...input as any,
          downloadedBlob: mockResult.mockContent,
          azureMetadata: mockResult,
        },
        metadata: {
          azureOperation: operation,
          emulated: true,
        },
      };
    }

    // Delete operation
    return {
      output: input,
      metadata: {
        azureOperation: operation,
        azureResult: mockResult,
        emulated: true,
      },
    };
  }

  // PRODUCTION MODE - Real Azure Blob operations
  try {
    const { BlobServiceClient } = await import("@azure/storage-blob");
    
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(processedBlobName);
    
    switch (operation) {
      case "upload": {
        const fileContent = (input as any)[sourceField];
        if (!fileContent) {
          throw new Error(`Source field '${sourceField}' not found in payload`);
        }
        const content = typeof fileContent === "string" ? fileContent : JSON.stringify(fileContent);
        await blockBlobClient.upload(content, content.length);
        const uploadUrl = blockBlobClient.url;
        
        return {
          output: { ...input as any, blobUrl: uploadUrl },
          metadata: { azureOperation: "upload", blobUrl: uploadUrl, blobName: processedBlobName },
        };
      }
      
      case "download": {
        const downloadResponse = await blockBlobClient.download();
        if (!downloadResponse.readableStreamBody) {
          throw new Error("Failed to download blob - no readable stream");
        }
        const downloadedContent = await streamToBuffer(downloadResponse.readableStreamBody);
        
        return {
          output: { ...input as any, downloadedBlob: downloadedContent.toString() },
          metadata: { azureOperation: "download", blobName: processedBlobName },
        };
      }
      
      case "delete": {
        await blockBlobClient.delete();
        
        return {
          output: input,
          metadata: { azureOperation: "delete", blobName: processedBlobName },
        };
      }
      
      default:
        throw new Error(`Unsupported Azure Blob operation: ${operation}`);
    }
  } catch (error: any) {
    // If @azure/storage-blob not installed, throw helpful error
    if (error.code === "MODULE_NOT_FOUND" || error.message?.includes("Cannot find module")) {
      throw new Error(
        `Azure Blob Connector requires '@azure/storage-blob' package. ` +
        `Install with: npm install @azure/storage-blob. ` +
        `Use emulation mode for testing without Azure Storage.`
      );
    }
    throw error;
  }
};

// Helper to convert stream to buffer
async function streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on("data", (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on("end", () => resolve(Buffer.concat(chunks)));
    readableStream.on("error", reject);
  });
}
