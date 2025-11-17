import { Router, Request, Response } from "express";
import { geminiService } from "../ai/gemini-service.js";
import { aiQuotaManager } from "../ai/ai-quota-manager.js";
import { logger } from "../core/logger.js";

const log = logger.child("ai-routes");
const router = Router();

/**
 * AI Assistant Routes
 * Provides AI-powered features for consultants:
 * - Smart mapping generation
 * - Error diagnosis
 * - Flow configuration suggestions
 * - Test data generation
 */

/**
 * GET /api/ai/status
 * Check if AI features are available
 */
router.get("/status", async (req: Request, res: Response) => {
  try {
    const configured = geminiService.isConfigured();
    
    // Get projectId from request context
    const projectId = (req as any).projectId;
    
    if (!projectId) {
      return res.json({
        available: false,
        configured,
        provider: configured ? "gemini" : null,
        features: [],
        message: "No project context found",
      });
    }
    
    // Check if AI is enabled for THIS PROJECT
    const enabled = configured ? await aiQuotaManager.isAIEnabled(projectId) : false;
    
    // Get usage stats for this project
    let stats = null;
    if (enabled) {
      stats = await aiQuotaManager.getUsageStats(projectId);
    }
    
    res.json({
      available: enabled,
      configured,
      provider: configured ? "gemini" : null,
      features: enabled ? [
        "mapping_generation",
        "error_diagnosis",
        "flow_suggestions",
        "test_data_generation",
        "config_explanation",
      ] : [],
      usage: stats,
      scope: "per-project", // Quota is per-project
      projectId,
    });
  } catch (error: any) {
    log.error("Failed to check AI status", { error: error.message });
    res.status(500).json({
      error: "Failed to check AI status",
      message: error.message,
    });
  }
});

/**
 * POST /api/ai/suggest-mappings
 * Generate field mapping suggestions
 * 
 * Body:
 * {
 *   "sourceSchema": {...},
 *   "targetSchema": {...},
 *   "context": "Optional context"
 * }
 */
router.post("/suggest-mappings", async (req: Request, res: Response) => {
  try {
    // Extract project context
    const organizationId = (req as any).user?.organizationId || "unknown";
    const organizationName = (req as any).user?.organizationName;
    const projectId = (req as any).projectId;
    const projectName = (req as any).projectName;
    
    if (!projectId) {
      return res.status(400).json({
        error: "Missing project context",
        message: "projectId is required",
      });
    }
    
    // Check per-PROJECT quota
    const quotaCheck = await aiQuotaManager.checkQuota(projectId, "mapping");
    if (!quotaCheck.allowed) {
      return res.status(429).json({
        error: "Quota exceeded",
        message: quotaCheck.reason,
        remainingRequests: quotaCheck.remainingRequests,
        resetDate: quotaCheck.resetDate,
      });
    }

    if (!geminiService.isConfigured()) {
      return res.status(503).json({
        error: "AI features not available",
        message: "GEMINI_API_KEY not configured",
      });
    }

    const { sourceSchema, targetSchema, context } = req.body;

    if (!sourceSchema || !targetSchema) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "Both sourceSchema and targetSchema are required",
      });
    }

    log.info("Generating mapping suggestions", {
      organizationId,
      projectId,
      sourceFields: Object.keys(sourceSchema).length,
      targetFields: Object.keys(targetSchema).length,
    });

    const startTime = Date.now();
    const mappings = await geminiService.suggestMappings(
      sourceSchema,
      targetSchema,
      context
    );
    const durationMs = Date.now() - startTime;
    
    // Track usage with full project context for AI improvement
    await aiQuotaManager.trackUsage("mapping", {
      organizationId,
      organizationName,
      projectId,
      projectName,
      inputSize: JSON.stringify(req.body).length,
      outputSize: JSON.stringify(mappings).length,
      durationMs,
      success: true,
    });

    res.json({
      mappings,
      confidence: "ai-generated",
      provider: "gemini",
      remainingRequests: quotaCheck.remainingRequests,
    });
  } catch (error: any) {
    log.error("Mapping suggestion failed", { error: error.message });
    
    // Track failed request
    await aiQuotaManager.trackUsage("mapping", {
      organizationId: (req as any).user?.organizationId || "unknown",
      projectId: (req as any).projectId,
      success: false,
      errorType: error.name,
    });
    
    res.status(500).json({
      error: "AI generation failed",
      message: error.message,
    });
  }
});

/**
 * POST /api/ai/diagnose-error
 * Analyze flow error and suggest fixes
 * 
 * Body:
 * {
 *   "flowName": "Order Processing",
 *   "nodeName": "Object Mapper",
 *   "nodeType": "object_mapper",
 *   "errorMessage": "Required field missing: orderId",
 *   "payloadSnapshot": {...},
 *   "stackTrace": "..."
 * }
 */
router.post("/diagnose-error", async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId || "unknown";
    const organizationName = (req as any).user?.organizationName;
    const projectId = (req as any).projectId;
    const projectName = (req as any).projectName;
    
    if (!projectId) {
      return res.status(400).json({
        error: "Missing project context",
        message: "projectId is required",
      });
    }
    
    // Check per-PROJECT quota
    const quotaCheck = await aiQuotaManager.checkQuota(projectId, "diagnosis");
    if (!quotaCheck.allowed) {
      return res.status(429).json({
        error: "Quota exceeded",
        message: quotaCheck.reason,
        remainingRequests: quotaCheck.remainingRequests,
        resetDate: quotaCheck.resetDate,
      });
    }

    if (!geminiService.isConfigured()) {
      return res.status(503).json({
        error: "AI features not available",
        message: "GEMINI_API_KEY not configured",
      });
    }

    const {
      flowName,
      nodeName,
      nodeType,
      errorMessage,
      payloadSnapshot,
      stackTrace,
    } = req.body;

    if (!flowName || !nodeName || !nodeType || !errorMessage) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "flowName, nodeName, nodeType, and errorMessage are required",
      });
    }

    log.info("Diagnosing error", { organizationId, projectId, flowName, nodeName, nodeType });

    const startTime = Date.now();
    const diagnosis = await geminiService.diagnoseError({
      flowName,
      nodeName,
      nodeType,
      errorMessage,
      payloadSnapshot,
      stackTrace,
    });
    const durationMs = Date.now() - startTime;
    
    // Track usage with project context
    await aiQuotaManager.trackUsage("diagnosis", {
      organizationId,
      organizationName,
      projectId,
      projectName,
      flowName,
      nodeType,
      durationMs,
      success: true,
    });

    res.json({
      ...diagnosis,
      provider: "gemini",
      timestamp: new Date().toISOString(),
      remainingRequests: quotaCheck.remainingRequests,
    });
  } catch (error: any) {
    log.error("Error diagnosis failed", { error: error.message });
    
    // Track failed request
    await aiQuotaManager.trackUsage("diagnosis", {
      organizationId: (req as any).user?.organizationId || "unknown",
      success: false,
      errorType: error.name,
    });
    
    res.status(500).json({
      error: "AI diagnosis failed",
      message: error.message,
    });
  }
});

/**
 * POST /api/ai/suggest-flow
 * Generate flow configuration from natural language
 * 
 * Body:
 * {
 *   "requirement": "Pull orders from SAP and push to WMS",
 *   "availableInterfaces": ["SAP ERP", "Manhattan WMS"]
 * }
 */
router.post("/suggest-flow", async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId || "unknown";
    const organizationName = (req as any).user?.organizationName;
    const projectId = (req as any).projectId;
    const projectName = (req as any).projectName;
    
    if (!projectId) {
      return res.status(400).json({
        error: "Missing project context",
        message: "projectId is required",
      });
    }
    
    // Check per-PROJECT quota
    const quotaCheck = await aiQuotaManager.checkQuota(projectId, "flow_suggestion");
    if (!quotaCheck.allowed) {
      return res.status(429).json({
        error: "Quota exceeded",
        message: quotaCheck.reason,
        remainingRequests: quotaCheck.remainingRequests,
        resetDate: quotaCheck.resetDate,
      });
    }

    if (!geminiService.isConfigured()) {
      return res.status(503).json({
        error: "AI features not available",
        message: "GEMINI_API_KEY not configured",
      });
    }

    const { requirement, availableInterfaces } = req.body;

    if (!requirement) {
      return res.status(400).json({
        error: "Missing required field",
        message: "requirement is required",
      });
    }

    log.info("Generating flow suggestion", {
      organizationId,
      projectId,
      requirementLength: requirement.length,
      interfaceCount: availableInterfaces?.length || 0,
    });

    const startTime = Date.now();
    const suggestion = await geminiService.suggestFlowConfiguration(
      requirement,
      availableInterfaces
    );
    const durationMs = Date.now() - startTime;
    
    // Track usage with project context
    await aiQuotaManager.trackUsage("flow_suggestion", {
      organizationId,
      organizationName,
      projectId,
      projectName,
      durationMs,
      success: true,
    });

    res.json({
      ...suggestion,
      provider: "gemini",
      timestamp: new Date().toISOString(),
      remainingRequests: quotaCheck.remainingRequests,
    });
  } catch (error: any) {
    log.error("Flow suggestion failed", { error: error.message });
    
    // Track failed request
    await aiQuotaManager.trackUsage("flow_suggestion", {
      organizationId: (req as any).user?.organizationId || "unknown",
      success: false,
      errorType: error.name,
    });
    
    res.status(500).json({
      error: "AI suggestion failed",
      message: error.message,
    });
  }
});

/**
 * POST /api/ai/generate-test-data
 * Generate test data based on schema
 * 
 * Body:
 * {
 *   "schema": {...},
 *   "format": "json" | "xml" | "csv",
 *   "context": "Optional context"
 * }
 */
router.post("/generate-test-data", async (req: Request, res: Response) => {
  try {
    if (!geminiService.isConfigured()) {
      return res.status(503).json({
        error: "AI features not available",
        message: "GEMINI_API_KEY not configured",
      });
    }

    const { schema, format, context } = req.body;

    if (!schema || !format) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "schema and format are required",
      });
    }

    if (!["json", "xml", "csv"].includes(format)) {
      return res.status(400).json({
        error: "Invalid format",
        message: "format must be json, xml, or csv",
      });
    }

    log.info("Generating test data", { format });

    const testData = await geminiService.generateTestData(
      schema,
      format,
      context
    );

    res.json({
      testData,
      format,
      provider: "gemini",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    log.error("Test data generation failed", { error: error.message });
    res.status(500).json({
      error: "AI generation failed",
      message: error.message,
    });
  }
});

/**
 * POST /api/ai/explain-config
 * Explain configuration in plain language
 * 
 * Body:
 * {
 *   "nodeType": "object_mapper",
 *   "config": {...}
 * }
 */
router.post("/explain-config", async (req: Request, res: Response) => {
  try {
    if (!geminiService.isConfigured()) {
      return res.status(503).json({
        error: "AI features not available",
        message: "GEMINI_API_KEY not configured",
      });
    }

    const { nodeType, config } = req.body;

    if (!nodeType || !config) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "nodeType and config are required",
      });
    }

    log.info("Explaining configuration", { nodeType });

    const explanation = await geminiService.explainConfiguration(
      nodeType,
      config
    );

    res.json({
      explanation,
      nodeType,
      provider: "gemini",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    log.error("Config explanation failed", { error: error.message });
    res.status(500).json({
      error: "AI explanation failed",
      message: error.message,
    });
  }
});

export default router;
