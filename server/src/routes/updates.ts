import { Router } from "express";
import multer from "multer";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { offlineUpdatePackage } from "../updates/offline-update-package.js";
import { logger } from "../core/logger.js";

const log = logger.child("UpdatesAPI");
const router = Router();

// Configure multer for file uploads (in-memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith(".cbupdate")) {
      cb(null, true);
    } else {
      cb(new Error("Only .cbupdate files are allowed"));
    }
  },
});

/**
 * POST /api/updates/upload
 * Upload signed .cbupdate package (air-gapped deployments)
 * MULTI-TENANT: Packages are scoped to user's organization
 */
router.post(
  "/upload",
  authenticateUser,
  upload.single("package"),
  async (req, res) => {
    try {
      // Only superadmin and consultants can upload updates
      if (req.user?.role !== "superadmin" && req.user?.role !== "consultant") {
        return res.status(403).json({
          error: "Forbidden: Only superadmin and consultants can upload updates",
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      // Get organization ID (for multi-tenant isolation)
      const organizationId = req.user?.organizationId || "global";

      log.info("Update package upload started", {
        filename: req.file.originalname,
        size: req.file.size,
        uploadedBy: req.user?.email,
        organizationId,
      });

      // Validate and save package (organization-scoped)
      const result = await offlineUpdatePackage.uploadPackage(
        req.file.buffer,
        req.user?.email || "unknown",
        organizationId
      );

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
        });
      }

      log.info("Update package uploaded successfully", {
        packageId: result.packageId,
        version: result.version,
        organizationId,
      });

      res.json({
        success: true,
        packageId: result.packageId,
        version: result.version,
        message: "Update package uploaded and verified successfully",
      });
    } catch (error: any) {
      log.error("Upload failed", error);
      res.status(500).json({
        error: error.message || "Failed to upload package",
      });
    }
  }
);

/**
 * GET /api/updates/packages
 * List uploaded packages
 */
router.get("/packages", authenticateUser, async (req, res) => {
  try {
    if (req.user?.role !== "superadmin" && req.user?.role !== "consultant") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const packages = await offlineUpdatePackage.listPackages();

    res.json({
      packages,
      count: packages.length,
    });
  } catch (error: any) {
    log.error("Failed to list packages", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/updates/install/:packageId/:version
 * Install uploaded package
 */
router.post(
  "/install/:packageId/:version",
  authenticateUser,
  async (req, res) => {
    try {
      if (req.user?.role !== "superadmin" && req.user?.role !== "consultant") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { packageId, version } = req.params;

      log.info("Installing update package", {
        packageId,
        version,
        installedBy: req.user?.email,
      });

      const result = await offlineUpdatePackage.installPackage(packageId, version);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      log.info("Update package installed", {
        packageId,
        version,
        filesInstalled: result.installed?.length,
      });

      res.json({
        success: true,
        installed: result.installed,
        message: `Successfully installed ${result.installed?.length} files`,
      });
    } catch (error: any) {
      log.error("Installation failed", error);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
