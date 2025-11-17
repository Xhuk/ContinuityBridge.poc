import { Router, Request, Response } from "express";
import { db } from "../../db";
import { configurationVersions } from "../../schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { authenticateUser } from "../auth/rbac-middleware";
import { logger } from "../core/logger";

const router = Router();

/**
 * Filter configuration based on target environment
 * - STAGING: Excludes SuperAdmin pages/routes
 * - PROD: Excludes SuperAdmin AND Consultant pages/routes
 */
function filterConfigurationForEnvironment(config: any, targetEnv: "staging" | "prod"): any {
  if (!config) return config;

  const filtered = JSON.parse(JSON.stringify(config)); // Deep clone

  // List of SuperAdmin-only routes/features to exclude
  const superAdminRoutes = [
    "/admin/projects",
    "/api/admin/projects",
  ];

  // List of Consultant-only routes/features to exclude (only in PROD)
  const consultantRoutes = [
    "/tenant-selector",
    "/api/consultant/tenants",
    "/api/consultant/select-tenant",
  ];

  // Filter flows (if present)
  if (filtered.flows && Array.isArray(filtered.flows)) {
    filtered.flows = filtered.flows.filter((flow: any) => {
      // Exclude SuperAdmin flows (both staging and prod)
      if (flow.tags?.includes("superadmin-only")) return false;
      // Exclude Consultant flows (only in prod)
      if (targetEnv === "prod" && flow.tags?.includes("consultant-only")) return false;
      return true;
    });
  }

  // Filter routes/pages configuration (if present)
  if (filtered.routes && Array.isArray(filtered.routes)) {
    filtered.routes = filtered.routes.filter((route: string) => {
      // Exclude SuperAdmin routes (both staging and prod)
      if (superAdminRoutes.some(r => route.includes(r))) return false;
      // Exclude Consultant routes (only in prod)
      if (targetEnv === "prod" && consultantRoutes.some(r => route.includes(r))) return false;
      return true;
    });
  }

  // Filter settings/features (if present)
  if (filtered.settings) {
    // Remove SuperAdmin settings (both staging and prod)
    delete filtered.settings?.superadminFeatures;
    // Remove Consultant settings (only in prod)
    if (targetEnv === "prod") {
      delete filtered.settings?.consultantFeatures;
      delete filtered.settings?.tenantSelection;
    }
  }

  // Add metadata about filtering
  filtered._filtered = {
    environment: targetEnv,
    excludedFeatures: targetEnv === "prod" 
      ? ["SuperAdmin pages", "Consultant tenant selection", "Project management"]
      : ["SuperAdmin pages", "Project management"],
    filteredAt: new Date().toISOString(),
  };

  logger.info(`Configuration filtered for ${targetEnv.toUpperCase()}`, {
    scope: "superadmin",
    excludedRoutes: targetEnv === "prod" 
      ? [...superAdminRoutes, ...consultantRoutes]
      : superAdminRoutes,
  });

  return filtered;
}

/**
 * POST /api/environment-promotion/dev-to-staging
 * Promote DEV version to STAGING
 * 🔒 Contractor can promote dev → staging
 */
router.post("/dev-to-staging", authenticateUser, async (req: Request, res: Response) => {
  try {
    const { devVersionId } = req.body;

    if (!devVersionId) {
      return res.status(400).json({ error: "devVersionId required" });
    }

    const devVersion = await (db.select() as any)
      .from(configurationVersions)
      .where(eq(configurationVersions.id, devVersionId))
      .get();

    if (!devVersion) {
      return res.status(404).json({ error: "DEV version not found" });
    }

    // Validate it's a DEV version
    if (devVersion.targetEnvironment !== "dev") {
      return res.status(400).json({
        error: `This is a ${devVersion.targetEnvironment.toUpperCase()} version. Only DEV versions can be promoted to STAGING.`
      });
    }

    // Validate authorization
    if (req.user?.role !== "superadmin" && devVersion.organizationId !== req.user?.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Clone config to STAGING with new version
    const stagingVersionId = randomUUID();
    const stagingVersion = `${devVersion.versionMajor}.${devVersion.versionMinor}.${devVersion.versionPatch}`;

    // Filter configuration: Remove SuperAdmin routes/features for STAGING
    const filteredConfig = filterConfigurationForEnvironment(devVersion.configuration, "staging");

    await (db.insert(configurationVersions) as any).values({
      id: stagingVersionId,
      organizationId: devVersion.organizationId,
      organizationName: devVersion.organizationName,
      targetEnvironment: "staging",
      version: stagingVersion,
      versionMajor: devVersion.versionMajor,
      versionMinor: devVersion.versionMinor,
      versionPatch: devVersion.versionPatch,
      label: `${devVersion.label} (from DEV)`,
      description: `Promoted from DEV version ${devVersion.version}`,
      changeType: devVersion.changeType,
      status: "draft",
      isImmutable: false,
      configuration: filteredConfig, // Filtered configuration (SuperAdmin excluded)
      changesSummary: devVersion.changesSummary,
      createdBy: req.user?.id || "",
      createdByEmail: req.user?.email || "",
      previousVersionId: devVersion.id,
      metadata: {
        promotedFrom: {
          environment: "dev",
          versionId: devVersion.id,
          version: devVersion.version
        }
      }
    }).run();

    logger.info(`Version ${devVersion.version} promoted from DEV to STAGING`, {
      scope: "customer",
      organizationId: devVersion.organizationId,
      userId: req.user?.id,
      devVersionId,
      stagingVersionId,
    });

    res.json({
      success: true,
      message: `Version ${devVersion.version} promoted to STAGING`,
      stagingVersion: {
        id: stagingVersionId,
        version: stagingVersion,
        environment: "staging",
        status: "draft"
      }
    });
  } catch (error: any) {
    logger.error("Failed to promote DEV to STAGING", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/environment-promotion/staging-to-prod
 * Promote STAGING version to PROD (requires superadmin approval)
 * 🔒 Contractor can initiate, Superadmin must approve
 */
router.post("/staging-to-prod", authenticateUser, async (req: Request, res: Response) => {
  try {
    const { stagingVersionId } = req.body;

    if (!stagingVersionId) {
      return res.status(400).json({ error: "stagingVersionId required" });
    }

    const stagingVersion = await (db.select() as any)
      .from(configurationVersions)
      .where(eq(configurationVersions.id, stagingVersionId))
      .get();

    if (!stagingVersion) {
      return res.status(404).json({ error: "STAGING version not found" });
    }

    // Validate it's a STAGING version
    if (stagingVersion.targetEnvironment !== "staging") {
      return res.status(400).json({
        error: `This is a ${stagingVersion.targetEnvironment.toUpperCase()} version. Only STAGING versions can be promoted to PROD.`
      });
    }

    // Validate authorization
    if (req.user?.role !== "superadmin" && stagingVersion.organizationId !== req.user?.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Clone config to PROD with same version
    const prodVersionId = randomUUID();
    const prodVersion = `${stagingVersion.versionMajor}.${stagingVersion.versionMinor}.${stagingVersion.versionPatch}`;

    // Filter configuration: Remove SuperAdmin AND Consultant routes/features for PROD
    const filteredConfig = filterConfigurationForEnvironment(stagingVersion.configuration, "prod");

    await (db.insert(configurationVersions) as any).values({
      id: prodVersionId,
      organizationId: stagingVersion.organizationId,
      organizationName: stagingVersion.organizationName,
      targetEnvironment: "prod",
      version: prodVersion,
      versionMajor: stagingVersion.versionMajor,
      versionMinor: stagingVersion.versionMinor,
      versionPatch: stagingVersion.versionPatch,
      label: `${stagingVersion.label} (PROD)`,
      description: `Promoted from STAGING version ${stagingVersion.version}`,
      changeType: stagingVersion.changeType,
      status: "pending_approval", // PROD always requires approval
      isImmutable: false, // Will become immutable after deployment
      configuration: filteredConfig, // Filtered configuration (SuperAdmin + Consultant excluded)
      changesSummary: stagingVersion.changesSummary,
      createdBy: req.user?.id || "",
      createdByEmail: req.user?.email || "",
      previousVersionId: stagingVersion.id,
      metadata: {
        promotedFrom: {
          environment: "staging",
          versionId: stagingVersion.id,
          version: stagingVersion.version
        }
      }
    }).run();

    logger.info(`Version ${stagingVersion.version} promoted from STAGING to PROD (pending approval)`, {
      scope: "customer",
      organizationId: stagingVersion.organizationId,
      userId: req.user?.id,
      stagingVersionId,
      prodVersionId,
    });

    res.json({
      success: true,
      message: `Version ${stagingVersion.version} promoted to PROD (pending superadmin approval)`,
      prodVersion: {
        id: prodVersionId,
        version: prodVersion,
        environment: "prod",
        status: "pending_approval",
        requiresApproval: true
      },
      warning: "⚠️ PROD version requires superadmin approval before deployment"
    });
  } catch (error: any) {
    logger.error("Failed to promote STAGING to PROD", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

export default router;
