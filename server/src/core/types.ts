import type { CanonicalItem } from "@shared/schema";

export interface PipelineInput {
  xml?: string;
  canonical?: CanonicalItem;
  traceId: string;
}

export interface PipelineResult {
  success: boolean;
  traceId: string;
  canonical?: CanonicalItem;
  decision?: {
    warehouseId: string;
    warehouseName: string;
    reason: string;
  };
  dispatchResults?: {
    receiver: string;
    success: boolean;
    timestamp: string;
  }[];
  error?: string;
  latencyMs?: number;
}

export interface LatencyRecord {
  value: number;
  timestamp: number;
}

export interface MetricsSnapshot {
  avgLatencyMs: number;
  p95LatencyMs: number;
  tps: number;
  inDepth: number;
  outDepth: number;
  errors: number;
  totalProcessed: number;
  lastUpdated: string;
}
