import type { DataSourceConfig, DataSourceSecret, PullHistory } from "@shared/schema.js";

export interface PullResult {
  success: boolean;
  files: PulledFile[];
  error?: string;
}

export interface PulledFile {
  fileName: string;
  content: string;
  size: number;
  hash: string;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  error?: string;
}

export interface DataSourceAdapter {
  config: DataSourceConfig;
  secret: DataSourceSecret;
  
  testConnection(): Promise<TestConnectionResult>;
  fetchFiles(): Promise<PullResult>;
  disconnect(): Promise<void>;
}
