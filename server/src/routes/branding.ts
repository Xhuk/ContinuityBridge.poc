/**
 * Organization Branding/Theme API
 * 
 * Allows customers to customize:
 * - Colors (primary, secondary, accent, sidebar)
 * - Logo upload
 * - Preset themes or custom colors
 * - Application name
 */

import { Router, Request, Response } from "express";
import { db } from "../../db.js";
import { organizationBranding } from "../../schema.js";
import { eq } from "drizzle-orm";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";
import { randomUUID } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs/promises";

const router = Router();
const log = logger.child("BrandingAPI");

// Preset color themes
const PRESET_THEMES = {
  "default": {
    name: "Default Blue",
    primaryColor: "217 91% 35%",
    secondaryColor: "217 8% 90%",
    accentColor: "217 12% 91%",
    destructiveColor: "0 84% 35%",
    sidebarColor: "0 0% 96%",
    sidebarPrimaryColor: "217 91% 35%",
  },
  "corporate-blue": {
    name: "Corporate Blue",
    primaryColor: "211 100% 50%",
    secondaryColor: "211 20% 90%",
    accentColor: "211 25% 88%",
    destructiveColor: "0 84% 35%",
    sidebarColor: "211 100% 15%",
    sidebarPrimaryColor: "211 100% 70%",
  },
  "forest-green": {
    name: "Forest Green",
    primaryColor: "142 76% 36%",
    secondaryColor: "142 15% 90%",
    accentColor: "142 20% 88%",
    destructiveColor: "0 84% 35%",
    sidebarColor: "142 76% 95%",
    sidebarPrimaryColor: "142 76% 36%",
  },
  "sunset-orange": {
    name: "Sunset Orange",
    primaryColor: "24 100% 50%",
    secondaryColor: "24 20% 92%",
    accentColor: "24 25% 90%",
    destructiveColor: "0 84% 35%",
    sidebarColor: "24 100% 97%",
    sidebarPrimaryColor: "24 100% 50%",
  },
  "royal-purple": {
    name: "Royal Purple",
    primaryColor: "271 81% 56%",
    secondaryColor: "271 15% 92%",
    accentColor: "271 20% 90%",
    destructiveColor: "0 84% 35%",
    sidebarColor: "271 81% 96%",
    sidebarPrimaryColor: "271 81% 56%",
  },
  "ocean-teal": {
    name: "Ocean Teal",
    primaryColor: "180 64% 40%",
    secondaryColor: "180 15% 90%",
    accentColor: "180 20% 88%",
    destructiveColor: "0 84% 35%",
    sidebarColor: "180 64% 96%",
    sidebarPrimaryColor: "180 64% 40%",
  },
};

// Configure multer for logo uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadsDir = path.join(process.cwd(), "uploads", "branding");
    await fs.mkdir(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const organizationId = (req as any).user?.organizationId || "default";
    const ext = path.extname(file.originalname);
    cb(null, `${organizationId}-logo-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed (jpg, png, gif, svg)"));
    }
  },
});

/**
 * GET /api/branding
 * Get current organization's branding
 */
router.get("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    const branding = await db.select()
      .from(organizationBranding)
      .where(eq(organizationBranding.organizationId, organizationId))
      .limit(1);

    if (branding.length === 0) {
      // Return default branding
      return res.json({
        branding: {
          ...PRESET_THEMES.default,
          presetTheme: "default",
          showLogo: true,
          logoPosition: "left",
          applicationName: "ContinuityBridge",
        },
        isDefault: true,
      });
    }

    res.json({
      branding: branding[0],
      isDefault: false,
    });

  } catch (error: any) {
    log.error("Failed to get branding", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/branding/presets
 * Get available preset themes
 */
router.get("/presets", authenticateUser, async (req: Request, res: Response) => {
  try {
    res.json({
      presets: Object.entries(PRESET_THEMES).map(([key, theme]) => ({
        id: key,
        ...theme,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/branding
 * Create or update organization branding
 * 🔒 Customer Admin or Superadmin
 */
router.post("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    const organizationId = req.user?.organizationId;
    const organizationName = req.user?.organizationName;

    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    // Access control: Customer Admin or Superadmin
    if (userRole !== "superadmin" && userRole !== "customer_admin") {
      return res.status(403).json({ 
        error: "Customer Admin or Superadmin access required" 
      });
    }

    const {
      presetTheme,
      primaryColor,
      secondaryColor,
      accentColor,
      destructiveColor,
      sidebarColor,
      sidebarPrimaryColor,
      applicationName,
      showLogo,
      logoPosition,
    } = req.body;

    // If preset theme selected, use preset colors
    let colors = {
      primaryColor,
      secondaryColor,
      accentColor,
      destructiveColor,
      sidebarColor,
      sidebarPrimaryColor,
    };

    if (presetTheme && presetTheme !== "custom" && PRESET_THEMES[presetTheme as keyof typeof PRESET_THEMES]) {
      const preset = PRESET_THEMES[presetTheme as keyof typeof PRESET_THEMES];
      colors = {
        primaryColor: preset.primaryColor,
        secondaryColor: preset.secondaryColor,
        accentColor: preset.accentColor,
        destructiveColor: preset.destructiveColor,
        sidebarColor: preset.sidebarColor,
        sidebarPrimaryColor: preset.sidebarPrimaryColor,
      };
    }

    // Check if branding exists
    const existing = await db.select()
      .from(organizationBranding)
      .where(eq(organizationBranding.organizationId, organizationId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      const updated = await db.update(organizationBranding)
        .set({
          ...colors,
          presetTheme: presetTheme || "custom",
          applicationName: applicationName || "ContinuityBridge",
          showLogo: showLogo !== undefined ? showLogo : true,
          logoPosition: logoPosition || "left",
          updatedAt: new Date().toISOString(),
        } as any)
        .where(eq(organizationBranding.organizationId, organizationId))
        .returning();

      log.info("Branding updated", { organizationId, presetTheme });

      return res.json({
        success: true,
        branding: updated[0],
        message: "Branding updated successfully",
      });
    } else {
      // Create new
      const created = await db.insert(organizationBranding)
        .values({
          id: randomUUID(),
          organizationId,
          organizationName: organizationName || organizationId,
          ...colors,
          presetTheme: presetTheme || "custom",
          applicationName: applicationName || "ContinuityBridge",
          showLogo: showLogo !== undefined ? showLogo : true,
          logoPosition: logoPosition || "left",
          createdBy: req.user?.id || "system",
        } as any)
        .returning();

      log.info("Branding created", { organizationId, presetTheme });

      return res.json({
        success: true,
        branding: created[0],
        message: "Branding created successfully",
      });
    }

  } catch (error: any) {
    log.error("Failed to save branding", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/branding/upload-logo
 * Upload organization logo
 * 🔒 Customer Admin or Superadmin
 */
router.post("/upload-logo", authenticateUser, upload.single("logo"), async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    if (userRole !== "superadmin" && userRole !== "customer_admin") {
      return res.status(403).json({ 
        error: "Customer Admin or Superadmin access required" 
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No logo file provided" });
    }

    const logoUrl = `/uploads/branding/${req.file.filename}`;

    // Update branding with logo URL
    const existing = await db.select()
      .from(organizationBranding)
      .where(eq(organizationBranding.organizationId, organizationId))
      .limit(1);

    if (existing.length > 0) {
      // Delete old logo if exists
      if (existing[0].logoUrl) {
        try {
          const oldPath = path.join(process.cwd(), existing[0].logoUrl);
          await fs.unlink(oldPath);
        } catch (err) {
          log.warn("Failed to delete old logo", err);
        }
      }

      // Update with new logo
      await db.update(organizationBranding)
        .set({
          logoUrl,
          updatedAt: new Date().toISOString(),
        } as any)
        .where(eq(organizationBranding.organizationId, organizationId));
    } else {
      // Create branding with logo
      await db.insert(organizationBranding)
        .values({
          id: randomUUID(),
          organizationId,
          organizationName: req.user?.organizationName || organizationId,
          logoUrl,
          createdBy: req.user?.id || "system",
        } as any);
    }

    log.info("Logo uploaded", { organizationId, filename: req.file.filename });

    res.json({
      success: true,
      logoUrl,
      message: "Logo uploaded successfully",
    });

  } catch (error: any) {
    log.error("Failed to upload logo", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/branding/logo
 * Remove organization logo
 */
router.delete("/logo", authenticateUser, async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    if (userRole !== "superadmin" && userRole !== "customer_admin") {
      return res.status(403).json({ 
        error: "Customer Admin or Superadmin access required" 
      });
    }

    const existing = await db.select()
      .from(organizationBranding)
      .where(eq(organizationBranding.organizationId, organizationId))
      .limit(1);

    if (existing.length > 0 && existing[0].logoUrl) {
      // Delete logo file
      try {
        const logoPath = path.join(process.cwd(), existing[0].logoUrl);
        await fs.unlink(logoPath);
      } catch (err) {
        log.warn("Failed to delete logo file", err);
      }

      // Remove from database
      await db.update(organizationBranding)
        .set({
          logoUrl: null,
          updatedAt: new Date().toISOString(),
        } as any)
        .where(eq(organizationBranding.organizationId, organizationId));

      log.info("Logo removed", { organizationId });
    }

    res.json({
      success: true,
      message: "Logo removed successfully",
    });

  } catch (error: any) {
    log.error("Failed to remove logo", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
/**
 * Organization Branding/Theme API
 * 
 * Allows customers to customize:
 * - Colors (primary, secondary, accent, sidebar)
 * - Logo upload
 * - Preset themes or custom colors
 * - Application name
 */

import { Router, Request, Response } from "express";
import { db } from "../../db.js";
import { organizationBranding } from "../../schema.js";
import { eq } from "drizzle-orm";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";
import { randomUUID } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
