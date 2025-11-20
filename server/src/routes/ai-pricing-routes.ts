/**
 * AI Pricing Tiers Management Routes (Founder/Superadmin Only)
 * 
 * Allows configuring different pricing models per consultant team:
 * - Team 1: $250 per 2000 tokens
 * - Team 2: $400 per 4000 tokens
 * - Team 3: Custom pricing
 */

import { Router, Request, Response } from "express";
import { db } from "../../db.js";
import { aiPricingTiers, aiUsageTracking } from "../../db";
import { eq, sql, desc } from "drizzle-orm";
import { logger } from "../core/logger.js";

const router = Router();
const log = logger.child("AIPricingRoutes");

/**
 * GET /api/ai/pricing-tiers
 * List all pricing tiers
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    // Enforce superadmin access
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Superadmin access required",
      });
    }

    const tiers = await db.select().from(aiPricingTiers).orderBy(desc(aiPricingTiers.createdAt));

    // Calculate price per token for each
    const tiersWithCalculations = tiers.map(tier => ({
      ...tier,
      pricePerToken: tier.pricePerUnit / tier.tokensPerBillingUnit,
      formattedRate: `$${tier.pricePerUnit} per ${tier.tokensPerBillingUnit.toLocaleString()} tokens`,
    }));

    res.json({
      tiers: tiersWithCalculations,
      total: tiers.length,
    });
  } catch (error: any) {
    log.error("Failed to list pricing tiers", { error: error.message });
    res.status(500).json({
      error: "Failed to list pricing tiers",
      message: error.message,
    });
  }
});

/**
 * GET /api/ai/pricing-tiers/:teamId/usage
 * Get usage stats for a specific pricing tier
 */
router.get("/:teamId/usage", async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Superadmin access required",
      });
    }

    const { teamId } = req.params;
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    // Get usage for this pricing tier
    const usage = await db.select({
      totalRequests: sql<number>`count(*)`,
      totalTokens: sql<number>`COALESCE(SUM(CAST(json_extract(metadata, '$.tokensUsed') AS INTEGER)), 0)`,
      successfulRequests: sql<number>`SUM(CASE WHEN json_extract(metadata, '$.success') = 1 THEN 1 ELSE 0 END)`,
      failedRequests: sql<number>`SUM(CASE WHEN json_extract(metadata, '$.success') = 0 THEN 1 ELSE 0 END)`,
    })
    .from(aiUsageTracking)
    .where(sql`pricing_tier_id = ${teamId} AND request_date >= ${currentMonth + '-01'}`);

    // Get tier details
    const tier = await db.select().from(aiPricingTiers).where(eq(aiPricingTiers.teamId, teamId)).limit(1);

    if (!tier.length) {
      return res.status(404).json({ error: "Pricing tier not found" });
    }

    const stats = usage[0];
    const totalTokens = Number(stats.totalTokens);
    const estimatedCost = (totalTokens / tier[0].tokensPerBillingUnit) * tier[0].pricePerUnit;

    res.json({
      teamId,
      teamName: tier[0].teamName,
      billingPeriod: currentMonth,
      totalRequests: Number(stats.totalRequests),
      totalTokens,
      successfulRequests: Number(stats.successfulRequests),
      failedRequests: Number(stats.failedRequests),
      estimatedCost,
      pricing: {
        tokensPerUnit: tier[0].tokensPerBillingUnit,
        pricePerUnit: tier[0].pricePerUnit,
        pricePerToken: tier[0].pricePerUnit / tier[0].tokensPerBillingUnit,
      },
    });
  } catch (error: any) {
    log.error("Failed to get tier usage", { error: error.message });
    res.status(500).json({
      error: "Failed to get usage",
      message: error.message,
    });
  }
});

/**
 * POST /api/ai/pricing-tiers
 * Create a new pricing tier
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Superadmin access required",
      });
    }

    const { teamId, teamName, tokensPerBillingUnit, pricePerUnit, description, isDefault } = req.body;

    if (!teamId || !teamName || !tokensPerBillingUnit || !pricePerUnit) {
      return res.status(400).json({
        error: "Missing required fields: teamId, teamName, tokensPerBillingUnit, pricePerUnit",
      });
    }

    // Check if teamId already exists
    const existing = await db.select().from(aiPricingTiers).where(eq(aiPricingTiers.teamId, teamId)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({
        error: "Team ID already exists",
        message: `Pricing tier with teamId "${teamId}" already exists`,
      });
    }

    // If this is marked as default, unset other defaults
    if (isDefault) {
      await db.update(aiPricingTiers)
        .set({ isDefault: false })
        .where(eq(aiPricingTiers.isDefault, true));
    }

    const tier = await db.insert(aiPricingTiers).values({
      teamId,
      teamName,
      tokensPerBillingUnit,
      pricePerUnit,
      description,
      isDefault: isDefault || false,
      createdBy: req.user?.id || "superadmin",
    }).returning();

    log.info("Created pricing tier", {
      teamId,
      teamName,
      pricing: `$${pricePerUnit} per ${tokensPerBillingUnit} tokens`,
    });

    res.json({
      success: true,
      tier: tier[0],
      message: `Pricing tier "${teamName}" created successfully`,
    });
  } catch (error: any) {
    log.error("Failed to create pricing tier", { error: error.message });
    res.status(500).json({
      error: "Failed to create pricing tier",
      message: error.message,
    });
  }
});

/**
 * PATCH /api/ai/pricing-tiers/:teamId
 * Update pricing tier
 */
router.patch("/:teamId", async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Superadmin access required",
      });
    }

    const { teamId } = req.params;
    const { teamName, tokensPerBillingUnit, pricePerUnit, description, isActive, isDefault } = req.body;

    // Check if tier exists
    const existing = await db.select().from(aiPricingTiers).where(eq(aiPricingTiers.teamId, teamId)).limit(1);
    if (!existing.length) {
      return res.status(404).json({ error: "Pricing tier not found" });
    }

    // If setting as default, unset others
    if (isDefault) {
      await db.update(aiPricingTiers)
        .set({ isDefault: false })
        .where(eq(aiPricingTiers.isDefault, true));
    }

    const updates: any = {
      updatedAt: new Date().toISOString(),
    };

    if (teamName !== undefined) updates.teamName = teamName;
    if (tokensPerBillingUnit !== undefined) updates.tokensPerBillingUnit = tokensPerBillingUnit;
    if (pricePerUnit !== undefined) updates.pricePerUnit = pricePerUnit;
    if (description !== undefined) updates.description = description;
    if (isActive !== undefined) updates.isActive = isActive;
    if (isDefault !== undefined) updates.isDefault = isDefault;

    const updated = await db.update(aiPricingTiers)
      .set(updates)
      .where(eq(aiPricingTiers.teamId, teamId))
      .returning();

    log.info("Updated pricing tier", { teamId, updates });

    res.json({
      success: true,
      tier: updated[0],
      message: `Pricing tier "${teamId}" updated successfully`,
    });
  } catch (error: any) {
    log.error("Failed to update pricing tier", { error: error.message });
    res.status(500).json({
      error: "Failed to update pricing tier",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/ai/pricing-tiers/:teamId
 * Delete pricing tier
 */
router.delete("/:teamId", async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Superadmin access required",
      });
    }

    const { teamId } = req.params;

    // Check if tier exists
    const existing = await db.select().from(aiPricingTiers).where(eq(aiPricingTiers.teamId, teamId)).limit(1);
    if (!existing.length) {
      return res.status(404).json({ error: "Pricing tier not found" });
    }

    // Don't allow deleting default tier
    if (existing[0].isDefault) {
      return res.status(400).json({
        error: "Cannot delete default pricing tier",
        message: "Please set another tier as default first",
      });
    }

    // Check if tier is in use
    const usageCount = await db.select({ count: sql<number>`count(*)` })
      .from(aiUsageTracking)
      .where(eq(aiUsageTracking.pricingTierId, teamId));

    if (Number(usageCount[0].count) > 0) {
      return res.status(400).json({
        error: "Pricing tier in use",
        message: `This tier has ${usageCount[0].count} usage records. Consider deactivating instead of deleting.`,
      });
    }

    await db.delete(aiPricingTiers).where(eq(aiPricingTiers.teamId, teamId));

    log.info("Deleted pricing tier", { teamId });

    res.json({
      success: true,
      message: `Pricing tier "${teamId}" deleted successfully`,
    });
  } catch (error: any) {
    log.error("Failed to delete pricing tier", { error: error.message });
    res.status(500).json({
      error: "Failed to delete pricing tier",
      message: error.message,
    });
  }
});

export default router;
