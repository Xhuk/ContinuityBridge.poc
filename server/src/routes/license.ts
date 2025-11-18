import { Router } from "express";
import { db, customerLicense } from "../../db.js";
import { eq } from "drizzle-orm";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { randomUUID } from "crypto";

const router = Router();

/**
 * GET /api/license
 * Get license/feature flags for current user's organization
 */
router.get("/", authenticateUser, async (req, res) => {
  try {
    const userOrgId = req.user?.organizationId;
    const userRole = req.user?.role;

    // Superadmins and consultants have all features enabled
    if (userRole === "superadmin" || userRole === "consultant") {
      return res.json({
        license: {
          licenseType: "enterprise",
          
          // Feature flags (what they can do)
          features: {
            flowEditor: true,
            dataSources: true,
            interfaces: true,
            mappingGenerator: true,
            advancedSettings: true,
            customNodes: true,
            apiAccess: true,
            webhooks: true,
            
            // Self-service permissions
            canEditFlows: true,
            canAddInterfaces: true,
            canAddSystems: true,
            canDeleteResources: true,
          },
          
          // Resource limits (count-based pricing)
          limits: {
            maxFlows: 999999,
            maxDataSources: 999999,
            maxInterfaces: 999999,  // Unlimited for admin
            maxSystems: 999999,      // Unlimited for admin
            maxUsers: 999999,
            maxExecutionsPerMonth: 999999999,
          },
          
          // Current usage (for billing)
          usage: {
            interfacesCount: 0,  // Populated by query
            systemsCount: 0,     // Populated by query
            flowsCount: 0,
          },
          
          active: true,
          isAdmin: true,
        },
      });
    }

    // For customers, fetch their license
    if (!userOrgId) {
      return res.status(400).json({ error: "No organization ID found" });
    }

    const licenses = await (db.select().from(customerLicense)
      .where(eq(customerLicense.organizationId, userOrgId)) as any);
    
    const license = licenses[0];

    if (!license) {
      // Return default trial license if none exists
      return res.json({
        license: {
          licenseType: "trial",
          
          // Feature flags (trial = limited)
          features: {
            flowEditor: false,        // No flow editing in trial
            dataSources: false,
            interfaces: false,
            mappingGenerator: false,
            advancedSettings: false,
            customNodes: false,
            apiAccess: true,          // API access allowed
            webhooks: true,           // Webhooks allowed
            
            // Self-service permissions (trial = read-only)
            canEditFlows: false,      // ❌ Cannot edit flows
            canAddInterfaces: false,  // ❌ Cannot add interfaces
            canAddSystems: false,     // ❌ Cannot add systems
            canDeleteResources: false,// ❌ Cannot delete
          },
          
          // Resource limits (trial = very limited)
          limits: {
            maxFlows: 5,
            maxDataSources: 2,
            maxInterfaces: 2,         // Max 2 interfaces in trial
            maxSystems: 1,            // Max 1 system in trial
            maxUsers: 5,
            maxExecutionsPerMonth: 10000,
          },
          
          // Current usage
          usage: {
            interfacesCount: 0,
            systemsCount: 0,
            flowsCount: 0,
          },
          
          // Pricing info (for upsell)
          pricing: {
            basePlatform: 0,          // Trial = free
            perInterface: 0,          // Show pricing on upgrade
            perSystem: 0,
          },
          
          active: true,
          isAdmin: false,
        },
      });
    }

    // Check if license is expired
    const now = new Date();
    const isExpired = license.validUntil && new Date(license.validUntil) < now;

    res.json({
      license: {
        ...license,
        active: license.active && !isExpired,
        isExpired,
        isAdmin: false,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/license/:organizationId
 * Get license for specific organization
 * 🔒 Superadmin or Consultant only
 */
router.get("/:organizationId", authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const userRole = req.user?.role;

    if (userRole !== "superadmin" && userRole !== "consultant") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const licenses = await (db.select().from(customerLicense)
      .where(eq(customerLicense.organizationId, organizationId)) as any);
    
    const license = licenses[0];

    if (!license) {
      return res.status(404).json({ error: "License not found" });
    }

    res.json({ license });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/license
 * Create or update license for an organization
 * 🔒 Superadmin only
 */
router.post("/", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const {
      organizationId,
      organizationName,
      licenseType = "trial",
      features,
      limits,
      validUntil,
      contractNumber,
      notes,
    } = req.body;

    if (!organizationId || !organizationName) {
      return res.status(400).json({ 
        error: "organizationId and organizationName are required" 
      });
    }

    // Check if license exists
    const existing = await (db.select().from(customerLicense)
      .where(eq(customerLicense.organizationId, organizationId)) as any);

    const licenseData = {
      organizationId,
      organizationName,
      licenseType,
      features: features || {
        flowEditor: licenseType !== "trial",
        dataSources: licenseType !== "trial",
        interfaces: licenseType !== "trial",
        mappingGenerator: licenseType === "professional" || licenseType === "enterprise",
        advancedSettings: licenseType === "enterprise",
        customNodes: licenseType === "enterprise",
        apiAccess: true,
        webhooks: true,
      },
      limits: limits || getLimitsForLicenseType(licenseType),
      validUntil: validUntil ? new Date(validUntil).toISOString() : null,
      active: true,
      contractNumber,
      notes,
      updatedAt: new Date().toISOString(),
      createdBy: req.user?.email,
    };

    if (existing && existing[0]) {
      // Update existing
      await (db.update(customerLicense)
        .set(licenseData)
        .where(eq(customerLicense.id, existing[0].id)) as any);

      res.json({
        success: true,
        message: "License updated successfully",
        license: { ...existing[0], ...licenseData },
      });
    } else {
      // Create new
      const newLicense = {
        id: randomUUID(),
        ...licenseData,
        validFrom: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      await (db.insert(customerLicense).values(newLicense) as any);

      res.json({
        success: true,
        message: "License created successfully",
        license: newLicense,
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/license/:organizationId/toggle-feature
 * Toggle a specific feature on/off
 * 🔒 Superadmin only
 */
router.patch("/:organizationId/toggle-feature", authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { feature, enabled } = req.body;
    const userRole = req.user?.role;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const licenses = await (db.select().from(customerLicense)
      .where(eq(customerLicense.organizationId, organizationId)) as any);
    
    const license = licenses[0];

    if (!license) {
      return res.status(404).json({ error: "License not found" });
    }

    const updatedFeatures = {
      ...license.features,
      [feature]: enabled,
    };

    await (db.update(customerLicense)
      .set({ 
        features: updatedFeatures as any,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customerLicense.id, license.id)) as any);

    res.json({
      success: true,
      message: `Feature ${feature} ${enabled ? 'enabled' : 'disabled'}`,
      features: updatedFeatures,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/license/:organizationId
 * Delete/revoke license
 * 🔒 Superadmin only
 */
router.delete("/:organizationId", authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const userRole = req.user?.role;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    await (db.delete(customerLicense)
      .where(eq(customerLicense.organizationId, organizationId)) as any);

    res.json({
      success: true,
      message: "License revoked successfully",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Helper: Get default limits based on license type
 */
function getLimitsForLicenseType(licenseType: string) {
  switch (licenseType) {
    case "trial":
      return {
        maxFlows: 5,
        maxDataSources: 2,
        maxInterfaces: 2,      // 2 interfaces max
        maxSystems: 1,         // 1 system max
        maxUsers: 5,
        maxExecutionsPerMonth: 10000,
      };
    case "basic":              // Read-only production
      return {
        maxFlows: 20,
        maxDataSources: 5,
        maxInterfaces: 5,      // 5 interfaces
        maxSystems: 2,         // 2 systems
        maxUsers: 10,
        maxExecutionsPerMonth: 100000,
      };
    case "professional":       // Can edit flows
      return {
        maxFlows: 100,
        maxDataSources: 20,
        maxInterfaces: 20,     // 20 interfaces
        maxSystems: 10,        // 10 systems
        maxUsers: 50,
        maxExecutionsPerMonth: 1000000,
      };
    case "enterprise":         // Unlimited + full control
      return {
        maxFlows: 999999,
        maxDataSources: 999999,
        maxInterfaces: 999999, // Unlimited interfaces
        maxSystems: 999999,    // Unlimited systems
        maxUsers: 999999,
        maxExecutionsPerMonth: 999999999,
      };
    default:
      return {
        maxFlows: 5,
        maxDataSources: 2,
        maxInterfaces: 2,
        maxSystems: 1,
        maxUsers: 5,
        maxExecutionsPerMonth: 10000,
      };
  }
}

/**
 * Helper: Calculate monthly cost based on usage
 * Forger pricing model: Base + per-interface + per-system
 */
function calculateMonthlyCost(params: {
  licenseType: string;
  interfacesCount: number;
  systemsCount: number;
  basePricing?: { platform: number; perInterface: number; perSystem: number };
}) {
  const { licenseType, interfacesCount, systemsCount, basePricing } = params;
  
  // Default pricing (can be overridden per customer)
  const pricing = basePricing || {
    platform: licenseType === "trial" ? 0 : 500,     // Base platform fee
    perInterface: licenseType === "trial" ? 0 : 100, // $100 per interface/month
    perSystem: licenseType === "trial" ? 0 : 200,    // $200 per system/month
  };
  
  const cost = {
    basePlatform: pricing.platform,
    interfaces: interfacesCount * pricing.perInterface,
    systems: systemsCount * pricing.perSystem,
    total: pricing.platform + (interfacesCount * pricing.perInterface) + (systemsCount * pricing.perSystem),
    breakdown: {
      description: `Base ($${pricing.platform}) + ${interfacesCount} interfaces ($${pricing.perInterface} each) + ${systemsCount} systems ($${pricing.perSystem} each)`,
      formula: `$${pricing.platform} + (${interfacesCount} × $${pricing.perInterface}) + (${systemsCount} × $${pricing.perSystem}) = $${pricing.platform + (interfacesCount * pricing.perInterface) + (systemsCount * pricing.perSystem)}`,
    },
  };
  
  return cost;
}

/**
 * Helper: Get feature permissions based on license type
 */
function getFeaturesForLicenseType(licenseType: string) {
  const isEnterprise = licenseType === "enterprise";
  const isProfessional = licenseType === "professional" || isEnterprise;
  const isBasic = licenseType === "basic" || isProfessional;
  const isTrial = licenseType === "trial";
  
  return {
    flowEditor: isBasic,
    dataSources: isBasic,
    interfaces: isBasic,
    mappingGenerator: isProfessional,
    advancedSettings: isEnterprise,
    customNodes: isEnterprise,
    apiAccess: true,
    webhooks: true,
    
    // Self-service permissions (key for forger model)
    canEditFlows: isProfessional,        // Only Professional+ can edit
    canAddInterfaces: isProfessional,    // Only Professional+ can add
    canAddSystems: isProfessional,       // Only Professional+ can add
    canDeleteResources: isEnterprise,    // Only Enterprise can delete
  };
}

export default router;
