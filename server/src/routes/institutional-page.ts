import { Router } from "express";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { InstitutionalPageGenerator } from "../services/institutional-page-generator.js";

const router = Router();
const generator = new InstitutionalPageGenerator();

/**
 * POST /api/institutional-page/generate
 * Generate AI-powered institutional landing page for customer deployment
 * 🔒 Superadmin only
 */
router.post("/generate", authenticateUser, async (req, res) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const {
      companyName,
      industry,
      tagline,
      features,
      brandColors,
      contactEmail,
    } = req.body;

    if (!companyName) {
      return res.status(400).json({ error: "companyName is required" });
    }

    // Generate landing page using AI
    const result = await generator.generateLandingPage({
      companyName,
      industry,
      tagline,
      features,
      brandColors,
      contactEmail,
    });

    return res.json({
      success: true,
      ...result,
      message: "Landing page generated successfully",
    });
  } catch (error: any) {
    console.error("Failed to generate institutional page:", error);
    
    // Fallback to default page if AI fails
    if (req.body.companyName) {
      const fallback = generator.generateDefaultLandingPage(req.body.companyName);
      return res.json({
        success: true,
        ...fallback,
        message: "Generated default landing page (AI unavailable)",
        usedFallback: true,
      });
    }

    return res.status(500).json({
      error: "Failed to generate landing page",
      details: error.message,
    });
  }
});

/**
 * POST /api/institutional-page/preview
 * Preview generated institutional page
 * 🔒 Superadmin only
 */
router.post("/preview", authenticateUser, async (req, res) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const { companyName } = req.body;

    if (!companyName) {
      return res.status(400).json({ error: "companyName is required" });
    }

    // Generate default preview
    const result = generator.generateDefaultLandingPage(companyName);

    return res.json({
      success: true,
      ...result,
      message: "Preview generated",
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to generate preview",
      details: error.message,
    });
  }
});

export default router;
