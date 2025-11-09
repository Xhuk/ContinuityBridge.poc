import SftpClient from "ssh2-sftp-client";
import { createHash } from "crypto";
import type { SftpConfig, DataSourceSecret } from "@shared/schema.js";
import type { DataSourceAdapter, PullResult, PulledFile, TestConnectionResult } from "./types.js";
import { logger } from "../core/logger.js";

const log = logger.child("SftpSource");

export class SftpSource implements DataSourceAdapter {
  config: SftpConfig;
  secret: DataSourceSecret;
  private client: SftpClient;

  constructor(config: SftpConfig, secret: DataSourceSecret) {
    this.config = config;
    this.secret = secret;
    this.client = new SftpClient();
  }

  private async connect(): Promise<void> {
    const connectConfig: any = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
    };

    if (this.config.authType === "password") {
      if (!this.secret.password) {
        throw new Error("Password is required for password authentication");
      }
      connectConfig.password = this.secret.password;
    } else if (this.config.authType === "privateKey") {
      if (!this.secret.privateKey) {
        throw new Error("Private key is required for key authentication");
      }
      connectConfig.privateKey = this.secret.privateKey;
    }

    await this.client.connect(connectConfig);
    log.info(`Connected to SFTP ${this.config.host}`);
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      await this.connect();
      const list = await this.client.list(this.config.remotePath);
      await this.disconnect();
      
      return {
        success: true,
        message: `Connected successfully. Found ${list.length} items in ${this.config.remotePath}`,
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
      await this.connect();
      
      const files: PulledFile[] = [];
      const list = await this.client.list(this.config.remotePath);
      
      // Filter files by pattern (simple wildcard matching)
      const pattern = this.config.filePattern.replace("*", ".*");
      const regex = new RegExp(`^${pattern}$`);
      
      for (const item of list) {
        if (item.type === "-" && regex.test(item.name)) {
          const fullPath = `${this.config.remotePath}/${item.name}`;
          const content = await this.client.get(fullPath);
          const contentStr = content.toString("utf-8");
          const hash = createHash("md5").update(contentStr).digest("hex");
          
          files.push({
            fileName: item.name,
            content: contentStr,
            size: item.size,
            hash,
          });
          
          log.info(`Pulled file: ${item.name} (${item.size} bytes)`);
        }
      }
      
      await this.disconnect();
      
      return {
        success: true,
        files,
      };
    } catch (error: any) {
      log.error("File fetch failed", error);
      await this.disconnect();
      return {
        success: false,
        files: [],
        error: error.message,
      };
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.end();
      log.info("SFTP connection closed");
    } catch (error) {
      // Ignore disconnect errors
    }
  }
}
