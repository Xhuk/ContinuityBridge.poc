import { Router, Request, Response } from "express";
import { db, pricingCatalog } from "../../db";
import { eq, desc } from "drizzle-orm";
import { authenticateUser } from "../auth/rbac-middleware";
import { logger } from "../core/logger";

const router = Router();

/**
 * GET /api/pricing-catalog
 * Get all pricing tiers (public endpoint for pricing page)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const tiers = await (db.select().from(pricingCatalog)
      .where(eq(pricingCatalog.isActive, true))
      .orderBy(pricingCatalog.sortOrder) as any);

    // Convert cents to dollars for display
    const tiersWithDollars = tiers.map((tier: any) => ({
      ...tier,
      annualPriceDollars: tier.annualPrice / 100,
      monthlyPriceDollars: tier.monthlyPrice / 100,
      extraInterfacePriceDollars: tier.extraInterfacePrice / 100,
      extraSystemPriceDollars: tier.extraSystemPrice / 100,
    }));

    res.json({
      success: true,
      tiers: tiersWithDollars,
    });
  } catch (error: any) {
    logger.error("Failed to fetch pricing catalog", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pricing-catalog/:tierName
 * Get specific pricing tier by name
 */
router.get("/:tierName", async (req: Request, res: Response) => {
  try {
    const tier = await (db.select().from(pricingCatalog)
      .where(eq(pricingCatalog.tierName, req.params.tierName))
      .get() as any);

    if (!tier) {
      return res.status(404).json({ error: "Pricing tier not found" });
    }

    res.json({
      ...tier,
      annualPriceDollars: tier.annualPrice / 100,
      monthlyPriceDollars: tier.monthlyPrice / 100,
      extraInterfacePriceDollars: tier.extraInterfacePrice / 100,
      extraSystemPriceDollars: tier.extraSystemPrice / 100,
    });
  } catch (error: any) {
    logger.error("Failed to fetch pricing tier", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pricing-catalog
 * Create or update pricing tier
 * 🔒 Founder only
 */
router.post("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Founder access required" });
    }

    const {
      tierName,
      displayName,
      description,
      annualPriceDollars,
      monthlyPriceDollars,
      maxInterfaces,
      maxSystems,
      maxFlows,
      maxUsers,
      maxExecutionsPerMonth,
      extraInterfacePriceDollars,
      extraSystemPriceDollars,
      features,
      isActive,
      isPublic,
      sortOrder,
    } = req.body;

    if (!tierName || !displayName || annualPriceDollars === undefined || monthlyPriceDollars === undefined) {
      return res.status(400).json({
        error: "Missing required fields: tierName, displayName, annualPriceDollars, monthlyPriceDollars",
      });
    }

    // Convert dollars to cents for storage
    const tierData = {
      tierName,
      displayName,
      description: description || "",
      currency: "USD",
      annualPrice: Math.round(annualPriceDollars * 100),
      monthlyPrice: Math.round(monthlyPriceDollars * 100),
      maxInterfaces: maxInterfaces || 0,
      maxSystems: maxSystems || 0,
      maxFlows: maxFlows || 999999,
      maxUsers: maxUsers || 999999,
      maxExecutionsPerMonth: maxExecutionsPerMonth || 999999999,
      extraInterfacePrice: Math.round((extraInterfacePriceDollars || 100) * 100),
      extraSystemPrice: Math.round((extraSystemPriceDollars || 200) * 100),
      features: features || {
        flowEditor: true,
        dataSources: true,
        interfaces: true,
        mappingGenerator: false,
        advancedSettings: false,
        customNodes: false,
        apiAccess: true,
        webhooks: true,
        canEditFlows: false,
        canAddInterfaces: false,
        canAddSystems: false,
        canDeleteResources: false,
      },
      isActive: isActive !== undefined ? isActive : true,
      isPublic: isPublic !== undefined ? isPublic : true,
      sortOrder: sortOrder || 0,
      updatedAt: new Date(),
    };

    // Check if tier exists
    const existing = await (db.select().from(pricingCatalog)
      .where(eq(pricingCatalog.tierName, tierName))
      .get() as any);

    if (existing) {
      // Update existing
      await (db.update(pricingCatalog) as any)
        .set(tierData)
        .where(eq(pricingCatalog.tierName, tierName))
        .run();

      logger.info(`Pricing tier updated: ${tierName}`, {
        scope: "superadmin",
        userId: req.user?.id,
      });

      res.json({
        success: true,
        message: "Pricing tier updated",
        tier: { ...tierData, id: existing.id },
      });
    } else {
      // Create new
      const result = await (db.insert(pricingCatalog) as any)
        .values(tierData)
        .returning()
        .get();

      logger.info(`Pricing tier created: ${tierName}`, {
        scope: "superadmin",
        userId: req.user?.id,
      });

      res.status(201).json({
        success: true,
        message: "Pricing tier created",
        tier: result,
      });
    }
  } catch (error: any) {
    logger.error("Failed to create/update pricing tier", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/pricing-catalog/:tierName
 * Delete pricing tier
 * 🔒 Founder only
 */
router.delete("/:tierName", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Founder access required" });
    }

    await (db.delete(pricingCatalog) as any)
      .where(eq(pricingCatalog.tierName, req.params.tierName))
      .run();

    logger.info(`Pricing tier deleted: ${req.params.tierName}`, {
      scope: "superadmin",
      userId: req.user?.id,
    });

    res.json({
      success: true,
      message: "Pricing tier deleted",
    });
  } catch (error: any) {
    logger.error("Failed to delete pricing tier", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pricing-catalog/seed
 * Seed default pricing tiers (market research based)
 * 🔒 Founder only
 */
router.post("/seed", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Founder access required" });
    }

    const defaultTiers = [
      {
        tierName: "starter",
        displayName: "Starter",
        description: "Perfect for small businesses testing integration waters",
        annualPrice: 1200000, // $12,000/year
        monthlyPrice: 100000, // $1,000/month
        maxInterfaces: 5,
        maxSystems: 2,
        maxFlows: 20,
        maxUsers: 5,
        maxExecutionsPerMonth: 100000,
        extraInterfacePrice: 10000, // $100/mo
        extraSystemPrice: 20000, // $200/mo
        features: {
          flowEditor: true,
          dataSources: true,
          interfaces: true,
          mappingGenerator: false,
          advancedSettings: false,
          customNodes: false,
          apiAccess: true,
          webhooks: true,
          canEditFlows: false,
          canAddInterfaces: false,
          canAddSystems: false,
          canDeleteResources: false,
        },
        isActive: true,
        isPublic: true,
        sortOrder: 1,
      },
      {
        tierName: "professional",
        displayName: "Professional",
        description: "For growing operations with multiple warehouses",
        annualPrice: 2400000, // $24,000/year
        monthlyPrice: 200000, // $2,000/month
        maxInterfaces: 20,
        maxSystems: 10,
        maxFlows: 100,
        maxUsers: 50,
        maxExecutionsPerMonth: 1000000,
        extraInterfacePrice: 10000, // $100/mo
        extraSystemPrice: 20000, // $200/mo
        features: {
          flowEditor: true,
          dataSources: true,
          interfaces: true,
          mappingGenerator: true,
          advancedSettings: false,
          customNodes: false,
          apiAccess: true,
          webhooks: true,
          canEditFlows: true,
          canAddInterfaces: true,
          canAddSystems: true,
          canDeleteResources: false,
        },
        isActive: true,
        isPublic: true,
        sortOrder: 2,
      },
      {
        tierName: "enterprise",
        displayName: "Enterprise",
        description: "Unlimited integrations for complex supply chains",
        annualPrice: 4800000, // $48,000/year
        monthlyPrice: 400000, // $4,000/month
        maxInterfaces: 999999,
        maxSystems: 999999,
        maxFlows: 999999,
        maxUsers: 999999,
        maxExecutionsPerMonth: 999999999,
        extraInterfacePrice: 15000, // $150/mo
        extraSystemPrice: 30000, // $300/mo
        features: {
          flowEditor: true,
          dataSources: true,
          interfaces: true,
          mappingGenerator: true,
          advancedSettings: true,
          customNodes: true,
          apiAccess: true,
          webhooks: true,
          canEditFlows: true,
          canAddInterfaces: true,
          canAddSystems: true,
          canDeleteResources: true,
          premiumSupport: true,
        },
        isActive: true,
        isPublic: true,
        sortOrder: 3,
      },
    ];

    let created = 0;
    let updated = 0;

    for (const tier of defaultTiers) {
      const existing = await (db.select().from(pricingCatalog)
        .where(eq(pricingCatalog.tierName, tier.tierName))
        .get() as any);

      if (existing) {
        await (db.update(pricingCatalog) as any)
          .set({ ...tier, updatedAt: new Date() })
          .where(eq(pricingCatalog.tierName, tier.tierName))
          .run();
        updated++;
      } else {
        await (db.insert(pricingCatalog) as any)
          .values(tier)
          .run();
        created++;
      }
    }

    logger.info("Pricing catalog seeded", {
      scope: "superadmin",
      userId: req.user?.id,
      created,
      updated,
    });

    res.json({
      success: true,
      message: `Pricing catalog seeded: ${created} created, ${updated} updated`,
    });
  } catch (error: any) {
    logger.error("Failed to seed pricing catalog", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
