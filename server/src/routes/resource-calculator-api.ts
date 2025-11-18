/**
 * Resource Calculator API
 * 
 * Founder UI: Calculate infrastructure requirements based on SOW
 * POST /api/calculator/resources → Get hardware recommendations
 * 
 * 🔒 SUPERADMIN ONLY (Founder, not founder team)
 */

import { Router } from "express";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { resourceCalculator } from "../calculators/resource-calculator.js";
import { logger } from "../core/logger.js";

const router = Router();
const log = logger.child("ResourceCalculatorAPI");

/**
 * POST /api/calculator/resources
 * Calculate resource requirements
 * 🔒 SUPERADMIN ONLY (Founder access)
 */
router.post("/resources", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Forbidden: Superadmin access required" });
    }

    const {
      ordersPerDay,
      interfacesCount,
      systemsCount,
      avgOrderSizeKB = 50,
      transformationComplexity = "medium",
      retentionDays = 90,
      peakMultiplier = 3,
    } = req.body;

    if (!ordersPerDay || !interfacesCount || !systemsCount) {
      return res.status(400).json({
        error: "Missing required fields: ordersPerDay, interfacesCount, systemsCount",
      });
    }

    log.info("Calculating resource requirements", {
      ordersPerDay,
      interfacesCount,
      systemsCount,
    });

    // Calculate
    const recommendation = resourceCalculator.calculate({
      ordersPerDay,
      interfacesCount,
      systemsCount,
      avgOrderSizeKB,
      transformationComplexity,
      retentionDays,
      peakMultiplier,
    });

    res.json({
      success: true,
      workload: {
        ordersPerDay,
        interfacesCount,
        systemsCount,
        transformationComplexity,
        retentionDays,
        peakMultiplier,
      },
      recommendation,
    });
  } catch (error: any) {
    log.error("Failed to calculate resources", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/calculator/presets
 * Get common workload presets
 * 🔒 SUPERADMIN ONLY (Founder access)
 */
router.get("/presets", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Forbidden: Superadmin access required" });
    }

    const presets = [
      {
        id: "small-3pl",
        name: "Small 3PL",
        description: "500-2,000 orders/day, 3-5 interfaces",
        workload: {
          ordersPerDay: 1000,
          interfacesCount: 4,
          systemsCount: 2,
          avgOrderSizeKB: 30,
          transformationComplexity: "low" as const,
          retentionDays: 30,
          peakMultiplier: 2,
        },
      },
      {
        id: "medium-3pl",
        name: "Medium 3PL",
        description: "2,000-10,000 orders/day, 5-15 interfaces",
        workload: {
          ordersPerDay: 5000,
          interfacesCount: 10,
          systemsCount: 5,
          avgOrderSizeKB: 50,
          transformationComplexity: "medium" as const,
          retentionDays: 60,
          peakMultiplier: 3,
        },
      },
      {
        id: "large-3pl",
        name: "Large 3PL",
        description: "10,000-50,000 orders/day, 15-30 interfaces",
        workload: {
          ordersPerDay: 25000,
          interfacesCount: 20,
          systemsCount: 10,
          avgOrderSizeKB: 75,
          transformationComplexity: "high" as const,
          retentionDays: 90,
          peakMultiplier: 5,
        },
      },
      {
        id: "enterprise-3pl",
        name: "Enterprise 3PL",
        description: "50,000+ orders/day, 30+ interfaces",
        workload: {
          ordersPerDay: 100000,
          interfacesCount: 40,
          systemsCount: 20,
          avgOrderSizeKB: 100,
          transformationComplexity: "high" as const,
          retentionDays: 180,
          peakMultiplier: 10,
        },
      },
    ];

    res.json(presets);
  } catch (error: any) {
    log.error("Failed to get presets", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
