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
   * Generate comprehensive test scenarios for production readiness
   * Covers: Auth, Flows, AI, Multi-tenancy, RBAC, Monitoring, Finance
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

      // ============================================================================
      // AUTHENTICATION & AUTHORIZATION
      // ============================================================================

      // Magic Link Login
      {
        testName: "Magic Link Authentication",
        testDescription: "Test passwordless login via magic link email",
        testUrl: `${baseUrl}/login`,
        browsers: ["chrome", "firefox", "safari"],
        devices: ["desktop", "mobile"],
        expectedBehavior: "User receives magic link and successfully authenticates",
        stepsToTest: [
          "Navigate to login page",
          "Click 'Send Magic Link'",
          "Enter email address",
          "Submit form",
          "Check email inbox for magic link",
          "Click magic link in email",
          "Verify automatic login and redirect to dashboard",
          "Verify magic link cannot be reused (security check)",
        ],
      },

      // RBAC - Role Permissions
      {
        testName: "RBAC - Role-Based Access Control",
        testDescription: "Test different user roles have appropriate access levels",
        testUrl: `${baseUrl}/admin`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Users can only access features allowed by their role",
        stepsToTest: [
          "Login as customer_user (lowest permission)",
          "Verify access to dashboard only",
          "Attempt to access /admin/users (should be denied)",
          "Logout and login as customer_admin",
          "Verify access to user management for own org",
          "Logout and login as superadmin",
          "Verify access to all admin features",
          "Check Finance Analytics page loads (superadmin only)",
        ],
      },

      // Multi-Tenant Isolation
      {
        testName: "Multi-Tenant Data Isolation",
        testDescription: "Test tenant data isolation between organizations",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Users can only see data from their organization",
        stepsToTest: [
          "Login as user from Organization A",
          "Create a test flow",
          "Note flow is visible in list",
          "Logout and login as user from Organization B",
          "Verify Organization A's flow is NOT visible",
          "Create Organization B flow",
          "Verify only Organization B flows are shown",
        ],
      },

      // ============================================================================
      // BRIDGESCRIPT & FLOW DEVELOPMENT
      // ============================================================================

      // BridgeScript Editor with Live Preview
      {
        testName: "BridgeScript DSL - Live Visual Preview",
        testDescription: "Test TypeScript DSL with real-time React Flow visualization",
        testUrl: `${baseUrl}/consultant/bridgescript-editor`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Code changes instantly update visual flow diagram",
        stepsToTest: [
          "Login as consultant/superadmin",
          "Navigate to BridgeScript Editor",
          "Verify Monaco editor loads with TypeScript IntelliSense",
          "Type: flow.addWebhook('test-webhook').addLogger()",
          "Verify visual flow updates in real-time",
          "Click 'Compile to YAML'",
          "Verify YAML output is valid",
          "Click 'Validate'",
          "Verify no validation errors",
        ],
      },

      // Flow Versioning & Approval
      {
        testName: "Flow Version Control & Approval Workflow",
        testDescription: "Test semantic versioning with approval for production flows",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Production flows require approval, dev flows deploy immediately",
        stepsToTest: [
          "Create flow in DEV environment",
          "Deploy immediately (no approval needed)",
          "Create flow in PROD environment",
          "Submit for approval",
          "Verify status shows 'Pending Approval'",
          "Login as approver (consultant/superadmin)",
          "Review and approve flow",
          "Verify flow deploys after approval",
        ],
      },

      // Dynamic Webhook Hot-Reload
      {
        testName: "Dynamic Webhook Registration",
        testDescription: "Test webhook endpoints register without server restart",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Webhook endpoints become available immediately after flow save",
        stepsToTest: [
          "Create new flow with webhook trigger",
          "Set webhook path to /webhook/test-instant",
          "Save flow",
          "Copy webhook URL",
          "Send POST request to webhook (via Postman/curl)",
          "Verify flow executes without server restart",
          "Check flow execution logs",
        ],
      },

      // Scheduled Flows (Cron)
      {
        testName: "Scheduler Daemon - Cron-Based Flows",
        testDescription: "Test scheduled flows execute at configured intervals",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Flows execute automatically based on cron schedule",
        stepsToTest: [
          "Create flow with Timer trigger (cron: */1 * * * *)",
          "Add logger node to output timestamp",
          "Save and enable flow",
          "Wait 1 minute",
          "Check flow execution logs",
          "Verify flow ran automatically",
          "Verify timestamp in output",
        ],
      },

      // Poller Daemon - SFTP/Blob
      {
        testName: "Poller Daemon - File System Polling",
        testDescription: "Test SFTP/Blob storage polling for new files",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "System detects and processes new files automatically",
        stepsToTest: [
          "Create flow with SFTP Poller node",
          "Configure poll interval (5 minutes)",
          "Set file pattern (*.csv)",
          "Upload test file to SFTP server",
          "Wait for poll interval",
          "Verify flow executes automatically",
          "Check file was processed",
        ],
      },

      // ============================================================================
      // AI INTEGRATION & SMART FEATURES
      // ============================================================================

      // AI Environment Guard
      {
        testName: "AI Environment Restriction - Security",
        testDescription: "Test AI features blocked in production (security)",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "AI mapping blocked in staging/prod, allowed in dev/test",
        stepsToTest: [
          "Create flow in DEV environment",
          "Add object-mapper node",
          "Click 'Generate AI Mapping'",
          "Verify AI suggestions load",
          "Switch environment to PROD",
          "Try to use AI mapping",
          "Verify error: 'AI features disabled in production'",
        ],
      },

      // AI Expert Advisors (Founder Only)
      {
        testName: "AI Expert Advisors - Multi-AI Consensus",
        testDescription: "Test founder-only AI strategic advice with consensus",
        testUrl: `${baseUrl}/admin/ai-monitoring`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Multi-AI consensus provides strategic recommendations",
        stepsToTest: [
          "Login as superadmin (founder)",
          "Navigate to AI Monitoring",
          "Click 'Get Strategic Advice'",
          "Ask: 'Should we prioritize enterprise features?'",
          "Verify responses from Gemini, ChatGPT, Claude",
          "Verify consensus level displayed (UNANIMOUS/MAJORITY/SPLIT)",
          "Verify confidence scores shown",
        ],
      },

      // AI Activity Violation Tracking
      {
        testName: "AI Usage Monitoring & Violation Detection",
        testDescription: "Test AI misuse detection (e.g., weather queries in mapping)",
        testUrl: `${baseUrl}/admin/ai-monitoring`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "System detects and logs AI feature misuse",
        stepsToTest: [
          "Login as consultant",
          "Try to use AI mapping for non-mapping task",
          "Submit irrelevant query (e.g., 'What's the weather?')",
          "Login as superadmin",
          "Navigate to AI Monitoring > Violations",
          "Verify violation logged with user, timestamp, query",
        ],
      },

      // ============================================================================
      // FINANCE & LICENSING
      // ============================================================================

      // Finance Analytics Dashboard
      {
        testName: "Finance Analytics - MRR/ARR Tracking",
        testDescription: "Test revenue metrics and AI insights (Founder only)",
        testUrl: `${baseUrl}/admin/finance-analytics`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Dashboard shows accurate revenue metrics with AI insights",
        stepsToTest: [
          "Login as superadmin",
          "Navigate to Finance Analytics",
          "Verify MRR calculation displayed",
          "Verify ARR = MRR × 12",
          "Check active customer count",
          "Verify pipeline value from SOW requests",
          "Read AI-powered insights section",
          "Verify customer segmentation by tier",
        ],
      },

      // SOW Amendment Request (Customer Self-Service)
      {
        testName: "SOW Amendment - Customer Upgrade Request",
        testDescription: "Test customer admin requesting license upgrade",
        testUrl: `${baseUrl}/customer/my-sow-requests`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Customer can request upgrades, founder can approve/reject",
        stepsToTest: [
          "Login as customer_admin (at license limit)",
          "Click 'Request SOW Amendment'",
          "Increase interface limit from 5 to 10",
          "Verify AI cost estimate shown",
          "Submit request",
          "Logout and login as superadmin",
          "Navigate to /admin/sow-requests",
          "Review pending request with AI recommendations",
          "Approve request",
          "Verify license limits updated automatically",
        ],
      },

      // License Enforcement
      {
        testName: "License Limits - Hard Enforcement",
        testDescription: "Test system blocks actions when license limit reached",
        testUrl: `${baseUrl}/interfaces`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "User cannot exceed licensed resource limits",
        stepsToTest: [
          "Login as customer with 5 interface limit",
          "Create 5 interfaces",
          "Attempt to create 6th interface",
          "Verify error: 'License limit reached'",
          "Verify suggestion to request SOW amendment",
        ],
      },

      // ============================================================================
      // DEPLOYMENT & LAYERED STORAGE
      // ============================================================================

      // Layered Storage Override System
      {
        testName: "BASE + CUSTOM Inheritance - File Override",
        testDescription: "Test customer customizations override base deployment files",
        testUrl: `${baseUrl}/consultant/deployment-manager`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Custom files override BASE, runtime merges both layers",
        stepsToTest: [
          "Login as consultant",
          "Navigate to Deployment Manager",
          "View customer's BASE version (e.g., v1.2.0)",
          "Upload custom .env file (overrides BASE)",
          "Click 'Generate Runtime Package'",
          "Verify runtime shows -custom.1 suffix",
          "Download and verify custom .env in package",
          "Verify BASE files still present (not in CUSTOM)",
        ],
      },

      // Package Builder (Founder Platform)
      {
        testName: "Package Builder - Multi-Format Release",
        testDescription: "Test generating Docker + K8s + Binary releases",
        testUrl: `${baseUrl}/admin/updates`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "System generates deployment packages for all formats",
        stepsToTest: [
          "Login as superadmin on founder platform",
          "Navigate to Package Builder",
          "Select customer: 'ACME Corp'",
          "Choose deployment type: Docker Compose",
          "Click 'Build Package'",
          "Verify build progress shown",
          "Download generated package (.tar.gz)",
          "Verify docker-compose.yml in package",
        ],
      },

      // Remote Updates Agent
      {
        testName: "Remote Update Agent - Auto-Update",
        testDescription: "Test customer deployments auto-update from founder platform",
        testUrl: `${baseUrl}/admin/system-health`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Customer deployment checks for updates and applies them",
        stepsToTest: [
          "Configure customer deployment with REMOTE_UPDATES_ENABLED=true",
          "Founder releases new version (v1.3.0)",
          "Wait for update check interval (24 hours or manual trigger)",
          "Verify customer deployment detects new version",
          "Verify update downloads and applies",
          "Verify version shown in System Health: v1.3.0",
        ],
      },

      // ============================================================================
      // MONITORING & OBSERVABILITY
      // ============================================================================

      // Prometheus Metrics Export
      {
        testName: "Prometheus Metrics - Scraping",
        testDescription: "Test Prometheus metrics endpoint for monitoring",
        testUrl: `${baseUrl}/metrics`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Metrics endpoint returns Prometheus-formatted data",
        stepsToTest: [
          "Navigate to /metrics endpoint",
          "Verify response is text/plain format",
          "Check for metrics: http_requests_total",
          "Check for: flow_execution_duration_seconds",
          "Check for: daemon_uptime_seconds",
          "Verify metrics include labels (method, status, flow_id)",
        ],
      },

      // Health Check Endpoint
      {
        testName: "Health Check - Liveness & Readiness",
        testDescription: "Test /health endpoint for container orchestration",
        testUrl: `${baseUrl}/health`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Health endpoint returns 200 OK when system is healthy",
        stepsToTest: [
          "Navigate to /health endpoint",
          "Verify HTTP 200 response",
          "Verify JSON response includes: status, timestamp, uptime",
          "Check database connectivity status",
          "Check queue status",
          "Verify all daemons running",
        ],
      },

      // Error Triage with Context Snapshots
      {
        testName: "Error Triage - Context Preservation",
        testDescription: "Test error tracking captures full execution context",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Errors include input data, stack trace, and flow state",
        stepsToTest: [
          "Create flow with transformation node",
          "Use invalid jq expression: .invalid[].broken",
          "Trigger flow with test data",
          "Navigate to error dashboard",
          "Click on failed execution",
          "Verify input payload shown",
          "Verify exact error location (node ID)",
          "Verify stack trace available",
        ],
      },

      // ============================================================================
      // QA & TESTING
      // ============================================================================

      // QA Tracking Dashboard
      {
        testName: "QA Tracking - Manual Test Management",
        testDescription: "Test QA dashboard for manual test tracking",
        testUrl: `${baseUrl}/admin/qa-tracking`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "QA managers can log tests and track coverage",
        stepsToTest: [
          "Login as consultant (QA manager)",
          "Navigate to QA Tracking",
          "Click 'Add Test Result'",
          "Select category: Flow Execution",
          "Enter test name and steps",
          "Mark status: Pass/Fail",
          "Save test result",
          "Verify test appears in dashboard",
          "Check test coverage percentage updates",
        ],
      },

      // TestSprite Integration - Webhook Callback
      {
        testName: "TestSprite Webhook - Result Ingestion",
        testDescription: "Test external test results webhook back to dashboard",
        testUrl: `${baseUrl}/api/testsprite/webhook`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "TestSprite results automatically populate QA dashboard",
        stepsToTest: [
          "Submit test scenarios to TestSprite",
          "Wait for TestSprite execution",
          "Verify webhook receives POST with test results",
          "Navigate to QA Tracking dashboard",
          "Verify external test results appear",
          "Check status: passed/failed/skipped",
          "Verify screenshots/videos attached",
        ],
      },

      // ============================================================================
      // PERFORMANCE & STRESS TESTING
      // ============================================================================

      // Concurrent Flow Execution
      {
        testName: "Concurrent Execution - 50 Parallel Flows",
        testDescription: "Test system handles multiple simultaneous flow executions",
        testUrl: `${baseUrl}/flows`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "System processes 50 concurrent flows without errors",
        stepsToTest: [
          "Create simple webhook flow",
          "Use load testing tool (k6/Artillery) to send 50 requests",
          "Monitor system health dashboard",
          "Verify all 50 flows complete successfully",
          "Check error rate stays at 0%",
          "Verify P95 latency < 5 seconds",
          "Check memory usage < 85%",
        ],
      },

      // Cache Performance
      {
        testName: "Valkey Cache - Hit Rate",
        testDescription: "Test cache reduces database load for license checks",
        testUrl: `${baseUrl}/admin/cache`,
        browsers: ["chrome"],
        devices: ["desktop"],
        expectedBehavior: "Cache hit rate > 80% for frequently accessed data",
        stepsToTest: [
          "Login as superadmin",
          "Navigate to Cache Management",
          "Trigger 100 API requests requiring license checks",
          "Check cache statistics",
          "Verify hit rate > 80%",
          "Verify latency improvement vs. DB query",
        ],
      },

      // Bundle Size & Load Time
      {
        testName: "Frontend Performance - Initial Load",
        testDescription: "Test optimized bundle loads quickly",
        testUrl: `${baseUrl}/`,
        browsers: ["chrome"],
        devices: ["desktop", "mobile"],
        expectedBehavior: "Page loads in < 3 seconds on 3G connection",
        stepsToTest: [
          "Open browser DevTools > Network",
          "Throttle to 'Slow 3G'",
          "Navigate to homepage",
          "Measure time to interactive (TTI)",
          "Verify TTI < 3 seconds",
          "Check main bundle size < 800KB (gzipped)",
          "Verify lazy-loaded chunks present",
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
