import { Router, type Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import type { IStorage } from "../../storage.js";
import type { FlowOrchestrator } from "../flow/orchestrator.js";
import { logger } from "../core/logger.js";

const log = logger.child("DynamicWebhookRouter");

export interface WebhookRegistration {
  slug: string;
  flowId: string;
  organizationId?: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  enabled: boolean;
  registeredAt: string;
}

/**
 * Dynamic Webhook Router - Hot-Reload Support
 * 
 * Allows creating/deleting webhook endpoints at runtime without server restart.
 * Supports multi-tenant isolation via organizationId.
 * 
 * Features:
 * - Zero downtime endpoint registration
 * - Automatic conflict detection
 * - Multi-tenant slug isolation
 * - Startup sync from database
 */
export class DynamicWebhookRouter {
  private webhooks: Map<string, WebhookRegistration> = new Map();
  private storage: IStorage;
  private orchestrator: FlowOrchestrator;

  constructor(storage: IStorage, orchestrator: FlowOrchestrator) {
    this.storage = storage;
    this.orchestrator = orchestrator;
  }

  /**
   * Register a webhook endpoint dynamically
   * @returns true if registered, false if slug already exists
   */
  async registerWebhook(
    slug: string,
    flowId: string,
    method: WebhookRegistration["method"] = "POST",
    organizationId?: string
  ): Promise<{ success: boolean; reason?: string }> {
    // Generate unique key for multi-tenant isolation
    const key = organizationId ? `${organizationId}::${slug}` : slug;

    // Check for conflicts
    if (this.webhooks.has(key)) {
      log.warn(`Webhook slug already registered: ${slug}`, { flowId, organizationId });
      return {
        success: false,
        reason: `Webhook slug '${slug}' is already in use`,
      };
    }

    // Verify flow exists and is enabled
    const flow = await this.storage.getFlow(flowId);
    if (!flow) {
      return {
        success: false,
        reason: `Flow not found: ${flowId}`,
      };
    }

    if (!flow.enabled) {
      return {
        success: false,
        reason: `Flow is disabled: ${flow.name}`,
      };
    }

    // Register webhook
    const registration: WebhookRegistration = {
      slug,
      flowId,
      organizationId,
      method,
      enabled: true,
      registeredAt: new Date().toISOString(),
    };

    this.webhooks.set(key, registration);
    log.info(`Webhook registered: ${method} /api/webhook/${slug}`, {
      flowId,
      flowName: flow.name,
      organizationId,
    });

    return { success: true };
  }

  /**
   * Unregister a webhook endpoint
   */
  async unregisterWebhook(slug: string, organizationId?: string): Promise<boolean> {
    const key = organizationId ? `${organizationId}::${slug}` : slug;
    const existed = this.webhooks.delete(key);

    if (existed) {
      log.info(`Webhook unregistered: /api/webhook/${slug}`, { organizationId });
    }

    return existed;
  }

  /**
   * Update webhook registration (e.g., slug change, method change)
   */
  async updateWebhook(
    oldSlug: string,
    newSlug: string,
    flowId: string,
    method?: WebhookRegistration["method"],
    organizationId?: string
  ): Promise<{ success: boolean; reason?: string }> {
    // Unregister old
    await this.unregisterWebhook(oldSlug, organizationId);

    // Register new
    return await this.registerWebhook(newSlug, flowId, method || "POST", organizationId);
  }

  /**
   * Get all registered webhooks (optionally filtered by organizationId)
   */
  getWebhooks(organizationId?: string): WebhookRegistration[] {
    const allWebhooks = Array.from(this.webhooks.values());

    if (!organizationId) {
      return allWebhooks;
    }

    return allWebhooks.filter((w) => w.organizationId === organizationId);
  }

  /**
   * Get webhook by slug
   */
  getWebhook(slug: string, organizationId?: string): WebhookRegistration | undefined {
    const key = organizationId ? `${organizationId}::${slug}` : slug;
    return this.webhooks.get(key);
  }

  /**
   * Load all webhook-enabled flows from database on startup
   * Ensures existing webhooks are re-registered after server restart
   */
  async syncFromDatabase(): Promise<number> {
    log.info("Syncing webhooks from database...");

    const flows = await this.storage.getFlows();
    let registered = 0;

    for (const flow of flows) {
      if (!flow.enabled) continue;

      // Check if flow has webhook trigger
      const hasWebhookTrigger = flow.nodes.some((n) => n.type === "webhook_trigger");
      const webhookSlug = flow.webhookSlug || flow.id;

      if (hasWebhookTrigger || flow.webhookEnabled) {
        const webhookNode = flow.nodes.find((n) => n.type === "webhook_trigger");
        const method = (webhookNode?.data.webhookMethod as any) || "POST";
        const organizationId = (flow as any).metadata?.organizationId;

        const result = await this.registerWebhook(webhookSlug, flow.id, method, organizationId);

        if (result.success) {
          registered++;
        } else {
          log.warn(`Failed to sync webhook for flow ${flow.id}`, { reason: result.reason });
        }
      }
    }

    log.info(`Webhook sync complete: ${registered} webhooks registered`, {
      total: flows.length,
    });

    return registered;
  }

  /**
   * Create Express router with dynamic webhook handling
   */
  createRouter(): Router {
    const router = Router();

    // Catch-all route for dynamic webhooks
    router.all("/:slug", async (req: Request, res: Response, next: NextFunction) => {
      const slug = req.params.slug;
      const organizationId = (req as any).organizationId; // From auth middleware

      // Find webhook registration
      const key = organizationId ? `${organizationId}::${slug}` : slug;
      const registration = this.webhooks.get(key);

      if (!registration) {
        log.warn(`Webhook not found: ${slug}`, { organizationId, method: req.method });
        return res.status(404).json({
          error: "Webhook not found",
          message: `No webhook registered for slug: ${slug}`,
        });
      }

      // Validate HTTP method
      if (req.method !== registration.method && registration.method !== "POST") {
        return res.status(405).json({
          error: "Method not allowed",
          message: `This webhook only accepts ${registration.method} requests`,
          allowedMethod: registration.method,
        });
      }

      // Check if webhook is enabled
      if (!registration.enabled) {
        return res.status(410).json({
          error: "Webhook disabled",
          message: "This webhook has been temporarily disabled",
        });
      }

      // Verify flow still exists and is enabled
      const flow = await this.storage.getFlow(registration.flowId);
      if (!flow) {
        log.error(`Flow not found for webhook: ${slug}`, { flowId: registration.flowId });
        return res.status(500).json({
          error: "Flow not found",
          message: "The flow associated with this webhook no longer exists",
        });
      }

      if (!flow.enabled) {
        return res.status(410).json({
          error: "Flow disabled",
          message: `Flow '${flow.name}' has been disabled`,
        });
      }

      try {
        const traceId = randomUUID();
        const inputData = req.body;

        log.info(`Webhook triggered: ${slug}`, {
          flowId: flow.id,
          flowName: flow.name,
          traceId,
          organizationId,
          method: req.method,
        });

        // Execute flow via orchestrator
        const flowRun = await this.orchestrator.executeFlow(
          registration.flowId,
          inputData,
          "webhook"
        );

        if (flowRun.status === "failed") {
          return res.status(500).json({
            ok: false,
            error: flowRun.error || "Flow execution failed",
            traceId,
            runId: flowRun.id,
          });
        }

        // Success response
        res.json({
          ok: true,
          traceId,
          runId: flowRun.id,
          status: flowRun.status,
          output: flowRun.outputData,
          executedNodes: flowRun.executedNodes.length,
          durationMs: flowRun.durationMs,
        });
      } catch (error: any) {
        log.error(`Webhook execution error: ${slug}`, {
          error: error.message,
          flowId: registration.flowId,
        });

        res.status(500).json({
          ok: false,
          error: error.message || "Internal server error",
        });
      }
    });

    return router;
  }
}
