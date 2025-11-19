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
import { getDeploymentBuildScheduler } from "./src/schedulers/deployment-build-scheduler.js";
import { getLogCleanupJob } from "./src/core/log-cleanup-job.js";
import { getHealthMonitor } from "./src/core/health-monitor.js";
import { FlowVersionManager } from "./src/versioning/flow-version-manager.js";
import { TenantQuotaManager } from "./src/core/tenant-quotas.js";
import { initFlowDSLAPI } from "./src/routes/flow-dsl-api.js";
import { initFlowVersioningAPI } from "./src/routes/flow-versioning-api.js";
import { DynamicWebhookRouter } from "./src/http/dynamic-webhook-router.js";
import { initializeRedis } from "./src/middleware/rate-limiter.js";
import { codeProtection } from "./src/security/code-protection.js";
import { initializeUpdateAgent } from "./src/updates/remote-update-agent.js";

const log = logger.child("Server");

export async function registerRoutes(app: Express): Promise<Server> {
  try {
    // Initialize Valkey/Redis connection (optional - gracefully falls back to in-memory)
    initializeRedis();
    
    // Initialize code protection (production only)
    if (process.env.NODE_ENV === "production") {
      await codeProtection.initializeIntegrityChecks();
      codeProtection.startPeriodicChecks(60); // Check every hour
      log.info("Code protection enabled (integrity checks + tamper detection)");
    }
    
    // Initialize remote update agent (customer environments only)
    const isCustomerDeployment = process.env.VITE_DEPLOYMENT_TYPE === "customer";
    const remoteUpdatesEnabled = process.env.REMOTE_UPDATES_ENABLED === "true";
    
    if (isCustomerDeployment && remoteUpdatesEnabled) {
      const updateAgent = initializeUpdateAgent({
        enabled: true,
        founderPlatformUrl: process.env.FOUNDER_PLATFORM_URL || "https://continuitybridge.onrender.com",
        organizationId: process.env.ORGANIZATION_ID || "default",
        apiKey: process.env.SUPERADMIN_API_KEY || "",
        environment: (process.env.ENVIRONMENT || "dev") as any,
        autoUpdate: process.env.AUTO_UPDATE === "true",
        updateChannel: (process.env.UPDATE_CHANNEL || "stable") as any,
        checkIntervalHours: parseInt(process.env.UPDATE_CHECK_INTERVAL_HOURS || "24"),
      });
      
      log.info("Remote update agent initialized", {
        platform: process.env.FOUNDER_PLATFORM_URL,
        environment: process.env.ENVIRONMENT,
        autoUpdate: process.env.AUTO_UPDATE === "true",
      });
    }
    
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

    // Register System Health routes (superadmin/consultant/customer_admin)
    const systemHealthRouter = (await import("./src/routes/system-health-routes.js")).default;
    app.use("/api/admin/system-health", systemHealthRouter);
    
    // Register Cache Management routes (superadmin)
    const cacheRouter = (await import("./src/routes/cache-routes.js")).default;
    app.use("/api/admin/cache", cacheRouter);
    
    // Register Test Alert routes (superadmin)
    const testAlertRouter = (await import("./src/routes/test-alert.js")).default;
    app.use("/api/admin/test-alert", testAlertRouter);
    
    // Register TestSprite Integration routes
    const testspriteRouter = (await import("./src/routes/testsprite-integration.js")).default;
    app.use("/api/testsprite", testspriteRouter);
    
    // Register Flow DSL API routes (YAML/JSON import/export)
    const flowDslRouter = initFlowDSLAPI(storage, quotaManager);
    app.use("/api/flows", flowDslRouter);
    
    // Register Flow Versioning API routes (version management, approval, rollback)
    const flowVersioningRouter = initFlowVersioningAPI(storage, versionManager, quotaManager);
    app.use("/api/flows", flowVersioningRouter);
    
    // Register Dynamic Webhook Router (hot-reload endpoints)
    app.use("/api/webhook", webhookRouter.createRouter());
    
    // Register BridgeScript API routes (code editor + validation)
    const bridgescriptRouter = (await import("./src/routes/bridgescript.js")).default;
    app.use("/api/bridgescript", bridgescriptRouter);
    
    // Register Deployment Download routes (local storage access)
    const deploymentDownloadRouter = (await import("./src/routes/deployment-download.js")).default;
    app.use("/api/deployments", deploymentDownloadRouter);
    
    // Register Storage Statistics routes (founder only)
    const storageStatsRouter = (await import("./src/routes/storage-stats.js")).default;
    app.use("/api/admin/storage", storageStatsRouter);
    
    // Register Layered Storage routes (BASE + CUSTOM override system)
    const layeredStorageRouter = (await import("./src/routes/layered-storage.js")).default;
    app.use("/api/layered-storage", layeredStorageRouter);
    log.info("Layered storage (override system) registered");
    
    log.info("Dynamic webhook endpoints registered");
    
    // Register Remote Updates API (Founder platform only)
    if (process.env.VITE_DEPLOYMENT_TYPE === "platform") {
      const updatesRouter = (await import("./src/routes/updates.js")).default;
      app.use("/api/updates", updatesRouter);
      log.info("Remote updates API registered (founder platform)");
      
      // Register Package Builder API (Founder platform only)
      const packageBuilderRouter = (await import("./src/routes/package-builder.js")).default;
      app.use("/api/package", packageBuilderRouter);
      log.info("Package builder API registered (founder platform)");
          
      // Register Plugins API (all environments)
      const pluginsRouter = (await import("./src/routes/plugins.js")).default;
      app.use("/api/plugins", pluginsRouter);
      log.info("Plugins API registered");
      
      // Register Kubernetes Release Generator (Founder platform only)
      const k8sReleaseRouter = (await import("./src/routes/kubernetes-release.js")).default;
      app.use("/api/releases", k8sReleaseRouter);
      log.info("Kubernetes release API registered (founder platform)");
      
      // Register Binary Release Generator (Founder platform only)
      const binaryReleaseRouter = (await import("./src/routes/binary-release.js")).default;
      app.use("/api/releases", binaryReleaseRouter);
      log.info("Binary release API registered (founder platform)");
      
      // Register Resource Calculator (Founder platform only)
      const calculatorRouter = (await import("./src/routes/resource-calculator-api.js")).default;
      app.use("/api/calculator", calculatorRouter);
      log.info("Resource calculator API registered (founder platform)");
    }

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

    // Initialize and start deployment build scheduler (daily at 2 AM)
    const deploymentBuildScheduler = getDeploymentBuildScheduler();
    deploymentBuildScheduler.start();
    log.info("Deployment build scheduler started (daily at 2:00 AM UTC)");

    // Initialize and start log cleanup job (runs every hour)
    const logCleanupJob = getLogCleanupJob(60); // 60 minutes interval
    logCleanupJob.start();
    log.info("Log cleanup job started (runs every 60 minutes)");

    // Initialize and start health monitor (checks every 5 minutes)
    const healthMonitor = getHealthMonitor({
      enabled: process.env.HEALTH_MONITORING_ENABLED !== "false",
      emailRecipients: process.env.HEALTH_ALERT_EMAILS?.split(",") || [],
      checkIntervalMinutes: parseInt(process.env.HEALTH_CHECK_INTERVAL_MINUTES || "5"),
      thresholds: {
        errorRatePerMinute: parseInt(process.env.HEALTH_ERROR_THRESHOLD || "10"),
        p95LatencyMs: parseInt(process.env.HEALTH_LATENCY_THRESHOLD || "5000"),
        memoryUsagePercent: parseInt(process.env.HEALTH_MEMORY_THRESHOLD || "85"),
        diskUsagePercent: parseInt(process.env.HEALTH_DISK_THRESHOLD || "90"),
      },
    });
    healthMonitor.start();
    log.info("Health monitor started (checks every 5 minutes)");

    // Register Prometheus metrics exporter
    const prometheusRouter = (await import("./src/monitoring/prometheus-exporter.js")).default;
    app.use("/", prometheusRouter); // Exposes /metrics and /health
    log.info("Prometheus metrics exporter registered at /metrics");

    // Register AI Expert Advisors (Founder only - multi-AI consensus)
    const aiExpertsRouter = (await import("./src/routes/ai-experts.js")).default;
    app.use("/api/ai", aiExpertsRouter);
    log.info("AI Expert Advisors registered (Founder only)");
    
    // Register Mock Systems API (Demo environment only)
    const mockSystemsRouter = (await import("./src/routes/mock-systems.js")).default;
    app.use("/api/mock", mockSystemsRouter);
    log.info("Mock Systems API registered (Demo/Testing)");

    log.info("All routes and services registered successfully");

    const httpServer = createServer(app);
    return httpServer;
  } catch (error) {
    log.error("Failed to register routes", error);
    throw error;
  }
}
