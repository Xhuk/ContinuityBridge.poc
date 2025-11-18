import { Router } from "express";
import { z } from "zod";
import * as yaml from "yaml";
import { FlowDSLParser } from "../flow/flow-dsl.js";
import { logger } from "../core/logger.js";
import { createAuthGuard } from "../middleware/auth-guard.js";
import { IStorage } from "../../storage.js";
import { TenantQuotaManager } from "../core/tenant-quotas.js";

const log = logger.child("FlowDSLAPI");
const router = Router();
const requireAuth = createAuthGuard();

// Validation schemas
const ImportFlowSchema = z.object({
  dsl: z.string(),
  format: z.enum(["yaml", "json"]).default("yaml"),
  organizationId: z.string().optional(),
});

const ExportFormatSchema = z.object({
  format: z.enum(["yaml", "json"]).default("yaml"),
});

/**
 * Initialize Flow DSL API routes
 */
export function initFlowDSLAPI(storage: IStorage, quotaManager: TenantQuotaManager) {
  
  /**
   * POST /api/flows/import
   * Import a flow from YAML/JSON DSL
   */
  router.post("/import", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const body = ImportFlowSchema.parse(req.body);
      
      const organizationId = body.organizationId || user.organizationId;
      
      // Check quota
      const quotaCheck = await quotaManager.checkQuota(organizationId, "maxFlows");
      if (!quotaCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: quotaCheck.reason,
          currentUsage: quotaCheck.currentUsage,
          limit: quotaCheck.limit,
        });
      }
      
      // Parse DSL to FlowDefinition
      const flowDefinition = FlowDSLParser.parse(body.dsl, body.format);
      
      // Override organizationId if provided
      if (organizationId) {
        flowDefinition.metadata = {
          ...flowDefinition.metadata,
          organizationId,
        };
      }
      
      // Store flow
      await storage.createFlow(flowDefinition);
      
      // Increment quota
      await quotaManager.incrementUsage(organizationId, "flowCount");
      
      log.info("Flow imported from DSL", {
        flowId: flowDefinition.id,
        flowName: flowDefinition.name,
        format: body.format,
        organizationId,
        userId: user.email,
      });
      
      res.json({
        success: true,
        flow: flowDefinition,
      });
      
    } catch (error: any) {
      log.error("Flow import failed", { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  /**
   * GET /api/flows/:flowId/export
   * Export a flow to YAML/JSON DSL
   */
  router.get("/:flowId/export", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { flowId } = req.params;
      const query = ExportFormatSchema.parse(req.query);
      
      // Get flow
      const flow = await storage.getFlow(flowId);
      
      if (!flow) {
        return res.status(404).json({
          success: false,
          error: "Flow not found",
        });
      }
      
      // Authorization check
      const flowOrgId = (flow as any).metadata?.organizationId;
      if (flowOrgId && flowOrgId !== user.organizationId && user.role !== "superadmin") {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }
      
      // Export to DSL
      const dsl = FlowDSLParser.export(flow, query.format);
      
      log.info("Flow exported to DSL", {
        flowId,
        flowName: flow.name,
        format: query.format,
        userId: user.email,
      });
      
      // Set content type
      const contentType = query.format === "yaml" 
        ? "application/x-yaml" 
        : "application/json";
      
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${flow.name}.${query.format}"`);
      res.send(dsl);
      
    } catch (error: any) {
      log.error("Flow export failed", { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  /**
   * POST /api/flows/:flowId/validate
   * Validate a flow DSL without importing
   */
  router.post("/:flowId/validate", requireAuth, async (req, res) => {
    try {
      const body = ImportFlowSchema.parse(req.body);
      
      // Parse DSL (will throw if invalid)
      const flowDefinition = FlowDSLParser.parse(body.dsl, body.format);
      
      res.json({
        success: true,
        valid: true,
        flow: {
          name: flowDefinition.name,
          version: flowDefinition.version,
          nodeCount: flowDefinition.nodes.length,
          edgeCount: flowDefinition.edges.length,
        },
      });
      
    } catch (error: any) {
      res.status(400).json({
        success: false,
        valid: false,
        error: error.message,
      });
    }
  });
  
  return router;
}

export default router;
