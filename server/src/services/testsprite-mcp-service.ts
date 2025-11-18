/**
 * TestSprite MCP Service
 * Uses Model Context Protocol to generate and submit test scenarios
 */

import { logger } from "../core/logger.js";

const log = logger.child("TestSpriteMCP");

interface TestScenario {
  testName: string;
  testDescription: string;
  testUrl: string;
  browsers: string[];
  devices: string[];
  expectedBehavior: string;
  stepsToTest: string[];
}

/**
 * Generate test scenarios for ContinuityBridge critical flows
 */
export class TestSpriteMCPService {
  /**
   * Generate test scenarios for common flows
   */
  static getCriticalFlowScenarios(baseUrl: string): TestScenario[] {
    return [
      // Login Flow
      {
        testName: "Login Flow - Cross Browser",
        testDescription: "Test user login functionality across different browsers",
        testUrl: `${baseUrl}/login`,
        browsers: ["chrome", "firefox", "safari", "edge"],
        devices: ["desktop", "mobile"],
        expectedBehavior: "User should successfully login and be redirected to dashboard",
        stepsToTest: [
          "Navigate to login page",
          "Verify login form displays correctly",
          "Enter valid credentials",
          "Click login button",
          "Verify redirect to dashboard",
          "Verify user profile displayed in header",
        ],
      },

      // Flow Builder
      {
        testName: "Visual Flow Builder - Drag and Drop",
        testDescription: "Test flow creation with visual node editor",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome", "firefox", "safari"],
        devices: ["desktop"],
        expectedBehavior: "User can create flows by dragging nodes and connecting them",
        stepsToTest: [
          "Navigate to flows page",
          "Click 'Create New Flow' button",
          "Drag webhook trigger node to canvas",
          "Drag transformation node to canvas",
          "Connect nodes by dragging edge",
          "Configure node settings",
          "Save flow",
          "Verify flow appears in list",
        ],
      },

      // Webhook Execution
      {
        testName: "Webhook Trigger - End-to-End",
        testDescription: "Test webhook receiving and flow execution",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome", "firefox"],
        devices: ["desktop"],
        expectedBehavior: "Webhook should trigger flow and process data correctly",
        stepsToTest: [
          "Create a simple flow with webhook trigger",
          "Copy webhook URL",
          "Send POST request to webhook URL using Postman/curl",
          "Verify flow execution in logs",
          "Check output data matches expected transformation",
        ],
      },

      // Interface Configuration
      {
        testName: "Interface Adapter Creation",
        testDescription: "Test creating and testing interface connections",
        testUrl: `${baseUrl}/interfaces`,
        browsers: ["chrome", "firefox"],
        devices: ["desktop"],
        expectedBehavior: "User can create interface adapters and test connections",
        stepsToTest: [
          "Navigate to interfaces page",
          "Click 'Add Interface'",
          "Select REST API protocol",
          "Enter API endpoint details",
          "Configure authentication (API Key/OAuth)",
          "Click 'Test Connection'",
          "Verify successful connection status",
          "Save interface configuration",
        ],
      },

      // Data Source Management
      {
        testName: "Database Connection Setup",
        testDescription: "Test database data source configuration",
        testUrl: `${baseUrl}/datasources`,
        browsers: ["chrome", "firefox"],
        devices: ["desktop"],
        expectedBehavior: "User can configure database connections and test queries",
        stepsToTest: [
          "Navigate to data sources page",
          "Click 'Add Data Source'",
          "Select PostgreSQL/MySQL/SQLite",
          "Enter connection details (host, port, database, credentials)",
          "Click 'Test Connection'",
          "Verify connection success",
          "Save data source",
        ],
      },

      // AI Smart Mapping
      {
        testName: "AI-Assisted Field Mapping",
        testDescription: "Test AI suggestions for field mapping",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "AI should suggest correct field mappings between schemas",
        stepsToTest: [
          "Create flow with object-mapper node",
          "Paste source JSON schema",
          "Paste target JSON schema",
          "Click 'Generate AI Mapping'",
          "Verify AI suggested mappings are logical",
          "Accept/modify suggestions",
          "Test mapping with sample data",
        ],
      },

      // Settings & Configuration
      {
        testName: "System Settings - Email Configuration",
        testDescription: "Test SMTP configuration and email sending",
        testUrl: `${baseUrl}/settings`,
        browsers: ["chrome", "firefox"],
        devices: ["desktop"],
        expectedBehavior: "Admin can configure email settings and send test email",
        stepsToTest: [
          "Navigate to settings page",
          "Click 'Email' tab",
          "Enter SMTP configuration (host, port, credentials)",
          "Click 'Test Connection'",
          "Send test email",
          "Verify test email received",
          "Save settings",
        ],
      },

      // Error Handling
      {
        testName: "Error Triage Dashboard",
        testDescription: "Test error tracking and diagnostic features",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Errors should be captured with context and displayed in triage dashboard",
        stepsToTest: [
          "Create flow with intentional error (invalid jq expression)",
          "Trigger flow execution",
          "Navigate to error triage dashboard",
          "Verify error appears with context snapshot",
          "Click 'View Details'",
          "Verify stack trace and input data shown",
          "Click 'Flag for AI Analysis'",
        ],
      },

      // Performance - Large Payload
      {
        testName: "Large Payload Processing",
        testDescription: "Test system with 10MB+ JSON/XML payloads",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "System should handle large payloads without timeout or memory issues",
        stepsToTest: [
          "Create flow with webhook trigger and transformation",
          "Send 10MB JSON payload to webhook",
          "Monitor flow execution time",
          "Verify no timeout errors (< 30 seconds)",
          "Check memory usage stays below threshold",
          "Verify output data is correct",
        ],
      },

      // Mobile Responsiveness
      {
        testName: "Mobile UI - Flow Management",
        testDescription: "Test mobile interface for flow management",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome", "safari"],
        devices: ["mobile"],
        expectedBehavior: "UI should be responsive and functional on mobile devices",
        stepsToTest: [
          "Navigate to flows page on mobile",
          "Verify sidebar collapses properly",
          "Tap to open flow details",
          "Verify node configuration modal is readable",
          "Test horizontal scrolling in flow canvas",
          "Verify all buttons are tappable (not too small)",
        ],
      },

      // System Health Monitoring
      {
        testName: "System Health Dashboard - Daemon Control",
        testDescription: "Test health monitoring and daemon management (Admin only)",
        testUrl: `${baseUrl}/admin/system-health`,
        browsers: ["chrome", "firefox"],
        devices: ["desktop"],
        expectedBehavior: "Admins can view system health and control background daemons",
        stepsToTest: [
          "Login as admin/consultant",
          "Navigate to System Health page",
          "Verify health metrics display (error rate, latency, memory, disk)",
          "Check daemon status cards (Scheduler, Poller, Log Cleanup, Health Monitor)",
          "Click 'Restart' on a daemon",
          "Confirm action in dialog",
          "Verify daemon restarts successfully",
          "Check audit log for action",
        ],
      },
    ];
  }

  /**
   * Submit test scenario to TestSprite
   */
  static async submitScenario(scenario: TestScenario): Promise<{ success: boolean; testId?: string; error?: string }> {
    try {
      const apiKey = process.env.TESTSPRITE_API_KEY;
      const enabled = process.env.TESTSPRITE_ENABLED === "true";

      if (!enabled) {
        return {
          success: false,
          error: "TestSprite integration is disabled. Set TESTSPRITE_ENABLED=true",
        };
      }

      if (!apiKey) {
        return {
          success: false,
          error: "TestSprite API key not configured",
        };
      }

      // Call TestSprite API
      const response = await fetch("https://api.testsprite.com/v1/tests", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: scenario.testName,
          description: scenario.testDescription,
          url: scenario.testUrl,
          browsers: scenario.browsers,
          devices: scenario.devices,
          expectedBehavior: scenario.expectedBehavior,
          steps: scenario.stepsToTest,
          webhookUrl: `${process.env.APP_URL || "http://localhost:5000"}/api/testsprite/webhook`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`TestSprite API error: ${errorData.message || response.statusText}`);
      }

      const result = await response.json();

      log.info("Test scenario submitted to TestSprite", {
        testName: scenario.testName,
        testId: result.testId,
      });

      return {
        success: true,
        testId: result.testId,
      };
    } catch (error: any) {
      log.error("Failed to submit test scenario", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Submit all critical flow scenarios
   */
  static async submitAllScenarios(baseUrl: string): Promise<{
    submitted: number;
    failed: number;
    testIds: string[];
    errors: string[];
  }> {
    const scenarios = this.getCriticalFlowScenarios(baseUrl);
    const testIds: string[] = [];
    const errors: string[] = [];

    for (const scenario of scenarios) {
      const result = await this.submitScenario(scenario);

      if (result.success && result.testId) {
        testIds.push(result.testId);
      } else {
        errors.push(`${scenario.testName}: ${result.error}`);
      }

      // Rate limit: Wait 1 second between submissions
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return {
      submitted: testIds.length,
      failed: errors.length,
      testIds,
      errors,
    };
  }
}
