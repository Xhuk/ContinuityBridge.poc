import { Router } from "express";
import { db, wafConfig } from "../../db.js";
import { eq } from "drizzle-orm";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { randomUUID } from "crypto";
import { getWAFStats, blockIP, unblockIP } from "../middleware/waf.js";

const router = Router();

/**
 * GET /api/waf/config
 * Get WAF configuration for user's organization
 * 🔒 Requires authentication
 */
router.get("/config", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;

    let organizationId: string | null = null;

    // Superadmin can see global config
    if (userRole === "superadmin") {
      organizationId = null; // Global config
    } 
    // Consultant sees their own org config
    else if (userRole === "consultant" && userOrgId) {
      organizationId = userOrgId;
    }
    // Customer admin sees their org config
    else if (userRole === "customer_admin" && userOrgId) {
      organizationId = userOrgId;
    }
    else {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // Get config for this organization (or global)
    const configs = await (db.select().from(wafConfig)
      .where(eq(wafConfig.organizationId, organizationId || null as any)) as any);
    
    let config = configs[0];

    // If no config exists, return defaults
    if (!config) {
      config = {
        organizationId,
        enabled: true,
        blockBots: true,
        blockSuspicious: true,
        rateLimitEnabled: true,
        rateLimitWindowMs: 60000,
        rateLimitMaxRequests: 30,
        rateLimitBlockDurationMs: 300000,
        whitelist: [],
      };
    }

    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/waf/config
 * Update WAF configuration
 * 🔒 Superadmin, Consultant (own org), Customer Admin (own org)
 */
router.put("/config", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;

    const {
      enabled,
      blockBots,
      blockSuspicious,
      rateLimitEnabled,
      rateLimitWindowMs,
      rateLimitMaxRequests,
      rateLimitBlockDurationMs,
      whitelist,
    } = req.body;

    let organizationId: string | null = null;

    // Determine which organization config to update
    if (userRole === "superadmin") {
      // Superadmin can update global or specific org
      organizationId = req.body.organizationId || null;
    } 
    else if (userRole === "consultant" && userOrgId) {
      // Consultant can only update their own org
      organizationId = userOrgId;
    }
    else if (userRole === "customer_admin" && userOrgId) {
      // Customer admin can only update their own org
      organizationId = userOrgId;
    }
    else {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // Check if config exists
    const existing = await (db.select().from(wafConfig)
      .where(eq(wafConfig.organizationId, organizationId || null as any)) as any);

    const configData = {
      organizationId: organizationId as any,
      enabled: enabled ?? true,
      blockBots: blockBots ?? true,
      blockSuspicious: blockSuspicious ?? true,
      rateLimitEnabled: rateLimitEnabled ?? true,
      rateLimitWindowMs: rateLimitWindowMs ?? 60000,
      rateLimitMaxRequests: rateLimitMaxRequests ?? 30,
      rateLimitBlockDurationMs: rateLimitBlockDurationMs ?? 300000,
      whitelist: whitelist ?? [],
      updatedAt: new Date().toISOString(),
    };

    if (existing && existing[0]) {
      // Update existing
      await (db.update(wafConfig)
        .set(configData)
        .where(eq(wafConfig.id, existing[0].id)) as any);
    } else {
      // Create new
      await (db.insert(wafConfig).values({
        id: randomUUID(),
        ...configData,
        createdAt: new Date().toISOString(),
      }) as any);
    }

    res.json({
      success: true,
      message: "WAF configuration updated",
      config: configData,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/waf/stats
 * Get WAF statistics (blocked IPs, rate limited IPs)
 * 🔒 Superadmin, Consultant, Customer Admin
 */
router.get("/stats", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;

    if (!["superadmin", "consultant", "customer_admin"].includes(userRole || "")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const stats = getWAFStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/waf/block-ip
 * Manually block an IP address
 * 🔒 Superadmin, Consultant, Customer Admin
 */
router.post("/block-ip", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;
    const { ip } = req.body;

    if (!["superadmin", "consultant", "customer_admin"].includes(userRole || "")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    if (!ip) {
      return res.status(400).json({ error: "IP address is required" });
    }

    blockIP(ip);

    res.json({
      success: true,
      message: `IP ${ip} has been blocked`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/waf/unblock-ip
 * Manually unblock an IP address
 * 🔒 Superadmin, Consultant, Customer Admin
 */
router.post("/unblock-ip", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;
    const { ip } = req.body;

    if (!["superadmin", "consultant", "customer_admin"].includes(userRole || "")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    if (!ip) {
      return res.status(400).json({ error: "IP address is required" });
    }

    unblockIP(ip);

    res.json({
      success: true,
      message: `IP ${ip} has been unblocked`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
