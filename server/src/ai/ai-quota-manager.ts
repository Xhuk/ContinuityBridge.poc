import { db } from "../../db.js";
import { aiQuotaSettings, aiUsageTracking } from "../../schema.js";
import { eq, and, gte } from "drizzle-orm";
import { logger } from "../core/logger.js";

const log = logger.child("AIQuotaManager");

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  remainingRequests?: number;
  resetDate?: string;
}

export interface AIUsageStats {
  requestsToday: number;
  requestsThisMonth: number;
  totalRequests: number;
  quotaLimit: number;
  quotaResetDate: string;
  trialEnabled: boolean;
  trialExpiresAt: string | null;
  trialExpired: boolean;
}

/**
 * AI Quota Manager
 * 
 * PER-PROJECT quota management:
 * - Single Gemini API key shared by entire application
 * - Quota tracked per projectId (15 req/day, 450 req/month per project)
 * - Superadmin enables/disables AI per project
 * - Usage tracking includes full project context for AI improvement
 * - Consultants can only use AI if enabled for their specific project
 */
export class AIQuotaManager {
  
  /**
   * Check if AI features are enabled for a specific project
   */
  async isAIEnabled(projectId: string): Promise<boolean> {
    const settings = await db.select()
      .from(aiQuotaSettings)
      .where(eq(aiQuotaSettings.organizationId, projectId))
      .limit(1);

    if (!settings.length) {
      // No settings = disabled by default
      return false;
    }

    const setting = settings[0];

    // Check if disabled for this project
    if (!setting.enabled) {
      return false;
    }

    // Check trial expiration
    if (setting.trialEnabled && setting.trialExpiresAt) {
      const now = new Date();
      const expiresAt = new Date(setting.trialExpiresAt);
      
      if (now > expiresAt) {
        log.warn("AI trial expired for project", {
          projectId,
          expiresAt: setting.trialExpiresAt,
        });
        
        // Auto-disable on trial expiration
        await this.disableAI(projectId, "Trial expired");
        return false;
      }
    }

    return true;
  }

  /**
   * Check if request is allowed under per-project quota limits
   */
  async checkQuota(projectId: string, featureType: string): Promise<QuotaCheckResult> {
    // Check if AI is enabled for this project
    const enabled = await this.isAIEnabled(projectId);
    if (!enabled) {
      return {
        allowed: false,
        reason: "AI features are not enabled for this project. Contact your administrator.",
      };
    }

    // Get project quota settings
    const settings = await db.select()
      .from(aiQuotaSettings)
      .where(eq(aiQuotaSettings.organizationId, projectId))
      .limit(1);

    if (!settings.length) {
      return {
        allowed: false,
        reason: "AI quota settings not found for this project",
      };
    }

    const setting = settings[0];

    // Get usage stats for today FOR THIS PROJECT
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const usageToday = await db.select()
      .from(aiUsageTracking)
      .where(and(
        eq(aiUsageTracking.organizationId, projectId),
        gte(aiUsageTracking.requestDate, today)
      ));

    const requestsToday = usageToday.length;

    // Check daily limit for this project
    const dailyLimit = setting.trialEnabled 
      ? 15  // Free tier: 15 req/day during trial
      : setting.dailyRequestLimit;

    if (requestsToday >= dailyLimit) {
      const resetDate = new Date();
      resetDate.setDate(resetDate.getDate() + 1);
      resetDate.setHours(0, 0, 0, 0);

      return {
        allowed: false,
        reason: `Project daily quota exceeded (${dailyLimit} requests/day for this project). Resets at midnight.`,
        remainingRequests: 0,
        resetDate: resetDate.toISOString(),
      };
    }

    // Check monthly limit for this project (if configured)
    if (setting.monthlyRequestLimit > 0) {
      const thisMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
      const usageThisMonth = await db.select()
        .from(aiUsageTracking)
        .where(and(
          eq(aiUsageTracking.organizationId, projectId),
          gte(aiUsageTracking.requestDate, thisMonth + '-01')
        ));

      const requestsThisMonth = usageThisMonth.length;

      if (requestsThisMonth >= setting.monthlyRequestLimit) {
        const resetDate = new Date();
        resetDate.setMonth(resetDate.getMonth() + 1);
        resetDate.setDate(1);
        resetDate.setHours(0, 0, 0, 0);

        return {
          allowed: false,
          reason: `Project monthly quota exceeded (${setting.monthlyRequestLimit} requests/month for this project). Resets on ${resetDate.toLocaleDateString()}.`,
          remainingRequests: 0,
          resetDate: resetDate.toISOString(),
        };
      }
    }

    // Request allowed
    return {
      allowed: true,
      remainingRequests: dailyLimit - requestsToday,
    };
  }

  /**
   * Track AI usage with project context for analytics and AI improvement
   */
  async trackUsage(
    featureType: "mapping" | "diagnosis" | "flow_suggestion" | "test_data" | "explanation",
    context: {
      organizationId?: string;      // Which tenant made the request
      organizationName?: string;     // Tenant name
      projectId?: string;            // Which project (for AI training)
      projectName?: string;          // Project name
      flowId?: string;               // Which flow (for context)
      flowName?: string;             // Flow name
      nodeType?: string;             // Node type being configured
      inputSize?: number;            // Request size in bytes
      outputSize?: number;           // Response size in bytes
      durationMs?: number;           // Processing time
      success?: boolean;             // Did request succeed?
      errorType?: string;            // Error classification if failed
    } = {}
  ): Promise<void> {
    const now = new Date();
    const requestDate = now.toISOString().split('T')[0];

    try {
      await db.insert(aiUsageTracking).values({
        organizationId: context.organizationId || "unknown",
        featureType,
        requestDate,
        timestamp: now.toISOString(),
        metadata: {
          organizationName: context.organizationName,
          projectId: context.projectId,
          projectName: context.projectName,
          flowId: context.flowId,
          flowName: context.flowName,
          nodeType: context.nodeType,
          inputSize: context.inputSize,
          outputSize: context.outputSize,
          durationMs: context.durationMs,
          success: context.success ?? true,
          errorType: context.errorType,
        },
      });

      log.info("AI usage tracked", {
        featureType,
        organizationId: context.organizationId,
        projectId: context.projectId,
        flowId: context.flowId,
        success: context.success ?? true,
      });
    } catch (error: any) {
      log.error("Failed to track AI usage", {
        error: error.message,
        featureType,
      });
    }
  }

  /**
   * Get usage statistics for a specific project
   */
  async getUsageStats(projectId: string): Promise<AIUsageStats> {
    const settings = await db.select()
      .from(aiQuotaSettings)
      .where(eq(aiQuotaSettings.organizationId, projectId))
      .limit(1);

    const setting = settings[0] || {
      dailyRequestLimit: 0,
      monthlyRequestLimit: 0,
      trialEnabled: false,
      trialExpiresAt: null,
    };

    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().substring(0, 7) + '-01';

    // Get usage for THIS PROJECT
    const usageToday = await db.select()
      .from(aiUsageTracking)
      .where(and(
        eq(aiUsageTracking.organizationId, projectId),
        gte(aiUsageTracking.requestDate, today)
      ));

    const usageThisMonth = await db.select()
      .from(aiUsageTracking)
      .where(and(
        eq(aiUsageTracking.organizationId, projectId),
        gte(aiUsageTracking.requestDate, thisMonth)
      ));

    const usageTotal = await db.select()
      .from(aiUsageTracking)
      .where(eq(aiUsageTracking.organizationId, projectId));

    const trialExpired = setting.trialExpiresAt 
      ? new Date() > new Date(setting.trialExpiresAt)
      : false;

    const resetDate = new Date();
    resetDate.setDate(resetDate.getDate() + 1);
    resetDate.setHours(0, 0, 0, 0);

    return {
      requestsToday: usageToday.length,
      requestsThisMonth: usageThisMonth.length,
      totalRequests: usageTotal.length,
      quotaLimit: setting.trialEnabled ? 15 : setting.dailyRequestLimit,
      quotaResetDate: resetDate.toISOString(),
      trialEnabled: setting.trialEnabled,
      trialExpiresAt: setting.trialExpiresAt,
      trialExpired,
    };
  }

  /**
   * Enable AI for a specific project (Superadmin only)
   */
  async enableAI(
    projectId: string,
    projectName: string,
    enabledBy: string,
    options?: {
      trialDays?: number;
      dailyLimit?: number;
      monthlyLimit?: number;
    }
  ): Promise<void> {
    const trialDays = options?.trialDays ?? 30;
    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + trialDays);

    const existing = await db.select()
      .from(aiQuotaSettings)
      .where(eq(aiQuotaSettings.organizationId, projectId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      await db.update(aiQuotaSettings)
        .set({
          enabled: true,
          trialEnabled: true,
          trialExpiresAt: trialExpiresAt.toISOString(),
          dailyRequestLimit: options?.dailyLimit ?? 15,
          monthlyRequestLimit: options?.monthlyLimit ?? 450,
          enabledBy,
          enabledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(aiQuotaSettings.organizationId, projectId));
    } else {
      // Create new
      await db.insert(aiQuotaSettings).values({
        organizationId: projectId,
        organizationName: projectName,
        enabled: true,
        trialEnabled: true,
        trialExpiresAt: trialExpiresAt.toISOString(),
        dailyRequestLimit: options?.dailyLimit ?? 15,
        monthlyRequestLimit: options?.monthlyLimit ?? 450,
        enabledBy,
        enabledAt: new Date().toISOString(),
      });
    }

    log.info("AI enabled for project", {
      projectId,
      projectName,
      trialDays,
      expiresAt: trialExpiresAt.toISOString(),
      enabledBy,
    });
  }

  /**
   * Disable AI for a specific project
   */
  async disableAI(projectId: string, reason?: string): Promise<void> {
    await db.update(aiQuotaSettings)
      .set({
        enabled: false,
        disabledAt: new Date().toISOString(),
        disabledReason: reason || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(aiQuotaSettings.organizationId, projectId));

    log.info("AI disabled for project", { projectId, reason });
  }

  /**
   * Extend trial period for a specific project (Superadmin only)
   */
  async extendTrial(projectId: string, additionalDays: number): Promise<void> {
    const settings = await db.select()
      .from(aiQuotaSettings)
      .where(eq(aiQuotaSettings.organizationId, projectId))
      .limit(1);

    if (!settings.length) {
      throw new Error("AI settings not found for this project");
    }

    const currentExpiry = settings[0].trialExpiresAt 
      ? new Date(settings[0].trialExpiresAt)
      : new Date();

    const newExpiry = new Date(currentExpiry);
    newExpiry.setDate(newExpiry.getDate() + additionalDays);

    await db.update(aiQuotaSettings)
      .set({
        trialExpiresAt: newExpiry.toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(aiQuotaSettings.organizationId, projectId));

    log.info("AI trial extended for project", {
      projectId,
      additionalDays,
      newExpiresAt: newExpiry.toISOString(),
    });
  }

  /**
   * Update quota limits for a specific project (Superadmin only)
   */
  async updateQuota(
    projectId: string,
    dailyLimit: number,
    monthlyLimit: number
  ): Promise<void> {
    await db.update(aiQuotaSettings)
      .set({
        dailyRequestLimit: dailyLimit,
        monthlyRequestLimit: monthlyLimit,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(aiQuotaSettings.organizationId, projectId));

    log.info("AI quota updated for project", {
      projectId,
      dailyLimit,
      monthlyLimit,
    });
  }
}

// Singleton instance
export const aiQuotaManager = new AIQuotaManager();
