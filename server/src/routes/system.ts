import { Router } from "express";
import { authenticateUser } from "../auth/rbac-middleware";
import { getSystemRequirements } from "../setup/first-run";

const router = Router();

/**
 * GET /api/system/requirements
 * Check system requirements and configuration status
 * 🔒 Superadmin only
 */
router.get("/requirements", authenticateUser, async (req, res) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const requirements = await getSystemRequirements();

    res.json({
      success: true,
      requirements,
      allGood:
        requirements.database.connected &&
        requirements.email.configured &&
        requirements.superadmin.exists &&
        requirements.security.apiKeySet &&
        requirements.security.encryptionKeySet,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
