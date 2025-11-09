import type { IStorage } from "../../storage";
import { TokenLifecycleService } from "./token-lifecycle-service";
import { SecretsService } from "../secrets/secrets-service";
import type { OutboundAuthResult } from "./base-auth-adapter";
import { OAuth2Adapter } from "./adapters/oauth2-adapter";
import { JWTAdapter } from "./adapters/jwt-adapter";
import { CookieAdapter } from "./adapters/cookie-adapter";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "OutboundTokenProvider" });

/**
 * OutboundTokenProvider
 * 
 * Provides fresh authentication tokens for outbound API calls.
 * Used by interface operations and queue workers to automatically
 * inject authentication into external requests.
 * 
 * Features:
 * - Automatic token refresh if expired
 * - Supports OAuth2, JWT, and Cookie authentication
 * - Returns token with placement metadata (header/query/body/cookie)
 */
export class OutboundTokenProvider {
  constructor(
    private storage: IStorage,
    private tokenLifecycle: TokenLifecycleService,
    private secretsService: SecretsService
  ) {}

  /**
   * Provide authentication for outbound request
   * 
   * @param adapterId - ID of the auth adapter to use
   * @param targetUrl - Optional target URL for context-specific auth
   * @returns Authentication data (headers, cookies, query params, or body fields)
   */
  async provideAuth(adapterId: string, targetUrl?: string): Promise<OutboundAuthResult> {
    log.info("Providing outbound authentication", { adapterId, targetUrl });

    // 1. Get adapter configuration
    const adapterConfig = await this.storage.getAuthAdapter?.(adapterId);
    if (!adapterConfig) {
      throw new Error(`Auth adapter not found: ${adapterId}`);
    }

    // 2. Create adapter instance
    const adapter = await this.createAdapter(adapterConfig);

    // 3. Call provideOutbound - handles token caching and refresh internally
    const authResult = await adapter.provideOutbound(targetUrl);

    log.info("Authentication provided successfully", { 
      adapterId,
      hasHeaders: !!authResult.headers,
      hasCookies: !!authResult.cookies,
      hasQueryParams: !!authResult.queryParams,
      hasBodyFields: !!authResult.bodyFields,
    });

    return authResult;
  }

  /**
   * Handle authentication failure (401/403)
   * 
   * Call this when an outbound request fails with 401 or 403.
   * Invalidates cached tokens and signals that the caller should retry.
   * 
   * @param adapterId - ID of the auth adapter
   * @returns True if caller should retry (token invalidated), false otherwise
   */
  async handleAuthError(adapterId: string): Promise<boolean> {
    log.warn("Handling authentication error", { adapterId });

    try {
      // Invalidate all tokens for this adapter
      // This ensures next provideAuth() will fetch fresh tokens
      await this.tokenLifecycle.invalidateToken(adapterId);

      log.info("Cached tokens invalidated, caller should retry", { adapterId });
      return true; // Signal to retry
    } catch (error: any) {
      log.error("Failed to invalidate tokens", { 
        adapterId, 
        error: error.message 
      });
      return false; // Don't retry if invalidation failed
    }
  }

  /**
   * Create adapter instance from configuration
   */
  private async createAdapter(config: any): Promise<OAuth2Adapter | JWTAdapter | CookieAdapter> {
    switch (config.type) {
      case "oauth2":
        return new OAuth2Adapter(
          config,
          this.storage,
          this.tokenLifecycle,
          this.secretsService
        );

      case "jwt":
        return new JWTAdapter(
          config,
          this.storage,
          this.tokenLifecycle,
          this.secretsService
        );

      case "cookie":
        return new CookieAdapter(
          config,
          this.storage,
          this.tokenLifecycle,
          this.secretsService
        );

      default:
        throw new Error(`Unsupported adapter type: ${config.type}`);
    }
  }
}
