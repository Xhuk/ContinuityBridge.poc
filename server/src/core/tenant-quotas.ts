import { logger } from "./logger.js";
import type { IStorage } from "../../storage.js";

const log = logger.child("TenantQuotas");

/**
 * Tenant Quota Configuration
 * Defines resource limits per organization
 */
export interface TenantQuotas {
  organizationId: string;
  
  // Flow limits
  maxFlows: number;
  maxVersionsPerFlow: number;
  
  // Execution limits
  maxConcurrentExecutions: number;
  maxFlowRunsPerHour: number;
  maxFlowRunsPerDay: number;
  
  // Storage limits
  dataRetentionDays: number;
  maxStorageMB: number;
  
  // API limits
  maxApiCallsPerMinute: number;
  maxApiCallsPerHour: number;
  
  // Feature flags
  customNodesEnabled: boolean;
  aiGenerationEnabled: boolean;
  advancedMonitoringEnabled: boolean;
}

/**
 * Default quotas by tier
 */
export const DEFAULT_QUOTAS: Record<string, Partial<TenantQuotas>> = {
  free: {
    maxFlows: 5,
    maxVersionsPerFlow: 10,
    maxConcurrentExecutions: 2,
    maxFlowRunsPerHour: 100,
    maxFlowRunsPerDay: 1000,
    dataRetentionDays: 7,
    maxStorageMB: 100,
    maxApiCallsPerMinute: 10,
    maxApiCallsPerHour: 500,
    customNodesEnabled: false,
    aiGenerationEnabled: false,
    advancedMonitoringEnabled: false,
  },
  
  starter: {
    maxFlows: 20,
    maxVersionsPerFlow: 50,
    maxConcurrentExecutions: 5,
    maxFlowRunsPerHour: 500,
    maxFlowRunsPerDay: 10000,
    dataRetentionDays: 30,
    maxStorageMB: 1000,
    maxApiCallsPerMinute: 50,
    maxApiCallsPerHour: 2000,
    customNodesEnabled: false,
    aiGenerationEnabled: true,
    advancedMonitoringEnabled: false,
  },
  
  professional: {
    maxFlows: 100,
    maxVersionsPerFlow: 100,
    maxConcurrentExecutions: 20,
    maxFlowRunsPerHour: 2000,
    maxFlowRunsPerDay: 50000,
    dataRetentionDays: 90,
    maxStorageMB: 10000,
    maxApiCallsPerMinute: 200,
    maxApiCallsPerHour: 10000,
    customNodesEnabled: true,
    aiGenerationEnabled: true,
    advancedMonitoringEnabled: true,
  },
  
  enterprise: {
    maxFlows: -1, // Unlimited
    maxVersionsPerFlow: -1,
    maxConcurrentExecutions: 100,
    maxFlowRunsPerHour: -1,
    maxFlowRunsPerDay: -1,
    dataRetentionDays: 365,
    maxStorageMB: -1,
    maxApiCallsPerMinute: 1000,
    maxApiCallsPerHour: -1,
    customNodesEnabled: true,
    aiGenerationEnabled: true,
    advancedMonitoringEnabled: true,
  },
};

/**
 * Quota Usage Tracking
 */
export interface QuotaUsage {
  organizationId: string;
  
  // Current usage
  flowCount: number;
  activeExecutions: number;
  flowRunsThisHour: number;
  flowRunsToday: number;
  storageMB: number;
  apiCallsThisMinute: number;
  apiCallsThisHour: number;
  
  // Timestamps
  lastResetHour: string;
  lastResetDay: string;
  lastResetMinute: string;
}

/**
 * Tenant Quota Manager
 * Enforces resource limits per organization
 */
export class TenantQuotaManager {
  private storage: IStorage;
  private quotaCache: Map<string, TenantQuotas> = new Map();
  private usageCache: Map<string, QuotaUsage> = new Map();
  
  constructor(storage: IStorage) {
    this.storage = storage;
  }
  
  /**
   * Get quotas for an organization
   */
  async getQuotas(organizationId: string): Promise<TenantQuotas> {
    // Check cache
    if (this.quotaCache.has(organizationId)) {
      return this.quotaCache.get(organizationId)!;
    }
    
    // Load from storage (TODO: implement storage method)
    // For now, use professional tier as default
    const quotas: TenantQuotas = {
      organizationId,
      ...DEFAULT_QUOTAS.professional,
    } as TenantQuotas;
    
    this.quotaCache.set(organizationId, quotas);
    return quotas;
  }
  
  /**
   * Get current usage for an organization
   */
  async getUsage(organizationId: string): Promise<QuotaUsage> {
    // Check cache
    if (this.usageCache.has(organizationId)) {
      const usage = this.usageCache.get(organizationId)!;
      
      // Reset counters if time windows expired
      this.resetExpiredCounters(usage);
      return usage;
    }
    
    // Initialize new usage tracking
    const usage: QuotaUsage = {
      organizationId,
      flowCount: 0,
      activeExecutions: 0,
      flowRunsThisHour: 0,
      flowRunsToday: 0,
      storageMB: 0,
      apiCallsThisMinute: 0,
      apiCallsThisHour: 0,
      lastResetHour: new Date().toISOString(),
      lastResetDay: new Date().toISOString(),
      lastResetMinute: new Date().toISOString(),
    };
    
    this.usageCache.set(organizationId, usage);
    return usage;
  }
  
  /**
   * Check if quota allows operation
   */
  async checkQuota(
    organizationId: string,
    resource: keyof Pick<TenantQuotas, 
      "maxFlows" | 
      "maxConcurrentExecutions" | 
      "maxFlowRunsPerHour" | 
      "maxFlowRunsPerDay" | 
      "maxApiCallsPerMinute" | 
      "maxApiCallsPerHour"
    >,
    increment: number = 1
  ): Promise<{ allowed: boolean; reason?: string; currentUsage?: number; limit?: number }> {
    const quotas = await this.getQuotas(organizationId);
    const usage = await this.getUsage(organizationId);
    
    const limit = quotas[resource];
    
    // -1 means unlimited
    if (limit === -1) {
      return { allowed: true };
    }
    
    // Map resource to usage counter
    let currentUsage = 0;
    switch (resource) {
      case "maxFlows":
        currentUsage = usage.flowCount;
        break;
      case "maxConcurrentExecutions":
        currentUsage = usage.activeExecutions;
        break;
      case "maxFlowRunsPerHour":
        currentUsage = usage.flowRunsThisHour;
        break;
      case "maxFlowRunsPerDay":
        currentUsage = usage.flowRunsToday;
        break;
      case "maxApiCallsPerMinute":
        currentUsage = usage.apiCallsThisMinute;
        break;
      case "maxApiCallsPerHour":
        currentUsage = usage.apiCallsThisHour;
        break;
    }
    
    const wouldExceed = (currentUsage + increment) > limit;
    
    if (wouldExceed) {
      log.warn("Quota exceeded", {
        organizationId,
        resource,
        currentUsage,
        limit,
        increment,
      });
      
      return {
        allowed: false,
        reason: `Quota exceeded: ${resource} (${currentUsage}/${limit})`,
        currentUsage,
        limit,
      };
    }
    
    return { allowed: true, currentUsage, limit };
  }
  
  /**
   * Increment usage counter
   */
  async incrementUsage(
    organizationId: string,
    counter: keyof Pick<QuotaUsage, 
      "flowCount" | 
      "activeExecutions" | 
      "flowRunsThisHour" | 
      "flowRunsToday" | 
      "apiCallsThisMinute" | 
      "apiCallsThisHour"
    >,
    amount: number = 1
  ): Promise<void> {
    const usage = await this.getUsage(organizationId);
    
    usage[counter] += amount;
    
    // Persist to storage (TODO: implement batched writes)
    log.debug("Usage incremented", { organizationId, counter, amount, newValue: usage[counter] });
  }
  
  /**
   * Decrement usage counter
   */
  async decrementUsage(
    organizationId: string,
    counter: keyof Pick<QuotaUsage, "flowCount" | "activeExecutions">,
    amount: number = 1
  ): Promise<void> {
    const usage = await this.getUsage(organizationId);
    
    usage[counter] = Math.max(0, usage[counter] - amount);
    
    log.debug("Usage decremented", { organizationId, counter, amount, newValue: usage[counter] });
  }
  
  /**
   * Reset expired time-based counters
   */
  private resetExpiredCounters(usage: QuotaUsage): void {
    const now = new Date();
    
    // Reset minute counter
    const lastMinute = new Date(usage.lastResetMinute);
    if (now.getTime() - lastMinute.getTime() > 60000) {
      usage.apiCallsThisMinute = 0;
      usage.lastResetMinute = now.toISOString();
    }
    
    // Reset hour counter
    const lastHour = new Date(usage.lastResetHour);
    if (now.getTime() - lastHour.getTime() > 3600000) {
      usage.flowRunsThisHour = 0;
      usage.apiCallsThisHour = 0;
      usage.lastResetHour = now.toISOString();
    }
    
    // Reset day counter
    const lastDay = new Date(usage.lastResetDay);
    if (now.getTime() - lastDay.getTime() > 86400000) {
      usage.flowRunsToday = 0;
      usage.lastResetDay = now.toISOString();
    }
  }
  
  /**
   * Get quota utilization percentage
   */
  async getUtilization(organizationId: string): Promise<Record<string, number>> {
    const quotas = await this.getQuotas(organizationId);
    const usage = await this.getUsage(organizationId);
    
    const calculate = (used: number, limit: number): number => {
      if (limit === -1) return 0; // Unlimited
      return Math.round((used / limit) * 100);
    };
    
    return {
      flows: calculate(usage.flowCount, quotas.maxFlows),
      executions: calculate(usage.activeExecutions, quotas.maxConcurrentExecutions),
      flowRunsHour: calculate(usage.flowRunsThisHour, quotas.maxFlowRunsPerHour),
      flowRunsDay: calculate(usage.flowRunsToday, quotas.maxFlowRunsPerDay),
      apiCallsMinute: calculate(usage.apiCallsThisMinute, quotas.maxApiCallsPerMinute),
      apiCallsHour: calculate(usage.apiCallsThisHour, quotas.maxApiCallsPerHour),
      storage: calculate(usage.storageMB, quotas.maxStorageMB),
    };
  }
}
