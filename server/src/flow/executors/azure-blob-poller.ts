import { NodeExecutor, ExecutionContext, NodeExecutionResult } from "./types";
import { FlowNode } from "@shared/schema";
import { db } from "../../../db";
import { pollerStates } from "../../../schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * Azure Blob Poller Node Executor - Poll Azure container for new blobs
 * 
 * Use Case:
 * - Watch container for customer uploads (PO documents)
 * - Monitor for invoice PDFs from finance system
 * - Detect new data export files
 * 
 * Configuration:
 * - connectionString: Azure Storage connection string
 * - containerName: Container to monitor
 * - blobPrefix: Prefix filter (e.g., "invoices/")
 * - blobPattern: Blob name pattern (e.g., "*.pdf")
 * - pollIntervalMinutes: How often to check (default 5)
 * - trackingMode: "filename" | "etag" - How to detect new blobs
 * 
 * Mock Mode: Returns mock blob detected event
 * Production Mode: Uses @azure/storage-blob for actual polling
 */
export const executeAzureBlobPoller: NodeExecutor = async (
  node: FlowNode,
  input: unknown,
  context: ExecutionContext
): Promise<NodeExecutionResult> => {
  const config = (node as any).config || {};
  const {
    connectionString = "",
    containerName = "",
    blobPrefix = "",
    blobPattern = "*",
    trackingMode = "filename",
  } = config;

  // Validation
  if (!connectionString) {
    throw new Error("Azure Storage connection string is required");
  }
  if (!containerName) {
    throw new Error("Container name is required");
  }

  // Get or create poller state
  let pollerState = await db.select().from(pollerStates)
    .where(and(
      eq(pollerStates.flowId, context.flowId),
      eq(pollerStates.nodeId, node.id)
    )).get();

  if (!pollerState) {
    pollerState = {
      id: randomUUID(),
      flowId: context.flowId,
      nodeId: node.id,
      pollerType: "azure_blob",
      lastFile: null,
      lastProcessedAt: null,
      fileChecksums: [],
      configSnapshot: config,
      enabled: true,
      lastError: null,
      lastErrorAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.insert(pollerStates).values(pollerState).run();
  }

  // MOCK MODE - Simulate blob detection
  if (context.emulationMode) {
    const mockBlobName = `${blobPrefix}invoice_${randomUUID().substring(0, 8)}.pdf`;
    const mockBlobUrl = `https://mockstorageaccount.blob.core.windows.net/${containerName}/${mockBlobName}`;
    const mockBlobContent = `Mock Invoice PDF Content\nInvoice #: INV-${Date.now()}\nAmount: $1,234.56`;
    
    // Update poller state with mock blob
    await db.update(pollerStates).set({
      lastFile: mockBlobName,
      lastProcessedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(pollerStates.id, pollerState.id)).run();

    // Return mock blob detection event
    return {
      output: {
        trigger: "azure_blob_poller",
        blob: {
          name: mockBlobName,
          url: mockBlobUrl,
          content: mockBlobContent,
          size: mockBlobContent.length,
          contentType: "application/pdf",
          lastModified: new Date().toISOString(),
          etag: `"mock-etag-${randomUUID()}"`,
        },
        azure: {
          containerName,
          blobPrefix,
        },
        _metadata: {
          pollerId: node.id,
          trackingMode,
          emulated: true,
        },
      },
      metadata: {
        pollerType: "azure_blob",
        blobDetected: true,
        emulated: true,
      },
    };
  }

  // PRODUCTION MODE - Real Azure Blob polling
  try {
    const { BlobServiceClient } = await import("@azure/storage-blob");
    const { minimatch } = await import("minimatch");
    
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // List blobs with prefix
    const blobs = [];
    for await (const blob of containerClient.listBlobsFlat({ prefix: blobPrefix })) {
      blobs.push(blob);
    }
    
    // Filter by pattern
    const matchingBlobs = blobs.filter(b => minimatch(b.name, blobPattern));
    
    // Filter new blobs based on tracking mode
    let newBlobs = [];
    if (trackingMode === "filename") {
      newBlobs = matchingBlobs.filter(b => 
        !pollerState.fileChecksums?.some(fc => fc.filename === b.name)
      );
    } else if (trackingMode === "etag") {
      newBlobs = matchingBlobs.filter(b => 
        !pollerState.fileChecksums?.some(fc => 
          fc.filename === b.name && fc.checksum === b.properties.etag
        )
      );
    }
    
    if (newBlobs.length === 0) {
      throw new Error("No new blobs detected - stopping execution");
    }
    
    // Process first new blob
    const newBlob = newBlobs[0];
    const blobClient = containerClient.getBlobClient(newBlob.name);
    const downloadResponse = await blobClient.download();
    
    if (!downloadResponse.readableStreamBody) {
      throw new Error("Failed to download blob - no readable stream");
    }
    
    const blobContent = await streamToBuffer(downloadResponse.readableStreamBody);
    
    // Update poller state
    const updatedChecksums = [
      ...(pollerState.fileChecksums || []).slice(-99), // Keep last 100 blobs
      {
        filename: newBlob.name,
        checksum: newBlob.properties.etag || "",
        processedAt: new Date().toISOString(),
      },
    ];
    
    await db.update(pollerStates).set({
      lastFile: newBlob.name,
      lastProcessedAt: new Date().toISOString(),
      fileChecksums: updatedChecksums,
      updatedAt: new Date().toISOString(),
    }).where(eq(pollerStates.id, pollerState.id)).run();
    
    return {
      output: {
        trigger: "azure_blob_poller",
        blob: {
          name: newBlob.name,
          url: blobClient.url,
          content: blobContent.toString(),
          size: newBlob.properties.contentLength,
          contentType: newBlob.properties.contentType,
          lastModified: newBlob.properties.lastModified?.toISOString() || new Date().toISOString(),
          etag: newBlob.properties.etag,
        },
        azure: {
          containerName,
          blobPrefix,
        },
        _metadata: {
          pollerId: node.id,
          trackingMode,
        },
      },
      metadata: {
        pollerType: "azure_blob",
        blobDetected: true,
      },
    };
  } catch (error: any) {
    // If libraries not installed, throw helpful error
    if (error.code === "MODULE_NOT_FOUND" || error.message?.includes("Cannot find module")) {
      throw new Error(
        `Azure Blob Poller requires '@azure/storage-blob' and 'minimatch' packages. ` +
        `Install with: npm install @azure/storage-blob minimatch. ` +
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
    readableStream.on("data", (data) => 
      chunks.push(data instanceof Buffer ? data : Buffer.from(data))
    );
    readableStream.on("end", () => resolve(Buffer.concat(chunks)));
    readableStream.on("error", reject);
  });
}
