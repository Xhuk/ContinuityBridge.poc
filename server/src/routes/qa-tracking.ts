import { Router } from "express";
import { db } from "../../db.js";
import { users } from "../../db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireSuperAdmin, authenticateUser } from "../auth/rbac-middleware.js";
import { randomUUID } from "crypto";
import { logger } from "../core/logger.js";

const router = Router();
const log = logger.child("QATracking");

// Temporary in-memory storage (replace with database tables later)
const testResults: any[] = [];
const testSessions: any[] = [];

/**
 * POST /api/qa/test-results
 * Log a test result (QA role or founders)
 */
router.post("/test-results", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;

    // Only QA (consultants with QA flag) and founders can log tests
    if (userRole !== "superadmin" && userRole !== "consultant") {
      return res.status(403).json({
        error: "Only QA team members and founders can log test results",
      });
    }

    const {
      sessionId,
      testCategory,
      testName,
      testDescription,
      status, // "pass" | "fail" | "blocked" | "skipped"
      severity, // "critical" | "high" | "medium" | "low"
      expectedResult,
      actualResult,
      notes,
      stepsToReproduce,
      screenshots,
      errorLogs,
      stackTrace,
      browser,
      environment = "production",
      buildVersion,
      defectId,
      requiresFollowUp = false,
      executionTime,
    } = req.body;

    // Validate required fields
    if (!testCategory || !testName || !status || !severity) {
      return res.status(400).json({
        error: "testCategory, testName, status, and severity are required",
      });
    }

    const testResult = {
      id: randomUUID(),
      sessionId,
      testCategory,
      testName,
      testDescription,
      status,
      severity,
      expectedResult,
      actualResult,
      notes,
      stepsToReproduce: stepsToReproduce || [],
      screenshots: screenshots || [],
      errorLogs,
      stackTrace,
      browser,
      environment,
      buildVersion,
      defectId,
      requiresFollowUp,
      executionTime,
      automatedTest: false,
      testedBy: req.user?.id,
      testedByEmail: req.user?.email,
      reviewedBy: null,
      reviewedByEmail: null,
      reviewedAt: null,
      reviewNotes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    testResults.push(testResult);

    // Update session stats if sessionId provided
    if (sessionId) {
      const session = testSessions.find((s) => s.id === sessionId);
      if (session) {
        session.totalTests++;
        if (status === "pass") session.passedTests++;
        if (status === "fail") session.failedTests++;
        if (status === "blocked") session.blockedTests++;
        if (status === "skipped") session.skippedTests++;
        session.updatedAt = new Date().toISOString();
      }
    }

    log.info("Test result logged", {
      testId: testResult.id,
      testName,
      status,
      testedBy: req.user?.email,
    });

    res.status(201).json({
      success: true,
      testResult,
    });
  } catch (error: any) {
    log.error("Failed to log test result", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/qa/test-results
 * Get all test results (founders see all, QA sees own)
 */
router.get("/test-results", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;
    const { sessionId, category, status, testedBy } = req.query;

    if (userRole !== "superadmin" && userRole !== "consultant") {
      return res.status(403).json({ error: "Access denied" });
    }

    let results = [...testResults];

    // Filter by session
    if (sessionId) {
      results = results.filter((r) => r.sessionId === sessionId);
    }

    // Filter by category
    if (category) {
      results = results.filter((r) => r.testCategory === category);
    }

    // Filter by status
    if (status) {
      results = results.filter((r) => r.status === status);
    }

    // Filter by tester
    if (testedBy) {
      results = results.filter((r) => r.testedBy === testedBy);
    }

    // Non-founders only see their own tests
    if (userRole !== "superadmin") {
      results = results.filter((r) => r.testedBy === req.user?.id);
    }

    // Sort by most recent
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      testResults: results,
      total: results.length,
    });
  } catch (error: any) {
    log.error("Failed to get test results", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/qa/test-sessions
 * Create a test session
 */
router.post("/test-sessions", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;

    if (userRole !== "superadmin" && userRole !== "consultant") {
      return res.status(403).json({ error: "Access denied" });
    }

    const {
      sessionName,
      sessionType, // "smoke" | "regression" | "exploratory" | "performance"
      testPlanUrl,
    } = req.body;

    if (!sessionName || !sessionType) {
      return res.status(400).json({
        error: "sessionName and sessionType are required",
      });
    }

    const session = {
      id: randomUUID(),
      sessionName,
      sessionType,
      status: "in_progress",
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      blockedTests: 0,
      skippedTests: 0,
      testPlanUrl,
      coveragePercentage: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      createdBy: req.user?.id,
      createdByEmail: req.user?.email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    testSessions.push(session);

    log.info("Test session created", {
      sessionId: session.id,
      sessionName,
      createdBy: req.user?.email,
    });

    res.status(201).json({
      success: true,
      session,
    });
  } catch (error: any) {
    log.error("Failed to create test session", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/qa/test-sessions
 * Get all test sessions
 */
router.get("/test-sessions", authenticateUser, async (req, res) => {
  try {
    const userRole = req.user?.role;

    if (userRole !== "superadmin" && userRole !== "consultant") {
      return res.status(403).json({ error: "Access denied" });
    }

    let sessions = [...testSessions];

    // Non-founders only see their own sessions
    if (userRole !== "superadmin") {
      sessions = sessions.filter((s) => s.createdBy === req.user?.id);
    }

    // Sort by most recent
    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      sessions,
      total: sessions.length,
    });
  } catch (error: any) {
    log.error("Failed to get test sessions", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/qa/test-sessions/:sessionId
 * Update test session (complete, add notes, etc.)
 */
router.patch("/test-sessions/:sessionId", authenticateUser, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { status, completedAt, coveragePercentage } = req.body;

    const session = testSessions.find((s) => s.id === sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Update fields
    if (status) session.status = status;
    if (completedAt) session.completedAt = completedAt;
    if (coveragePercentage !== undefined) session.coveragePercentage = coveragePercentage;
    session.updatedAt = new Date().toISOString();

    res.json({
      success: true,
      session,
    });
  } catch (error: any) {
    log.error("Failed to update test session", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/qa/test-results/:testId/review
 * Founder reviews a test result
 */
router.post("/test-results/:testId/review", requireSuperAdmin, async (req, res) => {
  try {
    const { testId } = req.params;
    const { reviewNotes } = req.body;

    const test = testResults.find((t) => t.id === testId);

    if (!test) {
      return res.status(404).json({ error: "Test result not found" });
    }

    test.reviewedBy = req.user?.id;
    test.reviewedByEmail = req.user?.email;
    test.reviewedAt = new Date().toISOString();
    test.reviewNotes = reviewNotes;
    test.updatedAt = new Date().toISOString();

    log.info("Test result reviewed", {
      testId,
      reviewedBy: req.user?.email,
    });

    res.json({
      success: true,
      testResult: test,
    });
  } catch (error: any) {
    log.error("Failed to review test result", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/qa/dashboard
 * Get QA dashboard summary (founders only)
 */
router.get("/dashboard", requireSuperAdmin, async (req, res) => {
  try {
    const totalTests = testResults.length;
    const passedTests = testResults.filter((t) => t.status === "pass").length;
    const failedTests = testResults.filter((t) => t.status === "fail").length;
    const blockedTests = testResults.filter((t) => t.status === "blocked").length;
    const skippedTests = testResults.filter((t) => t.status === "skipped").length;

    const criticalFailures = testResults.filter(
      (t) => t.status === "fail" && t.severity === "critical"
    ).length;

    const requiresFollowUp = testResults.filter((t) => t.requiresFollowUp).length;

    const activeSessions = testSessions.filter((s) => s.status === "in_progress").length;
    const completedSessions = testSessions.filter((s) => s.status === "completed").length;

    // Group by category
    const testsByCategory: Record<string, any> = {};
    for (const test of testResults) {
      if (!testsByCategory[test.testCategory]) {
        testsByCategory[test.testCategory] = {
          total: 0,
          passed: 0,
          failed: 0,
        };
      }
      testsByCategory[test.testCategory].total++;
      if (test.status === "pass") testsByCategory[test.testCategory].passed++;
      if (test.status === "fail") testsByCategory[test.testCategory].failed++;
    }

    // Get testers
    const testers = Array.from(new Set(testResults.map((t) => t.testedByEmail)));

    res.json({
      summary: {
        totalTests,
        passedTests,
        failedTests,
        blockedTests,
        skippedTests,
        passRate: totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0,
        criticalFailures,
        requiresFollowUp,
      },
      sessions: {
        active: activeSessions,
        completed: completedSessions,
        total: testSessions.length,
      },
      testsByCategory,
      testers,
    });
  } catch (error: any) {
    log.error("Failed to get QA dashboard", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
