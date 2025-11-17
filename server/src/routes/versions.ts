import { Router, Request, Response } from "express";
import { db } from "../../db";
import { configurationVersions, changeRequests, deploymentHistory, users } from "../../schema";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { authenticateUser } from "../auth/rbac-middleware";
import { logger } from "../core/logger";

const router = Router();

/**
 * GET /api/versions
 * List all configuration versions for organization (or all if superadmin)
 */
router.get("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const isSuperadmin = req.user?.role === "superadmin";
    const { organizationId, status } = req.query;

    let query = (db.select() as any).from(configurationVersions);

    // Filter by organization (unless superadmin viewing all)
    if (!isSuperadmin) {
      query = query.where(eq(configurationVersions.organizationId, req.user?.organizationId || ""));
    } else if (organizationId) {
      query = query.where(eq(configurationVersions.organizationId, organizationId as string));
    }

    // Filter by status
    if (status) {
      query = query.where(eq(configurationVersions.status, status as string));
    }

    const versions = await query.orderBy(desc(configurationVersions.createdAt)).all();

    res.json({
      success: true,
      versions,
      count: versions.length,
    });
  } catch (error: any) {
    logger.error("Failed to list versions", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/versions/:id
 * Get specific version details
 */
router.get("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const version = await (db.select() as any)
      .from(configurationVersions)
      .where(eq(configurationVersions.id, req.params.id))
      .get();

    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }

    // Authorization: superadmin or same org
    if (req.user?.role !== "superadmin" && version.organizationId !== req.user?.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json(version);
  } catch (error: any) {
    logger.error("Failed to get version", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/versions
 * Create new draft version (snapshot current config)
 * Environment-aware: DEV versions don't require approval
 */
router.post("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const { label, description, changeType = "patch", targetEnvironment = "dev" } = req.body;

    const organizationId = req.user?.organizationId;
    const organizationName = req.user?.organizationName;

    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    // Validate environment
    if (!['dev', 'staging', 'prod'].includes(targetEnvironment)) {
      return res.status(400).json({ error: "Invalid targetEnvironment. Must be: dev, staging, or prod" });
    }

    // Get latest version for this environment to increment
    const latestVersion = await (db.select() as any)
      .from(configurationVersions)
      .where(
        and(
          eq(configurationVersions.organizationId, organizationId),
          eq(configurationVersions.targetEnvironment, targetEnvironment)
        )
      )
      .orderBy(desc(configurationVersions.versionMajor), desc(configurationVersions.versionMinor), desc(configurationVersions.versionPatch))
      .get();

    let newMajor = 1, newMinor = 0, newPatch = 0;

    if (latestVersion) {
      switch (changeType) {
        case "major":
          newMajor = latestVersion.versionMajor + 1;
          newMinor = 0;
          newPatch = 0;
          break;
        case "minor":
          newMajor = latestVersion.versionMajor;
          newMinor = latestVersion.versionMinor + 1;
          newPatch = 0;
          break;
        case "patch":
        default:
          newMajor = latestVersion.versionMajor;
          newMinor = latestVersion.versionMinor;
          newPatch = latestVersion.versionPatch + 1;
          break;
      }
    }

    const newVersion = `${newMajor}.${newMinor}.${newPatch}`;

    // TODO: Snapshot current configuration (flows, interfaces, mappings, etc.)
    // For now, pass empty config - implement in next iteration
    const configuration = {
      flows: [],
      interfaces: [],
      dataSources: [],
      mappings: [],
      settings: {},
    };

    const versionId = randomUUID();

    await (db.insert(configurationVersions) as any).values({
      id: versionId,
      organizationId,
      organizationName: organizationName || "Unknown",
      targetEnvironment,
      version: newVersion,
      versionMajor: newMajor,
      versionMinor: newMinor,
      versionPatch: newPatch,
      label,
      description,
      changeType,
      status: "draft",
      isImmutable: false, // Draft versions are always mutable
      configuration,
      createdBy: req.user?.id || "",
      createdByEmail: req.user?.email || "",
      previousVersionId: latestVersion?.id || null,
    }).run();

    logger.info(`Configuration version ${newVersion} created for ${targetEnvironment}`, {
      scope: "customer",
      organizationId,
      userId: req.user?.id,
      versionId,
      targetEnvironment,
    });

    res.status(201).json({
      success: true,
      message: `Version ${newVersion} created for ${targetEnvironment.toUpperCase()} environment`,
      version: {
        id: versionId,
        version: newVersion,
        targetEnvironment,
        status: "draft",
        requiresApproval: targetEnvironment === "prod",
      },
    });
  } catch (error: any) {
    logger.error("Failed to create version", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/versions/:id/submit-for-approval
 * Contractor submits version for superadmin approval
 */
router.post("/:id/submit-for-approval", authenticateUser, async (req: Request, res: Response) => {
  try {
    const version = await (db.select() as any)
      .from(configurationVersions)
      .where(eq(configurationVersions.id, req.params.id))
      .get();

    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }

    // Authorization check
    if (req.user?.role !== "superadmin" && version.organizationId !== req.user?.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (version.status !== "draft") {
      return res.status(400).json({ error: `Version is already ${version.status}` });
    }

    await (db.update(configurationVersions) as any)
      .set({
        status: "pending_approval",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(configurationVersions.id, req.params.id))
      .run();

    logger.info(`Version ${version.version} submitted for approval`, {
      scope: "customer",
      organizationId: version.organizationId,
      userId: req.user?.id,
      versionId: version.id,
    });

    // TODO: Send email notification to superadmin

    res.json({
      success: true,
      message: "Version submitted for approval",
    });
  } catch (error: any) {
    logger.error("Failed to submit version", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/versions/:id/approve
 * Superadmin approves version
 * 🔒 Superadmin only
 */
router.post("/:id/approve", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const version = await (db.select() as any)
      .from(configurationVersions)
      .where(eq(configurationVersions.id, req.params.id))
      .get();

    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }

    if (version.status !== "pending_approval") {
      return res.status(400).json({ error: `Cannot approve version with status: ${version.status}` });
    }

    await (db.update(configurationVersions) as any)
      .set({
        status: "approved",
        approvedBy: req.user?.id,
        approvedByEmail: req.user?.email,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(configurationVersions.id, req.params.id))
      .run();

    logger.info(`Version ${version.version} approved by superadmin`, {
      scope: "superadmin",
      organizationId: version.organizationId,
      userId: req.user?.id,
      versionId: version.id,
    });

    res.json({
      success: true,
      message: `Version ${version.version} approved. Ready to deploy.`,
    });
  } catch (error: any) {
    logger.error("Failed to approve version", error, {
      scope: "superadmin",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/versions/:id/reject
 * Superadmin rejects version
 * 🔒 Superadmin only
 */
router.post("/:id/reject", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const { reason } = req.body;

    const version = await (db.select() as any)
      .from(configurationVersions)
      .where(eq(configurationVersions.id, req.params.id))
      .get();

    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }

    // Revert to draft with rejection notes
    await (db.update(configurationVersions) as any)
      .set({
        status: "draft",
        metadata: { ...version.metadata, rejectionReason: reason },
        updatedAt: new Date().toISOString(),
      })
      .where(eq(configurationVersions.id, req.params.id))
      .run();

    logger.warn(`Version ${version.version} rejected by superadmin`, {
      scope: "superadmin",
      organizationId: version.organizationId,
      userId: req.user?.id,
      versionId: version.id,
      reason,
    });

    res.json({
      success: true,
      message: `Version ${version.version} rejected. Reverted to draft.`,
    });
  } catch (error: any) {
    logger.error("Failed to reject version", error, {
      scope: "superadmin",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/versions/:id/deploy
 * Deploy approved version to customer Docker
 * 🔒 Superadmin only
 * Environment-aware: DEV = instant deploy, PROD = requires approval + makes immutable
 */
router.post("/:id/deploy", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const { dockerRegistryUrl, deploymentMethod = "docker" } = req.body;

    const version = await (db.select() as any)
      .from(configurationVersions)
      .where(eq(configurationVersions.id, req.params.id))
      .get();

    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }

    // Environment-based validation
    if (version.targetEnvironment === "prod") {
      // PROD requires approval
      if (version.status !== "approved") {
        return res.status(400).json({
          error: `PROD version must be approved before deployment. Current status: ${version.status}`,
          hint: "Submit for approval first, then deploy after superadmin approval"
        });
      }
    } else {
      // DEV/STAGING can deploy without approval
      if (version.status !== "approved" && version.status !== "draft") {
        return res.status(400).json({
          error: `Cannot deploy version with status: ${version.status}`
        });
      }
    }

    // Create deployment record
    const deploymentId = randomUUID();
    const dockerImageTag = `continuitybridge-${version.organizationId}:${version.version}-${version.targetEnvironment}`;

    await (db.insert(deploymentHistory) as any).values({
      id: deploymentId,
      organizationId: version.organizationId,
      organizationName: version.organizationName,
      environment: version.targetEnvironment,
      versionId: version.id,
      version: version.version,
      deploymentType: "update",
      deploymentMethod,
      dockerImageTag,
      dockerRegistryUrl: dockerRegistryUrl || process.env.DOCKER_REGISTRY_URL,
      status: "pending",
      deployedBy: req.user?.id || "",
      deployedByEmail: req.user?.email || "",
    }).run();

    // Update version status and set immutability for PROD
    const updateData: any = {
      status: "deployed",
      deployedAt: new Date().toISOString(),
      deploymentMethod,
      dockerImageTag,
      dockerRegistryUrl: dockerRegistryUrl || process.env.DOCKER_REGISTRY_URL,
      updatedAt: new Date().toISOString(),
    };

    // PROD versions become immutable after deployment
    if (version.targetEnvironment === "prod") {
      updateData.isImmutable = true;
    }

    await (db.update(configurationVersions) as any)
      .set(updateData)
      .where(eq(configurationVersions.id, req.params.id))
      .run();

    logger.info(`Version ${version.version} deployment initiated to ${version.targetEnvironment.toUpperCase()}`, {
      scope: "superadmin",
      organizationId: version.organizationId,
      userId: req.user?.id,
      versionId: version.id,
      deploymentId,
      environment: version.targetEnvironment,
      isImmutable: version.targetEnvironment === "prod",
    });

    // TODO: Trigger actual Docker build & push (implement in next iteration)
    // For now, return success with deployment tracking ID

    res.json({
      success: true,
      message: `Version ${version.version} deployment initiated to ${version.targetEnvironment.toUpperCase()} environment`,
      deployment: {
        id: deploymentId,
        version: version.version,
        environment: version.targetEnvironment,
        dockerImageTag,
        status: "pending",
        isImmutable: version.targetEnvironment === "prod",
      },
      warning: version.targetEnvironment === "prod"
        ? "⚠️ PROD deployment makes this version IMMUTABLE. Changes require a new version."
        : null,
    });
  } catch (error: any) {
    logger.error("Failed to deploy version", error, {
      scope: "superadmin",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/versions/:id/deployments
 * Get deployment history for version
 */
router.get("/:id/deployments", authenticateUser, async (req: Request, res: Response) => {
  try {
    const deployments = await (db.select() as any)
      .from(deploymentHistory)
      .where(eq(deploymentHistory.versionId, req.params.id))
      .orderBy(desc(deploymentHistory.createdAt))
      .all();

    res.json({
      success: true,
      deployments,
      count: deployments.length,
    });
  } catch (error: any) {
    logger.error("Failed to get deployments", error, {
      scope: "customer",
      userId: req.user?.id,
    });
    res.status(500).json({ error: error.message });
  }
});

export default router;
