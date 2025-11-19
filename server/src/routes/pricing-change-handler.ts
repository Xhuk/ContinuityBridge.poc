import { Router, Request, Response } from "express";
import { db, pricingCatalog, customerLicense, pricingChangeNotifications } from "../../db";
import { eq } from "drizzle-orm";
import { authenticateUser } from "../auth/rbac-middleware";
import { logger } from "../core/logger";

const router = Router();

/**
 * POST /api/pricing-catalog/:tierName/notify-impact
 * Analyzes pricing changes and provides grandfathering suggestions
 * 🔒 Founder only
 */
router.post("/:tierName/notify-impact", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Founder access required" });
    }

    const { tierName } = req.params;
    const { newPricing, grandfatherExistingCustomers } = req.body;

    // Get current tier
    const currentTier = await (db.select().from(pricingCatalog)
      .where(eq(pricingCatalog.tierName, tierName))
      .get() as any);

    if (!currentTier) {
      return res.status(404).json({ error: "Pricing tier not found" });
    }

    // Find affected customers
    const affectedCustomers = await (db.select().from(customerLicense)
      .where(eq(customerLicense.licenseType, tierName as any)) as any);

    // Determine change type
    let changeType: "price_increase" | "price_decrease" | "limit_change" | "feature_change" = "price_increase";
    const oldMonthly = currentTier.monthlyPrice / 100;
    const newMonthly = newPricing.monthlyPriceDollars;

    if (newMonthly < oldMonthly) {
      changeType = "price_decrease";
    } else if (newMonthly > oldMonthly) {
      changeType = "price_increase";
    } else if (newPricing.maxInterfaces !== currentTier.maxInterfaces || newPricing.maxSystems !== currentTier.maxSystems) {
      changeType = "limit_change";
    } else {
      changeType = "feature_change";
    }

    // Calculate impact
    const impactAnalysis = {
      tierName,
      changeType,
      affectedCustomersCount: affectedCustomers.length,
      priceChangePercentage: ((newMonthly - oldMonthly) / oldMonthly * 100).toFixed(2),
      oldPricing: {
        monthlyPrice: oldMonthly,
        annualPrice: currentTier.annualPrice / 100,
        extraInterfacePrice: currentTier.extraInterfacePrice / 100,
        extraSystemPrice: currentTier.extraSystemPrice / 100,
      },
      newPricing: {
        monthlyPrice: newMonthly,
        annualPrice: newPricing.annualPriceDollars,
        extraInterfacePrice: newPricing.extraInterfacePriceDollars,
        extraSystemPrice: newPricing.extraSystemPriceDollars,
      },
      affectedCustomers: affectedCustomers.map((c: any) => {
        const currentMonthlySpend = (currentTier.monthlyPrice + 
          (c.limits?.maxInterfaces || 0) * currentTier.extraInterfacePrice + 
          (c.limits?.maxSystems || 0) * currentTier.extraSystemPrice) / 100;
        const newMonthlySpend = (newPricing.monthlyPriceDollars * 100 + 
          (c.limits?.maxInterfaces || 0) * (newPricing.extraInterfacePriceDollars * 100) + 
          (c.limits?.maxSystems || 0) * (newPricing.extraSystemPriceDollars * 100)) / 100;
        
        return {
          organizationId: c.organizationId,
          organizationName: c.organizationName,
          currentMonthlySpend,
          newMonthlySpend,
          monthlyIncrease: newMonthlySpend - currentMonthlySpend,
          contactEmail: c.deploymentContactEmail,
          contactName: c.deploymentContactName,
          isGrandfathered: c.pricing?.isGrandfathered || false,
        };
      }),
      recommendations: {
        shouldGrandfatherExisting: changeType === "price_increase" && affectedCustomers.length > 0,
        salesTeamAction: changeType === "price_increase" 
          ? "⚠️ Sales team should contact customers before renewal to discuss pricing changes"
          : "✅ Sales team can notify customers of better pricing",
        suggestedInternalNote: `Pricing change affects ${affectedCustomers.length} customers on ${tierName} plan. ${changeType === 'price_increase' ? 'Recommend grandfathering existing customers and having sales reach out individually.' : 'Update all customers to new pricing immediately.'}`,
        estimatedRevenueImpact: affectedCustomers.length * (newMonthly - oldMonthly),
      },
    };

    res.json({
      success: true,
      impact: impactAnalysis,
    });

  } catch (error: any) {
    logger.error("Failed to analyze pricing change impact", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pricing-catalog/:tierName/apply-changes
 * Apply pricing changes with optional grandfathering
 * 🔒 Founder only
 */
router.post("/:tierName/apply-changes", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Founder access required" });
    }

    const { tierName } = req.params;
    const { newPricing, grandfatherExistingCustomers, notificationMessage } = req.body;

    // Get current tier
    const currentTier = await (db.select().from(pricingCatalog)
      .where(eq(pricingCatalog.tierName, tierName))
      .get() as any);

    if (!currentTier) {
      return res.status(404).json({ error: "Pricing tier not found" });
    }

    // Find affected customers
    const affectedCustomers = await (db.select().from(customerLicense)
      .where(eq(customerLicense.licenseType, tierName as any)) as any);

    // Update pricing catalog
    await (db.update(pricingCatalog) as any)
      .set({
        monthlyPrice: Math.round(newPricing.monthlyPriceDollars * 100),
        annualPrice: Math.round(newPricing.annualPriceDollars * 100),
        extraInterfacePrice: Math.round(newPricing.extraInterfacePriceDollars * 100),
        extraSystemPrice: Math.round(newPricing.extraSystemPriceDollars * 100),
        maxInterfaces: newPricing.maxInterfaces,
        maxSystems: newPricing.maxSystems,
        updatedAt: new Date(),
      })
      .where(eq(pricingCatalog.tierName, tierName))
      .run();

    let grandfatheredCount = 0;

    // Grandfather existing customers if requested
    if (grandfatherExistingCustomers && affectedCustomers.length > 0) {
      for (const customer of affectedCustomers) {
        await (db.update(customerLicense) as any)
          .set({
            pricing: {
              ...customer.pricing,
              isGrandfathered: true,
              grandfatheredAt: new Date().toISOString(),
              grandfatheredReason: `Pricing change on ${new Date().toLocaleDateString()}`,
              originalTierSnapshot: {
                tierName: currentTier.tierName,
                displayName: currentTier.displayName,
                monthlyPrice: currentTier.monthlyPrice,
                extraInterfacePrice: currentTier.extraInterfacePrice,
                extraSystemPrice: currentTier.extraSystemPrice,
              },
            },
            updatedAt: new Date().toISOString(),
          })
          .where(eq(customerLicense.organizationId, customer.organizationId))
          .run();

        grandfatheredCount++;
      }
    }

    // Create notification record (for SALES TEAM, not customers)
    await (db.insert(pricingChangeNotifications) as any)
      .values({
        catalogTierName: tierName,
        changeType: newPricing.monthlyPriceDollars > (currentTier.monthlyPrice / 100) ? "price_increase" : "price_decrease",
        changedBy: req.user?.id,
        changeDescription: notificationMessage || `Pricing updated for ${currentTier.displayName}`,
        oldValues: {
          monthlyPrice: currentTier.monthlyPrice,
          annualPrice: currentTier.annualPrice,
          extraInterfacePrice: currentTier.extraInterfacePrice,
          extraSystemPrice: currentTier.extraSystemPrice,
        },
        newValues: {
          monthlyPrice: Math.round(newPricing.monthlyPriceDollars * 100),
          annualPrice: Math.round(newPricing.annualPriceDollars * 100),
          extraInterfacePrice: Math.round(newPricing.extraInterfacePriceDollars * 100),
          extraSystemPrice: Math.round(newPricing.extraSystemPriceDollars * 100),
        },
        affectedCustomers: affectedCustomers.map((c: any) => {
          const currentMonthlySpend = (currentTier.monthlyPrice + 
            (c.limits?.maxInterfaces || 0) * currentTier.extraInterfacePrice + 
            (c.limits?.maxSystems || 0) * currentTier.extraSystemPrice) / 100;
          const newMonthlySpend = (newPricing.monthlyPriceDollars * 100 + 
            (c.limits?.maxInterfaces || 0) * (newPricing.extraInterfacePriceDollars * 100) + 
            (c.limits?.maxSystems || 0) * (newPricing.extraSystemPriceDollars * 100)) / 100;
          
          return {
            organizationId: c.organizationId,
            organizationName: c.organizationName,
            currentTier: tierName,
            grandfathered: grandfatherExistingCustomers,
            currentMonthlySpend,
            estimatedNewMonthlySpend: newMonthlySpend,
            deploymentContactEmail: c.deploymentContactEmail,
            deploymentContactName: c.deploymentContactName,
            salesRepAssigned: null, // To be assigned by sales manager
          };
        }),
        salesTeamEmails: req.body.salesTeamEmails || ["sales@continuitybridge.com"], // Configurable sales team emails
        salesTeamNotified: false,
        totalAffectedCustomers: affectedCustomers.length,
        grandfatheredCount,
        status: "pending",
      })
      .run();

    logger.info(`Pricing changes applied to ${tierName}. ${grandfatheredCount} customers grandfathered. Sales team will be notified.`, {
      scope: "superadmin",
      userId: req.user?.id,
    });

    res.json({
      success: true,
      message: `Pricing updated. ${grandfatheredCount} customers grandfathered. Sales team notification pending.`,
      affectedCustomers: affectedCustomers.length,
      grandfatheredCount,
      salesTeamAction: "Sales team should contact affected customers individually",
    });

  } catch (error: any) {
    logger.error("Failed to apply pricing changes", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pricing-changes/history
 * Get pricing change notification history
 * 🔒 Founder AND Sales access (prices masked for sales)
 */
router.get("/history", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin" && req.user?.role !== "sales") {
      return res.status(403).json({ error: "Founder or Sales access required" });
    }

    const changes = await (db.select().from(pricingChangeNotifications)
      .orderBy((table: any) => table.createdAt) as any);

    // Mask prices for sales role
    const isSalesRole = req.user?.role === "sales";
    const processedChanges = changes.map((change: any) => {
      if (isSalesRole) {
        // Sales: Hide exact dollar amounts, show only percentage changes
        const oldPrice = change.oldValues?.monthlyPrice || 0;
        const newPrice = change.newValues?.monthlyPrice || 0;
        const percentChange = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice * 100).toFixed(1) : "0";

        return {
          id: change.id,
          catalogTierName: change.catalogTierName,
          changeType: change.changeType,
          changeDescription: change.changeDescription,
          // Masked pricing - only show percentage change
          priceChangePercentage: percentChange,
          priceChangeDirection: newPrice > oldPrice ? "increase" : "decrease",
          // Customer data (no pricing)
          affectedCustomers: change.affectedCustomers?.map((c: any) => ({
            organizationId: c.organizationId,
            organizationName: c.organizationName,
            currentTier: c.currentTier,
            grandfathered: c.grandfathered,
            deploymentContactEmail: c.deploymentContactEmail,
            deploymentContactName: c.deploymentContactName,
            salesRepAssigned: c.salesRepAssigned,
            // HIDE: currentMonthlySpend, estimatedNewMonthlySpend
          })),
          totalAffectedCustomers: change.totalAffectedCustomers,
          grandfatheredCount: change.grandfatheredCount,
          salesTeamNotified: change.salesTeamNotified,
          salesTeamNotifiedAt: change.salesTeamNotifiedAt,
          status: change.status,
          salesNotes: change.salesNotes,
          createdAt: change.createdAt,
        };
      }

      // Full access for superadmin
      return change;
    });

    res.json({
      success: true,
      changes: processedChanges,
      restricted: isSalesRole,
    });

  } catch (error: any) {
    logger.error("Failed to fetch pricing change history", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
