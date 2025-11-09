import type { Express } from "express";
import { randomUUID } from "crypto";
import { Pipeline } from "../core/pipeline.js";
import { metricsCollector } from "../core/metrics.js";
import { getQueueProvider } from "../serverQueue.js";
import { getWorkerInstance } from "../workers/worker.js";
import { logger } from "../core/logger.js";
import { getCurrentBackend } from "../serverQueue.js";

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

export function registerRESTRoutes(app: Express, pipeline: Pipeline): void {
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

  log.info("REST routes registered");
}
