/**
 * Demo Flow Testing Script
 * 
 * Tests all demo flows with sample data
 * Run: npm run test:demo
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const API_BASE_URL = process.env.API_URL || "http://localhost:5000";
const API_KEY = process.env.SUPERADMIN_API_KEY || "cb_demo_key";

interface TestCase {
  name: string;
  flowId: string;
  webhookSlug: string;
  method: string;
  payloadFile: string;
  expectedStatus: number;
}

const TEST_CASES: TestCase[] = [
  {
    name: "Shopify Order → WMS Integration",
    flowId: "demo-shopify-to-wms",
    webhookSlug: "demo-shopify-to-wms",
    method: "POST",
    payloadFile: "examples/webhooks/shopify-order.json",
    expectedStatus: 200,
  },
  {
    name: "Shipment Tracking Update",
    flowId: "demo-shipment-tracking",
    webhookSlug: "demo-shipment-tracking",
    method: "POST",
    payloadFile: "examples/webhooks/carrier-tracking.json",
    expectedStatus: 200,
  },
];

async function testDemoFlows() {
  console.log("🧪 Testing Demo Flows\n");
  console.log(`API: ${API_BASE_URL}`);
  console.log(`Key: ${API_KEY.substring(0, 10)}...`);
  console.log("");

  let passed = 0;
  let failed = 0;

  for (const test of TEST_CASES) {
    console.log(`\n📋 Test: ${test.name}`);
    console.log(`   Flow ID: ${test.flowId}`);
    console.log(`   Webhook: ${test.method} /api/webhook/${test.webhookSlug}`);

    try {
      // Load payload
      const payloadPath = path.join(ROOT_DIR, test.payloadFile);
      const payload = JSON.parse(await fs.readFile(payloadPath, "utf-8"));
      console.log(`   Payload: ${test.payloadFile} ✓`);

      // Send webhook request
      const url = `${API_BASE_URL}/api/webhook/${test.webhookSlug}`;
      const response = await fetch(url, {
        method: test.method,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.text();

      if (response.status === test.expectedStatus) {
        console.log(`   ✅ PASSED (${response.status})`);
        passed++;
      } else {
        console.log(`   ❌ FAILED (expected ${test.expectedStatus}, got ${response.status})`);
        console.log(`   Response: ${responseData.substring(0, 200)}`);
        failed++;
      }
    } catch (error: any) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log("\n");
  console.log("═".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(50));

  if (failed > 0) {
    console.log("\n⚠️  Some tests failed. Check logs above.");
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
    process.exit(0);
  }
}

// Run tests
testDemoFlows().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
/**
 * Demo Flow Testing Script
 * 
 * Tests all demo flows with sample data
 * Run: npm run test:demo
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const API_BASE_URL = process.env.API_URL || "http://localhost:5000";
const API_KEY = process.env.SUPERADMIN_API_KEY || "cb_demo_key";

interface TestCase {
  name: string;
  flowId: string;
  webhookSlug: string;
  method: string;
  payloadFile: string;
  expectedStatus: number;
}

const TEST_CASES: TestCase[] = [
  {
    name: "Shopify Order → WMS Integration",
    flowId: "demo-shopify-to-wms",
    webhookSlug: "demo-shopify-to-wms",
    method: "POST",
    payloadFile: "examples/webhooks/shopify-order.json",
    expectedStatus: 200,
  },
  {
    name: "Shipment Tracking Update",
    flowId: "demo-shipment-tracking",
    webhookSlug: "demo-shipment-tracking",
    method: "POST",
    payloadFile: "examples/webhooks/carrier-tracking.json",
    expectedStatus: 200,
  },
];

async function testDemoFlows() {
  console.log("🧪 Testing Demo Flows\n");
  console.log(`API: ${API_BASE_URL}`);
  console.log(`Key: ${API_KEY.substring(0, 10)}...`);
  console.log("");

  let passed = 0;
  let failed = 0;

  for (const test of TEST_CASES) {
    console.log(`\n📋 Test: ${test.name}`);
    console.log(`   Flow ID: ${test.flowId}`);
    console.log(`   Webhook: ${test.method} /api/webhook/${test.webhookSlug}`);

    try {
      // Load payload
      const payloadPath = path.join(ROOT_DIR, test.payloadFile);
      const payload = JSON.parse(await fs.readFile(payloadPath, "utf-8"));
      console.log(`   Payload: ${test.payloadFile} ✓`);

      // Send webhook request
      const url = `${API_BASE_URL}/api/webhook/${test.webhookSlug}`;
      const response = await fetch(url, {
        method: test.method,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.text();

      if (response.status === test.expectedStatus) {
        console.log(`   ✅ PASSED (${response.status})`);
        passed++;
      } else {
        console.log(`   ❌ FAILED (expected ${test.expectedStatus}, got ${response.status})`);
        console.log(`   Response: ${responseData.substring(0, 200)}`);
        failed++;
      }
    } catch (error: any) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log("\n");
  console.log("═".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(50));

  if (failed > 0) {
    console.log("\n⚠️  Some tests failed. Check logs above.");
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
    process.exit(0);
  }
}

// Run tests
testDemoFlows().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
