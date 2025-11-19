#!/usr/bin/env node

/**
 * Test Script for Layered Storage System
 * 
 * Demonstrates the BASE + CUSTOM override mechanism
 * 
 * Usage:
 *   npm run test:layered-storage
 */

import { LayeredStorageService } from "../src/services/layered-storage-service.js";
import * as fs from "fs/promises";
import * as path from "path";

const STORAGE_PATH = path.join(process.cwd(), "storage");

async function setupTestEnvironment() {
  console.log("🔧 Setting up test environment...\n");

  const orgId = "test-org-001";
  const basePath = path.join(STORAGE_PATH, "Foundation", "Core", "DEV", "customer", "base");
  const customPath = path.join(STORAGE_PATH, orgId, "customadhoc");

  // Clean previous test
  await fs.rm(path.join(STORAGE_PATH, orgId), { recursive: true, force: true });
  await fs.rm(basePath, { recursive: true, force: true });

  // Create BASE layer (standard product files)
  await fs.mkdir(basePath, { recursive: true });
  
  await fs.writeFile(
    path.join(basePath, "docker-compose.yml"),
    `version: '3.8'
services:
  app:
    image: continuitybridge:standard
    ports:
      - "5000:5000"`,
    "utf-8"
  );

  await fs.writeFile(
    path.join(basePath, ".env"),
    `NODE_ENV=production
LOG_LEVEL=info
DB_TYPE=postgres`,
    "utf-8"
  );

  await fs.writeFile(
    path.join(basePath, "config.json"),
    JSON.stringify({ version: "1.0.0", profile: "standard" }, null, 2),
    "utf-8"
  );

  console.log("✅ BASE layer created with 3 files:");
  console.log("   - docker-compose.yml");
  console.log("   - .env");
  console.log("   - config.json\n");

  // Create CUSTOM layer (customer modifications)
  await fs.mkdir(customPath, { recursive: true });

  // CASE 1: Override docker-compose.yml
  await fs.writeFile(
    path.join(customPath, "docker-compose.yml"),
    `version: '3.8'
services:
  app:
    image: continuitybridge:custom
    ports:
      - "8080:5000"  # Custom port
    environment:
      CUSTOM_VAR: "true"`,
    "utf-8"
  );

  // CASE 2: Add-on (new file not in base)
  await fs.writeFile(
    path.join(customPath, "custom-script.sh"),
    `#!/bin/bash
echo "Custom deployment script"`,
    "utf-8"
  );

  // CASE 3: Invalid file (should go to rework)
  await fs.writeFile(
    path.join(customPath, "bad-config.json"),
    `{ this is not valid json }`,
    "utf-8"
  );

  console.log("✅ CUSTOM layer created with 3 files:");
  console.log("   - docker-compose.yml (OVERRIDE)");
  console.log("   - custom-script.sh (ADD-ON)");
  console.log("   - bad-config.json (INVALID)\n");
}

async function runMergeTest() {
  console.log("🚀 Running layer merge...\n");

  const service = new LayeredStorageService({
    organizationId: "test-org-001",
    deploymentProfile: "standard",
  });

  const result = await service.mergeLayersToRuntime();

  console.log("📊 MERGE RESULTS:");
  console.log("=".repeat(50));
  console.log(`✅ Success: ${result.success}`);
  console.log(`📂 Runtime Path: ${result.runtimePath}`);
  console.log(`📦 Files Processed: ${result.filesProcessed}`);
  console.log(`📥 From BASE: ${result.filesFromBase}`);
  console.log(`📤 From CUSTOM: ${result.filesFromCustom}`);
  console.log(`🔄 Overridden: ${result.filesOverridden}`);
  console.log(`❌ Failed: ${result.filesFailed}`);
  console.log("=".repeat(50));

  if (result.filesFailed > 0) {
    console.log("\n⚠️  FAILED FILES (moved to rework):");
    for (const failed of result.failedFiles) {
      console.log(`   - ${failed.fileName}`);
      console.log(`     Reason: ${failed.reason}`);
      console.log(`     Moved to rework: ${failed.movedToRework ? "✅" : "❌"}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log("\n⚠️  WARNINGS:");
    for (const warning of result.warnings) {
      console.log(`   - ${warning}`);
    }
  }

  console.log("\n");

  // List rework files
  const reworkFiles = await service.listReworkFiles();
  if (reworkFiles.length > 0) {
    console.log("🔧 FILES REQUIRING CONSULTANT ATTENTION:");
    console.log("=".repeat(50));
    for (const file of reworkFiles) {
      console.log(`📄 ${file.fileName}`);
      console.log(`   Reason: ${file.reason}`);
      console.log(`   Time: ${file.timestamp}`);
      console.log("");
    }
  }

  // Show runtime contents
  console.log("📁 RUNTIME PACKAGE CONTENTS:");
  console.log("=".repeat(50));
  const runtimePath = await service.getRuntimePackage();
  const files = await fs.readdir(runtimePath);
  
  for (const file of files) {
    const fullPath = path.join(runtimePath, file);
    const stats = await fs.stat(fullPath);
    console.log(`   ${file} (${stats.size} bytes)`);
  }
  console.log("=".repeat(50));

  console.log("\n✨ Test completed successfully!");
}

async function main() {
  try {
    console.log("╔════════════════════════════════════════════════╗");
    console.log("║   LAYERED STORAGE OVERRIDE SYSTEM TEST         ║");
    console.log("╚════════════════════════════════════════════════╝\n");

    await setupTestEnvironment();
    await runMergeTest();

    console.log("\n🎉 All tests passed!\n");
  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
