import { z } from "zod";

// Canonical Item Schema (transformed from XML)
export const canonicalItemSchema = z.object({
  itemId: z.string(),
  sku: z.string(),
  description: z.string(),
  quantity: z.number(),
  weight: z.number().optional(),
  dimensions: z.object({
    length: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
  destination: z.object({
    address: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string(),
    lat: z.number().optional(),
    lon: z.number().optional(),
  }),
  metadata: z.record(z.unknown()).optional(),
});

export type CanonicalItem = z.infer<typeof canonicalItemSchema>;

// Event Schema (for event tracking)
export const eventSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  timestamp: z.string(),
  sku: z.string(),
  warehouse: z.string(),
  warehouseId: z.string(),
  reason: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  latencyMs: z.number().optional(),
  error: z.string().optional(),
});

export type Event = z.infer<typeof eventSchema>;

// Decision Schema (warehouse routing decision)
export const decisionSchema = z.object({
  traceId: z.string(),
  timestamp: z.string(),
  selectedWarehouse: z.object({
    id: z.string(),
    name: z.string(),
    location: z.string(),
  }),
  reason: z.string(),
  alternatives: z.array(z.object({
    id: z.string(),
    name: z.string(),
    score: z.number(),
    reason: z.string(),
  })),
  decisionFactors: z.object({
    distance: z.number().optional(),
    sla: z.number().optional(),
    stock: z.number().optional(),
    cost: z.number().optional(),
  }),
});

export type Decision = z.infer<typeof decisionSchema>;

// Metrics Schema
export const metricsSchema = z.object({
  avgLatencyMs: z.number(),
  p95LatencyMs: z.number(),
  tps: z.number(),
  inDepth: z.number(),
  outDepth: z.number(),
  errors: z.number(),
  totalProcessed: z.number().optional(),
  lastUpdated: z.string(),
});

export type Metrics = z.infer<typeof metricsSchema>;

// Warehouse Schema
export const warehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.object({
    lat: z.number(),
    lon: z.number(),
    address: z.string(),
    city: z.string(),
    state: z.string(),
  }),
  sla: z.number(),
  stock: z.record(z.number()),
  costPerUnit: z.number(),
  capacity: z.number(),
  status: z.enum(["active", "inactive", "maintenance"]),
});

export type Warehouse = z.infer<typeof warehouseSchema>;

// Queue Config Schema
export const queueConfigSchema = z.object({
  backend: z.enum(["inmemory", "rabbit", "kafka"]),
  workerEnabled: z.boolean(),
  concurrency: z.number().min(1).max(100),
});

export type QueueConfig = z.infer<typeof queueConfigSchema>;

// Worker Status Schema
export const workerStatusSchema = z.object({
  enabled: z.boolean(),
  concurrency: z.number(),
  messagesProcessed: z.number(),
  currentThroughput: z.number(),
  status: z.enum(["running", "stopped", "error"]),
});

export type WorkerStatus = z.infer<typeof workerStatusSchema>;

// XML IFD Request Schema
export const xmlIfdRequestSchema = z.object({
  xml: z.string(),
});

export type XmlIfdRequest = z.infer<typeof xmlIfdRequestSchema>;

// XML IFD Response Schema
export const xmlIfdResponseSchema = z.object({
  ok: z.boolean(),
  traceId: z.string(),
  canonical: canonicalItemSchema.optional(),
  error: z.string().optional(),
});

export type XmlIfdResponse = z.infer<typeof xmlIfdResponseSchema>;

// GraphQL Input Types
export const processItemIFDInputSchema = z.object({
  xml: z.string(),
});

export type ProcessItemIFDInput = z.infer<typeof processItemIFDInputSchema>;

export const setWorkerInputSchema = z.object({
  enabled: z.boolean(),
  concurrency: z.number().optional(),
});

export type SetWorkerInput = z.infer<typeof setWorkerInputSchema>;

export const setQueueBackendInputSchema = z.object({
  backend: z.enum(["inmemory", "rabbit", "kafka"]),
});

export type SetQueueBackendInput = z.infer<typeof setQueueBackendInputSchema>;

// Chart Data Point Schema
export const chartDataPointSchema = z.object({
  timestamp: z.string(),
  avgLatency: z.number(),
  p95Latency: z.number(),
  tps: z.number(),
  errors: z.number(),
});

export type ChartDataPoint = z.infer<typeof chartDataPointSchema>;
