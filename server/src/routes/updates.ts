/**
 * Remote Updates API
 * 
 * Founder platform (Render) provides updates to customer environments
 * Endpoints for publishing and retrieving adapters, flows, patches
 */

import { Router } from "express";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";
import * as crypto from "crypto";

const router = Router();
const log = logger.child("UpdatesAPI");

/**
 * GET /api/updates/available
 * Customer environments check for available updates
 * 
 * Headers:
 *   X-Organization-Id: customer org
 *   X-Environment: dev|test|prod
 *   X-Update-Channel: stable|beta|nightly
 *   X-Current-Version: 1.0.0
 */
router.get("/available", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"] as string;
    const environment = req.headers["x-environment"] as string;
    const channel = req.headers["x-update-channel"] as string || "stable";
    const currentVersion = req.headers["x-current-version"] as string || "1.0.0";

    if (!organizationId) {
      return res.status(400).json({ error: "X-Organization-Id header required" });
    }

    log.info("Update check received", {
      organizationId,
      environment,
      channel,
      currentVersion,
    });

    // Query available updates for this customer
    // In production, filter by:
    // - Customer license (only show updates they're entitled to)
    // - Environment (dev gets all, prod gets stable only)
    // - Version compatibility

    const availableUpdates = await getAvailableUpdates({
      organizationId,
      environment,
      channel,
      currentVersion,
    });

    res.json(availableUpdates);
  } catch (error: any) {
    log.error("Error checking updates", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/updates/publish
 * Founders publish new updates (adapters, flows, patches)
 * 🔒 Superadmin only
 */
router.post("/publish", authenticateUser, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;

    if (userRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const {
      version,
      updateType,
      updates,
      minVersion,
      maxVersion,
      targetChannel,
      releaseNotes,
    } = req.body;

    if (!version || !updateType || !updates) {
      return res.status(400).json({ 
        error: "Missing required fields: version, updateType, updates" 
      });
    }

    // Create update manifest
    const manifest = {
      version,
      releaseDate: new Date().toISOString(),
      updateType,
      updates,
      minVersion,
      maxVersion,
      releaseNotes,
    };

    // Generate signature
    const signature = generateUpdateSignature(manifest);

    const signedManifest = {
      ...manifest,
      signature,
    };

    // Store in database
    await storeUpdate(signedManifest, targetChannel || "stable");

    log.info(`Update published: ${version}`, {
      updateType,
      channel: targetChannel,
      items: updates.length,
    });

    res.status(201).json({
      success: true,
      manifest: signedManifest,
      message: `Update ${version} published to ${targetChannel} channel`,
    });
  } catch (error: any) {
    log.error("Error publishing update", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/updates/:id/download
 * Download update item (adapter, flow, etc.)
 */
router.get("/:id/download", async (req, res) => {
  try {
    const updateId = req.params.id;

    // Fetch update item from database/storage
    const item = await getUpdateItem(updateId);

    if (!item) {
      return res.status(404).json({ error: "Update item not found" });
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${item.name}.json"`);
    res.send(item.content);
  } catch (error: any) {
    log.error("Error downloading update", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/updates/history
 * Get update history for organization
 */
router.get("/history", authenticateUser, async (req, res) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { limit = 50 } = req.query;

    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    // Fetch update history
    const history = await getUpdateHistory(organizationId, parseInt(limit as string));

    res.json(history);
  } catch (error: any) {
    log.error("Error fetching update history", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get available updates for customer
 */
async function getAvailableUpdates(params: {
  organizationId: string;
  environment: string;
  channel: string;
  currentVersion: string;
}) {
  // Mock implementation - replace with database query
  const mockUpdates = [
    {
      version: "1.1.0",
      releaseDate: new Date().toISOString(),
      updateType: "adapter",
      updates: [
        {
          type: "interface",
          id: "shopify-v2",
          name: "Shopify API v2024",
          version: "2.0.0",
          downloadUrl: `${process.env.APP_URL}/api/updates/shopify-v2/download`,
          checksum: "abc123...",
          metadata: {
            description: "Updated Shopify adapter with GraphQL support",
          },
        },
      ],
      minVersion: "1.0.0",
      signature: "xyz789...",
    },
  ];

  // Filter based on channel and version compatibility
  return params.channel === "stable" ? mockUpdates : [];
}

/**
 * Generate cryptographic signature for update
 */
function generateUpdateSignature(manifest: any): string {
  const payload = JSON.stringify({
    version: manifest.version,
    updates: manifest.updates,
  });

  // In production, use RSA private key to sign
  // For now, use SHA-256 hash
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Store update in database
 */
async function storeUpdate(manifest: any, channel: string): Promise<void> {
  // TODO: Implement database storage
  // For now, log to console
  log.info("Update stored", { version: manifest.version, channel });
}

/**
 * Get update item content
 */
async function getUpdateItem(id: string): Promise<any | null> {
  // TODO: Implement database lookup
  // Mock response
  return {
    name: "shopify-v2",
    content: JSON.stringify({
      id: "shopify-v2",
      name: "Shopify",
      type: "ecommerce",
      protocol: "rest_api",
      // ... interface config
    }),
  };
}

/**
 * Get update history for organization
 */
async function getUpdateHistory(organizationId: string, limit: number): Promise<any[]> {
  // TODO: Implement database query
  return [];
}

export default router;
