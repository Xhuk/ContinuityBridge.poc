import { NodeExecutor, ExecutionContext, NodeExecutionResult } from "./types";
import { FlowNode } from "@shared/schema";
import { randomUUID } from "crypto";

/**
 * SFTP Connector Node Executor - Upload/Download files to SFTP servers
 * 
 * Use Case:
 * - Upload daily sales report to finance partner's SFTP
 * - Download order files from supplier
 * - Move processed files to archive
 * 
 * Configuration:
 * - operation: "upload" | "download" | "move" | "delete"
 * - sftpHost: SFTP server hostname
 * - sftpPort: Port (default 22)
 * - sftpUsername: Authentication username
 * - sftpPassword: Authentication password/key
 * - remotePath: Remote file path
 * - sourceField: JSONPath to file content in payload (for upload)
 * 
 * Mock Mode: Returns success without actual SFTP connection
 * Production Mode: Uses ssh2-sftp-client library
 */
export const executeSftpConnector: NodeExecutor = async (
  node: FlowNode,
  input: unknown,
  context: ExecutionContext
): Promise<NodeExecutionResult> => {
  const config = (node as any).config || {};
  const {
    operation = "upload",
    sftpHost = "",
    sftpPort = 22,
    sftpUsername = "",
    sftpPassword = "",
    remotePath = "",
    sourceField = "fileContent",
  } = config;

  // Validation
  if (!sftpHost) {
    throw new Error("SFTP host is required");
  }
  if (!remotePath) {
    throw new Error("Remote path is required");
  }

  // MOCK MODE - For testing without real SFTP server
  if (context.emulationMode) {
    const mockResult = {
      operation,
      remotePath,
      host: sftpHost,
      port: sftpPort,
      timestamp: new Date().toISOString(),
      success: true,
      bytesTransferred: operation === "upload" ? 1024 : operation === "download" ? 2048 : 0,
      mockFile: operation === "download" ? "Mock file content from SFTP server" : undefined,
    };

    if (operation === "download") {
      // Add downloaded file to payload
      return {
        output: {
          ...input as any,
          downloadedFile: mockResult.mockFile,
          sftpMetadata: mockResult,
        },
        metadata: {
          sftpOperation: operation,
          emulated: true,
        },
      };
    }

    return {
      output: input,
      metadata: {
        sftpOperation: operation,
        sftpResult: mockResult,
        emulated: true,
      },
    };
  }

  // PRODUCTION MODE - Real SFTP operations
  try {
    const SftpClient = (await import("ssh2-sftp-client")).default;
    const sftp = new SftpClient();

    await sftp.connect({
      host: sftpHost,
      port: sftpPort,
      username: sftpUsername,
      password: sftpPassword,
    });

    try {
      switch (operation) {
        case "upload": {
          const fileContent = (input as any)[sourceField];
          if (!fileContent) {
            throw new Error(`Source field '${sourceField}' not found in payload`);
          }
          const buffer = Buffer.from(typeof fileContent === "string" ? fileContent : JSON.stringify(fileContent));
          await sftp.put(buffer, remotePath);
          
          return {
            output: { ...input as any, sftpUploadPath: remotePath },
            metadata: { sftpOperation: "upload", remotePath, bytesUploaded: buffer.length },
          };
        }
        
        case "download": {
          const data = await sftp.get(remotePath);
          const content = data.toString();
          
          return {
            output: { ...input as any, downloadedFile: content },
            metadata: { sftpOperation: "download", remotePath, bytesDownloaded: content.length },
          };
        }
        
        case "move": {
          const destPath = config.destinationPath || `${remotePath}.processed`;
          await sftp.rename(remotePath, destPath);
          
          return {
            output: input,
            metadata: { sftpOperation: "move", from: remotePath, to: destPath },
          };
        }
        
        case "delete": {
          await sftp.delete(remotePath);
          
          return {
            output: input,
            metadata: { sftpOperation: "delete", remotePath },
          };
        }
        
        default:
          throw new Error(`Unsupported SFTP operation: ${operation}`);
      }
    } finally {
      await sftp.end();
    }
  } catch (error: any) {
    // If ssh2-sftp-client not installed, throw helpful error
    if (error.code === "MODULE_NOT_FOUND" || error.message?.includes("Cannot find module")) {
      throw new Error(
        `SFTP Connector requires 'ssh2-sftp-client' package. ` +
        `Install with: npm install ssh2-sftp-client. ` +
        `Use emulation mode for testing without SFTP server.`
      );
    }
    throw error;
  }
};
