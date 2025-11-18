import { Router } from "express";
import { z } from "zod";
import { FlowVersionManager } from "../versioning/flow-version-manager.js";
import { logger } from "../core/logger.js";
import { createAuthGuard } from "../middleware/auth-guard.js";
import { IStorage } from "../../storage.js";
import { TenantQuotaManager } from "../core/tenant-quotas.js";

const log = logger.child("FlowVersioningAPI");
const router = Router();
const requireAuth = createAuthGuard();

// Validation schemas
const CreateVersionSchema = z.object({
  changeType: z.enum(["major", "minor", "patch"]),
  changeDescription: z.string().min(10),
  environment: z.enum(["dev", "staging", "prod"]).default("dev"),
});

const ApproveVersionSchema = z.object({
  approved: z.boolean(),
  comments: z.string().optional(),
});

const RollbackSchema = z.object({
  targetVersionId: z.string(),
  reason: z.string().min(10),
});

/**
 * Initialize Flow Versioning API routes
 */
export function initFlowVersioningAPI(
  storage: IStorage,
  versionManager: FlowVersionManager,
  quotaManager: TenantQuotaManager
) {
  
  /**
   * POST /api/flows/:flowId/versions
   * Create a new version of a flow
   */
  router.post("/:flowId/versions", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { flowId } = req.params;
      const body = CreateVersionSchema.parse(req.body);
      
      // Get current flow
      const flow = await storage.getFlow(flowId);
      
      if (!flow) {
        return res.status(404).json({
          success: false,
          error: "Flow not found",
        });
      }
      
      // Check authorization
      const flowOrgId = (flow as any).metadata?.organizationId || user.organizationId;
      if (flowOrgId !== user.organizationId && user.role !== "superadmin") {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }
      
      // Create version
      const version = await versionManager.createVersion({
        flowId,
        organizationId: flowOrgId,
        environment: body.environment,
        definition: flow,
        changeType: body.changeType,
        changeDescription: body.changeDescription,
        createdBy: user.id,
        createdByEmail: user.email,
      });
      
      log.info("Version created", {
        flowId,
        versionId: version.id,
        version: version.version,
        environment: body.environment,
        userId: user.email,
      });
      
      res.json({
        success: true,
        version,
      });
      
    } catch (error: any) {
      log.error("Version creation failed", { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  /**
   * GET /api/flows/:flowId/versions
   * List all versions of a flow
   */
  router.get("/:flowId/versions", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { flowId } = req.params;
      const environment = (req.query.environment as "dev" | "staging" | "prod") || "dev";
      
      // Get flow
      const flow = await storage.getFlow(flowId);
      
      if (!flow) {
        return res.status(404).json({
          success: false,
          error: "Flow not found",
        });
      }
      
      // Check authorization
      const flowOrgId = (flow as any).metadata?.organizationId || user.organizationId;
      if (flowOrgId !== user.organizationId && user.role !== "superadmin") {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }
      
      // Get version history
      const versions = await versionManager.getVersionHistory(flowId, flowOrgId, environment);
      
      res.json({
        success: true,
        flowId,
        environment,
        versions,
        count: versions.length,
      });
      
    } catch (error: any) {
      log.error("Failed to get version history", { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  /**
   * POST /api/flows/versions/:versionId/approve
   * Approve a pending version (Superadmin only)
   */
  router.post("/versions/:versionId/approve", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { versionId } = req.params;
      const body = ApproveVersionSchema.parse(req.body);
      
      // Only superadmin can approve
      if (user.role !== "superadmin") {
        return res.status(403).json({
          success: false,
          error: "Only superadmin can approve versions",
        });
      }
      
      if (!body.approved) {
        return res.status(400).json({
          success: false,
          error: "Approval must be true to approve version",
        });
      }
      
      // Approve version
      const approvedVersion = await versionManager.approveVersion({
        versionId,
        approvedBy: user.id,
        approvedByEmail: user.email,
      });
      
      log.info("Version approved", {
        versionId,
        version: approvedVersion.version,
        approvedBy: user.email,
      });
      
      res.json({
        success: true,
        version: approvedVersion,
      });
      
    } catch (error: any) {
      log.error("Version approval failed", { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  /**
   * POST /api/flows/versions/:versionId/deploy
   * Deploy an approved version
   */
  router.post("/versions/:versionId/deploy", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { versionId } = req.params;
      
      // Deploy version
      const deployedVersion = await versionManager.deployVersion(versionId);
      
      log.info("Version deployed", {
        versionId,
        version: deployedVersion.version,
        environment: deployedVersion.environment,
        deployedBy: user.email,
      });
      
      res.json({
        success: true,
        version: deployedVersion,
      });
      
    } catch (error: any) {
      log.error("Version deployment failed", { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  /**
   * POST /api/flows/:flowId/rollback
   * Rollback to a previous version (PROD only)
   */
  router.post("/:flowId/rollback", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { flowId } = req.params;
      const body = RollbackSchema.parse(req.body);
      
      // Only superadmin can rollback
      if (user.role !== "superadmin") {
        return res.status(403).json({
          success: false,
          error: "Only superadmin can perform rollbacks",
        });
      }
      
      // Get flow
      const flow = await storage.getFlow(flowId);
      
      if (!flow) {
        return res.status(404).json({
          success: false,
          error: "Flow not found",
        });
      }
      
      const flowOrgId = (flow as any).metadata?.organizationId || user.organizationId;
      
      // Perform rollback
      const rolledBackVersion = await versionManager.rollbackVersion({
        flowId,
        organizationId: flowOrgId,
        targetVersionId: body.targetVersionId,
        rolledBackBy: user.id,
        rolledBackByEmail: user.email,
      });
      
      log.warn("Flow rolled back", {
        flowId,
        targetVersionId: body.targetVersionId,
        newVersion: rolledBackVersion.version,
        reason: body.reason,
        rolledBackBy: user.email,
      });
      
      res.json({
        success: true,
        version: rolledBackVersion,
        message: `Successfully rolled back to version ${body.targetVersionId}`,
      });
      
    } catch (error: any) {
      log.error("Rollback failed", { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  /**
   * GET /api/flows/:flowId/current-version
   * Get currently deployed version
   */
  router.get("/:flowId/current-version", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { flowId } = req.params;
      const environment = (req.query.environment as "dev" | "staging" | "prod") || "prod";
      
      // Get flow
      const flow = await storage.getFlow(flowId);
      
      if (!flow) {
        return res.status(404).json({
          success: false,
          error: "Flow not found",
        });
      }
      
      const flowOrgId = (flow as any).metadata?.organizationId || user.organizationId;
      
      // Get current version
      const currentVersion = await versionManager.getCurrentVersion(flowId, flowOrgId, environment);
      
      if (!currentVersion) {
        return res.status(404).json({
          success: false,
          error: "No deployed version found",
        });
      }
      
      res.json({
        success: true,
        version: currentVersion,
      });
      
    } catch (error: any) {
      log.error("Failed to get current version", { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  return router;
}

export default router;
import { Router } from "express";
import { z } from "zod";
import { FlowVersionManager } from "../versioning/flow-version-manager.js";
import { logger } from "../core/logger.js";
import { createAuthGuard } from "../middleware/auth-guard.js";
import { IStorage } from "../../storage.js";
import { TenantQuotaManager } from "../core/tenant-quotas.js";

const log = logger.child("FlowVersioningAPI");
const router = Router();
const requireAuth = createAuthGuard();

// Validation schemas
const CreateVersionSchema = z.object({
  changeType: z.enum(["major", "minor", "patch"]),
  changeDescription: z.string().min(10),
  environment: z.enum(["dev", "staging", "prod"]).default("dev"),
});

const ApproveVersionSchema = z.object({
  approved: z.boolean(),
  comments: z.string().optional(),
});

const RollbackSchema = z.object({
  targetVersionId: z.string(),
  reason: z.string().min(10),
});

/**
 * Initialize Flow Versioning API routes
 */
export function initFlowVersioningAPI(
  storage: IStorage,
  versionManager: FlowVersionManager,
  quotaManager: TenantQuotaManager
) {
  
  /**
   * POST /api/flows/:flowId/versions
   * Create a new version of a flow
   */
  router.post("/:flowId/versions", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { flowId } = req.params;
      const body = CreateVersionSchema.parse(req.body);
      
      // Get current flow
      const flow = await storage.getFlow(flowId);
      
      if (!flow) {
        return res.status(404).json({
          success: false,
          error: "Flow not found",
        });
      }
      
      // Check authorization
      const flowOrgId = (flow as any).metadata?.organizationId || user.organizationId;
      if (flowOrgId !== user.organizationId && user.role !== "superadmin") {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }
      
      // Create version
      const version = await versionManager.createVersion({
        flowId,
        organizationId: flowOrgId,
        environment: body.environment,
        definition: flow,
        changeType: body.changeType,
        changeDescription: body.changeDescription,
        createdBy: user.id,
        createdByEmail: user.email,
      });
      
      log.info("Version created", {
        flowId,
        versionId: version.id,
        version: version.version,
        environment: body.environment,
        userId: user.email,
      });
      
      res.json({
        success: true,
        version,
      });
      
    } catch (error: any) {
      log.error("Version creation failed", { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  /**
   * GET /api/flows/:flowId/versions
   * List all versions of a flow
   */
  router.get("/:flowId/versions", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { flowId } = req.params;
      const environment = (req.query.environment as "dev" | "staging" | "prod") || "dev";
      
      // Get flow
      const flow = await storage.getFlow(flowId);
      
      if (!flow) {
        return res.status(404).json({
          success: false,
          error: "Flow not found",
        });
      }
      
      // Check authorization
      const flowOrgId = (flow as any).metadata?.organizationId || user.organizationId;
      if (flowOrgId !== user.organizationId && user.role !== "superadmin") {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }
      
      // Get version history
      const versions = await versionManager.getVersionHistory(flowId, flowOrgId, environment);
      
      res.json({
        success: true,
        flowId,
        environment,
        versions,
        count: versions.length,
      });
      
    } catch (error: any) {
      log.error("Failed to get version history", { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  /**
   * POST /api/flows/versions/:versionId/approve
   * Approve a pending version (Superadmin only)
   */
  router.post("/versions/:versionId/approve", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { versionId } = req.params;
      const body = ApproveVersionSchema.parse(req.body);
      
      // Only superadmin can approve
      if (user.role !== "superadmin") {
        return res.status(403).json({
          success: false,
          error: "Only superadmin can approve versions",
        });
      }
      
      if (!body.approved) {
        return res.status(400).json({
          success: false,
          error: "Approval must be true to approve version",
        });
      }
      
      // Approve version
      const approvedVersion = await versionManager.approveVersion({
        versionId,
        approvedBy: user.id,
        approvedByEmail: user.email,
      });
      
      log.info("Version approved", {
        versionId,
        version: approvedVersion.version,
        approvedBy: user.email,
      });
      
      res.json({
        success: true,
        version: approvedVersion,
      });
      
    } catch (error: any) {
      log.error("Version approval failed", { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  /**
   * POST /api/flows/versions/:versionId/deploy
   * Deploy an approved version
   */
  router.post("/versions/:versionId/deploy", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { versionId } = req.params;
      
      // Deploy version
      const deployedVersion = await versionManager.deployVersion(versionId);
      
      log.info("Version deployed", {
        versionId,
        version: deployedVersion.version,
        environment: deployedVersion.environment,
        deployedBy: user.email,
      });
      
      res.json({
        success: true,
        version: deployedVersion,
      });
      
    } catch (error: any) {
      log.error("Version deployment failed", { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  /**
   * POST /api/flows/:flowId/rollback
   * Rollback to a previous version (PROD only)
   */
  router.post("/:flowId/rollback", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { flowId } = req.params;
      const body = RollbackSchema.parse(req.body);
      
      // Only superadmin can rollback
      if (user.role !== "superadmin") {
        return res.status(403).json({
          success: false,
          error: "Only superadmin can perform rollbacks",
        });
      }
      
      // Get flow
      const flow = await storage.getFlow(flowId);
      
      if (!flow) {
        return res.status(404).json({
          success: false,
          error: "Flow not found",
        });
      }
      
      const flowOrgId = (flow as any).metadata?.organizationId || user.organizationId;
      
      // Perform rollback
      const rolledBackVersion = await versionManager.rollbackVersion({
        flowId,
        organizationId: flowOrgId,
        targetVersionId: body.targetVersionId,
        rolledBackBy: user.id,
        rolledBackByEmail: user.email,
      });
      
      log.warn("Flow rolled back", {
        flowId,
        targetVersionId: body.targetVersionId,
        newVersion: rolledBackVersion.version,
        reason: body.reason,
        rolledBackBy: user.email,
      });
      
      res.json({
        success: true,
        version: rolledBackVersion,
        message: `Successfully rolled back to version ${body.targetVersionId}`,
      });
      
    } catch (error: any) {
      log.error("Rollback failed", { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  /**
   * GET /api/flows/:flowId/current-version
   * Get currently deployed version
   */
  router.get("/:flowId/current-version", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { flowId } = req.params;
      const environment = (req.query.environment as "dev" | "staging" | "prod") || "prod";
      
      // Get flow
      const flow = await storage.getFlow(flowId);
      
      if (!flow) {
        return res.status(404).json({
          success: false,
          error: "Flow not found",
        });
      }
      
      const flowOrgId = (flow as any).metadata?.organizationId || user.organizationId;
      
      // Get current version
      const currentVersion = await versionManager.getCurrentVersion(flowId, flowOrgId, environment);
      
      if (!currentVersion) {
        return res.status(404).json({
          success: false,
          error: "No deployed version found",
        });
      }
      
      res.json({
        success: true,
        version: currentVersion,
      });
      
    } catch (error: any) {
      log.error("Failed to get current version", { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  return router;
}

export default router;
