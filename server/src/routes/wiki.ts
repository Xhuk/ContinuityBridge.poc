import { Router, Request, Response } from "express";
import { readFile } from "fs/promises";
import { join } from "path";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";

const router = Router();
const log = logger.child("WikiRoutes");

// Map of guides to their required roles
const guideRoleMap: Record<string, string[]> = {
  "founder-guide.md": ["superadmin"],
  "consultant-guide.md": ["superadmin", "consultant"],
  "customer-admin-guide.md": ["superadmin", "consultant", "customer_admin"],
  "customer-user-guide.md": ["superadmin", "consultant", "customer_admin", "customer_user"],
};

/**
 * GET /api/wiki/view/:fileName
 * View a user guide based on role permissions
 */
router.get("/view/:fileName", authenticateUser, async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;
    const user = (req as any).user;

    // Validate file name (security)
    if (!fileName.endsWith(".md") || fileName.includes("..") || fileName.includes("/")) {
      return res.status(400).json({ error: "Invalid file name" });
    }

    // Check if user has permission to view this guide
    const allowedRoles = guideRoleMap[fileName];
    if (!allowedRoles || !allowedRoles.includes(user?.role)) {
      log.warn("Unauthorized wiki access attempt", { fileName, userRole: user?.role });
      return res.status(403).json({ 
        error: "Access denied", 
        message: "You don't have permission to view this guide" 
      });
    }

    // Read the markdown file
    const filePath = join(process.cwd(), "docs", "user-guides", fileName);
    const content = await readFile(filePath, "utf-8");

    // Return markdown content
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.send(content);

  } catch (error: any) {
    log.error("Error serving wiki file", { error: error.message });
    
    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "Guide not found" });
    }
    
    res.status(500).json({ error: "Failed to load guide" });
  }
});

/**
 * GET /api/wiki/download/:fileName
 * Download a user guide as PDF (placeholder - returns markdown for now)
 */
router.get("/download/:fileName", authenticateUser, async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;
    const user = (req as any).user;

    // Validate file name (security)
    if (!fileName.endsWith(".md") || fileName.includes("..") || fileName.includes("/")) {
      return res.status(400).json({ error: "Invalid file name" });
    }

    // Check if user has permission to download this guide
    const allowedRoles = guideRoleMap[fileName];
    if (!allowedRoles || !allowedRoles.includes(user?.role)) {
      return res.status(403).json({ 
        error: "Access denied", 
        message: "You don't have permission to download this guide" 
      });
    }

    // Read the markdown file
    const filePath = join(process.cwd(), "docs", "user-guides", fileName);
    const content = await readFile(filePath, "utf-8");

    // Set headers for download
    const downloadName = fileName.replace(".md", ".txt");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    res.send(content);

  } catch (error: any) {
    log.error("Error downloading wiki file", { error: error.message });
    
    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "Guide not found" });
    }
    
    res.status(500).json({ error: "Failed to download guide" });
  }
});

/**
 * GET /api/wiki/list
 * List available guides for current user based on role
 */
router.get("/list", authenticateUser, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userRole = user?.role || "customer_user";

    // Filter guides based on user role
    const availableGuides = Object.entries(guideRoleMap)
      .filter(([_, roles]) => roles.includes(userRole))
      .map(([fileName]) => ({
        fileName,
        name: fileName
          .replace(".md", "")
          .split("-")
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" "),
        url: `/api/wiki/view/${fileName}`,
        downloadUrl: `/api/wiki/download/${fileName}`,
      }));

    res.json({ guides: availableGuides });

  } catch (error: any) {
    log.error("Error listing wiki files", { error: error.message });
    res.status(500).json({ error: "Failed to list guides" });
  }
});

export default router;
