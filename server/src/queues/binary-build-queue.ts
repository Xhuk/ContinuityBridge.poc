/**
 * Binary Build Queue
 * 
 * Async job queue for building customer binaries
 * Prevents blocking web requests during long builds
 */

import Bull from "bull";
import { logger } from "../core/logger.js";
import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";

const log = logger.child("BinaryBuildQueue");

// Queue config
const REDIS_URL = process.env.VALKEY_URL || process.env.REDIS_URL || "redis://localhost:6379";
const QUEUE_NAME = "binary-builds";

export interface BinaryBuildJob {
  organizationId: string;
  organizationName: string;
  licenseType: string;
  platforms: string[];
  version: string;
  requestedBy: string;
}

export interface BinaryBuildResult {
  binaries: {
    platform: string;
    filename: string;
    size: number;
    path: string;
  }[];
  packagePath: string;
  packageSize: number;
}

// Create queue
export const binaryBuildQueue = new Bull<BinaryBuildJob>(QUEUE_NAME, REDIS_URL, {
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 60000, // 1 minute
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500,     // Keep last 500 failed jobs
  },
});

// Process jobs
binaryBuildQueue.process(async (job) => {
  const { organizationId, organizationName, licenseType, platforms, version } = job.data;
  
  log.info("Starting binary build", {
    jobId: job.id,
    organizationId,
    platforms,
  });
  
  try {
    // Update progress
    await job.progress(10);
    
    // Map platform names to pkg targets
    const pkgPlatforms = platforms.map((p: string) => {
      switch (p.toLowerCase()) {
        case "windows":
          return "node20-win-x64";
        case "linux":
          return "node20-linux-x64";
        case "macos":
          return "node20-macos-x64";
        default:
          return "node20-linux-x64";
      }
    });
    
    await job.progress(20);
    
    // Build binaries
    const buildCommand = `node scripts/build-binary.js --org ${organizationId} --license ${licenseType} --platforms ${pkgPlatforms.join(",")}`;
    
    log.info("Executing build", { buildCommand });
    
    execSync(buildCommand, {
      cwd: process.cwd(),
      stdio: "inherit",
      maxBuffer: 10 * 1024 * 1024,
    });
    
    await job.progress(80);
    
    // Collect build artifacts
    const binariesDir = path.join(process.cwd(), "dist", "binaries");
    const files = await fs.readdir(binariesDir);
    
    const binaries: BinaryBuildResult["binaries"] = [];
    
    for (const file of files) {
      if (file.includes(organizationId)) {
        const filePath = path.join(binariesDir, file);
        const stats = await fs.stat(filePath);
        
        binaries.push({
          platform: file.includes("win") ? "windows" : file.includes("macos") ? "macos" : "linux",
          filename: file,
          size: stats.size,
          path: filePath,
        });
      }
    }
    
    await job.progress(100);
    
    log.info("Binary build complete", {
      jobId: job.id,
      organizationId,
      binaries: binaries.length,
    });
    
    const result: BinaryBuildResult = {
      binaries,
      packagePath: binariesDir,
      packageSize: binaries.reduce((sum, b) => sum + b.size, 0),
    };
    
    return result;
  } catch (error: any) {
    log.error("Binary build failed", {
      jobId: job.id,
      organizationId,
      error: error.message,
    });
    throw error;
  }
});

// Event handlers
binaryBuildQueue.on("completed", (job, result: BinaryBuildResult) => {
  log.info("Build job completed", {
    jobId: job.id,
    organizationId: job.data.organizationId,
    binaries: result.binaries.length,
    totalSize: (result.packageSize / 1024 / 1024).toFixed(2) + " MB",
  });
});

binaryBuildQueue.on("failed", (job, error) => {
  log.error("Build job failed", {
    jobId: job?.id,
    organizationId: job?.data?.organizationId,
    error: error.message,
    attempts: job?.attemptsMade,
  });
});

binaryBuildQueue.on("stalled", (job) => {
  log.warn("Build job stalled", {
    jobId: job.id,
    organizationId: job.data.organizationId,
  });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  log.info("Shutting down binary build queue...");
  await binaryBuildQueue.close();
});

export default binaryBuildQueue;
