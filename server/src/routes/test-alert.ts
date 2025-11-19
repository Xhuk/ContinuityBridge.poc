/**
 * Test Alert Endpoint
 * Send test alerts to verify Alertmanager configuration
 */

import { Router, type Request, type Response } from "express";
import { authenticateJWT } from "../middleware/auth.js";
import { logger } from "../core/logger.js";

const router = Router();
const log = logger.child("TestAlert");

/**
 * POST /api/admin/test-alert
 * Send a test alert to Alertmanager (superadmin only)
 */
router.post("/", authenticateJWT, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Only superadmins can send test alerts
    if (user?.role !== "superadmin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const { severity = "warning", message = "Test alert from ContinuityBridge" } = req.body;

    // Send alert to Alertmanager
    const alertmanagerUrl = process.env.ALERTMANAGER_URL || "http://localhost:9093";

    const alert = {
      labels: {
        alertname: "TestAlert",
        severity: severity,
        service: "continuitybridge",
        environment: process.env.NODE_ENV || "development",
      },
      annotations: {
        summary: "Test Alert",
        description: message,
        triggered_by: user.email,
      },
      startsAt: new Date().toISOString(),
    };

    // Post to Alertmanager API
    const response = await fetch(`${alertmanagerUrl}/api/v2/alerts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify([alert]),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Alertmanager responded with ${response.status}: ${error}`);
    }

    log.info("Test alert sent", {
      severity,
      triggeredBy: user.email,
      alertmanagerUrl,
    });

    res.json({
      success: true,
      message: "Test alert sent successfully",
      alert,
    });
  } catch (error: any) {
    log.error("Failed to send test alert", error);
    res.status(500).json({
      error: error.message,
      hint: "Make sure Alertmanager is running and ALERTMANAGER_URL is configured",
    });
  }
});

/**
 * GET /api/admin/test-alert/status
 * Check Alertmanager connectivity
 */
router.get("/status", authenticateJWT, async (req: Request, res: Response) => {
  try {
    const alertmanagerUrl = process.env.ALERTMANAGER_URL || "http://localhost:9093";

    const response = await fetch(`${alertmanagerUrl}/api/v2/status`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Alertmanager responded with ${response.status}`);
    }

    const status = await response.json();

    res.json({
      connected: true,
      url: alertmanagerUrl,
      status,
    });
  } catch (error: any) {
    res.json({
      connected: false,
      url: process.env.ALERTMANAGER_URL || "http://localhost:9093",
      error: error.message,
    });
  }
});

export default router;
