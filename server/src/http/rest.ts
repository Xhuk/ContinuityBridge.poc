import type { Express } from "express";
import { randomUUID } from "crypto";
import path from "path";
import multer from "multer";
import { Pipeline } from "../core/pipeline.js";
import { metricsCollector } from "../core/metrics.js";
import { getQueueProvider } from "../serverQueue.js";
import { getWorkerInstance } from "../workers/worker.js";
import { logger } from "../core/logger.js";
import { getCurrentBackend } from "../serverQueue.js";
import { getDataSourceManager } from "../datasources/manager.js";
import { interfaceManager } from "../interfaces/manager.js";
import { interfaceTemplateCatalog } from "../interfaces/template-catalog.js";
import { nodeCatalog } from "../flow/node-catalog.js";
import type { SystemInstanceTestFile } from "../../schema.js";
import { db } from "../../db.js";
import { secretsMasterKeys } from "../../schema.js";
import { eq } from "drizzle-orm";
import { secretsVaultRateLimit } from "../middleware/security.js";

const log = logger.child("REST-API");

// In-memory storage for events, decisions, and payloads (shared with worker and GraphQL)
const events: any[] = [];
const decisions: any[] = [];
const payloads: Map<string, string> = new Map(); // traceId -> original XML

// Export storage getters for worker and GraphQL access
export function getEventStorage() {
  return events;
}

export function getDecisionStorage() {
  return decisions;
}

export function getPayloadStorage() {
  return payloads;
}

import type { FlowOrchestrator } from "../flow/orchestrator.js";
import type { IStorage } from "../../storage.js";
import { registerAIMappingRoutes } from "./ai-mapping-routes.js";
import aiRoutes from "./ai-routes.js";
import aiAdminRoutes from "./ai-admin-routes.js";
import exportRoutes from "../routes/export.js";
import usersRoutes from "../routes/users.js";
import authLoginRoutes from "../routes/auth-login.js";
import logsRoutes from "../routes/logs.js";
import appControlRoutes from "../routes/app-control.js";
import systemRoutes from "../routes/system.js";
import versionsRoutes from "../routes/versions.js";
import changeRequestsRoutes from "../routes/change-requests.js";
import environmentPromotionRoutes from "../routes/environment-promotion.js";
import releasePlansRoutes from "../routes/release-plans.js";
import integrationNotesRoutes from "../routes/integration-notes.js";
import errorTriageRoutes from "../routes/error-triage.js";
import projectsRoutes from "../routes/projects.js";
import consultantRoutes from "../routes/consultant.js";
import postmanRoutes from "../routes/postman.js";
import smartMappingRoutes from "../routes/smart-mapping-routes.js";
import aiPricingRoutes from "../routes/ai-pricing-routes.js";
import customizationMigrationRoutes from "../routes/customization-migration.js";
import brandingRoutes from "../routes/branding.js";
import systemHealthRoutes from "../routes/system-health-routes.js";
import testSpriteRoutes from "../routes/testsprite-integration.js";
import { authenticateUser } from "../auth/rbac-middleware.js";
import type { DynamicWebhookRouter } from "./dynamic-webhook-router.js";

export function registerRESTRoutes(
  app: Express, 
  pipeline: Pipeline, 
  orchestrator?: FlowOrchestrator, 
  storage?: IStorage,
  webhookRouter?: DynamicWebhookRouter
): void {
  // Register AI Mapping Generator routes (dev-only)
  registerAIMappingRoutes(app);
  
  // Register AI Assistant routes (Gemini-powered)
  // Register AI routes (requires authentication)
  app.use("/api/ai", authenticateUser, aiRoutes);
  
  // Register AI Admin routes (Superadmin only - authentication enforced in routes)
  app.use("/api/ai/admin", authenticateUser, aiAdminRoutes);
  
  // Register Export/License Management routes
  app.use("/api/export", exportRoutes);
  
  // Register User Management routes
  app.use("/api/users", usersRoutes);
  
  // Register Authentication routes (login/magic-link)
  app.use("/api/auth/login", authLoginRoutes);
  
  // Register System Logs routes (superadmin portal)
  app.use("/api/logs", logsRoutes);
  
  // Register App Control routes (restart/stop/status)
  app.use("/api/app-control", appControlRoutes);
  
  // Register System Requirements Check (first-run)
  app.use("/api/system", systemRoutes);
  
  // Register Versioned Configuration Management
  app.use("/api/versions", versionsRoutes);
  app.use("/api/change-requests", changeRequestsRoutes);
  app.use("/api/environment-promotion", environmentPromotionRoutes);
  
  // Register Release Management & Integration Notes
  app.use("/api/release-plans", releasePlansRoutes);
  app.use("/api/integration-notes", integrationNotesRoutes);
  
  // Register Error Triage Dashboard
  app.use("/api/error-triage", errorTriageRoutes);
  
  // Register SuperAdmin Projects Management
  app.use("/api/admin/projects", projectsRoutes);
  
  // Register Consultant Tenant Selection
  app.use("/api/consultant", consultantRoutes);
  
  // Register Postman Collection Generator
  app.use("/api/postman", postmanRoutes);
  
  // Register Smart Mapping routes (AI-assisted field mapping for consultants)
  app.use("/api/smart-mapping", authenticateUser, smartMappingRoutes);
  
  // Register AI Pricing Tiers routes (Superadmin only - per-team pricing)
  app.use("/api/ai/pricing-tiers", authenticateUser, aiPricingRoutes);
  
  // Register Customization Migration routes (Export/Import customizations between environments)
  app.use("/api/customization", authenticateUser, customizationMigrationRoutes);
  
  // Register Organization Branding routes (Theme colors, logo upload)
  app.use("/api/branding", authenticateUser, brandingRoutes);
  
  // Register System Health & Daemon Management routes (Superadmin, Consultant, Customer Admin)
  app.use("/api/admin/system-health", authenticateUser, systemHealthRoutes);
  
  // Register TestSprite Integration routes (External testing platform)
  app.use("/api/testsprite", testSpriteRoutes);
  
  // ============================================================================
  // NODE CATALOG ENDPOINTS
  // ============================================================================

  // GET /api/node-definitions - Get all available node types from catalog
  app.get("/api/node-definitions", (req, res) => {
    try {
      const { category } = req.query;
      
      let nodes;
      if (category) {
        nodes = nodeCatalog.getNodesByCategory(category as any);
      } else {
        nodes = nodeCatalog.getAllNodes();
      }
      
      res.json(nodes);
    } catch (error: any) {
      log.error("Error fetching node definitions", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/node-definitions/:id - Get specific node definition
  app.get("/api/node-definitions/:id", (req, res) => {
    try {
      const nodeId = req.params.id;
      log.info(`[NodeCatalog] Fetching node definition for: ${nodeId}`);
      
      // Ensure node catalog is loaded
      if (!nodeCatalog) {
        log.error('[NodeCatalog] Node catalog not initialized');
        return res.status(500).json({ 
          error: "Node catalog not initialized",
          message: "Server is still starting up. Please try again in a moment."
        });
      }
      
      const node = nodeCatalog.getNode(nodeId);
      
      if (!node) {
        const availableNodes = nodeCatalog.getAllNodes().map(n => n.id);
        log.warn(`[NodeCatalog] Node definition not found: ${nodeId}`, {
          availableNodes,
        });
        return res.status(404).json({ 
          error: "Node definition not found",
          nodeId,
          availableNodes,
          message: `Node type '${nodeId}' does not exist. Available: ${availableNodes.join(', ')}`,
        });
      }
      
      log.info(`[NodeCatalog] Node definition found: ${nodeId}`, {
        category: node.category,
        label: node.label,
        configFieldsCount: node.configFields?.length || 0,
        configFields: node.configFields?.map(f => ({
          name: f.name,
          type: f.type,
          required: f.required,
        })),
      });
      
      // Ensure we're returning JSON with correct content-type
      res.setHeader('Content-Type', 'application/json');
      res.json(node);
    } catch (error: any) {
      log.error(`[NodeCatalog] Error fetching node definition for ${req.params.id}`, error, {
        errorMessage: error.message,
        stack: error.stack,
      });
      res.status(500).json({ 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  });
  
  // POST /api/items/ifd - Process XML IFD payload
  app.post("/api/items/ifd", async (req, res) => {
    try {
      const { xml } = req.body;

      if (!xml) {
        return res.status(400).json({
          ok: false,
          error: "XML payload is required",
        });
      }

      // Validate XML
      const validation = pipeline.validateXML(xml);
      if (!validation.valid) {
        return res.status(400).json({
          ok: false,
          error: `XML validation failed: ${validation.error}`,
        });
      }

      const traceId = randomUUID();

      // Enqueue to inbound queue for worker processing
      const queueProvider = getQueueProvider();
      await queueProvider.enqueue(
        "items.inbound",
        JSON.stringify({ xml, traceId })
      );

      // Store payload for potential replay
      payloads.set(traceId, xml);

      // Return immediately with trace ID - worker will process
      res.json({
        ok: true,
        traceId,
        message: "Payload enqueued for processing",
      });
    } catch (error: any) {
      log.error("Error processing IFD", error);
      res.status(500).json({
        ok: false,
        error: error.message,
      });
    }
  });

  // GET /api/metrics - Get metrics snapshot
  app.get("/api/metrics", async (req, res) => {
    try {
      const snapshot = metricsCollector.getSnapshot();
      res.json(snapshot);
    } catch (error: any) {
      log.error("Error fetching metrics", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/metrics/history - Get metrics history for charts
  app.get("/api/metrics/history", (req, res) => {
    try {
      const history = metricsCollector.getHistoryDataPoints(20);
      res.json(history);
    } catch (error: any) {
      log.error("Error fetching metrics history", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/decisions - Get recent decisions
  app.get("/api/decisions", (req, res) => {
    try {
      const recent = decisions.slice(-50).reverse();
      res.json(recent);
    } catch (error: any) {
      log.error("Error fetching decisions", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/events - Get all events
  app.get("/api/events", (req, res) => {
    try {
      res.json(events.slice().reverse());
    } catch (error: any) {
      log.error("Error fetching events", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/events/recent - Get recent events
  app.get("/api/events/recent", (req, res) => {
    try {
      const recent = events.slice(-10).reverse();
      res.json(recent);
    } catch (error: any) {
      log.error("Error fetching recent events", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/health - Health check endpoint for Render deployment
  app.get("/api/health", (req, res) => {
    try {
      // Check if essential services are running
      const worker = getWorkerInstance();
      const workerStatus = worker.getStatus();
      
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        services: {
          worker: workerStatus.enabled,
          queue: getCurrentBackend(),
        },
        version: process.env.npm_package_version || "unknown"
      });
    } catch (error: any) {
      log.error("Health check failed", error);
      res.status(500).json({ 
        status: "error", 
        error: error.message 
      });
    }
  });

  // GET /api/queue/config - Get queue configuration
  app.get("/api/queue/config", (req, res) => {
    try {
      const worker = getWorkerInstance();
      const status = worker.getStatus();

      res.json({
        backend: getCurrentBackend(),
        workerEnabled: status.enabled,
        concurrency: status.concurrency,
      });
    } catch (error: any) {
      log.error("Error fetching queue config", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/worker/status - Get worker status
  app.get("/api/worker/status", (req, res) => {
    try {
      const worker = getWorkerInstance();
      res.json(worker.getStatus());
    } catch (error: any) {
      log.error("Error fetching worker status", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/worker/toggle - Toggle worker on/off
  app.post("/api/worker/toggle", async (req, res) => {
    try {
      const { enabled } = req.body;
      const worker = getWorkerInstance();

      if (enabled) {
        await worker.start();
      } else {
        await worker.stop();
      }

      res.json({ success: true, enabled });
    } catch (error: any) {
      log.error("Error toggling worker", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/worker/concurrency - Update worker concurrency
  app.post("/api/worker/concurrency", (req, res) => {
    try {
      const { concurrency } = req.body;

      if (!concurrency || concurrency < 1 || concurrency > 100) {
        return res.status(400).json({ error: "Invalid concurrency value" });
      }

      const worker = getWorkerInstance();
      worker.setConfig({ concurrency });

      res.json({ success: true, concurrency });
    } catch (error: any) {
      log.error("Error updating concurrency", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // THROTTLING CONFIGURATION API (Caso 3 support)
  // ============================================================================

  // GET /api/throttling/config - Get throttling configuration for organization
  app.get("/api/throttling/config", authenticateUser, async (req, res) => {
    try {
      const { getThrottlingConfig } = await import("../services/throttling-config-service.js");
      const organizationId = (req as any).user?.organizationId || "default";
      const config = getThrottlingConfig(organizationId);
      res.json(config);
    } catch (error: any) {
      log.error("Error fetching throttling config", error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/throttling/config - Update throttling configuration
  app.put("/api/throttling/config", authenticateUser, async (req, res) => {
    try {
      const { upsertThrottlingConfig } = await import("../services/throttling-config-service.js");
      const organizationId = (req as any).user?.organizationId || "default";
      const updates = req.body;
      
      const result = upsertThrottlingConfig(organizationId, updates);
      res.json(result);
    } catch (error: any) {
      log.error("Error updating throttling config", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/throttling/apply - Apply throttling configuration
  app.post("/api/throttling/apply", authenticateUser, async (req, res) => {
    try {
      const { applyThrottlingConfig } = await import("../services/throttling-config-service.js");
      const organizationId = (req as any).user?.organizationId || "default";
      
      const result = await applyThrottlingConfig(organizationId);
      res.json(result);
    } catch (error: any) {
      log.error("Error applying throttling config", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // SYSTEM RESTART API
  // ============================================================================

  // GET /api/system/restart/status - Get restart status
  app.get("/api/system/restart/status", authenticateUser, async (req, res) => {
    try {
      const { getRestartStatus } = await import("../services/system-restart-service.js");
      const status = getRestartStatus();
      res.json(status);
    } catch (error: any) {
      log.error("Error fetching restart status", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/system/restart/request - Request system restart
  app.post("/api/system/restart/request", authenticateUser, async (req, res) => {
    try {
      const { requestSystemRestart } = await import("../services/system-restart-service.js");
      const { reason } = req.body;
      const requestedBy = (req as any).user?.email || "unknown";
      
      const restart = requestSystemRestart(requestedBy, reason || "Configuration change");
      res.json(restart);
    } catch (error: any) {
      log.error("Error requesting restart", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/system/restart/execute - Execute system restart
  app.post("/api/system/restart/execute", authenticateUser, async (req, res) => {
    try {
      const { executeSystemRestart } = await import("../services/system-restart-service.js");
      const requestedBy = (req as any).user?.email || "unknown";
      
      const result = await executeSystemRestart(requestedBy);
      res.json(result);
    } catch (error: any) {
      log.error("Error executing restart", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/system/restart/clear - Clear pending restart
  app.post("/api/system/restart/clear", authenticateUser, async (req, res) => {
    try {
      const { clearPendingRestart } = await import("../services/system-restart-service.js");
      clearPendingRestart();
      res.json({ success: true });
    } catch (error: any) {
      log.error("Error clearing restart", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/queue/dead-letter - Get dead letter queue depth and stats
  app.get("/api/queue/dead-letter", async (req, res) => {
    try {
      const queueProvider = getQueueProvider();
      const depth = await queueProvider.getDeadLetterDepth("items.inbound");
      
      // Get failed events from event storage
      const failedEvents = events.filter(e => e.status === "failed");
      
      res.json({
        depth,
        failedEvents: failedEvents.slice(0, 100), // Limit to 100 recent failures
        backend: getCurrentBackend(),
      });
    } catch (error: any) {
      log.error("Error fetching dead letter queue", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==== DATA SOURCES API ====

  // GET /api/datasources - Get all data sources
  app.get("/api/datasources", (req, res) => {
    try {
      const manager = getDataSourceManager();
      const sources = manager.getAllSources();
      res.json(sources);
    } catch (error: any) {
      log.error("Error fetching data sources", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/datasources/:id - Get specific data source
  app.get("/api/datasources/:id", (req, res) => {
    try {
      const manager = getDataSourceManager();
      const source = manager.getSource(req.params.id);
      
      if (!source) {
        return res.status(404).json({ error: "Data source not found" });
      }
      
      res.json(source);
    } catch (error: any) {
      log.error("Error fetching data source", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/datasources - Create new data source
  app.post("/api/datasources", (req, res) => {
    try {
      const { config, secret } = req.body;
      
      if (!config || !secret) {
        return res.status(400).json({ error: "Config and secret are required" });
      }

      // Generate ID if not provided
      if (!config.id) {
        config.id = randomUUID();
      }
      secret.sourceId = config.id;

      const manager = getDataSourceManager();
      manager.createSource(config, secret);
      
      res.json({ success: true, id: config.id });
    } catch (error: any) {
      log.error("Error creating data source", error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/datasources/:id - Update data source
  app.put("/api/datasources/:id", (req, res) => {
    try {
      const { config, secret } = req.body;
      
      if (!config) {
        return res.status(400).json({ error: "Config is required" });
      }

      const manager = getDataSourceManager();
      manager.updateSource(req.params.id, config, secret);
      
      res.json({ success: true });
    } catch (error: any) {
      log.error("Error updating data source", error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/datasources/:id - Delete data source
  app.delete("/api/datasources/:id", (req, res) => {
    try {
      const manager = getDataSourceManager();
      manager.deleteSource(req.params.id);
      
      res.json({ success: true });
    } catch (error: any) {
      log.error("Error deleting data source", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/datasources/:id/test - Test connection
  app.post("/api/datasources/:id/test", async (req, res) => {
    try {
      const manager = getDataSourceManager();
      const result = await manager.testConnection(req.params.id);
      
      res.json(result);
    } catch (error: any) {
      log.error("Error testing connection", error);
      res.status(500).json({ 
        success: false,
        message: "Test failed",
        error: error.message 
      });
    }
  });

  // POST /api/datasources/:id/pull - Trigger manual pull
  app.post("/api/datasources/:id/pull", async (req, res) => {
    try {
      const manager = getDataSourceManager();
      const result = await manager.pullFiles(req.params.id);
      
      res.json(result);
    } catch (error: any) {
      log.error("Error pulling files", error);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

  // GET /api/datasources/history - Get pull history
  app.get("/api/datasources/history", (req, res) => {
    try {
      const { sourceId } = req.query;
      const manager = getDataSourceManager();
      const history = manager.getPullHistory(sourceId as string | undefined);
      
      res.json(history);
    } catch (error: any) {
      log.error("Error fetching pull history", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // INTERFACE REGISTRY ROUTES
  // ============================================================================

  // GET /api/interfaces - List all interfaces
  app.get("/api/interfaces", async (req, res) => {
    try {
      const { type, direction } = req.query;
      const userRole = (req as any).user?.role;
      const userOrgId = (req as any).user?.organizationId;
      
      let interfaces;
      if (type) {
        interfaces = interfaceManager.getInterfacesByType(type as string);
      } else if (direction) {
        interfaces = interfaceManager.getInterfacesByDirection(direction as string);
      } else {
        interfaces = interfaceManager.getAllInterfaces();
      }
      
      // TRIAL FILTERING: For trial users, only show demo/mock interfaces
      // Admins/consultants see everything
      if (userRole !== "superadmin" && userRole !== "consultant" && storage) {
        try {
          const { db } = await import("../../db.js");
          const { customerLicense } = await import("../../schema.pg.js");
          const { eq } = await import("drizzle-orm");
          
          if (userOrgId) {
            const licenses = await (db.select().from(customerLicense)
              .where(eq(customerLicense.organizationId, userOrgId)) as any);
            
            const license = licenses[0];
            
            // If trial license, filter to demo interfaces only
            if (!license || license.licenseType === "trial") {
              // Demo interfaces: only show representative examples
              const DEMO_INTERFACES = [
                "amazon-sp-api-demo",      // Amazon demo
                "mercadolibre-demo",       // MercadoLibre demo
              ];
              
              interfaces = interfaces.filter((iface: any) => {
                // Show if it's a demo interface OR marked as demo
                return DEMO_INTERFACES.includes(iface.id) || 
                       iface.name?.toLowerCase().includes("demo") ||
                       iface.name?.toLowerCase().includes("mock") ||
                       iface.metadata?.isDemo === true;
              });
              
              log.info(`[Trial Filter] User ${userOrgId} is on trial - filtered to ${interfaces.length} demo interfaces`);
            }
          }
        } catch (error: any) {
          log.warn("Error checking license for interface filtering", error);
          // If error checking license, don't filter (fail open)
        }
      }
      
      res.json(interfaces);
    } catch (error: any) {
      log.error("Error fetching interfaces", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/interfaces - Create new interface
  app.post("/api/interfaces", (req, res) => {
    try {
      const { config, secret } = req.body;
      
      if (!config) {
        return res.status(400).json({ error: "Interface configuration is required" });
      }
      
      const newInterface = interfaceManager.addInterface(config, secret);
      res.status(201).json(newInterface);
    } catch (error: any) {
      log.error("Error creating interface", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/interfaces/:id - Get interface by ID
  app.get("/api/interfaces/:id", (req, res) => {
    try {
      const iface = interfaceManager.getInterface(req.params.id);
      
      if (!iface) {
        return res.status(404).json({ error: "Interface not found" });
      }
      
      res.json(iface);
    } catch (error: any) {
      log.error("Error fetching interface", error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/interfaces/:id - Update interface
  app.put("/api/interfaces/:id", (req, res) => {
    try {
      const { config } = req.body;
      
      if (!config) {
        return res.status(400).json({ error: "Interface configuration is required" });
      }
      
      const updated = interfaceManager.updateInterface(req.params.id, config);
      
      if (!updated) {
        return res.status(404).json({ error: "Interface not found" });
      }
      
      res.json(updated);
    } catch (error: any) {
      log.error("Error updating interface", error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/interfaces/:id - Delete interface
  app.delete("/api/interfaces/:id", (req, res) => {
    try {
      const success = interfaceManager.deleteInterface(req.params.id);
      
      if (!success) {
        return res.status(404).json({ error: "Interface not found" });
      }
      
      res.json({ success: true, message: "Interface deleted successfully" });
    } catch (error: any) {
      log.error("Error deleting interface", error);
      res.status(500).json({ error: error.message });
    }
  });

  // HEAD /api/interfaces - Check if interfaces exist (no response body)
  app.head("/api/interfaces", (req, res) => {
    try {
      const interfaces = interfaceManager.getAllInterfaces();
      res.set({
        "Content-Type": "application/json",
        "X-Total-Count": interfaces.length.toString(),
      });
      res.status(200).end();
    } catch (error: any) {
      log.error("Error checking interfaces", error);
      res.status(500).end();
    }
  });

  // HEAD /api/interfaces/:id - Check if specific interface exists (no response body)
  app.head("/api/interfaces/:id", (req, res) => {
    try {
      const iface = interfaceManager.getInterface(req.params.id);
      if (!iface) {
        return res.status(404).end();
      }
      res.set({
        "Content-Type": "application/json",
        "X-Interface-Name": iface.name,
        "X-Interface-Type": iface.type,
        "X-Interface-Protocol": iface.protocol,
      });
      res.status(200).end();
    } catch (error: any) {
      log.error("Error checking interface", error);
      res.status(500).end();
    }
  });

  // OPTIONS /api/interfaces - Describe allowed methods for collection
  app.options("/api/interfaces", (req, res) => {
    res.set({
      "Allow": "GET, POST, HEAD, OPTIONS",
      "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.status(204).end();
  });

  // OPTIONS /api/interfaces/:id - Describe allowed methods for specific resource
  app.options("/api/interfaces/:id", (req, res) => {
    res.set({
      "Allow": "GET, PUT, DELETE, HEAD, OPTIONS",
      "Access-Control-Allow-Methods": "GET, PUT, DELETE, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.status(204).end();
  });

  // POST /api/interfaces/:id/test - Test connectivity
  app.post("/api/interfaces/:id/test", async (req, res) => {
    try {
      const result = await interfaceManager.testConnection(req.params.id);
      
      res.json(result);
    } catch (error: any) {
      log.error("Error testing interface connection", error);
      res.status(500).json({ 
        success: false,
        message: "Test failed",
        error: error.message 
      });
    }
  });

  // POST /api/interfaces/:id/secret - Set interface secret
  app.post("/api/interfaces/:id/secret", (req, res) => {
    try {
      const { secret } = req.body;
      
      if (!secret) {
        return res.status(400).json({ error: "Secret data is required" });
      }
      
      const success = interfaceManager.setInterfaceSecret(req.params.id, secret);
      
      if (!success) {
        return res.status(404).json({ error: "Interface not found" });
      }
      
      res.json({ success: true, message: "Secret saved successfully" });
    } catch (error: any) {
      log.error("Error setting interface secret", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/integration/events - Get integration events
  app.get("/api/integration/events", (req, res) => {
    try {
      const { sourceInterfaceId, targetInterfaceId, status, limit } = req.query;
      
      const filters: any = {};
      if (sourceInterfaceId) filters.sourceInterfaceId = sourceInterfaceId as string;
      if (targetInterfaceId) filters.targetInterfaceId = targetInterfaceId as string;
      if (status) filters.status = status as string;
      if (limit) filters.limit = parseInt(limit as string);
      
      const events = interfaceManager.getEvents(filters);
      res.json(events);
    } catch (error: any) {
      log.error("Error fetching integration events", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========== INTERFACE TEMPLATE ENDPOINTS ==========

  // GET /api/interface-templates - List all interface templates
  app.get("/api/interface-templates", (req, res) => {
    try {
      const { type, tag, search } = req.query;
      
      let templates;
      if (search) {
        templates = interfaceTemplateCatalog.searchTemplates(search as string);
      } else if (type) {
        templates = interfaceTemplateCatalog.getTemplatesByType(type as string);
      } else if (tag) {
        templates = interfaceTemplateCatalog.getTemplatesByTag(tag as string);
      } else {
        templates = interfaceTemplateCatalog.getAllTemplates();
      }
      
      res.json(templates);
    } catch (error: any) {
      log.error("Error listing interface templates", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/interface-templates/:id - Get specific interface template
  app.get("/api/interface-templates/:id", (req, res) => {
    try {
      const template = interfaceTemplateCatalog.getTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      res.json(template);
    } catch (error: any) {
      log.error("Error getting interface template", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/interface-templates/:id/instantiate - Create interface from template
  app.post("/api/interface-templates/:id/instantiate", (req, res) => {
    try {
      const template = interfaceTemplateCatalog.getTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      const { name, secrets, customization } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Interface name is required" });
      }
      
      // Build interface config from template
      const interfaceConfig: any = {
        name,
        description: customization?.description || template.description,
        type: template.type,
        direction: template.direction,
        protocol: template.protocol,
        endpoint: customization?.endpoint || template.endpoint,
        authType: template.authType,
        formats: template.formats,
        defaultFormat: template.defaultFormat,
        enabled: true,
        tags: [...(template.tags || []), "from-template", `template:${template.id}`],
        metadata: {
          ...template.metadata,
          templateId: template.id,
          templateName: template.name,
          instantiatedAt: new Date().toISOString(),
        },
      };
      
      // Add HTTP config if present
      if (template.httpConfig) {
        interfaceConfig.httpConfig = {
          ...template.httpConfig,
          ...customization?.httpConfig,
        };
      }
      
      // Add OAuth2 config if present
      if (template.oauth2Config) {
        interfaceConfig.oauth2Config = template.oauth2Config;
      }
      
      // Create the interface
      const createdInterface = interfaceManager.addInterface(interfaceConfig, secrets);
      
      log.info(`Interface created from template ${template.id}: ${createdInterface.name}`);
      
      res.status(201).json({
        interface: createdInterface,
        template: {
          id: template.id,
          name: template.name,
          suggestedMappings: template.suggestedMappings,
          endpoints: template.endpoints,
          payloadTemplates: template.payloadTemplates,
        },
      });
    } catch (error: any) {
      log.error("Error instantiating interface from template", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========== FLOW MANAGEMENT ENDPOINTS ==========

  // GET /api/flows - List all flows (optionally filtered by systemInstanceId)
  app.get("/api/flows", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).json({ error: "Flow storage is not initialized" });
      }
      const systemInstanceId = req.query.systemInstanceId as string | undefined;
      const flows = await storage.getFlows(systemInstanceId);
      res.json(flows);
    } catch (error: any) {
      log.error("Error listing flows", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/flows/:id - Get a specific flow
  app.get("/api/flows/:id", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).json({ error: "Flow storage is not initialized" });
      }
      const flow = await storage.getFlow(req.params.id);
      if (!flow) {
        return res.status(404).json({ error: "Flow not found" });
      }
      res.json(flow);
    } catch (error: any) {
      log.error("Error getting flow", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/flows - Create a new flow
  app.post("/api/flows", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).json({ error: "Flow storage is not initialized" });
      }
      const flowData = req.body;
      const flow = await storage.createFlow(flowData);
      log.info(`Flow created: ${flow.id} - ${flow.name}`);
      
      // Auto-register webhook if enabled
      if (webhookRouter && flow.enabled) {
        const hasWebhookTrigger = flow.nodes.some((n) => n.type === "webhook_trigger");
        const webhookSlug = flow.webhookSlug || flow.id;
        
        if (hasWebhookTrigger || flow.webhookEnabled) {
          const webhookNode = flow.nodes.find((n) => n.type === "webhook_trigger");
          const method = (webhookNode?.data.webhookMethod as any) || "POST";
          const organizationId = (flow as any).metadata?.organizationId;
          
          const result = await webhookRouter.registerWebhook(webhookSlug, flow.id, method, organizationId);
          
          if (result.success) {
            log.info(`Webhook auto-registered: ${method} /api/webhook/${webhookSlug}`, {
              flowId: flow.id,
              organizationId,
            });
          } else {
            log.warn(`Failed to auto-register webhook: ${result.reason}`, {
              flowId: flow.id,
              webhookSlug,
            });
          }
        }
      }
      
      res.status(201).json(flow);
    } catch (error: any) {
      log.error("Error creating flow", error);
      res.status(400).json({ error: error.message });
    }
  });

  // PATCH /api/flows/:id - Update a flow
  app.patch("/api/flows/:id", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).json({ error: "Flow storage is not initialized" });
      }
      
      const existingFlow = await storage.getFlow(req.params.id);
      const flow = await storage.updateFlow(req.params.id, req.body);
      if (!flow) {
        return res.status(404).json({ error: "Flow not found" });
      }
      log.info(`Flow updated: ${flow.id} - ${flow.name}`);
      
      // Handle webhook re-registration on update
      if (webhookRouter && existingFlow) {
        const oldSlug = existingFlow.webhookSlug || existingFlow.id;
        const newSlug = flow.webhookSlug || flow.id;
        const wasWebhookEnabled = existingFlow.nodes.some((n) => n.type === "webhook_trigger") || existingFlow.webhookEnabled;
        const isWebhookEnabled = flow.nodes.some((n) => n.type === "webhook_trigger") || flow.webhookEnabled;
        const organizationId = (flow as any).metadata?.organizationId;
        
        // Scenario 1: Webhook disabled -> unregister
        if (wasWebhookEnabled && !isWebhookEnabled) {
          await webhookRouter.unregisterWebhook(oldSlug, organizationId);
          log.info(`Webhook unregistered: ${oldSlug}`);
        }
        
        // Scenario 2: Webhook slug changed -> update registration
        else if (isWebhookEnabled && oldSlug !== newSlug) {
          const webhookNode = flow.nodes.find((n) => n.type === "webhook_trigger");
          const method = (webhookNode?.data.webhookMethod as any) || "POST";
          
          await webhookRouter.updateWebhook(oldSlug, newSlug, flow.id, method, organizationId);
          log.info(`Webhook updated: ${oldSlug} -> ${newSlug}`);
        }
        
        // Scenario 3: Webhook newly enabled -> register
        else if (!wasWebhookEnabled && isWebhookEnabled && flow.enabled) {
          const webhookNode = flow.nodes.find((n) => n.type === "webhook_trigger");
          const method = (webhookNode?.data.webhookMethod as any) || "POST";
          
          await webhookRouter.registerWebhook(newSlug, flow.id, method, organizationId);
          log.info(`Webhook registered: ${newSlug}`);
        }
        
        // Scenario 4: Flow disabled -> unregister webhook
        else if (isWebhookEnabled && !flow.enabled) {
          await webhookRouter.unregisterWebhook(newSlug, organizationId);
          log.info(`Webhook unregistered (flow disabled): ${newSlug}`);
        }
      }
      
      res.json(flow);
    } catch (error: any) {
      log.error("Error updating flow", error);
      res.status(400).json({ error: error.message });
    }
  });

  // DELETE /api/flows/:id - Delete a flow
  app.delete("/api/flows/:id", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).json({ error: "Flow storage is not initialized" });
      }
      
      // Get flow before deletion to unregister webhook
      const flow = await storage.getFlow(req.params.id);
      
      const deleted = await storage.deleteFlow(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Flow not found" });
      }
      
      // Unregister webhook endpoint
      if (webhookRouter && flow) {
        const webhookSlug = flow.webhookSlug || flow.id;
        const organizationId = (flow as any).metadata?.organizationId;
        
        await webhookRouter.unregisterWebhook(webhookSlug, organizationId);
        log.info(`Webhook unregistered on flow deletion: ${webhookSlug}`);
      }
      
      log.info(`Flow deleted: ${req.params.id}`);
      res.status(204).send();
    } catch (error: any) {
      log.error("Error deleting flow", error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/flows/:id - Replace entire flow (idempotent)
  app.put("/api/flows/:id", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).json({ error: "Flow storage is not initialized" });
      }
      
      const existingFlow = await storage.getFlow(req.params.id);
      const flowData = { ...req.body, id: req.params.id };
      
      if (existingFlow) {
        // Replace existing flow
        const flow = await storage.updateFlow(req.params.id, flowData);
        if (!flow) {
          return res.status(404).json({ error: "Flow not found" });
        }
        log.info(`Flow replaced: ${flow.id} - ${flow.name}`);
        res.json(flow);
      } else {
        // Create new flow with specified ID
        const flow = await storage.createFlow(flowData);
        log.info(`Flow created via PUT: ${flow.id} - ${flow.name}`);
        res.status(201).json(flow);
      }
    } catch (error: any) {
      log.error("Error replacing flow", error);
      res.status(400).json({ error: error.message });
    }
  });

  // HEAD /api/flows - Check if flows exist (no response body)
  app.head("/api/flows", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).end();
      }
      const flows = await storage.getFlows();
      res.set({
        "Content-Type": "application/json",
        "X-Total-Count": flows.length.toString(),
      });
      res.status(200).end();
    } catch (error: any) {
      log.error("Error checking flows", error);
      res.status(500).end();
    }
  });

  // HEAD /api/flows/:id - Check if specific flow exists (no response body)
  app.head("/api/flows/:id", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).end();
      }
      const flow = await storage.getFlow(req.params.id);
      if (!flow) {
        return res.status(404).end();
      }
      res.set({
        "Content-Type": "application/json",
        "X-Flow-Name": flow.name,
        "X-Flow-Enabled": flow.enabled.toString(),
      });
      res.status(200).end();
    } catch (error: any) {
      log.error("Error checking flow", error);
      res.status(500).end();
    }
  });

  // OPTIONS /api/flows - Describe allowed methods for collection
  app.options("/api/flows", (req, res) => {
    res.set({
      "Allow": "GET, POST, HEAD, OPTIONS",
      "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.status(204).end();
  });

  // OPTIONS /api/flows/:id - Describe allowed methods for specific resource
  app.options("/api/flows/:id", (req, res) => {
    res.set({
      "Allow": "GET, PUT, PATCH, DELETE, HEAD, OPTIONS",
      "Access-Control-Allow-Methods": "GET, PUT, PATCH, DELETE, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.status(204).end();
  });

  // ========== FLOW EXECUTION ENDPOINTS ==========

  // POST /api/flows/:id/execute - Execute a flow manually
  app.post("/api/flows/:id/execute", async (req, res) => {
    try {
      if (!orchestrator) {
        return res.status(501).json({
          ok: false,
          error: "Flow orchestrator is not initialized. Server was started without flow support.",
        });
      }

      const flowId = req.params.id;
      const { input, enqueue, emulationMode } = req.body;

      // Option 1: Enqueue for worker processing
      if (enqueue) {
        const traceId = randomUUID();
        const queueProvider = getQueueProvider();
        await queueProvider.enqueue(
          "items.inbound",
          JSON.stringify({ 
            mode: 'flow',
            flowId, 
            flowInput: input,
            traceId,
            emulationMode: emulationMode || false,
          })
        );

        return res.json({
          ok: true,
          traceId,
          message: emulationMode 
            ? "Flow execution enqueued for processing (EMULATION MODE)"
            : "Flow execution enqueued for processing",
          emulationMode: emulationMode || false,
        });
      }

      // Option 2: Execute synchronously via pipeline
      const traceId = randomUUID();
      const result = await pipeline.runItemPipeline({
        mode: 'flow',
        flowId,
        flowInput: input,
        traceId,
        emulationMode: emulationMode || false,
      });

      res.json({
        ok: result.success,
        traceId: result.traceId,
        output: result.canonical,
        decision: result.decision,
        error: result.error,
        latencyMs: result.latencyMs,
        emulationMode: emulationMode || false,
      });
    } catch (error: any) {
      log.error("Error executing flow", error);
      res.status(500).json({
        ok: false,
        error: error.message,
      });
    }
  });

  // POST /api/flows/:id/execute-direct - Execute flow directly (bypass pipeline)
  app.post("/api/flows/:id/execute-direct", async (req, res) => {
    try {
      if (!orchestrator) {
        return res.status(501).json({
          ok: false,
          error: "Flow orchestrator is not initialized.",
        });
      }

      const flowId = req.params.id;
      const { input } = req.body;

      log.debug(`Executing flow ${flowId} directly`);
      const flowRun = await orchestrator.executeFlow(flowId, input);

      res.json({
        ok: flowRun.status !== "failed",
        run: flowRun,
      });
    } catch (error: any) {
      log.error("Error executing flow directly", error);
      res.status(500).json({
        ok: false,
        error: error.message,
      });
    }
  });

  // GET /api/flows/runs/:runId - Get flow run status
  app.get("/api/flows/runs/:runId", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).json({ error: "Flow storage is not initialized" });
      }
      const flowRun = await storage.getFlowRun(req.params.runId);
      if (!flowRun) {
        return res.status(404).json({ error: "Flow run not found" });
      }
      res.json(flowRun);
    } catch (error: any) {
      log.error("Error getting flow run", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/flows/:id/test-node - Test individual node (Phase 2)
  app.post("/api/flows/:id/test-node", async (req, res) => {
    try {
      if (!orchestrator) {
        return res.status(501).json({
          ok: false,
          error: "Flow orchestrator is not initialized.",
        });
      }
      
      if (!storage) {
        return res.status(501).json({ error: "Flow storage is not initialized" });
      }

      const flowId = req.params.id;
      const { nodeId, input } = req.body;
      
      if (!nodeId) {
        return res.status(400).json({ error: "nodeId is required" });
      }

      // Get flow definition
      const flow = await storage.getFlow(flowId);
      if (!flow) {
        return res.status(404).json({ error: "Flow not found" });
      }
      
      // Find the node
      const node = flow.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return res.status(404).json({ error: "Node not found in flow" });
      }
      
      // Use orchestrator's internal executor (accessing private method via reflection is not ideal,
      // so we'll use the orchestrator's public method with a dummy single-node flow)
      // For now, return a mock response indicating the feature needs backend support
      
      const startTime = Date.now();
      
      // TODO: Implement single-node execution in orchestrator
      // For MVP, return the input as output (passthrough)
      const output = input;
      
      const durationMs = Date.now() - startTime;

      res.json({
        ok: true,
        output,
        metadata: { note: "Node test passthrough - full execution requires orchestrator enhancement" },
        durationMs,
      });
    } catch (error: any) {
      log.error("Error testing node", error);
      res.status(500).json({
        ok: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // SMTP Settings Routes
  // ============================================================================

  // GET /api/smtp-settings - Get SMTP configuration (without password)
  app.get("/api/smtp-settings", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).json({ error: "Storage not initialized" });
      }

      const settings = await storage.getSmtpSettings();
      
      if (!settings) {
        return res.json({ configured: false });
      }

      // Never send password to client
      const { password, ...safeSettings } = settings;
      
      res.json({
        configured: true,
        hasPassword: true,
        settings: safeSettings,
      });
    } catch (error: any) {
      log.error("Error fetching SMTP settings", error);
      res.status(500).json({ error: "Failed to fetch SMTP settings" });
    }
  });

  // PUT /api/smtp-settings - Update or create SMTP configuration
  app.put("/api/smtp-settings", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).json({ error: "Storage not initialized" });
      }

      const existing = await storage.getSmtpSettingsForService?.() || await storage.getSmtpSettings();
      
      // Use appropriate schema based on whether this is update or create
      const { insertSmtpSettingsSchema, updateSmtpSettingsSchema } = await import('../../schema.js');
      const schema = existing ? updateSmtpSettingsSchema : insertSmtpSettingsSchema;
      const validation = schema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid SMTP settings",
          details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        });
      }

      const settingsData = validation.data;
      
      // Handle password encryption
      const { encryptPassword } = await import('../notifications/crypto.js');
      let encryptedPassword: string;
      
      if (settingsData.password) {
        // New password provided
        encryptedPassword = encryptPassword(settingsData.password);
      } else if (existing && existing.password) {
        // Keep existing password
        encryptedPassword = existing.password;
      } else {
        return res.status(400).json({
          error: "Password is required for initial setup",
        });
      }

      const settings = await storage.upsertSmtpSettings({
        ...settingsData,
        password: encryptedPassword,
      });

      // Reconfigure email service with new settings
      const { emailService } = await import('../notifications/index.js');
      try {
        await emailService.configure(settings);
        log.info("Email service reconfigured with new SMTP settings");
      } catch (emailError: any) {
        log.error("Failed to configure email service", emailError);
        return res.status(400).json({
          error: `SMTP configuration failed: ${emailError.message}`,
        });
      }

      // Don't send password back
      const { password, ...safeSettings } = settings;
      
      res.json({
        ok: true,
        settings: safeSettings,
      });
    } catch (error: any) {
      log.error("Error saving SMTP settings", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/smtp-settings/test - Send test email
  app.post("/api/smtp-settings/test", async (req, res) => {
    try {
      const { emailService } = await import('../notifications/index.js');
      
      if (!emailService.isConfigured()) {
        return res.status(400).json({
          error: "SMTP is not configured",
        });
      }

      const { recipients } = req.body;
      await emailService.sendTestEmail(recipients);

      // Update lastTestedAt timestamp
      if (storage) {
        const currentSettings = await storage.getSmtpSettings();
        if (currentSettings) {
          await storage.upsertSmtpSettings({
            ...currentSettings,
            lastTestedAt: new Date().toISOString(),
          });
        }
      }

      res.json({
        ok: true,
        message: "Test email sent successfully",
      });
    } catch (error: any) {
      log.error("Error sending test email", error);
      res.status(500).json({
        ok: false,
        error: error.message,
      });
    }
  });

  // DELETE /api/smtp-settings - Delete SMTP configuration
  app.delete("/api/smtp-settings", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).json({ error: "Storage not initialized" });
      }

      const deleted = await storage.deleteSmtpSettings();
      
      if (deleted) {
        // Unconfigure email service
        const { emailService } = await import('../notifications/index.js');
        await emailService.configure({ enabled: false } as any);
      }

      res.json({ ok: deleted });
    } catch (error: any) {
      log.error("Error deleting SMTP settings", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // Secrets Vault Routes (Master Seed-based Encryption)
  // ============================================================================

  // Simple rate limiting for unlock attempts (in-memory)
  const unlockAttempts = new Map<string, { count: number; resetAt: number }>();
  const MAX_UNLOCK_ATTEMPTS = 5;
  const UNLOCK_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

  function checkUnlockRateLimit(ip: string): boolean {
    const now = Date.now();
    const attempt = unlockAttempts.get(ip);

    if (!attempt || now > attempt.resetAt) {
      unlockAttempts.set(ip, { count: 1, resetAt: now + UNLOCK_LOCKOUT_MS });
      return true;
    }

    if (attempt.count >= MAX_UNLOCK_ATTEMPTS) {
      return false; // Rate limited
    }

    attempt.count++;
    return true;
  }

  function resetUnlockRateLimit(ip: string): void {
    unlockAttempts.delete(ip);
  }

  // Audit logging helper
  function auditLog(operation: string, details: Record<string, any>): void {
    log.info(`[Secrets Vault Audit] ${operation}`, details);
    // TODO: Persist audit logs to database for compliance
  }

  // GET /api/secrets/status - Check vault initialization and lock status
  app.get("/api/secrets/status", async (req, res) => {
    try {
      if (!storage || !storage.getMasterKey) {
        return res.status(501).json({ error: "Secrets vault not available" });
      }

      const { secretsService } = await import('../secrets/secrets-service.js');
      
      const isInitialized = await secretsService.isVaultInitialized(
        () => storage.getMasterKey!()
      );
      
      const isUnlocked = secretsService.isVaultUnlocked();

      res.json({
        initialized: isInitialized,
        unlocked: isUnlocked,
      });
    } catch (error: any) {
      log.error("Error checking secrets vault status", error);
      res.status(500).json({ error: "Failed to check vault status" });
    }
  });

  // GET /api/secrets/kpi - Get vault KPIs and metrics
  app.get("/api/secrets/kpi", async (req, res) => {
    try {
      if (!storage || !storage.getMasterKey) {
        return res.status(501).json({ error: "Secrets vault not available" });
      }

      const { secretsService } = await import('../secrets/secrets-service.js');
      
      const isInitialized = await secretsService.isVaultInitialized(
        () => storage.getMasterKey!()
      );
      
      const isUnlocked = secretsService.isVaultUnlocked();
      
      // Get all secrets (metadata only) to count by type
      let secretsByType: Record<string, number> = {};
      let totalSecrets = 0;
      
      if (isUnlocked && storage.getSecrets) {
        const secrets = await storage.getSecrets();
        totalSecrets = secrets.length;
        
        // Count by integration type
        secretsByType = secrets.reduce((acc, secret) => {
          acc[secret.integrationType] = (acc[secret.integrationType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
      }

      // Get audit log summary (last 24 hours)
      let recentActivity = 0;
      let failedAttempts = 0;
      
      if (storage.getAuditLogs) {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const auditLogs = await storage.getAuditLogs({ since: oneDayAgo, limit: 1000 });
        
        recentActivity = auditLogs.length;
        failedAttempts = auditLogs.filter(log => 
          log.action === 'UNLOCK_FAILED' || log.action === 'SECRET_DELETE_FAILED'
        ).length;
      }

      res.json({
        initialized: isInitialized,
        unlocked: isUnlocked,
        totalSecrets,
        secretsByType,
        metrics: {
          recentActivity24h: recentActivity,
          failedAttempts24h: failedAttempts,
          vaultHealth: failedAttempts > 5 ? 'warning' : 'healthy',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      log.error("Error getting vault KPIs", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/secrets/initialize - Initialize vault with master seed
  app.post("/api/secrets/initialize", secretsVaultRateLimit, async (req, res) => {
    try {
      if (!storage || !storage.getMasterKey || !storage.saveMasterKey) {
        return res.status(501).json({ error: "Secrets vault not available" });
      }

      const { masterSeed } = req.body;

      if (!masterSeed || typeof masterSeed !== 'string') {
        return res.status(400).json({
          error: "Master seed is required",
        });
      }

      // Check if vault is already initialized
      const existing = await storage.getMasterKey();
      if (existing) {
        return res.status(400).json({
          error: "Vault is already initialized - use reset to start over",
        });
      }

      const { secretsService } = await import('../secrets/secrets-service.js');

      const { recoveryCode } = await secretsService.initializeVault(
        masterSeed,
        (data) => storage.saveMasterKey!(data)
      );

      auditLog("VAULT_INITIALIZED", {
        timestamp: new Date().toISOString(),
        ip: req.ip,
      });

      res.json({
        ok: true,
        recoveryCode,
        warning: "Store this recovery code securely - you cannot recover it later. Loss of master seed means permanent data loss.",
      });
    } catch (error: any) {
      log.error("Error initializing secrets vault", error);
      auditLog("VAULT_INIT_FAILED", {
        error: error.message,
        ip: req.ip,
      });
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/secrets/unlock - Unlock vault with master seed (rate limited)
  app.post("/api/secrets/unlock", secretsVaultRateLimit, async (req, res) => {
    try {
      if (!storage || !storage.getMasterKey) {
        return res.status(501).json({ error: "Secrets vault not available" });
      }

      const clientIp = req.ip || 'unknown';
      const { masterSeed, recoveryCode } = req.body;

      if (!masterSeed && !recoveryCode) {
        return res.status(400).json({
          error: "Master seed or recovery code is required",
        });
      }

      const { secretsService } = await import('../secrets/secrets-service.js');
      const masterKey = await storage.getMasterKey();

      if (!masterKey) {
        return res.status(400).json({ error: "Vault not initialized" });
      }

      // Check if vault is locked due to too many failed attempts
      if (masterKey.lockedUntil) {
        const lockoutTime = new Date(masterKey.lockedUntil).getTime();
        const now = Date.now();
        
        if (now < lockoutTime) {
          const minutesRemaining = Math.ceil((lockoutTime - now) / 60000);
          return res.status(423).json({
            error: "Vault is locked",
            locked: true,
            message: `Vault locked due to failed attempts. Try again in ${minutesRemaining} minutes or use recovery code to reset password.`,
            minutesRemaining,
          });
        }
      }

      // If recovery code provided, validate and allow password reset
      if (recoveryCode) {
        const { verifyRecoveryCode } = await import('../secrets/secrets-service.js');
        const isValid = await verifyRecoveryCode(recoveryCode, masterKey);

        if (!isValid) {
          // Increment failed recovery attempts
          const newAttempts = (masterKey.failedAttempts || 0) + 1;
          
          if (newAttempts >= 3) {
            // Lock vault permanently after 3 failed recovery attempts
            await (db as any).update(secretsMasterKeys)
              .set({
                failedAttempts: newAttempts,
                lockedUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // Lock for 1 year
                updatedAt: new Date().toISOString(),
              })
              .where(eq(secretsMasterKeys.id, masterKey.id))
              .run();

            auditLog("VAULT_LOCKED_PERMANENTLY", {
              ip: clientIp,
              timestamp: new Date().toISOString(),
              reason: "3 failed recovery code attempts",
            });

            return res.status(423).json({
              error: "Vault permanently locked",
              locked: true,
              permanent: true,
              message: "Too many failed recovery attempts. You must delete vault contents and reinitialize.",
            });
          }

          // Update failed attempts
          await (db as any).update(secretsMasterKeys)
            .set({
              failedAttempts: newAttempts,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(secretsMasterKeys.id, masterKey.id))
            .run();

          auditLog("RECOVERY_CODE_INVALID", {
            ip: clientIp,
            attempts: newAttempts,
            timestamp: new Date().toISOString(),
          });

          return res.status(401).json({
            error: "Invalid recovery code",
            attemptsRemaining: 3 - newAttempts,
          });
        }

        // Valid recovery code - return success for password reset flow
        auditLog("RECOVERY_CODE_VERIFIED", {
          ip: clientIp,
          timestamp: new Date().toISOString(),
        });

        return res.json({
          ok: true,
          recoveryVerified: true,
          message: "Recovery code verified. You can now set a new master seed.",
        });
      }

      // Normal master seed unlock
      const unlocked = await secretsService.unlockVault(
        masterSeed,
        () => Promise.resolve(masterKey)
      );

      if (!unlocked) {
        // Increment failed attempts
        const newAttempts = (masterKey.failedAttempts || 0) + 1;
        
        if (newAttempts >= 3) {
          // Lock vault for 15 minutes after 3 failed attempts
          const lockoutTime = new Date(Date.now() + 15 * 60 * 1000);
          
          await (db as any).update(secretsMasterKeys)
            .set({
              failedAttempts: newAttempts,
              lockedUntil: lockoutTime.toISOString(),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(secretsMasterKeys.id, masterKey.id))
            .run();

          auditLog("VAULT_LOCKED", {
            ip: clientIp,
            attempts: newAttempts,
            lockedUntil: lockoutTime.toISOString(),
            timestamp: new Date().toISOString(),
          });

          return res.status(423).json({
            error: "Vault locked",
            locked: true,
            message: "Too many failed attempts. Vault locked for 15 minutes. Use recovery code to unlock immediately.",
          });
        }

        // Update failed attempts
        await (db as any).update(secretsMasterKeys)
          .set({
            failedAttempts: newAttempts,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(secretsMasterKeys.id, masterKey.id))
          .run();

        auditLog("UNLOCK_FAILED", {
          ip: clientIp,
          attempts: newAttempts,
          timestamp: new Date().toISOString(),
        });

        return res.status(401).json({
          error: "Invalid master seed",
          attemptsRemaining: 3 - newAttempts,
        });
      }

      // Reset failed attempts on successful unlock
      await (db as any).update(secretsMasterKeys)
        .set({
          failedAttempts: 0,
          lockedUntil: null,
          lastUnlocked: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(secretsMasterKeys.id, masterKey.id))
        .run();

      auditLog("VAULT_UNLOCKED", {
        ip: clientIp,
        timestamp: new Date().toISOString(),
      });

      res.json({
        ok: true,
        message: "Vault unlocked successfully",
      });
    } catch (error: any) {
      log.error("Error unlocking secrets vault", error);
      auditLog("UNLOCK_ERROR", {
        error: error.message,
        ip: req.ip,
      });
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/secrets/lock - Lock vault
  app.post("/api/secrets/lock", async (req, res) => {
    try {
      const { secretsService } = await import('../secrets/secrets-service.js');
      secretsService.lockVault();

      auditLog("VAULT_LOCKED", {
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      res.json({
        ok: true,
        message: "Vault locked successfully",
      });
    } catch (error: any) {
      log.error("Error locking secrets vault", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/secrets - List all secrets (metadata only, no payloads)
  app.get("/api/secrets", async (req, res) => {
    try {
      if (!storage || !storage.listSecrets) {
        return res.status(501).json({ error: "Secrets vault not available" });
      }

      const { secretsService } = await import('../secrets/secrets-service.js');

      if (!secretsService.isVaultUnlocked()) {
        return res.status(403).json({
          error: "Vault is locked - please unlock first",
        });
      }

      const integrationType = req.query.type as any;
      const secrets = await storage.listSecrets(integrationType);

      // Return metadata only (no encrypted payloads)
      const safeSecrets = secrets.map(s => ({
        id: s.id,
        integrationType: s.integrationType,
        label: s.label,
        metadata: s.metadata,
        enabled: s.enabled,
        lastRotatedAt: s.lastRotatedAt,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));

      res.json(safeSecrets);
    } catch (error: any) {
      log.error("Error listing secrets", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/secrets/:id - Get secret with decrypted payload
  app.get("/api/secrets/:id", async (req, res) => {
    try {
      if (!storage || !storage.getSecret) {
        return res.status(501).json({ error: "Secrets vault not available" });
      }

      const { secretsService } = await import('../secrets/secrets-service.js');

      if (!secretsService.isVaultUnlocked()) {
        return res.status(403).json({
          error: "Vault is locked - please unlock first",
        });
      }

      const vaultEntry = await storage.getSecret(req.params.id);

      if (!vaultEntry) {
        return res.status(404).json({
          error: "Secret not found",
        });
      }

      // Decrypt payload
      const payload = await secretsService.retrieveSecret(vaultEntry);

      auditLog("SECRET_RETRIEVED", {
        secretId: vaultEntry.id,
        integrationType: vaultEntry.integrationType,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      res.json({
        id: vaultEntry.id,
        integrationType: vaultEntry.integrationType,
        label: vaultEntry.label,
        metadata: vaultEntry.metadata,
        payload, // Decrypted
        enabled: vaultEntry.enabled,
        createdAt: vaultEntry.createdAt,
        updatedAt: vaultEntry.updatedAt,
      });
    } catch (error: any) {
      log.error("Error retrieving secret", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/secrets - Create new secret
  app.post("/api/secrets", async (req, res) => {
    try {
      if (!storage || !storage.saveSecret) {
        return res.status(501).json({ error: "Secrets vault not available" });
      }

      const { secretsService } = await import('../secrets/secrets-service.js');

      if (!secretsService.isVaultUnlocked()) {
        return res.status(403).json({
          error: "Vault is locked - please unlock first",
        });
      }

      const { integrationType, label, payload, metadata } = req.body;

      if (!integrationType || !label || !payload) {
        return res.status(400).json({
          error: "integrationType, label, and payload are required",
        });
      }

      // Validate payload against integration type schema
      const { validateSecretPayload } = await import('../secrets/secret-validator.js');
      const validation = validateSecretPayload(integrationType, payload);

      if (!validation.success) {
        return res.status(400).json({
          error: "Secret validation failed",
          errors: validation.errors,
        });
      }

      const vaultEntry = await secretsService.storeSecret(
        integrationType,
        label,
        payload,
        metadata,
        (data) => storage.saveSecret!(data)
      );

      auditLog("SECRET_CREATED", {
        secretId: vaultEntry.id,
        integrationType: vaultEntry.integrationType,
        label: vaultEntry.label,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      // Return without encrypted payload
      const { encryptedPayload, iv, authTag, ...safeEntry } = vaultEntry;

      res.status(201).json({
        ok: true,
        secret: safeEntry,
      });
    } catch (error: any) {
      log.error("Error creating secret", error);
      auditLog("SECRET_CREATE_FAILED", {
        error: error.message,
        ip: req.ip,
      });
      res.status(400).json({ error: error.message });
    }
  });

  // PUT /api/secrets/:id - Update existing secret
  app.put("/api/secrets/:id", async (req, res) => {
    try {
      if (!storage || !storage.updateSecret) {
        return res.status(501).json({ error: "Secrets vault not available" });
      }

      const { secretsService } = await import('../secrets/secrets-service.js');

      if (!secretsService.isVaultUnlocked()) {
        return res.status(403).json({
          error: "Vault is locked - please unlock first",
        });
      }

      const { payload, metadata } = req.body;

      if (!payload) {
        return res.status(400).json({
          error: "payload is required",
        });
      }

      // Get existing secret to determine integration type
      const existing = await storage.getSecret!(req.params.id);
      if (!existing) {
        return res.status(404).json({
          error: "Secret not found",
        });
      }

      // Validate payload against integration type schema
      const { validateSecretPayload } = await import('../secrets/secret-validator.js');
      const validation = validateSecretPayload(existing.integrationType, payload);

      if (!validation.success) {
        return res.status(400).json({
          error: "Secret validation failed",
          errors: validation.errors,
        });
      }

      const updated = await secretsService.updateSecret(
        req.params.id,
        payload,
        metadata,
        (id, data) => storage.updateSecret!(id, data)
      );

      if (!updated) {
        return res.status(404).json({
          error: "Secret not found",
        });
      }

      auditLog("SECRET_UPDATED", {
        secretId: updated.id,
        integrationType: updated.integrationType,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      // Return without encrypted payload
      const { encryptedPayload, iv, authTag, ...safeEntry } = updated;

      res.json({
        ok: true,
        secret: safeEntry,
      });
    } catch (error: any) {
      log.error("Error updating secret", error);
      auditLog("SECRET_UPDATE_FAILED", {
        secretId: req.params.id,
        error: error.message,
        ip: req.ip,
      });
      res.status(400).json({ error: error.message });
    }
  });

  // DELETE /api/secrets/:id - Delete secret
  app.delete("/api/secrets/:id", async (req, res) => {
    try {
      if (!storage || !storage.deleteSecret) {
        return res.status(501).json({ error: "Secrets vault not available" });
      }

      const { secretsService } = await import('../secrets/secrets-service.js');

      if (!secretsService.isVaultUnlocked()) {
        return res.status(403).json({
          error: "Vault is locked - please unlock first",
        });
      }

      const deleted = await secretsService.deleteSecret(
        req.params.id,
        (id) => storage.deleteSecret!(id)
      );

      if (!deleted) {
        return res.status(404).json({
          error: "Secret not found",
        });
      }

      auditLog("SECRET_DELETED", {
        secretId: req.params.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      res.json({
        ok: true,
        message: "Secret deleted successfully",
      });
    } catch (error: any) {
      log.error("Error deleting secret", error);
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/secrets/reset - Reset vault (destructive - requires confirmation)
  app.post("/api/secrets/reset", async (req, res) => {
    try {
      if (!storage || !storage.clearAllSecrets || !storage.clearMasterKey) {
        return res.status(501).json({ error: "Secrets vault not available" });
      }

      const { confirmation } = req.body;

      if (confirmation !== "DELETE_ALL_SECRETS") {
        return res.status(400).json({
          error: 'Please provide confirmation: "DELETE_ALL_SECRETS"',
        });
      }

      const { secretsService } = await import('../secrets/secrets-service.js');

      await secretsService.resetVault(
        () => storage.clearAllSecrets!(),
        () => storage.clearMasterKey!()
      );

      auditLog("VAULT_RESET", {
        ip: req.ip,
        timestamp: new Date().toISOString(),
        warning: "ALL SECRETS PERMANENTLY DELETED",
      });

      res.json({
        ok: true,
        message: "Vault reset successfully - all secrets permanently deleted",
      });
    } catch (error: any) {
      log.error("Error resetting vault", error);
      auditLog("VAULT_RESET_FAILED", {
        error: error.message,
        ip: req.ip,
      });
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // QUEUE BACKEND MANAGEMENT - Connection Testing, Backend Switching, Rollback
  // ============================================================================

  // POST /api/queue/test-connection - Test RabbitMQ or Kafka connection
  app.post("/api/queue/test-connection", async (req, res) => {
    try {
      const { backend, secretId } = req.body;

      if (!backend) {
        return res.status(400).json({
          error: "backend is required",
        });
      }

      // Validate backend type
      if (!["rabbitmq", "kafka"].includes(backend)) {
        return res.status(400).json({
          error: "backend must be 'rabbitmq' or 'kafka'",
        });
      }

      if (!secretId) {
        return res.status(400).json({
          error: "secretId is required - credentials must be stored in vault",
        });
      }

      // Fetch credentials from secrets vault
      const { secretsService } = await import('../secrets/secrets-service.js');
      
      // Check if vault is unlocked
      if (!secretsService.isVaultUnlocked()) {
        return res.status(423).json({
          error: "Vault is locked. Please unlock the vault first to test queue connections.",
          vaultLocked: true,
        });
      }

      // Retrieve and decrypt the secret
      if (!storage || !storage.getSecret) {
        return res.status(501).json({ error: "Secrets vault not available" });
      }

      const encryptedSecret = await storage.getSecret(secretId);
      if (!encryptedSecret) {
        return res.status(404).json({
          error: "Secret not found. Please select valid credentials from the vault.",
        });
      }

      // Decrypt the secret payload using retrieveSecret
      const credentials = await secretsService.retrieveSecret(encryptedSecret);

      // Test connection with timeout
      const timeout = 10000; // 10 seconds
      const testPromise = backend === "rabbitmq"
        ? testRabbitMQConnection(credentials)
        : testKafkaConnection(credentials);

      const result = await Promise.race([
        testPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connection test timeout")), timeout)
        ),
      ]);

      auditLog("QUEUE_CONNECTION_TEST", {
        backend,
        success: true,
        secretId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      res.json({
        ok: true,
        message: `Successfully connected to ${backend.toUpperCase()}`,
        details: result,
      });
    } catch (error: any) {
      log.error("Connection test failed", error);
      auditLog("QUEUE_CONNECTION_TEST_FAILED", {
        backend: req.body.backend,
        error: error.message,
        ip: req.ip,
      });
      res.status(400).json({
        ok: false,
        error: error.message || "Connection test failed",
      });
    }
  });

  // POST /api/queue/change-backend - Save queue backend configuration
  app.post("/api/queue/change-backend", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).json({ error: "Storage not available" });
      }

      const { backend, secretId, immediate } = req.body;

      if (!backend) {
        return res.status(400).json({
          error: "backend is required (inmemory, rabbitmq, kafka)",
        });
      }

      if (backend !== "inmemory" && !secretId) {
        return res.status(400).json({
          error: "secretId is required for rabbitmq and kafka backends",
        });
      }

      // Check if worker is processing messages
      const worker = getWorkerInstance();
      if (worker && worker.isProcessing && worker.isProcessing()) {
        return res.status(409).json({
          error: "Worker is currently processing messages. Please pause the worker first.",
          workerStatus: "processing",
        });
      }

      // Get current backend config or create default
      let currentConfig = await storage.getQueueBackendConfig?.();
      
      // Save previous backend before changing
      const previousBackend = currentConfig?.currentBackend || "inmemory";
      const previousSecretId = currentConfig?.currentSecretId;

      // Update backend configuration
      const newConfig = {
        id: "singleton",
        currentBackend: backend,
        currentSecretId: secretId || null,
        previousBackend,
        previousSecretId,
        lastChangeAt: new Date().toISOString(),
        changePending: !immediate,
        lastError: null,
        updatedAt: new Date().toISOString(),
      };

      await storage.saveQueueBackendConfig?.(newConfig);

      auditLog("QUEUE_BACKEND_CHANGED", {
        from: previousBackend,
        to: backend,
        immediate,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      res.json({
        ok: true,
        message: immediate
          ? "Backend changed - restart application to apply"
          : "Backend configuration saved - restart when ready",
        config: {
          currentBackend: backend,
          previousBackend,
          changePending: !immediate,
        },
        requiresRestart: true,
      });
    } catch (error: any) {
      log.error("Error changing queue backend", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/queue/rollback - Rollback to previous queue backend
  app.post("/api/queue/rollback", async (req, res) => {
    try {
      if (!storage || !storage.getQueueBackendConfig || !storage.saveQueueBackendConfig) {
        return res.status(501).json({ error: "Storage not available" });
      }

      const config = await storage.getQueueBackendConfig();

      if (!config || !config.previousBackend) {
        return res.status(404).json({
          error: "No previous backend configuration found",
        });
      }

      // Swap current and previous
      const rollbackConfig = {
        ...config,
        currentBackend: config.previousBackend,
        currentSecretId: config.previousSecretId,
        previousBackend: config.currentBackend,
        previousSecretId: config.currentSecretId,
        lastChangeAt: new Date().toISOString(),
        changePending: false,
        lastError: null,
        updatedAt: new Date().toISOString(),
      };

      await storage.saveQueueBackendConfig(rollbackConfig);

      auditLog("QUEUE_BACKEND_ROLLBACK", {
        from: config.currentBackend,
        to: config.previousBackend,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      res.json({
        ok: true,
        message: `Rolled back to ${config.previousBackend} - restart application to apply`,
        config: {
          currentBackend: config.previousBackend,
          previousBackend: config.currentBackend,
        },
        requiresRestart: true,
      });
    } catch (error: any) {
      log.error("Error rolling back queue backend", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // System Instance Test Files API (for E2E testing and emulation)
  // ============================================================================

  // Configure multer for file uploads (memory storage, 10MB max)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['application/xml', 'application/json', 'text/csv', 'text/plain', 'text/xml'];
      const allowedExts = ['.xml', '.json', '.csv', '.txt'];
      const ext = path.extname(file.originalname).toLowerCase();
      
      if (allowedTypes.includes(file.mimetype) && allowedExts.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type. Allowed: XML, JSON, CSV. Got: ${file.mimetype}`));
      }
    }
  });

  // GET /api/system-instances/:id/test-files - List test files (🔒 Auth required)
  app.get("/api/system-instances/:id/test-files", authenticateUser, async (req, res) => {
    try {
      const { id: systemInstanceId } = req.params;
      
      if (!storage?.getTestFiles) {
        return res.status(501).json({ error: "Test files not supported" });
      }
      
      const files = await storage.getTestFiles(systemInstanceId);
      
      // Filter notes based on user role - customers cannot see notes
      const userRole = (req as any).user?.role || "customer_user";
      const filesWithRBAC = files.map(file => {
        // Customers cannot see notes at all
        if (userRole !== "superadmin" && userRole !== "consultant") {
          const { notes, mlApproved, mlApprovedBy, mlApprovedAt, ...publicFile } = file;
          return publicFile;
        }
        return file;
      });
      
      res.json({ files: filesWithRBAC });
    } catch (error: any) {
      log.error("Error listing test files", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/system-instances/:id/test-files - Upload test file (🔒 Auth required)
  app.post("/api/system-instances/:id/test-files", 
    authenticateUser,
    (req, res, next) => {
      upload.single('file')(req, res, (err: any) => {
        if (err) {
          // Handle multer-specific errors
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: "File too large. Maximum 10MB." });
          }
          if (err.message && err.message.includes('Invalid file type')) {
            return res.status(400).json({ error: err.message });
          }
          // Other multer errors
          return res.status(400).json({ error: err.message || "File upload failed" });
        }
        next();
      });
    },
    async (req, res) => {
    try {
      const { id: systemInstanceId } = req.params;
      const file = req.file;
      const { description, initialNote } = req.body;
      const userRole = (req as any).user?.role || "customer_user";
      const userEmail = (req as any).user?.email || "unknown@example.com";
      
      if (!file) {
        return res.status(400).json({ error: "File is required" });
      }
      
      // Only consultants and superadmins can add notes
      if (initialNote && userRole !== "superadmin" && userRole !== "consultant") {
        return res.status(403).json({ error: "Only consultants and founders can add notes" });
      }
      
      if (!storage?.createTestFile || !storage?.writeTestFileToDisk || !storage?.getTestFileQuota) {
        return res.status(501).json({ error: "Test files not supported" });
      }
      
      // Check quotas
      const quota = await storage.getTestFileQuota(systemInstanceId);
      const MAX_FILES = 50;
      const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
      
      if (quota.count >= MAX_FILES) {
        return res.status(429).json({ 
          error: `File quota exceeded. Maximum ${MAX_FILES} files per system instance.`,
          quota 
        });
      }
      
      if (quota.totalSize + file.size > MAX_TOTAL_SIZE) {
        return res.status(429).json({ 
          error: `Storage quota exceeded. Maximum ${MAX_TOTAL_SIZE / 1024 / 1024}MB total per system instance.`,
          quota 
        });
      }
      
      // Determine media type from MIME type
      const mediaTypeMap: Record<string, SystemInstanceTestFile["mediaType"]> = {
        'application/xml': 'application/xml',
        'text/xml': 'application/xml',
        'application/json': 'application/json',
        'text/csv': 'text/csv',
        'text/plain': 'text/plain',
      };
      const mediaType = mediaTypeMap[file.mimetype] || 'text/plain';
      
      let storageKey: string | undefined;
      let fileSize: number;
      let createdFile: SystemInstanceTestFile;
      
      try {
        // Write file to disk first
        const writeResult = await storage.writeTestFileToDisk(
          systemInstanceId,
          file.buffer,
          file.originalname,
          mediaType
        );
        
        storageKey = writeResult.storageKey;
        fileSize = writeResult.fileSize;
        
        // Create initial note if provided
        const initialNotes = initialNote ? [{
          iteration: 1,
          author: userEmail,
          authorRole: userRole === "superadmin" ? "superadmin" as const : "consultant" as const,
          timestamp: new Date().toISOString(),
          content: initialNote,
        }] : undefined;
        
        // Then create database record with initial note
        createdFile = await storage.createTestFile({
          systemInstanceId,
          filename: file.originalname,
          mediaType,
          storageKey,
          fileSize,
          notes: initialNotes,
          metadata: description ? { description } : undefined,
        });
      } catch (dbError: any) {
        // If DB insert fails, clean up orphaned file
        if (storageKey && storage.deleteTestFileFromDisk) {
          await storage.deleteTestFileFromDisk(storageKey).catch(() => {});
        }
        throw dbError;
      }
      
      // Filter notes from response if customer
      const responseFile = (userRole === "superadmin" || userRole === "consultant") ? createdFile : (() => {
        const { notes, mlApproved, mlApprovedBy, mlApprovedAt, ...publicFile } = createdFile;
        return publicFile;
      })();
      
      res.status(201).json({ file: responseFile });
    } catch (error: any) {
      log.error("Error uploading test file", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/system-instances/:id/test-files/:fileId/download - Download test file (🔒 Auth required)
  app.get("/api/system-instances/:id/test-files/:fileId/download", authenticateUser, async (req, res) => {
    try {
      const { id: systemInstanceId, fileId } = req.params;
      
      if (!storage?.getTestFile || !storage?.readTestFileFromDisk) {
        return res.status(501).json({ error: "Test files not supported" });
      }
      
      const file = await storage.getTestFile(fileId);
      
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Verify ownership (prevent cross-instance access)
      if (file.systemInstanceId !== systemInstanceId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const buffer = await storage.readTestFileFromDisk(file.storageKey);
      
      res.setHeader('Content-Type', file.mediaType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(buffer);
    } catch (error: any) {
      log.error("Error downloading test file", error);
      
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: "File not found on disk" });
      }
      
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/system-instances/:id/test-files/:fileId - Delete test file (🔒 Auth required)
  app.delete("/api/system-instances/:id/test-files/:fileId", authenticateUser, async (req, res) => {
    try {
      const { id: systemInstanceId, fileId } = req.params;
      
      if (!storage?.getTestFile || !storage?.deleteTestFile) {
        return res.status(501).json({ error: "Test files not supported" });
      }
      
      // Verify ownership before deletion
      const file = await storage.getTestFile(fileId);
      
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (file.systemInstanceId !== systemInstanceId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // deleteTestFile handles both DB and disk deletion (see database-storage.ts)
      const deleted = await storage.deleteTestFile(fileId);
      
      res.json({ ok: deleted });
    } catch (error: any) {
      log.error("Error deleting test file", error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/system-instances/:id/test-files/:fileId/notes - Add iteration note (🔒 Consultant/Superadmin only)
  app.patch("/api/system-instances/:id/test-files/:fileId/notes", authenticateUser, async (req, res) => {
    try {
      const { id: systemInstanceId, fileId } = req.params;
      const { content } = req.body;
      const userRole = (req as any).user?.role || "customer_user";
      const userEmail = (req as any).user?.email || "unknown@example.com";
      
      // Only consultants and superadmins can add notes
      if (userRole !== "superadmin" && userRole !== "consultant") {
        return res.status(403).json({ error: "Only consultants and founders can add notes" });
      }
      
      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Note content is required" });
      }
      
      if (!storage?.getTestFile || !storage?.addTestFileNote) {
        return res.status(501).json({ error: "Test file notes not supported" });
      }
      
      // Verify file exists and belongs to system instance
      const file = await storage.getTestFile(fileId);
      
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (file.systemInstanceId !== systemInstanceId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Add note
      const authorRole = userRole === "superadmin" ? "superadmin" as const : "consultant" as const;
      const updated = await storage.addTestFileNote(fileId, userEmail, authorRole, content);
      
      res.json({ ok: updated });
    } catch (error: any) {
      log.error("Error adding note", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/system-instances/:id/test-files/:fileId/approve - Approve for ML training (🔒 Superadmin only)
  app.post("/api/system-instances/:id/test-files/:fileId/approve", authenticateUser, async (req, res) => {
    try {
      const { id: systemInstanceId, fileId } = req.params;
      const userRole = (req as any).user?.role || "customer_user";
      const userEmail = (req as any).user?.email || "unknown@example.com";
      
      // Only superadmins can approve for ML
      if (userRole !== "superadmin") {
        return res.status(403).json({ error: "Only founders can approve files for ML training" });
      }
      
      if (!storage?.getTestFile || !storage?.approveTestFileForML) {
        return res.status(501).json({ error: "ML approval not supported" });
      }
      
      // Verify file exists and belongs to system instance
      const file = await storage.getTestFile(fileId);
      
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (file.systemInstanceId !== systemInstanceId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Approve file
      const updated = await storage.approveTestFileForML(fileId, userEmail);
      
      res.json({ ok: updated, mlApproved: true });
    } catch (error: any) {
      log.error("Error approving file for ML", error);
      res.status(500).json({ error: error.message });
    }
  });

  log.info("REST routes registered");
}

// ============================================================================
// Queue Backend Connection Testing Utilities
// ============================================================================

async function testRabbitMQConnection(credentials: any): Promise<any> {
  const { url, queueIn, queueOut } = credentials;

  if (!url) {
    throw new Error("RabbitMQ URL is required");
  }

  let connection;
  let channel;

  try {
    const amqp = await import("amqplib");
    connection = await amqp.default.connect(url);
    channel = await connection.createChannel();

    // Test queue assertions
    const testQueue = queueIn || "test_queue";
    await channel.assertQueue(testQueue, { durable: true });

    return {
      connected: true,
      url: url.replace(/:\/\/[^:]+:[^@]+@/, "://*****:*****@"), // Mask credentials
      queueIn,
      queueOut,
      timestamp: new Date().toISOString(),
    };
  } finally {
    if (channel) await channel.close().catch(() => {});
    if (connection) await connection.close().catch(() => {});
  }
}

async function testKafkaConnection(credentials: any): Promise<any> {
  const { brokers, user, password, groupId, topicIn, topicOut } = credentials;

  if (!brokers) {
    throw new Error("Kafka brokers are required");
  }

  const { Kafka } = await import("kafkajs");
  
  const kafka = new Kafka({
    clientId: "continuitybridge-test",
    brokers: brokers.split(",").map((b: string) => b.trim()),
    ...(user && password && {
      sasl: {
        mechanism: "plain",
        username: user,
        password,
      },
      ssl: true,
    }),
  });

  const admin = kafka.admin();

  try {
    await admin.connect();
    
    // Test connection by listing topics
    const topics = await admin.listTopics();

    return {
      connected: true,
      brokers: brokers.split(",").map((b: string) => b.trim()),
      groupId,
      topicIn,
      topicOut,
      availableTopics: topics.slice(0, 10), // First 10 topics
      timestamp: new Date().toISOString(),
    };
  } finally {
    await admin.disconnect().catch(() => {});
  }
}

/**
 * Register authentication adapter and policy routes
 */
export function registerAuthRoutes(
  app: Express,
  storage: IStorage,
  tokenLifecycle: any,
  secretsService: any,
  reloadPolicies: () => Promise<void>,
  authGuard?: any
): void {
  const authLog = logger.child("AuthRoutes");

  // Apply auth guard to all /api/auth/* routes if provided
  // For MVP, this requires X-API-Key header, Bearer token, or session
  if (authGuard) {
    app.use("/api/auth", authGuard);
    authLog.info("Auth guard applied to /api/auth/* endpoints");
  } else {
    authLog.warn("Auth routes registered WITHOUT authentication guard - INSECURE");
  }

  // ============================================================================
  // Auth Adapters CRUD
  // ============================================================================

  // GET /api/auth/adapters - List all auth adapters
  app.get("/api/auth/adapters", async (req, res) => {
    try {
      const adapters = await storage.getAuthAdapters?.() || [];
      res.json(adapters);
    } catch (error: any) {
      authLog.error("Failed to list auth adapters", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/auth/adapters/:id - Get single auth adapter
  app.get("/api/auth/adapters/:id", async (req, res) => {
    try {
      const adapter = await storage.getAuthAdapter?.(req.params.id);
      if (!adapter) {
        return res.status(404).json({ error: "Auth adapter not found" });
      }
      res.json(adapter);
    } catch (error: any) {
      authLog.error("Failed to get auth adapter", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/auth/adapters - Create auth adapter
  app.post("/api/auth/adapters", async (req, res) => {
    try {
      const adapter = await storage.createAuthAdapter?.(req.body);
      if (!adapter) {
        return res.status(500).json({ error: "Failed to create auth adapter" });
      }
      
      // Log audit event
      await storage.addAuditLog?.({
        event_type: "auth_adapter_created",
        resource_type: "authAdapter",
        resource_id: adapter.id,
        actor: "system", // TODO: Add user from session
        status: "success",
        metadata: { name: adapter.name, type: adapter.type },
      });

      res.json(adapter);
    } catch (error: any) {
      authLog.error("Failed to create auth adapter", error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/auth/adapters/:id - Update auth adapter
  app.put("/api/auth/adapters/:id", async (req, res) => {
    try {
      const adapter = await storage.updateAuthAdapter?.(req.params.id, req.body);
      if (!adapter) {
        return res.status(404).json({ error: "Auth adapter not found" });
      }

      // Log audit event
      await storage.addAuditLog?.({
        event_type: "auth_adapter_updated",
        resource_type: "authAdapter",
        resource_id: adapter.id,
        actor: "system",
        status: "success",
        metadata: { name: adapter.name },
      });

      res.json(adapter);
    } catch (error: any) {
      authLog.error("Failed to update auth adapter", error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/auth/adapters/:id - Delete auth adapter
  app.delete("/api/auth/adapters/:id", async (req, res) => {
    try {
      await storage.deleteAuthAdapter?.(req.params.id);

      // Log audit event
      await storage.addAuditLog?.({
        event_type: "auth_adapter_deleted",
        resource_type: "authAdapter",
        resource_id: req.params.id,
        actor: "system",
        status: "success",
      });

      res.json({ ok: true });
    } catch (error: any) {
      authLog.error("Failed to delete auth adapter", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // Auth Adapter Actions
  // ============================================================================

  // POST /api/auth/adapters/:id/test - Test adapter connection
  app.post("/api/auth/adapters/:id/test", async (req, res) => {
    try {
      const adapter = await storage.getAuthAdapter?.(req.params.id);
      if (!adapter) {
        return res.status(404).json({ error: "Auth adapter not found" });
      }

      if (!adapter.activated) {
        return res.status(400).json({ error: "Adapter is not activated" });
      }

      // Log test attempt
      await storage.addAuditLog?.({
        event_type: "auth_adapter_test_started",
        resource_type: "authAdapter",
        resource_id: adapter.id,
        actor: "system",
        status: "pending",
      });

      // Test based on adapter type
      let testResult: any;
      if (adapter.type === "oauth2") {
        // Import and test OAuth2 adapter
        const { OAuth2Adapter } = await import("../auth/adapters/oauth2-adapter.js");
        const oauth2 = new OAuth2Adapter(adapter, storage, tokenLifecycle, secretsService);
        const result = await oauth2.provideOutbound();
        testResult = { 
          success: true, 
          hasToken: !!result.token,
          placement: result.placement 
        };
      } else if (adapter.type === "jwt") {
        // Import and test JWT adapter
        const { JWTAdapter } = await import("../auth/adapters/jwt-adapter.js");
        const jwt = new JWTAdapter(adapter, storage, tokenLifecycle, secretsService);
        const result = await jwt.provideOutbound();
        testResult = { 
          success: true, 
          hasToken: !!result.token,
          placement: result.placement 
        };
      } else if (adapter.type === "cookie") {
        // Cookie adapter needs a real session - return mock success
        testResult = { 
          success: true, 
          message: "Cookie adapter configured - requires active session to test" 
        };
      } else {
        return res.status(400).json({ error: "Unknown adapter type" });
      }

      // Update last tested timestamp
      await storage.updateAuthAdapter?.(adapter.id, {
        lastTestedAt: new Date().toISOString(),
      });

      // Log success
      await storage.addAuditLog?.({
        event_type: "auth_adapter_test_completed",
        resource_type: "authAdapter",
        resource_id: adapter.id,
        actor: "system",
        status: "success",
        metadata: testResult,
      });

      res.json({ ok: true, result: testResult });
    } catch (error: any) {
      authLog.error("Auth adapter test failed", error);
      
      // Log failure
      await storage.addAuditLog?.({
        event_type: "auth_adapter_test_failed",
        resource_type: "authAdapter",
        resource_id: req.params.id,
        actor: "system",
        status: "failure",
        metadata: { error: error.message },
      });

      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // POST /api/auth/adapters/:id/refresh - Force token refresh
  app.post("/api/auth/adapters/:id/refresh", async (req, res) => {
    try {
      const adapter = await storage.getAuthAdapter?.(req.params.id);
      if (!adapter) {
        return res.status(404).json({ error: "Auth adapter not found" });
      }

      if (!adapter.activated) {
        return res.status(400).json({ error: "Adapter is not activated" });
      }

      // Invalidate all tokens for this adapter
      await tokenLifecycle.invalidateToken(adapter.id);

      // Log refresh
      await storage.addAuditLog?.({
        event_type: "auth_adapter_refresh_forced",
        resource_type: "authAdapter",
        resource_id: adapter.id,
        actor: "system",
        status: "success",
      });

      res.json({ ok: true, message: "Token cache invalidated - will refresh on next use" });
    } catch (error: any) {
      authLog.error("Failed to refresh adapter tokens", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/auth/adapters/:id/status - Get token status
  app.get("/api/auth/adapters/:id/status", async (req, res) => {
    try {
      const adapter = await storage.getAuthAdapter?.(req.params.id);
      if (!adapter) {
        return res.status(404).json({ error: "Auth adapter not found" });
      }

      // Get cached token info (without exposing token itself)
      const cached = await tokenLifecycle.get(adapter.id, "access");
      
      const status = {
        adapterId: adapter.id,
        name: adapter.name,
        type: adapter.type,
        activated: adapter.activated,
        hasCachedToken: !!cached,
        tokenExpired: cached ? tokenLifecycle.isExpired(cached.expiresAt) : null,
        expiresAt: cached?.expiresAt || null,
        lastUsed: adapter.lastUsedAt || null,
        lastTested: adapter.lastTestedAt || null,
      };

      res.json(status);
    } catch (error: any) {
      authLog.error("Failed to get adapter status", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // Inbound Auth Policies CRUD
  // ============================================================================

  // GET /api/auth/policies - List all policies
  app.get("/api/auth/policies", async (req, res) => {
    try {
      const policies = await storage.getInboundAuthPolicies?.() || [];
      res.json(policies);
    } catch (error: any) {
      authLog.error("Failed to list policies", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/auth/policies/:id - Get single policy
  app.get("/api/auth/policies/:id", async (req, res) => {
    try {
      const policies = await storage.getInboundAuthPolicies?.() || [];
      const policy = policies.find((p: any) => p.id === req.params.id);
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }
      res.json(policy);
    } catch (error: any) {
      authLog.error("Failed to get policy", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/auth/policies - Create policy
  app.post("/api/auth/policies", async (req, res) => {
    try {
      const policy = await storage.createInboundAuthPolicy?.(req.body);
      if (!policy) {
        return res.status(500).json({ error: "Failed to create policy" });
      }

      // Reload middleware policy cache
      await reloadPolicies();

      // Log audit event
      await storage.addAuditLog?.({
        event_type: "inbound_policy_created",
        resource_type: "inboundAuthPolicy",
        resource_id: policy.id,
        actor: "system",
        status: "success",
        metadata: { routePattern: policy.routePattern, httpMethod: policy.httpMethod },
      });

      res.json(policy);
    } catch (error: any) {
      authLog.error("Failed to create policy", error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/auth/policies/:id - Update policy
  app.put("/api/auth/policies/:id", async (req, res) => {
    try {
      const policy = await storage.updateInboundAuthPolicy?.(req.params.id, req.body);
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }

      // Reload middleware policy cache
      await reloadPolicies();

      // Log audit event
      await storage.addAuditLog?.({
        event_type: "inbound_policy_updated",
        resource_type: "inboundAuthPolicy",
        resource_id: policy.id,
        actor: "system",
        status: "success",
      });

      res.json(policy);
    } catch (error: any) {
      authLog.error("Failed to update policy", error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/auth/policies/:id - Delete policy
  app.delete("/api/auth/policies/:id", async (req, res) => {
    try {
      await storage.deleteInboundAuthPolicy?.(req.params.id);

      // Reload middleware policy cache
      await reloadPolicies();

      // Log audit event
      await storage.addAuditLog?.({
        event_type: "inbound_policy_deleted",
        resource_type: "inboundAuthPolicy",
        resource_id: req.params.id,
        actor: "system",
        status: "success",
      });

      res.json({ ok: true });
    } catch (error: any) {
      authLog.error("Failed to delete policy", error);
      res.status(500).json({ error: error.message });
    }
  });

  authLog.info("Auth routes registered successfully");
}

