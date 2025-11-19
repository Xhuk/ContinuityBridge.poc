/**
 * Throttling Configuration Service
 * Manages organization-specific throttling and rate limiting configurations
 */

import { randomUUID } from "crypto";
import { logger } from "../core/logger.js";
import type { ThrottlingConfig, InsertThrottlingConfig } from "../../../shared/schema.js";

const log = logger.child("ThrottlingConfigService");

// In-memory storage (replace with database in production)
const throttlingConfigs = new Map<string, ThrottlingConfig>();

// Default configuration
const DEFAULT_CONFIG: Omit<ThrottlingConfig, "id" | "organizationId"> = {
  workerConcurrency: 3,
  httpRequestsPerSecond: 50,
  httpMaxConcurrent: 10,
  csvBatchSize: 100,
  csvProcessingDelay: 0,
  maxRetries: 3,
  retryDelayMs: 1000,
  retryBackoffMultiplier: 2,
  queuePollInterval: 1000,
  deadLetterAfterRetries: 5,
  enabled: true,
  requiresRestart: false,
};

/**
 * Get throttling configuration for an organization
 */
export function getThrottlingConfig(organizationId: string): ThrottlingConfig {
  const existing = Array.from(throttlingConfigs.values()).find(
    (c) => c.organizationId === organizationId
  );

  if (existing) {
    return existing;
  }

  // Return default config if none exists
  const defaultConfig: ThrottlingConfig = {
    ...DEFAULT_CONFIG,
    id: randomUUID(),
    organizationId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return defaultConfig;
}

/**
 * Get all throttling configurations
 */
export function getAllThrottlingConfigs(): ThrottlingConfig[] {
  return Array.from(throttlingConfigs.values());
}

/**
 * Create or update throttling configuration
 */
export function upsertThrottlingConfig(
  organizationId: string,
  updates: Partial<InsertThrottlingConfig>
): { config: ThrottlingConfig; requiresRestart: boolean } {
  const existing = Array.from(throttlingConfigs.values()).find(
    (c) => c.organizationId === organizationId
  );

  // Determine if restart is required
  const restartRequired = !!(
    updates.workerConcurrency !== undefined ||
    updates.queuePollInterval !== undefined ||
    updates.deadLetterAfterRetries !== undefined
  );

  if (existing) {
    // Update existing configuration
    const updated: ThrottlingConfig = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      requiresRestart: restartRequired,
    };

    throttlingConfigs.set(existing.id, updated);
    log.info("Throttling config updated", {
      organizationId,
      configId: existing.id,
      requiresRestart: restartRequired,
    });

    return { config: updated, requiresRestart: restartRequired };
  } else {
    // Create new configuration
    const newConfig: ThrottlingConfig = {
      ...DEFAULT_CONFIG,
      ...updates,
      id: randomUUID(),
      organizationId,
      enabled: true,
      requiresRestart: restartRequired,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    throttlingConfigs.set(newConfig.id, newConfig);
    log.info("Throttling config created", {
      organizationId,
      configId: newConfig.id,
    });

    return { config: newConfig, requiresRestart: restartRequired };
  }
}

/**
 * Delete throttling configuration
 */
export function deleteThrottlingConfig(organizationId: string): boolean {
  const existing = Array.from(throttlingConfigs.values()).find(
    (c) => c.organizationId === organizationId
  );

  if (existing) {
    throttlingConfigs.delete(existing.id);
    log.info("Throttling config deleted", { organizationId });
    return true;
  }

  return false;
}

/**
 * Apply throttling config to worker
 * Returns whether restart is required
 */
export async function applyThrottlingConfig(
  organizationId: string
): Promise<{ applied: boolean; requiresRestart: boolean }> {
  const config = getThrottlingConfig(organizationId);

  try {
    // Import worker instance
    const { getWorkerInstance } = await import("../workers/worker.js");
    const worker = getWorkerInstance();

    // Check if current concurrency is different
    const currentStatus = worker.getStatus();
    const concurrencyChanged = currentStatus.concurrency !== config.workerConcurrency;

    if (concurrencyChanged) {
      // Update worker concurrency
      worker.setConfig({ concurrency: config.workerConcurrency });
      log.info("Worker concurrency updated", {
        organizationId,
        oldConcurrency: currentStatus.concurrency,
        newConcurrency: config.workerConcurrency,
      });

      return { applied: true, requiresRestart: true };
    }

    return { applied: true, requiresRestart: false };
  } catch (error: any) {
    log.error("Failed to apply throttling config", {
      organizationId,
      error: error.message,
    });
    return { applied: false, requiresRestart: false };
  }
}
