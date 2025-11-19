import { Router, Request, Response } from "express";
import { authenticateUser } from "../auth/rbac-middleware";
import { logger } from "../core/logger";
import { getExpertAdvice, routeToExpert, EXPERT_ADVISORS, ExpertDomain } from "../ai/expert-advisors";
import { db, customerLicense } from "../../db";

const router = Router();

/**
 * POST /api/ai/expert-advice
 * Get advice from AI expert advisors
 * 🔒 FOUNDER ONLY - Most sensitive AI integration
 */
router.post("/expert-advice", authenticateUser, async (req: Request, res: Response) => {
  try {
    // STRICT: Only founder can access expert advisors
    if (req.user?.role !== "superadmin") {
      logger.warn("Unauthorized AI expert access attempt", {
        scope: "superadmin",
        userId: req.user?.id,
        role: req.user?.role,
      });
      return res.status(403).json({ 
        error: "Founder access required",
        message: "AI Expert Advisors are restricted to Founder role only"
      });
    }

    const { question, domain, contextData, useConsensus } = req.body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Question is required" });
    }

    // Auto-route to expert if domain not specified
    const expertDomain: ExpertDomain = domain || routeToExpert(question);

    // Gather system context automatically
    const systemContext = await gatherSystemContext();

    // Merge with user-provided context
    const fullContext = {
      ...systemContext,
      ...(contextData || {}),
    };

    // Get expert advice with optional consensus
    const result = await getExpertAdvice(
      expertDomain, 
      question, 
      fullContext,
      useConsensus === true // Default to single AI unless explicitly requested
    );

    logger.info("Expert advice generated successfully", {
      scope: "superadmin",
      userId: req.user?.id,
      expert: expertDomain,
      confidence: result.confidence,
    });

    res.json({
      success: true,
      ...result,
      availableExperts: Object.keys(EXPERT_ADVISORS),
    });

  } catch (error: any) {
    logger.error("Expert advice generation failed", error, {
      scope: "superadmin",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ai/expert-advisors
 * List available expert advisors with their specializations
 * 🔒 FOUNDER ONLY
 */
router.get("/expert-advisors", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Founder access required" });
    }

    const experts = Object.entries(EXPERT_ADVISORS).map(([domain, config]) => ({
      domain,
      temperature: config.temperature,
      safeguardsCount: config.safeguards.length,
      // Don't expose full system prompts for security
      description: getExpertDescription(domain as ExpertDomain),
    }));

    res.json({
      success: true,
      experts,
      totalExperts: experts.length,
    });

  } catch (error: any) {
    logger.error("Failed to list expert advisors", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Gather system context automatically
 */
async function gatherSystemContext(): Promise<Record<string, any>> {
  try {
    // Fetch key metrics
    const licenses = await (db.select().from(customerLicense) as any);
    
    const activeCustomers = licenses.filter((l: any) => l.active);
    const totalMRR = activeCustomers.reduce((acc: number, c: any) => {
      const basePlatform = c.pricing?.basePlatform || 0;
      const interfaceCost = (c.limits?.maxInterfaces || 0) * (c.pricing?.perInterface || 0);
      const systemCost = (c.limits?.maxSystems || 0) * (c.pricing?.perSystem || 0);
      return acc + basePlatform + interfaceCost + systemCost;
    }, 0);

    // Customer segmentation
    const customersByTier = activeCustomers.reduce((acc: any, c: any) => {
      const tier = c.licenseType || "trial";
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    }, {});

    return {
      totalCustomers: licenses.length,
      activeCustomers: activeCustomers.length,
      totalMRR,
      totalARR: totalMRR * 12,
      averageRevenuePerCustomer: activeCustomers.length > 0 ? totalMRR / activeCustomers.length : 0,
      customerDistribution: customersByTier,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("Failed to gather system context", error);
    return {
      timestamp: new Date().toISOString(),
      error: "Context gathering failed - using partial data",
    };
  }
}

/**
 * Get human-readable expert description
 */
function getExpertDescription(domain: ExpertDomain): string {
  const descriptions: Record<ExpertDomain, string> = {
    finance: "CFO-level financial strategy: revenue optimization, pricing, forecasting, cash flow",
    infrastructure: "CTO-level technical strategy: cloud costs, scalability, performance, DevOps",
    sales: "VP Sales-level growth strategy: pipeline management, pricing, customer targeting",
    product: "CPO-level product strategy: feature prioritization, roadmap, product-market fit",
    security: "CISO-level security strategy: compliance, vulnerabilities, incident response",
    operations: "COO-level operational excellence: processes, team structure, efficiency",
  };
  return descriptions[domain];
}

export default router;
