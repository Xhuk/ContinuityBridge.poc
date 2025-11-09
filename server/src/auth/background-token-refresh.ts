import cron, { type ScheduledTask } from "node-cron";
import type { IStorage } from "../../storage";
import { TokenLifecycleService } from "./token-lifecycle-service";
import { SecretsService } from "../secrets/secrets-service";
import { OAuth2Adapter } from "./adapters/oauth2-adapter";
import { JWTAdapter } from "./adapters/jwt-adapter";
import { CookieAdapter } from "./adapters/cookie-adapter";
import type { BaseAuthAdapter } from "./base-auth-adapter";
import { logger } from "../core/logger.js";

const log = logger.child("BackgroundTokenRefresh");

/**
 * BackgroundTokenRefreshJob
 * 
 * Runs every 1 minute to scan for tokens expiring within 5 minutes
 * and preemptively refreshes them to prevent 401/403 errors during active operations.
 * 
 * Benefits:
 * - Prevents token expiration during active operations
 * - Reduces 401/403 errors and retries
 * - Improves system reliability
 * 
 * Flow:
 * 1. Get tokens expiring in <5min from TokenLifecycleService
 * 2. For each token, get the adapter configuration
 * 3. Create adapter instance
 * 4. Trigger refresh via adapter.refreshToken()
 * 5. Log outcome (success/failure)
 */
export class BackgroundTokenRefreshJob {
  private cronJob: ScheduledTask | null = null;
  private isRunning = false;

  constructor(
    private storage: IStorage,
    private tokenLifecycle: TokenLifecycleService,
    private secretsService: SecretsService,
    private refreshIntervalMinutes: number = 1,
    private expiryThresholdMinutes: number = 5
  ) {}

  /**
   * Start the background refresh job
   */
  start(): void {
    if (this.cronJob) {
      log.warn("Background token refresh job already running");
      return;
    }

    // Run every N minutes (default: 1 minute)
    // Cron format: "*/N * * * *" = every N minutes
    const cronExpression = `*/${this.refreshIntervalMinutes} * * * *`;

    this.cronJob = cron.schedule(cronExpression, async () => {
      if (this.isRunning) {
        log.debug("Previous refresh job still running, skipping this iteration");
        return;
      }

      this.isRunning = true;
      try {
        await this.refreshExpiringSoonTokens();
      } catch (error: any) {
        log.error("Error in background token refresh job", { error: error.message });
      } finally {
        this.isRunning = false;
      }
    });

    log.info("Background token refresh job started", {
      intervalMinutes: this.refreshIntervalMinutes,
      expiryThresholdMinutes: this.expiryThresholdMinutes,
    });
  }

  /**
   * Stop the background refresh job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      log.info("Background token refresh job stopped");
    }
  }

  /**
   * Refresh tokens that are expiring soon
   */
  private async refreshExpiringSoonTokens(): Promise<void> {
    try {
      // Get tokens expiring in <N minutes
      const expiringTokens = await this.tokenLifecycle.getExpiringSoonTokens(
        this.expiryThresholdMinutes
      );

      if (expiringTokens.length === 0) {
        log.debug("No tokens expiring soon");
        return;
      }

      log.info("Found tokens expiring soon", { count: expiringTokens.length });

      // Refresh each token
      const results = await Promise.allSettled(
        expiringTokens.map((token) => this.refreshToken(token))
      );

      // Count successes and failures
      const successes = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter((r) => r.status === "rejected").length;

      log.info("Background token refresh completed", {
        total: expiringTokens.length,
        successes,
        failures,
      });

      // Log all outcomes (success and failure) and add to audit log
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const token = expiringTokens[i];

        if (result.status === "fulfilled") {
          // Success - token refreshed (or was already valid)
          log.info("Token refresh completed successfully", {
            adapterId: token.adapterId,
            tokenType: token.tokenType,
          });

          // Add success to audit log
          await this.storage.addAuditLog?.({
            resourceType: "token_refresh",
            resourceId: token.id,
            action: "background_refresh_success",
            timestamp: new Date().toISOString(),
            metadata: { 
              adapterId: token.adapterId,
              tokenType: token.tokenType,
              expiresAt: token.expiresAt,
            },
          });
        } else {
          // Failure - token refresh failed
          log.error("Token refresh failed", {
            adapterId: token.adapterId,
            tokenType: token.tokenType,
            error: result.reason?.message || String(result.reason),
          });

          // Add failure to audit log
          await this.storage.addAuditLog?.({
            resourceType: "token_refresh",
            resourceId: token.id,
            action: "background_refresh_failed",
            timestamp: new Date().toISOString(),
            metadata: { 
              adapterId: token.adapterId,
              tokenType: token.tokenType,
              error: result.reason?.message || String(result.reason),
            },
          });
        }
      }
    } catch (error: any) {
      log.error("Error fetching expiring tokens", { error: error.message });
    }
  }

  /**
   * Refresh a single token
   */
  private async refreshToken(token: any): Promise<void> {
    try {
      // Get adapter configuration
      if (!this.storage.getAuthAdapter) {
        throw new Error("Auth adapter storage not available");
      }

      const adapterConfig = await this.storage.getAuthAdapter(token.adapterId);
      if (!adapterConfig) {
        throw new Error(`Adapter not found: ${token.adapterId}`);
      }

      // Create adapter instance
      const adapter = await this.createAdapter(adapterConfig);
      if (!adapter) {
        throw new Error(`Failed to create adapter for type: ${adapterConfig.type}`);
      }

      // Trigger refresh (delegated to adapter)
      // Note: Audit logging happens in the caller based on Promise.allSettled results
      await adapter.refreshToken();
    } catch (error: any) {
      log.error("Token refresh failed", {
        adapterId: token.adapterId,
        tokenType: token.tokenType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create adapter instance from configuration
   */
  private async createAdapter(config: any): Promise<BaseAuthAdapter | null> {
    switch (config.type) {
      case "oauth2":
        return new OAuth2Adapter(config, this.storage, this.tokenLifecycle, this.secretsService);
      case "jwt":
        return new JWTAdapter(config, this.storage, this.tokenLifecycle, this.secretsService);
      case "cookie":
        return new CookieAdapter(config, this.storage, this.tokenLifecycle, this.secretsService);
      default:
        log.warn("Unknown adapter type", { type: config.type });
        return null;
    }
  }
}
