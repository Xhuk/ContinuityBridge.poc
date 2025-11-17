import { Router } from "express";
import { ExportOrchestrator } from "../export/export-orchestrator";
import { ManifestManager } from "../export/manifest-manager";
import { LicenseManager } from "../export/license-manager";
import { GitHubBackupService } from "../services/github-backup.js";
import { db } from "../../db";
import { flowDefinitions } from "../../schema";
import { eq } from "drizzle-orm";
import { authenticateUser, requireSuperAdmin, requireConsultant } from "../auth/rbac-middleware";
import * as fs from "fs/promises";
import * as path from "path";

const router = Router();

/**
 * POST /api/export/generate
 * Generate black box export with license
 * 🔒 SUPERADMIN ONLY - Contractors cannot access
 */
router.post("/generate", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const {
      organizationId,
      organizationName,
      licenseType = "trial",
      licenseDays,
      maxFlows,
      environment = "production",
      includeInactive = false,
      enableGitHubBackup = true,
    } = req.body;

    if (!organizationId || !organizationName) {
      return res.status(400).json({
        error: "organizationId and organizationName are required",
      });
    }

    const orchestrator = new ExportOrchestrator();
    const result = await orchestrator.exportBlackBox({
      organizationId,
      organizationName,
      licenseType,
      licenseDays,
      maxFlows,
      environment,
      includeInactive,
    });

    // GitHub backup (if enabled)
    let backupResult = null;
    if (enableGitHubBackup) {
      try {
        const githubBackup = new GitHubBackupService();
        
        // Collect all generated files for backup
        const files: Array<{ path: string; content: string; description?: string }> = [];
        
        // Read export directory
        const exportPath = path.join(process.cwd(), "exports", `export-${result.exportId}`);
        const exportFiles = await fs.readdir(exportPath, { recursive: true });
        
        for (const file of exportFiles) {
          const filePath = path.join(exportPath, file as string);
          const stat = await fs.stat(filePath);
          
          if (stat.isFile()) {
            const content = await fs.readFile(filePath, "utf-8");
            files.push({
              path: `exports/${organizationId}/${file}`,
              content,
              description: `Exported ${path.extname(file as string)} file`,
            });
          }
        }
        
        backupResult = await githubBackup.backupCustomerDeployment({
          customerName: organizationName,
          organizationId,
          environment: environment as any,
          files,
          metadata: {
            promotedBy: req.user?.email || "system",
            promotedAt: new Date().toISOString(),
            version: result.version || "1.0.0",
            configSnapshot: {
              licenseType,
              environment,
              flowCount: result.manifest?.flowCount || 0,
              exportId: result.exportId,
            },
          },
        });
        
        console.log("GitHub backup completed", backupResult);
      } catch (backupError: any) {
        console.warn("GitHub backup failed (non-critical):", backupError.message);
        // Don't fail export if backup fails
      }
    }

    res.json({
      ...result,
      backup: backupResult,
    });
  } catch (error: any) {
    console.error("Export generation failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/export/manifest
 * Get current manifest (all assets with status)
 * 🔒 Consultants can view to see their work status
 */
router.get("/manifest", authenticateUser, requireConsultant, async (req, res) => {
  try {
    const manifestManager = new ManifestManager();
    const manifest = await manifestManager.generateManifest("development");
    res.json(manifest);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/export/active-assets
 * Get only active assets (ready for export)
 */
router.get("/active-assets", async (req, res) => {
  try {
    const manifestManager = new ManifestManager();
    const assets = await manifestManager.getActiveAssets();
    res.json({ assets, count: assets.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/export/asset-status/:id
 * Update asset status (active/inactive/testing/deprecated)
 */
router.patch("/asset-status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, author } = req.body;

    if (!["active", "inactive", "testing", "deprecated"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // Update flow metadata in database
    const flow = await db.select().from(flowDefinitions)
      .where(eq(flowDefinitions.id, id))
      .get();

    if (!flow) {
      return res.status(404).json({ error: "Flow not found" });
    }

    const updatedMetadata = {
      ...(flow as any).metadata,
      status,
      author: author || (flow as any).metadata?.author,
      statusUpdatedAt: new Date().toISOString(),
    };

    await db.update(flowDefinitions)
      .set({
        updatedAt: new Date().toISOString(),
        metadata: updatedMetadata,
      } as any)
      .where(eq(flowDefinitions.id, id))
      .run();

    res.json({ success: true, status, assetId: id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/export/generate-keys
 * Generate RSA key pair (run once during initial setup)
 * 🔒 SUPERADMIN ONLY
 */
router.post("/generate-keys", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const licenseManager = new LicenseManager();
    await licenseManager.generateKeyPair();
    res.json({
      success: true,
      message: "RSA key pair generated. Keep private_key.pem SECRET!",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/export/validate-license
 * Validate a license file (for testing)
 */
router.post("/validate-license", async (req, res) => {
  try {
    const { licensePath } = req.body;
    const licenseManager = new LicenseManager();
    const result = await licenseManager.validateLicense(licensePath);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/export/download/:exportId
 * Download export package as ZIP
 * 🔒 SUPERADMIN ONLY
 */
router.get("/download/:exportId", authenticateUser, requireSuperAdmin, async (req, res) => {
  try {
    const { exportId } = req.params;
    const exportPath = path.join(process.cwd(), "exports", `export-${exportId}`);

    // Check if export exists
    try {
      await fs.access(exportPath);
    } catch {
      return res.status(404).json({ error: "Export not found" });
    }

    // Set headers for download
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="continuitybridge-export-${exportId}.zip"`);

    // Create ZIP stream (using built-in zlib for simple compression)
    const files = await fs.readdir(exportPath, { withFileTypes: true });
    
    // For simplicity, send tarball instead of ZIP
    // TODO: Install 'archiver' package for proper ZIP support
    const { exec } = require("child_process");
    const tarPath = path.join(process.cwd(), "exports", `export-${exportId}.tar.gz`);
    
    exec(`tar -czf "${tarPath}" -C "${exportPath}" .`, async (error: any) => {
      if (error) {
        return res.status(500).json({ error: "Failed to create archive" });
      }

      // Stream file to response
      const fileStream = await fs.readFile(tarPath);
      res.send(fileStream);

      // Cleanup temp tarball
      await fs.unlink(tarPath).catch(() => {});
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
