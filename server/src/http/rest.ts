import type { Express } from "express";
import { randomUUID } from "crypto";
import { Pipeline } from "../core/pipeline.js";
import { metricsCollector } from "../core/metrics.js";
import { getQueueProvider } from "../serverQueue.js";
import { getWorkerInstance } from "../workers/worker.js";
import { logger } from "../core/logger.js";
import { getCurrentBackend } from "../serverQueue.js";
import { getDataSourceManager } from "../datasources/manager.js";
import { interfaceManager } from "../interfaces/manager.js";
import { interfaceTemplateCatalog } from "../interfaces/template-catalog.js";

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

export function registerRESTRoutes(app: Express, pipeline: Pipeline, orchestrator?: FlowOrchestrator, storage?: IStorage): void {
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
  app.get("/api/interfaces", (req, res) => {
    try {
      const { type, direction } = req.query;
      
      let interfaces;
      if (type) {
        interfaces = interfaceManager.getInterfacesByType(type as string);
      } else if (direction) {
        interfaces = interfaceManager.getInterfacesByDirection(direction as string);
      } else {
        interfaces = interfaceManager.getAllInterfaces();
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

  // GET /api/flows - List all flows
  app.get("/api/flows", async (req, res) => {
    try {
      if (!storage) {
        return res.status(501).json({ error: "Flow storage is not initialized" });
      }
      const flows = await storage.getFlows();
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
      const flow = await storage.updateFlow(req.params.id, req.body);
      if (!flow) {
        return res.status(404).json({ error: "Flow not found" });
      }
      log.info(`Flow updated: ${flow.id} - ${flow.name}`);
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
      const deleted = await storage.deleteFlow(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Flow not found" });
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
      const { input, enqueue } = req.body;

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
            traceId 
          })
        );

        return res.json({
          ok: true,
          traceId,
          message: "Flow execution enqueued for processing",
        });
      }

      // Option 2: Execute synchronously via pipeline
      const traceId = randomUUID();
      const result = await pipeline.runItemPipeline({
        mode: 'flow',
        flowId,
        flowInput: input,
        traceId,
      });

      res.json({
        ok: result.success,
        traceId: result.traceId,
        output: result.canonical,
        decision: result.decision,
        error: result.error,
        latencyMs: result.latencyMs,
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

  log.info("REST routes registered");
}
