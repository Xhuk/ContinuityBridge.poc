import { Router, Request, Response } from "express";
import { aiQuotaManager } from "../ai/ai-quota-manager.js";
import { logger } from "../core/logger.js";

const log = logger.child("ai-admin-routes");
const router = Router();

/**
 * AI Admin Routes (Superadmin only)
 * 
 * Manage AI quota PER-PROJECT (consultants can use AI only if enabled for their project)
 */

/**
 * GET /api/ai/admin/projects
 * List all projects with AI settings
 */
router.get("/projects", async (req: Request, res: Response) => {
  try {
    // Enforce superadmin access
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Superadmin access required",
      });
    }
    const { db } = await import("../../db.js");
    const { aiQuotaSettings } = await import("../../schema.js");
    
    const projects = await db.select().from(aiQuotaSettings);
    
    res.json({
      projects,
      total: projects.length,
    });
  } catch (error: any) {
    log.error("Failed to list AI projects", { error: error.message });
    res.status(500).json({
      error: "Failed to list projects",
      message: error.message,
    });
  }
});

/**
 * GET /api/ai/admin/projects/:projectId/stats
 * Get AI usage statistics for a specific project
 */
router.get("/projects/:projectId/stats", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const stats = await aiQuotaManager.getUsageStats(projectId);
    
    res.json(stats);
  } catch (error: any) {
    log.error("Failed to get AI stats", { error: error.message });
    res.status(500).json({
      error: "Failed to get statistics",
      message: error.message,
    });
  }
});

/**
 * POST /api/ai/admin/projects/:projectId/enable
 * Enable AI for a specific project (Superadmin only)
 * 
 * Body:
 * {
 *   "projectName": "Project A",
 *   "trialDays": 30,
 *   "dailyLimit": 15,
 *   "monthlyLimit": 450
 * }
 */
router.post("/projects/:projectId/enable", async (req: Request, res: Response) => {
  try {
    // Enforce superadmin access
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Superadmin access required",
      });
    }
    const superadminId = (req as any).user?.id || "superadmin";
    const { projectId } = req.params;
    const { projectName, trialDays, dailyLimit, monthlyLimit } = req.body;
    
    await aiQuotaManager.enableAI(
      projectId,
      projectName || projectId,
      superadminId,
      {
        trialDays: trialDays ?? 30,
        dailyLimit: dailyLimit ?? 15,
        monthlyLimit: monthlyLimit ?? 450,
      }
    );
    
    log.info("AI enabled for project", {
      projectId,
      projectName,
      enabledBy: superadminId,
      trialDays,
    });
    
    res.json({
      success: true,
      message: `AI enabled for project ${projectName || projectId}`,
      projectId,
      trialDays: trialDays ?? 30,
      dailyLimit: dailyLimit ?? 15,
      monthlyLimit: monthlyLimit ?? 450,
    });
  } catch (error: any) {
    log.error("Failed to enable AI", { error: error.message });
    res.status(500).json({
      error: "Failed to enable AI",
      message: error.message,
    });
  }
});

/**
 * POST /api/ai/admin/projects/:projectId/disable
 * Disable AI for a specific project
 * 
 * Body:
 * {
 *   "reason": "Trial expired"
 * }
 */
router.post("/projects/:projectId/disable", async (req: Request, res: Response) => {
  try {
    // Enforce superadmin access
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Superadmin access required",
      });
    }
    const { projectId } = req.params;
    const { reason } = req.body;
    
    await aiQuotaManager.disableAI(projectId, reason);
    
    log.info("AI disabled for project", { projectId, reason });
    
    res.json({
      success: true,
      message: `AI disabled for project ${projectId}`,
      projectId,
      reason,
    });
  } catch (error: any) {
    log.error("Failed to disable AI", { error: error.message });
    res.status(500).json({
      error: "Failed to disable AI",
      message: error.message,
    });
  }
});

/**
 * POST /api/ai/admin/projects/:projectId/extend-trial
 * Extend trial period for a specific project
 * 
 * Body:
 * {
 *   "additionalDays": 30
 * }
 */
router.post("/projects/:projectId/extend-trial", async (req: Request, res: Response) => {
  try {
    // Enforce superadmin access
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Superadmin access required",
      });
    }
    const { projectId } = req.params;
    const { additionalDays } = req.body;
    
    if (!additionalDays || additionalDays <= 0) {
      return res.status(400).json({
        error: "Invalid days",
        message: "additionalDays must be a positive number",
      });
    }
    
    await aiQuotaManager.extendTrial(projectId, additionalDays);
    
    log.info("AI trial extended for project", { projectId, additionalDays });
    
    res.json({
      success: true,
      message: `Trial extended by ${additionalDays} days for project ${projectId}`,
      projectId,
      additionalDays,
    });
  } catch (error: any) {
    log.error("Failed to extend trial", { error: error.message });
    res.status(500).json({
      error: "Failed to extend trial",
      message: error.message,
    });
  }
});

/**
 * PUT /api/ai/admin/organizations/:organizationId/quota
 * Update quota limits
 * 
 * Body:
 * {
 *   "dailyLimit": 50,
 *   "monthlyLimit": 1500
 * }
 */
router.put("/organizations/:organizationId/quota", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { dailyLimit, monthlyLimit } = req.body;
    
    if (!dailyLimit || !monthlyLimit) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "dailyLimit and monthlyLimit are required",
      });
    }
    
    await aiQuotaManager.updateQuota(organizationId, dailyLimit, monthlyLimit);
    
    log.info("AI quota updated", {
      organizationId,
      dailyLimit,
      monthlyLimit,
    });
    
    res.json({
      success: true,
      message: "Quota updated",
      organizationId,
      dailyLimit,
      monthlyLimit,
    });
  } catch (error: any) {
    log.error("Failed to update quota", { error: error.message });
    res.status(500).json({
      error: "Failed to update quota",
      message: error.message,
    });
  }
});

/**
 * GET /api/ai/admin/usage/summary
 * Get global AI usage summary across all organizations
 */
router.get("/usage/summary", async (req: Request, res: Response) => {
  try {
    const { db } = await import("../../db.js");
    const { aiUsageTracking, aiQuotaSettings } = await import("../../schema.js");
    const { sql } = await import("drizzle-orm");
    
    // Get total usage stats
    const totalUsage = await db.select({
      count: sql<number>`count(*)`,
      featureType: aiUsageTracking.featureType,
    })
    .from(aiUsageTracking)
    .groupBy(aiUsageTracking.featureType);
    
    // Get enabled organizations count
    const enabledOrgs = await db.select({
      count: sql<number>`count(*)`,
    })
    .from(aiQuotaSettings)
    .where(sql`${aiQuotaSettings.enabled} = true`);
    
    res.json({
      totalRequests: totalUsage.reduce((sum, row) => sum + Number(row.count), 0),
      byFeature: totalUsage,
      enabledOrganizations: Number(enabledOrgs[0]?.count || 0),
    });
  } catch (error: any) {
    log.error("Failed to get usage summary", { error: error.message });
    res.status(500).json({
      error: "Failed to get usage summary",
      message: error.message,
    });
  }
});

export default router;
