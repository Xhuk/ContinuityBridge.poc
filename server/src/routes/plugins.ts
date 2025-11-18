import { Router } from "express";
import multer from "multer";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { pluginPackageManager } from "../plugins/plugin-package-manager.js";
import { logger } from "../core/logger.js";

const log = logger.child("PluginsAPI");
const router = Router();

// Configure multer for plugin uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith(".cbplugin")) {
      cb(null, true);
    } else {
      cb(new Error("Only .cbplugin files are allowed"));
    }
  },
});

/**
 * POST /api/plugins/upload
 * Upload signed .cbplugin package (custom nodes)
 * MULTI-TENANT: Plugins scoped to organization
 */
router.post(
  "/upload",
  authenticateUser,
  upload.single("plugin"),
  async (req, res) => {
    try {
      // Only superadmin and consultants can upload plugins
      if (req.user?.role !== "superadmin" && req.user?.role !== "consultant") {
        return res.status(403).json({
          error: "Forbidden: Only superadmin and consultants can upload plugins",
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      // Get organization ID (multi-tenant isolation)
      const organizationId = req.user?.organizationId || "global";

      log.info("Plugin upload started", {
        filename: req.file.originalname,
        size: req.file.size,
        uploadedBy: req.user?.email,
        organizationId,
      });

      // Validate and save plugin
      const result = await pluginPackageManager.uploadPlugin(
        req.file.buffer,
        req.user?.email || "unknown",
        organizationId
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      log.info("Plugin uploaded successfully", {
        pluginId: result.pluginId,
        version: result.version,
        organizationId,
      });

      res.json({
        success: true,
        pluginId: result.pluginId,
        version: result.version,
        message: "Plugin uploaded and verified successfully",
      });
    } catch (error: any) {
      log.error("Plugin upload failed", error);
      res.status(500).json({ error: error.message || "Failed to upload plugin" });
    }
  }
);

/**
 * GET /api/plugins
 * List uploaded plugins for user's organization
 */
router.get("/", authenticateUser, async (req, res) => {
  try {
    if (req.user?.role !== "superadmin" && req.user?.role !== "consultant") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const organizationId = req.user?.organizationId || "global";
    const plugins = await pluginPackageManager.listPlugins(organizationId);

    res.json({
      plugins,
      count: plugins.length,
      organizationId,
    });
  } catch (error: any) {
    log.error("Failed to list plugins", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/plugins/install/:pluginId/:version
 * Install uploaded plugin to runtime registry
 */
router.post(
  "/install/:pluginId/:version",
  authenticateUser,
  async (req, res) => {
    try {
      if (req.user?.role !== "superadmin" && req.user?.role !== "consultant") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { pluginId, version } = req.params;
      const organizationId = req.user?.organizationId || "global";

      log.info("Installing plugin", {
        pluginId,
        version,
        organizationId,
        installedBy: req.user?.email,
      });

      const result = await pluginPackageManager.installPlugin(
        pluginId,
        version,
        organizationId
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      log.info("Plugin installed", {
        pluginId,
        version,
        organizationId,
        nodeType: result.nodeType,
      });

      res.json({
        success: true,
        nodeType: result.nodeType,
        message: `Plugin ${pluginId} installed successfully`,
      });
    } catch (error: any) {
      log.error("Plugin installation failed", error);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
