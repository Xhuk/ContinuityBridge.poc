import type { Express } from "express";
import { createServer, type Server } from "http";
import { Pipeline } from "./src/core/pipeline.js";
import { FlowOrchestrator } from "./src/flow/orchestrator.js";
import { registerRESTRoutes } from "./src/http/rest.js";
import { registerGraphQLServer } from "./src/http/graphql.js";
import { initializeQueue } from "./src/serverQueue.js";
import { Worker, setWorkerInstance } from "./src/workers/worker.js";
import { logger } from "./src/core/logger.js";
import { DatabaseStorage } from "./database-storage.js";
import { ensureTables } from "./migrate.js";

const log = logger.child("Server");

export async function registerRoutes(app: Express): Promise<Server> {
  try {
    // Initialize database tables
    await ensureTables();
    
    // Create database storage instance
    const storage = new DatabaseStorage();
    
    // Initialize email service with stored SMTP settings
    const { emailService } = await import("./src/notifications/index.js");
    const smtpSettings = await storage.getSmtpSettings();
    if (smtpSettings) {
      try {
        await emailService.configure(smtpSettings);
        log.info("Email service initialized with stored SMTP settings");
      } catch (error) {
        log.warn("Failed to initialize email service - SMTP settings may be invalid", error);
      }
    } else {
      log.info("No SMTP settings found - email notifications disabled");
    }
    
    // Initialize queue provider
    await initializeQueue();

    // Create flow orchestrator (shared across pipeline and REST routes)
    const orchestrator = new FlowOrchestrator(storage);

    // Create pipeline instance with flow support
    const pipeline = new Pipeline({ orchestrator });

    // Register REST API routes with storage
    registerRESTRoutes(app, pipeline, orchestrator, storage);

    // Register GraphQL server (standalone on port 4000) with shared pipeline
    registerGraphQLServer(pipeline).catch((err) => {
      log.error("Failed to start GraphQL server", err);
    });

    // Initialize and start worker with shared pipeline
    const worker = new Worker(pipeline);
    setWorkerInstance(worker);
    await worker.start();

    log.info("All routes and services registered successfully");

    const httpServer = createServer(app);
    return httpServer;
  } catch (error) {
    log.error("Failed to register routes", error);
    throw error;
  }
}
