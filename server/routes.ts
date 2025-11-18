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
import { ensureTables, seedDefaultHierarchy } from "./migrate.js";
import { secretsService } from "./src/secrets/secrets-service.js";
import { TokenLifecycleService } from "./src/auth/token-lifecycle-service.js";
import { initializeOutboundTokenProvider } from "./src/auth/auth-service-factory.js";
import { BackgroundTokenRefreshJob } from "./src/auth/background-token-refresh.js";
import { createInboundAuthMiddleware } from "./src/auth/inbound-auth-middleware.js";
import { createAuthGuard } from "./src/middleware/auth-guard.js";
import { getSchedulerDaemon } from "./src/schedulers/scheduler-daemon.js";
import { getPollerDaemon } from "./src/schedulers/poller-daemon.js";
import { getLogCleanupJob } from "./src/core/log-cleanup-job.js";
import { FlowVersionManager } from "./src/versioning/flow-version-manager.js";
import { TenantQuotaManager } from "./src/core/tenant-quotas.js";
import { initFlowDSLAPI } from "./src/routes/flow-dsl-api.js";
import { initFlowVersioningAPI } from "./src/routes/flow-versioning-api.js";
import { DynamicWebhookRouter } from "./src/http/dynamic-webhook-router.js";

const log = logger.child("Server");

export async function registerRoutes(app: Express): Promise<Server> {
  try {
    // Initialize database tables
    await ensureTables();
    
    // Seed default hierarchy (Account → Tenant → Ecosystem → Environment → System Instance)
    await seedDefaultHierarchy();
    
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

    // Initialize outbound token provider (singleton for flow executors)
    initializeOutboundTokenProvider(storage, tokenLifecycle, secretsService);

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
    
    // Initialize Flow Version Manager for semantic versioning
    const versionManager = new FlowVersionManager(storage);
    
    // Initialize Tenant Quota Manager for multi-tenant resource limits
    const quotaManager = new TenantQuotaManager(storage);
    
    // Initialize Dynamic Webhook Router for hot-reload webhook endpoints
    const webhookRouter = new DynamicWebhookRouter(storage, orchestrator);
    await webhookRouter.syncFromDatabase();
    log.info("Dynamic webhook router initialized");

    // Create pipeline instance with flow support
    const pipeline = new Pipeline({ orchestrator });

    // Register REST API routes with storage and webhook router
    registerRESTRoutes(app, pipeline, orchestrator, storage, webhookRouter);

    // Create auth guard for protecting management endpoints
    // For MVP: Auth guard disabled in development mode to allow Settings UI access
    // TODO: Enable in production with proper session/API key validation
    const authGuard = process.env.NODE_ENV === "production" ? createAuthGuard() : undefined;

    // Register auth adapter and policy routes with optional auth guard
    registerAuthRoutes(app, storage, tokenLifecycle, secretsService, reloadPolicies, authGuard);

    // Register WAF configuration routes
    const wafConfigRouter = (await import("./src/routes/waf-config.js")).default;
    app.use("/api/waf", wafConfigRouter);

    // Register stage promotion routes
    const stagePromotionRouter = (await import("./src/routes/stage-promotion.js")).default;
    app.use("/api/stages", stagePromotionRouter);

    // Register customer database provisioning routes
    const customerDatabaseRouter = (await import("./src/routes/customer-database.js")).default;
    app.use("/api/customer-databases", customerDatabaseRouter);

    // Register license management routes
    const licenseRouter = (await import("./src/routes/license.js")).default;
    app.use("/api/license", licenseRouter);

    // Register institutional page generator routes
    const institutionalPageRouter = (await import("./src/routes/institutional-page.js")).default;
    app.use("/api/institutional-page", institutionalPageRouter);

    // Register wiki routes (role-based documentation access)
    const wikiRouter = (await import("./src/routes/wiki.js")).default;
    app.use("/api/wiki", wikiRouter);

    // Register founder user management routes
    const founderUserRouter = (await import("./src/routes/founder-user-management.js")).default;
    app.use("/api/founder", founderUserRouter);

    // Register enrollment routes (public - no auth required)
    const enrollmentRouter = (await import("./src/routes/enrollment.js")).default;
    app.use("/api/enrollment", enrollmentRouter);

    // Register QA tracking routes (QA team + founders)
    const qaTrackingRouter = (await import("./src/routes/qa-tracking.js")).default;
    app.use("/api/qa", qaTrackingRouter);
    
    // Register Flow DSL API routes (YAML/JSON import/export)
    const flowDslRouter = initFlowDSLAPI(storage, quotaManager);
    app.use("/api/flows", flowDslRouter);
    
    // Register Flow Versioning API routes (version management, approval, rollback)
    const flowVersioningRouter = initFlowVersioningAPI(storage, versionManager, quotaManager);
    app.use("/api/flows", flowVersioningRouter);
    
    // Register Dynamic Webhook Router (hot-reload endpoints)
    app.use("/api/webhook", webhookRouter.createRouter());
    log.info("Dynamic webhook endpoints registered");

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

    // Initialize and start scheduler daemon (for cron-based flows)
    const schedulerDaemon = getSchedulerDaemon(orchestrator);
    await schedulerDaemon.start();
    log.info("Scheduler daemon started");

    // Initialize and start poller daemon (for SFTP/Blob pollers)
    const pollerDaemon = getPollerDaemon(orchestrator);
    pollerDaemon.start();
    log.info("Poller daemon started");

    // Initialize and start log cleanup job (runs every hour)
    const logCleanupJob = getLogCleanupJob(60); // 60 minutes interval
    logCleanupJob.start();
    log.info("Log cleanup job started (runs every 60 minutes)");

    log.info("All routes and services registered successfully");

    const httpServer = createServer(app);
    return httpServer;
  } catch (error) {
    log.error("Failed to register routes", error);
    throw error;
  }
}
