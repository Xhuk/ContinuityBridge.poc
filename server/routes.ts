import type { Express } from "express";
import { createServer, type Server } from "http";
import { Pipeline } from "./src/core/pipeline.js";
import { FlowOrchestrator } from "./src/flow/orchestrator.js";
import { registerRESTRoutes, registerAuthRoutes } from "./src/http/rest.js";
import { registerGraphQLServer } from "./src/http/graphql.js";
import { initializeQueue } from "./src/serverQueue.js";
import { Worker, setWorkerInstance } from "./src/workers/worker.js";
import { logger } from "./src/core/logger.js";
import { DatabaseStorage } from "./database-storage.js";
import { ensureTables } from "./migrate.js";
import { secretsService } from "./src/secrets/secrets-service.js";
import { TokenLifecycleService } from "./src/auth/token-lifecycle-service.js";
import { BackgroundTokenRefreshJob } from "./src/auth/background-token-refresh.js";
import { createInboundAuthMiddleware } from "./src/auth/inbound-auth-middleware.js";

const log = logger.child("Server");

export async function registerRoutes(app: Express): Promise<Server> {
  try {
    // Initialize database tables
    await ensureTables();
    
    // Create database storage instance
    const storage = new DatabaseStorage();
    
    // Initialize email service with stored SMTP settings
    const { emailService } = await import("./src/notifications/index.js");
    const smtpSettings = storage.getSmtpSettingsForService 
      ? await storage.getSmtpSettingsForService() 
      : await storage.getSmtpSettings();
    if (smtpSettings && smtpSettings.password) {
      try {
        await emailService.configure(smtpSettings);
        log.info("Email service initialized with stored SMTP settings");
      } catch (error) {
        log.warn("Failed to initialize email service - SMTP settings may be invalid", error);
      }
    } else {
      log.info("No SMTP settings found - email notifications disabled");
    }
    
    // Initialize queue provider with storage and secrets service for backend config
    await initializeQueue(storage, secretsService);

    // Initialize token lifecycle service (shared)
    const tokenLifecycle = new TokenLifecycleService(storage, secretsService);

    // Initialize inbound auth middleware
    const { middleware: inboundAuthMiddleware, reloadPolicies } = createInboundAuthMiddleware({
      storage,
      tokenLifecycle,
      secretsService,
    });

    // Apply inbound auth middleware globally
    // Note: Policies with enforcement="bypass" allow public access
    // TODO: In production, apply selectively to specific route groups for better performance
    app.use(inboundAuthMiddleware);

    // Create flow orchestrator (shared across pipeline and REST routes)
    const orchestrator = new FlowOrchestrator(storage);

    // Create pipeline instance with flow support
    const pipeline = new Pipeline({ orchestrator });

    // Register REST API routes with storage
    registerRESTRoutes(app, pipeline, orchestrator, storage);

    // Register auth adapter and policy routes
    registerAuthRoutes(app, storage, tokenLifecycle, secretsService, reloadPolicies);

    // Register GraphQL server (standalone on port 4000) with shared pipeline
    registerGraphQLServer(pipeline).catch((err) => {
      log.error("Failed to start GraphQL server", err);
    });

    // Initialize and start worker with shared pipeline
    const worker = new Worker(pipeline);
    setWorkerInstance(worker);
    await worker.start();

    // Initialize and start background token refresh job
    const tokenRefreshJob = new BackgroundTokenRefreshJob(
      storage,
      tokenLifecycle,
      secretsService,
      1,  // Run every 1 minute
      5   // Refresh tokens expiring in <5 minutes
    );
    tokenRefreshJob.start();

    log.info("All routes and services registered successfully");

    const httpServer = createServer(app);
    return httpServer;
  } catch (error) {
    log.error("Failed to register routes", error);
    throw error;
  }
}
