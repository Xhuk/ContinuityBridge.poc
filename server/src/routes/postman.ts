import { Router, Request, Response } from "express";
import { postmanGenerator } from "../export/postman-generator.js";
import { interfaceManager } from "../interfaces/manager.js";
import { db } from "../../db.js";
import { flowDefinitions } from "../../schema.js";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";

const router = Router();
const log = logger.child("PostmanRoutes");

/**
 * GET /api/postman/collection
 * Download Postman collection for configured interfaces and flows
 * 
 * Query params:
 * - environment: dev | staging | prod (default: dev)
 * - includeSecrets: true | false (default: false)
 * - includeFlowTriggers: true | false (default: true)
 * - includeSamplePayloads: true | false (default: true)
 * - vaultKey: string (required for production secrets)
 */
router.get("/collection", authenticateUser, async (req: Request, res: Response) => {
  try {
    const {
      environment = "dev",
      includeSecrets = "false",
      includeFlowTriggers = "true",
      includeSamplePayloads = "true",
      vaultKey,
    } = req.query;

    const user = req.user!;
    
    log.info(`Generating Postman collection`, {
      userId: user.id,
      environment,
      includeSecrets: includeSecrets === "true",
    });

    // Check if user has permission to include secrets
    const canIncludeSecrets = user.role === "superadmin" || user.role === "consultant" || user.role === "customer_admin";
    const requestedSecrets = includeSecrets === "true";
    const isProd = environment === "prod";

    // PRODUCTION PROTECTION: Require vault key for production secrets
    if (isProd && requestedSecrets && !vaultKey) {
      log.warn(`Production secrets requested without vault key`, {
        userId: user.id,
        role: user.role,
      });
      return res.status(403).json({
        error: "Vault key required",
        message: "Production credentials require Secrets Vault key for verification",
      });
    }

    // Verify vault key for production secrets
    if (isProd && requestedSecrets && vaultKey) {
      const { secretsService } = await import("../secrets/secrets-service.js");
      const { storage } = await import("../../storage.js");

      // Verify vault key by attempting to unlock
      if (!storage || !storage.getMasterKey) {
        return res.status(501).json({ error: "Secrets vault not available" });
      }

      const masterKey = await storage.getMasterKey();
      if (!masterKey) {
        return res.status(500).json({ error: "Vault not initialized" });
      }

      // Verify vault key matches
      const verified = await secretsService.unlockVault(
        vaultKey as string,
        async () => masterKey
      );

      if (!verified) {
        log.warn(`Invalid vault key provided for production secrets`, {
          userId: user.id,
          role: user.role,
        });
        return res.status(403).json({
          error: "Invalid vault key",
          message: "The provided vault key is incorrect",
        });
      }

      log.info(`Vault key verified for production secrets export`, {
        userId: user.id,
        role: user.role,
      });
    }

    // Get all interfaces
    const interfaces = interfaceManager.getAllInterfaces();
    
    // Get all flows from database
    const flows = await (db.select() as any)
      .from(flowDefinitions)
      .all();

    // Get secrets (only if authorized and secrets are requested)
    const secrets = new Map();
    if (requestedSecrets && canIncludeSecrets) {
      // For non-production or vault-verified production
      if (!isProd || (isProd && vaultKey)) {
        interfaces.forEach(iface => {
          const secret = interfaceManager.getInterfaceSecret(iface.id);
          if (secret) {
            secrets.set(iface.id, secret);
          }
        });
      }
    }

    // Generate collection
    const collection = await postmanGenerator.generateCollection(
      interfaces,
      flows,
      secrets,
      {
        environment: environment as "dev" | "staging" | "prod",
        includeSecrets: requestedSecrets && canIncludeSecrets && secrets.size > 0,
        includeFlowTriggers: includeFlowTriggers === "true",
        includeSamplePayloads: includeSamplePayloads === "true",
        organizationName: user.organizationId || "ContinuityBridge",
      }
    );

    // Set headers for file download
    const filename = `${user.organizationId || "continuitybridge"}-${environment}-collection.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.json(collection);

    log.info(`Postman collection downloaded`, {
      userId: user.id,
      interfaceCount: interfaces.length,
      flowCount: flows.length,
      filename,
      secretsIncluded: secrets.size > 0,
    });
  } catch (error: any) {
    log.error("Error generating Postman collection", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/postman/collection/regenerate
 * Regenerate Postman collection with updated configuration
 * Useful when interfaces or flows have been modified
 */
router.post("/collection/regenerate", authenticateUser, async (req: Request, res: Response) => {
  try {
    const { environment, includeSecrets, organizationName } = req.body;
    const user = req.user!;

    log.info(`Regenerating Postman collection`, {
      userId: user.id,
      environment,
    });

    // Get all interfaces
    const interfaces = interfaceManager.getAllInterfaces();
    
    // Get all flows
    const flows = await (db.select() as any)
      .from(flowDefinitions)
      .all();

    // Get secrets (only for superadmin)
    const secrets = new Map();
    if (includeSecrets && user.role === "superadmin") {
      interfaces.forEach(iface => {
        const secret = interfaceManager.getInterfaceSecret(iface.id);
        if (secret) {
          secrets.set(iface.id, secret);
        }
      });
    }

    // Generate collection
    const collection = await postmanGenerator.generateCollection(
      interfaces,
      flows,
      secrets,
      {
        environment: environment || "dev",
        includeSecrets: includeSecrets && user.role === "superadmin",
        includeFlowTriggers: true,
        includeSamplePayloads: true,
        organizationName: organizationName || user.organizationId || "ContinuityBridge",
      }
    );

    res.json({
      success: true,
      collection,
      stats: {
        interfaces: interfaces.length,
        flows: flows.length,
        requests: collection.item.reduce((sum, folder: any) => sum + (folder.item?.length || 0), 0),
      },
    });
  } catch (error: any) {
    log.error("Error regenerating Postman collection", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/postman/stats
 * Get statistics about what will be included in Postman collection
 */
router.get("/stats", authenticateUser, async (req: Request, res: Response) => {
  try {
    const interfaces = interfaceManager.getAllInterfaces();
    const flows = await (db.select() as any)
      .from(flowDefinitions)
      .all();

    const stats = {
      interfaces: {
        total: interfaces.length,
        inbound: interfaces.filter(i => i.direction === "inbound").length,
        outbound: interfaces.filter(i => i.direction === "outbound").length,
        bidirectional: interfaces.filter(i => i.direction === "bidirectional").length,
        byProtocol: interfaces.reduce((acc, iface) => {
          acc[iface.protocol] = (acc[iface.protocol] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byAuthType: interfaces.reduce((acc, iface) => {
          acc[iface.authType] = (acc[iface.authType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
      flows: {
        total: flows.length,
        enabled: flows.filter((f: any) => f.enabled).length,
        withWebhooks: flows.filter((f: any) => f.webhookEnabled || f.triggerType === "webhook").length,
      },
    };

    res.json(stats);
  } catch (error: any) {
    log.error("Error fetching Postman stats", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
