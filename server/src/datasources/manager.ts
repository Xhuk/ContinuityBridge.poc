import { randomUUID } from "crypto";
import type { DataSourceConfig, DataSourceSecret, PullHistory } from "@shared/schema.js";
import type { DataSourceAdapter, PullResult, TestConnectionResult } from "./types.js";
import { SftpSource } from "./sftp.js";
import { AzureBlobSource } from "./azure.js";
import { logger } from "../core/logger.js";
import { getQueueProvider } from "../serverQueue.js";

const log = logger.child("DataSourceManager");

// In-memory storage
const dataSourceConfigs = new Map<string, DataSourceConfig>();
const dataSourceSecrets = new Map<string, DataSourceSecret>();
const pullHistory: PullHistory[] = [];

export class DataSourceManager {
  createAdapter(config: DataSourceConfig, secret: DataSourceSecret): DataSourceAdapter {
    if (config.type === "sftp") {
      return new SftpSource(config, secret);
    } else if (config.type === "azureBlob") {
      return new AzureBlobSource(config, secret);
    }
    throw new Error(`Unknown data source type: ${config.type}`);
  }

  async testConnection(sourceId: string): Promise<TestConnectionResult> {
    const config = dataSourceConfigs.get(sourceId);
    const secret = dataSourceSecrets.get(sourceId);

    if (!config) {
      return {
        success: false,
        message: "Data source not found",
        error: "Configuration not found for this source ID",
      };
    }

    if (!secret) {
      return {
        success: false,
        message: "Credentials not found",
        error: "Secret not found for this source ID",
      };
    }

    const adapter = this.createAdapter(config, secret);
    try {
      const result = await adapter.testConnection();
      await adapter.disconnect();
      return result;
    } catch (error: any) {
      await adapter.disconnect();
      return {
        success: false,
        message: "Connection test failed",
        error: error.message,
      };
    }
  }

  async pullFiles(sourceId: string): Promise<{ success: boolean; history: PullHistory; error?: string }> {
    const config = dataSourceConfigs.get(sourceId);
    const secret = dataSourceSecrets.get(sourceId);

    if (!config) {
      return {
        success: false,
        history: {} as PullHistory,
        error: "Data source not found",
      };
    }

    if (!secret) {
      return {
        success: false,
        history: {} as PullHistory,
        error: "Credentials not found",
      };
    }

    if (!config.enabled) {
      return {
        success: false,
        history: {} as PullHistory,
        error: "Data source is disabled",
      };
    }

    const adapter = this.createAdapter(config, secret);
    
    try {
      const pullResult: PullResult = await adapter.fetchFiles();
      await adapter.disconnect();

      if (!pullResult.success) {
        const history: PullHistory = {
          id: randomUUID(),
          sourceId: config.id,
          sourceName: config.name,
          fileName: "N/A",
          fileSize: 0,
          fileHash: "",
          pulledAt: new Date().toISOString(),
          status: "failed",
          itemsProcessed: 0,
          error: pullResult.error,
          traceIds: [],
        };
        
        pullHistory.push(history);
        return { success: false, history, error: pullResult.error };
      }

      // Process each pulled file
      const queueProvider = getQueueProvider();
      const traceIds: string[] = [];

      for (const file of pullResult.files) {
        // Check if file was already processed (by hash)
        const alreadyProcessed = pullHistory.some(h => h.fileHash === file.hash && h.status === "success");
        if (alreadyProcessed) {
          log.info(`Skipping already processed file: ${file.fileName}`);
          continue;
        }

        const traceId = randomUUID();
        traceIds.push(traceId);

        // Enqueue XML for processing
        await queueProvider.enqueue(
          "items.inbound",
          JSON.stringify({ xml: file.content, traceId })
        );

        log.info(`Enqueued file ${file.fileName} with traceId ${traceId}`);
      }

      const history: PullHistory = {
        id: randomUUID(),
        sourceId: config.id,
        sourceName: config.name,
        fileName: pullResult.files.length > 0 ? pullResult.files[0].fileName : "N/A",
        fileSize: pullResult.files.reduce((sum, f) => sum + f.size, 0),
        fileHash: pullResult.files.length > 0 ? pullResult.files[0].hash : "",
        pulledAt: new Date().toISOString(),
        status: pullResult.files.length > 0 ? "success" : "partial",
        itemsProcessed: pullResult.files.length,
        traceIds,
      };

      pullHistory.push(history);
      log.info(`Pull completed: ${pullResult.files.length} files processed`);

      return { success: true, history };
    } catch (error: any) {
      await adapter.disconnect();
      
      const history: PullHistory = {
        id: randomUUID(),
        sourceId: config.id,
        sourceName: config.name,
        fileName: "N/A",
        fileSize: 0,
        fileHash: "",
        pulledAt: new Date().toISOString(),
        status: "failed",
        itemsProcessed: 0,
        error: error.message,
        traceIds: [],
      };
      
      pullHistory.push(history);
      return { success: false, history, error: error.message };
    }
  }

  // CRUD operations
  createSource(config: DataSourceConfig, secret: DataSourceSecret): void {
    dataSourceConfigs.set(config.id, config);
    dataSourceSecrets.set(config.id, secret);
    log.info(`Created data source: ${config.name} (${config.id})`);
  }

  updateSource(sourceId: string, config: Partial<DataSourceConfig>, secret?: Partial<DataSourceSecret>): void {
    const existing = dataSourceConfigs.get(sourceId);
    if (!existing) {
      throw new Error("Data source not found");
    }

    dataSourceConfigs.set(sourceId, { ...existing, ...config } as DataSourceConfig);
    
    if (secret) {
      const existingSecret = dataSourceSecrets.get(sourceId) || { sourceId };
      dataSourceSecrets.set(sourceId, { ...existingSecret, ...secret });
    }

    log.info(`Updated data source: ${sourceId}`);
  }

  deleteSource(sourceId: string): void {
    dataSourceConfigs.delete(sourceId);
    dataSourceSecrets.delete(sourceId);
    log.info(`Deleted data source: ${sourceId}`);
  }

  getSource(sourceId: string): DataSourceConfig | undefined {
    return dataSourceConfigs.get(sourceId);
  }

  getAllSources(): DataSourceConfig[] {
    return Array.from(dataSourceConfigs.values());
  }

  getPullHistory(sourceId?: string): PullHistory[] {
    if (sourceId) {
      return pullHistory.filter(h => h.sourceId === sourceId);
    }
    return [...pullHistory].reverse();
  }
}

// Global instance
let managerInstance: DataSourceManager | null = null;

export function getDataSourceManager(): DataSourceManager {
  if (!managerInstance) {
    managerInstance = new DataSourceManager();
  }
  return managerInstance;
}
