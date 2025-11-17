import { Router, Request, Response } from "express";
import { db } from "../../db";
import { configurationVersions } from "../../schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { authenticateUser } from "../auth/rbac-middleware";
import { logger } from "../core/logger";

const router = Router();

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
      configuration: devVersion.configuration,
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
      configuration: stagingVersion.configuration,
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
