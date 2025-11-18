/**
 * TestSprite MCP Integration
 * Webhook receiver for external test results from TestSprite platform
 */

import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { logger } from "../core/logger.js";
import { db } from "../../db.js";
import { qaTestResults, qaTestSessions } from "../../schema.js";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { TestSpriteMCPService } from "../services/testsprite-mcp-service.js";

const router = Router();
const log = logger.child("TestSpriteIntegration");

// ============================================================================
// GET /api/testsprite/scenarios - Get all available test scenarios
// ============================================================================

router.get("/scenarios", (req: Request, res: Response) => {
  try {
    const baseUrl = process.env.APP_URL || "http://localhost:5000";
    const scenarios = TestSpriteMCPService.getCriticalFlowScenarios(baseUrl);

    res.json({
      success: true,
      count: scenarios.length,
      scenarios,
    });
  } catch (error: any) {
    log.error("Failed to get test scenarios", error);
    res.status(500).json({
      error: error.message,
    });
  }
});

// ============================================================================
// POST /api/testsprite/submit-all - Submit all critical flow scenarios
// ============================================================================

router.post("/submit-all", async (req: Request, res: Response) => {
  try {
    const baseUrl = process.env.APP_URL || req.body.baseUrl || "http://localhost:5000";

    log.info("Submitting all test scenarios to TestSprite", { baseUrl });

    const result = await TestSpriteMCPService.submitAllScenarios(baseUrl);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    log.error("Failed to submit all scenarios", error);
    res.status(500).json({
      error: error.message,
    });
  }
});

// ============================================================================
// Helper: Verify TestSprite webhook signature
// ============================================================================

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ============================================================================
// POST /api/testsprite/webhook - Receive test results from TestSprite
// ============================================================================

router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-testsprite-signature"] as string;
    const webhookSecret = process.env.TESTSPRITE_WEBHOOK_SECRET;

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      const isValid = verifyWebhookSignature(
        JSON.stringify(req.body),
        signature,
        webhookSecret
      );

      if (!isValid) {
        log.warn("Invalid TestSprite webhook signature");
        return res.status(401).json({
          error: "Invalid signature",
        });
      }
    }

    const {
      testId,
      testName,
      testDescription,
      category,
      status,
      severity,
      expectedResult,
      actualResult,
      testedBy,
      testedByEmail,
      browser,
      device,
      operatingSystem,
      screenshots,
      errorLogs,
      stackTrace,
      stepsToReproduce,
      notes,
      executionTime,
      sessionId,
      sessionName,
    } = req.body;

    log.info("Received TestSprite webhook", {
      testId,
      testName,
      status,
      testedBy,
    });

    // Map TestSprite status to our status
    const mappedStatus = mapTestSpriteStatus(status);
    const mappedSeverity = severity?.toLowerCase() || "medium";

    // Find or create session
    let dbSessionId = sessionId;

    if (sessionName && !dbSessionId) {
      // Try to find existing session by name
      const sessions = await (db.select() as any)
        .from(qaTestSessions)
        .where(eq(qaTestSessions.sessionName, sessionName));

      if (sessions.length > 0) {
        dbSessionId = sessions[0].id;
      } else {
        // Create new session
        const newSession = {
          id: randomUUID(),
          sessionName: sessionName || `TestSprite - ${new Date().toISOString()}`,
          sessionType: "exploratory" as const,
          status: "in_progress" as const,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          blockedTests: 0,
          skippedTests: 0,
          coveragePercentage: 0,
          startedAt: new Date().toISOString(),
          createdByEmail: testedByEmail || "testsprite@external.com",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await (db.insert(qaTestSessions) as any).values(newSession);
        dbSessionId = newSession.id;
      }
    }

    // Create test result
    const testResult = {
      id: randomUUID(),
      sessionId: dbSessionId,
      testCategory: category || "external",
      testName: testName || `Test ${testId}`,
      testDescription,
      status: mappedStatus,
      severity: mappedSeverity,
      expectedResult,
      actualResult,
      notes: notes || `External test via TestSprite\nBrowser: ${browser}\nDevice: ${device}\nOS: ${operatingSystem}`,
      stepsToReproduce: stepsToReproduce || [],
      screenshots: screenshots || [],
      errorLogs,
      stackTrace,
      browser: browser || "Unknown",
      environment: "testsprite",
      requiresFollowUp: mappedStatus === "fail" && mappedSeverity === "critical",
      executionTime,
      automatedTest: false,
      testedByEmail: testedByEmail || "testsprite@external.com",
      source: "testsprite", // Mark as external
      externalTestId: testId, // Store TestSprite's original ID
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await (db.insert(qaTestResults) as any).values(testResult);

    // Update session stats if session exists
    if (dbSessionId) {
      await updateSessionStats(dbSessionId);
    }

    log.info("TestSprite test result saved", {
      testResultId: testResult.id,
      sessionId: dbSessionId,
      status: mappedStatus,
    });

    res.json({
      success: true,
      testResultId: testResult.id,
      sessionId: dbSessionId,
    });
  } catch (error: any) {
    log.error("Failed to process TestSprite webhook", error);
    res.status(500).json({
      error: error.message,
    });
  }
});

// ============================================================================
// POST /api/testsprite/submit-test - Submit test request to TestSprite
// ============================================================================

router.post("/submit-test", async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.TESTSPRITE_API_KEY;
    const enabled = process.env.TESTSPRITE_ENABLED === "true";

    if (!enabled) {
      return res.status(400).json({
        error: "TestSprite integration is disabled",
        message: "Set TESTSPRITE_ENABLED=true in environment variables",
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: "TestSprite API key not configured",
        message: "Set TESTSPRITE_API_KEY in environment variables",
      });
    }

    const {
      testName,
      testDescription,
      testUrl,
      browsers,
      devices,
      expectedBehavior,
      stepsToTest,
    } = req.body;

    // Call TestSprite API to submit test
    // Note: This is a placeholder - actual API structure depends on TestSprite's API
    const testSpriteResponse = await fetch("https://api.testsprite.com/v1/tests", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: testName,
        description: testDescription,
        url: testUrl,
        browsers: browsers || ["chrome", "firefox", "safari"],
        devices: devices || ["desktop", "mobile"],
        expectedBehavior,
        steps: stepsToTest,
        webhookUrl: `${process.env.APP_URL || "http://localhost:5000"}/api/testsprite/webhook`,
      }),
    });

    if (!testSpriteResponse.ok) {
      throw new Error(`TestSprite API error: ${testSpriteResponse.statusText}`);
    }

    const result = await testSpriteResponse.json();

    log.info("Test submitted to TestSprite", {
      testName,
      testSpriteId: result.testId,
    });

    res.json({
      success: true,
      testSpriteId: result.testId,
      message: "Test submitted to TestSprite successfully",
    });
  } catch (error: any) {
    log.error("Failed to submit test to TestSprite", error);
    res.status(500).json({
      error: error.message,
    });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function mapTestSpriteStatus(status: string): "pass" | "fail" | "blocked" | "skipped" {
  const normalized = status?.toLowerCase() || "";
  
  if (normalized === "passed" || normalized === "pass") return "pass";
  if (normalized === "failed" || normalized === "fail") return "fail";
  if (normalized === "blocked") return "blocked";
  if (normalized === "skipped") return "skipped";
  
  return "fail"; // Default to fail for unknown statuses
}

async function updateSessionStats(sessionId: string) {
  try {
    const tests = await (db.select() as any)
      .from(qaTestResults)
      .where(eq(qaTestResults.sessionId, sessionId));

    const stats = {
      totalTests: tests.length,
      passedTests: tests.filter((t: any) => t.status === "pass").length,
      failedTests: tests.filter((t: any) => t.status === "fail").length,
      blockedTests: tests.filter((t: any) => t.status === "blocked").length,
      skippedTests: tests.filter((t: any) => t.status === "skipped").length,
    };

    await (db.update(qaTestSessions) as any)
      .set({
        ...stats,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(qaTestSessions.id, sessionId));
  } catch (error: any) {
    log.error("Failed to update session stats", error);
  }
}

export default router;
