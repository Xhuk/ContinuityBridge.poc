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
          features: {
            flowEditor: true,
            dataSources: true,
            interfaces: true,
            mappingGenerator: true,
            advancedSettings: true,
            customNodes: true,
            apiAccess: true,
            webhooks: true,
          },
          limits: {
            maxFlows: 999999,
            maxDataSources: 999999,
            maxInterfaces: 999999,
            maxUsers: 999999,
            maxExecutionsPerMonth: 999999999,
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
          features: {
            flowEditor: false,
            dataSources: false,
            interfaces: false,
            mappingGenerator: false,
            advancedSettings: false,
            customNodes: false,
            apiAccess: true,
            webhooks: true,
          },
          limits: {
            maxFlows: 5,
            maxDataSources: 2,
            maxInterfaces: 2,
            maxUsers: 5,
            maxExecutionsPerMonth: 10000,
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
        maxInterfaces: 2,
        maxUsers: 5,
        maxExecutionsPerMonth: 10000,
      };
    case "basic":
      return {
        maxFlows: 20,
        maxDataSources: 5,
        maxInterfaces: 5,
        maxUsers: 10,
        maxExecutionsPerMonth: 100000,
      };
    case "professional":
      return {
        maxFlows: 100,
        maxDataSources: 20,
        maxInterfaces: 20,
        maxUsers: 50,
        maxExecutionsPerMonth: 1000000,
      };
    case "enterprise":
      return {
        maxFlows: 999999,
        maxDataSources: 999999,
        maxInterfaces: 999999,
        maxUsers: 999999,
        maxExecutionsPerMonth: 999999999,
      };
    default:
      return {
        maxFlows: 5,
        maxDataSources: 2,
        maxInterfaces: 2,
        maxUsers: 5,
        maxExecutionsPerMonth: 10000,
      };
  }
}

export default router;
