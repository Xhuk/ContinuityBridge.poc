import { NodeExecutor, ExecutionContext, NodeExecutionResult } from "./types";
import { FlowNode } from "@shared/schema";
import { db } from "../../../db";
import { pollerStates } from "../../../schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * SFTP Poller Node Executor - Poll SFTP directory for new files
 * 
 * Use Case:
 * - Watch WMS SFTP folder for shipping label PDFs
 * - Detect new order files from supplier
 * - Trigger flow when new file appears
 * 
 * Configuration:
 * - sftpHost: SFTP server hostname
 * - sftpPort: Port (default 22)
 * - sftpUsername: Authentication username
 * - sftpPassword: Authentication password
 * - remotePath: Directory to watch (e.g., "/outbound/labels")
 * - filePattern: File glob pattern (e.g., "*.pdf", "order_*.xml")
 * - pollIntervalMinutes: How often to check (default 5)
 * - trackingMode: "filename" | "checksum" - How to detect new files
 * 
 * Mock Mode: Returns mock file detected event
 * Production Mode: Uses ssh2-sftp-client for actual polling
 */
export const executeSftpPoller: NodeExecutor = async (
  node: FlowNode,
  input: unknown,
  context: ExecutionContext
): Promise<NodeExecutionResult> => {
  const config = (node as any).config || {};
  const {
    sftpHost = "",
    sftpPort = 22,
    sftpUsername = "",
    remotePath = "",
    filePattern = "*",
    trackingMode = "filename",
  } = config;

  // Validation
  if (!sftpHost) {
    throw new Error("SFTP host is required");
  }
  if (!remotePath) {
    throw new Error("Remote path is required");
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
      pollerType: "sftp",
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

  // MOCK MODE - Simulate file detection
  if (context.emulationMode) {
    const mockFileName = `shipping_label_${randomUUID().substring(0, 8)}.pdf`;
    const mockFileContent = `Mock PDF content for WMS shipping label\nOrder ID: 12345\nTracking: UPS123456789`;
    
    // Update poller state with mock file
    await db.update(pollerStates).set({
      lastFile: mockFileName,
      lastProcessedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(pollerStates.id, pollerState.id)).run();

    // Return mock file detection event
    return {
      output: {
        trigger: "sftp_poller",
        file: {
          name: mockFileName,
          path: `${remotePath}/${mockFileName}`,
          content: mockFileContent,
          size: mockFileContent.length,
          modifiedAt: new Date().toISOString(),
        },
        sftp: {
          host: sftpHost,
          port: sftpPort,
          remotePath,
        },
        _metadata: {
          pollerId: node.id,
          trackingMode,
          emulated: true,
        },
      },
      metadata: {
        pollerType: "sftp",
        fileDetected: true,
        emulated: true,
      },
    };
  }

  // PRODUCTION MODE - Real SFTP polling
  try {
    const SftpClient = (await import("ssh2-sftp-client")).default;
    const minimatch = (await import("minimatch")).default;
    const crypto = await import("crypto");
    
    const sftp = new SftpClient();
    await sftp.connect({
      host: sftpHost,
      port: sftpPort,
      username: sftpUsername,
      password: sftpPassword,
    });
    
    try {
      const files = await sftp.list(remotePath);
      const matchingFiles = files.filter(f => minimatch(f.name, filePattern));
      
      // Filter new files based on tracking mode
      let newFiles = [];
      if (trackingMode === "filename") {
        newFiles = matchingFiles.filter(f => 
          !pollerState.fileChecksums?.some(fc => fc.filename === f.name)
        );
      } else {
        // checksum mode - download and hash files
        for (const file of matchingFiles) {
          const fullPath = `${remotePath}/${file.name}`.replace(/\/\//g, "/");
          const buffer = await sftp.get(fullPath);
          const hash = crypto.createHash("sha256").update(buffer).digest("hex");
          
          const existingChecksum = pollerState.fileChecksums?.find(fc => fc.filename === file.name);
          if (!existingChecksum || existingChecksum.checksum !== hash) {
            newFiles.push({ ...file, checksum: hash });
          }
        }
      }
      
      if (newFiles.length === 0) {
        throw new Error("No new files detected - stopping execution");
      }
      
      // Process first new file
      const newFile = newFiles[0];
      const fullPath = `${remotePath}/${newFile.name}`.replace(/\/\//g, "/");
      const fileBuffer = await sftp.get(fullPath);
      const fileContent = fileBuffer.toString();
      
      // Calculate checksum if not already done
      const checksum = (newFile as any).checksum || 
        crypto.createHash("sha256").update(fileBuffer).digest("hex");
      
      // Update poller state
      const updatedChecksums = [
        ...(pollerState.fileChecksums || []).slice(-99), // Keep last 100 files
        {
          filename: newFile.name,
          checksum,
          processedAt: new Date().toISOString(),
        },
      ];
      
      await db.update(pollerStates).set({
        lastFile: newFile.name,
        lastProcessedAt: new Date().toISOString(),
        fileChecksums: updatedChecksums,
        updatedAt: new Date().toISOString(),
      }).where(eq(pollerStates.id, pollerState.id)).run();
      
      return {
        output: {
          trigger: "sftp_poller",
          file: {
            name: newFile.name,
            path: fullPath,
            content: fileContent,
            size: newFile.size,
            modifiedAt: newFile.modifyTime || new Date().toISOString(),
          },
          sftp: {
            host: sftpHost,
            port: sftpPort,
            remotePath,
          },
          _metadata: {
            pollerId: node.id,
            trackingMode,
            checksum,
          },
        },
        metadata: {
          pollerType: "sftp",
          fileDetected: true,
        },
      };
    } finally {
      await sftp.end();
    }
  } catch (error: any) {
    // If libraries not installed, throw helpful error
    if (error.code === "MODULE_NOT_FOUND" || error.message?.includes("Cannot find module")) {
      throw new Error(
        `SFTP Poller requires 'ssh2-sftp-client' and 'minimatch' packages. ` +
        `Install with: npm install ssh2-sftp-client minimatch. ` +
        `Use emulation mode for testing without SFTP server.`
      );
    }
    throw error;
  }
};
