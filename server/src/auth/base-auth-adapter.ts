import type { Request, Response } from "express";
import type { AuthAdapter } from "../schema";
import type { IStorage } from "../storage";
import { TokenLifecycleService } from "./token-lifecycle-service";
import { SecretsService } from "../secrets/secrets-service";

/**
 * Adapter result for inbound validation
 */
export interface InboundAuthResult {
  valid: boolean;
  error?: string;
  userId?: string; // Optional: extracted user ID from token
  metadata?: Record<string, unknown>; // Optional: token claims, scopes, etc.
}

/**
 * Adapter result for outbound token provisioning
 */
export interface OutboundAuthResult {
  headers?: Record<string, string>; // e.g., { "Authorization": "Bearer token" }
  cookies?: Record<string, string>; // e.g., { "session_id": "abc123" }
  queryParams?: Record<string, string>; // e.g., { "access_token": "xyz" }
  bodyFields?: Record<string, unknown>; // e.g., { "token": "xyz" }
}

/**
 * BaseAuthAdapter
 * 
 * Abstract base class for all authentication adapters (OAuth2, JWT, Cookie).
 * Provides common functionality for token lifecycle management, error handling,
 * and telemetry.
 * 
 * Concrete adapters must implement:
 * - hydrateCredentials(): Load and decrypt credentials from vault
 * - fetchFreshToken(): Obtain new token from auth provider
 * - validateTokenFormat(): Verify token structure/signature
 * - applyOutbound(): Apply token to outbound request
 */
export abstract class BaseAuthAdapter {
  protected credentials: any = null;
  protected lastError: string | null = null;

  constructor(
    protected adapter: AuthAdapter,
    protected storage: IStorage,
    protected tokenLifecycle: TokenLifecycleService,
    protected secretsService: SecretsService
  ) {}

  /**
   * Validate inbound request (called by Express middleware)
   */
  async validateInbound(req: Request): Promise<InboundAuthResult> {
    try {
      // Extract token from request based on adapter config
      const token = this.extractInboundToken(req);
      
      if (!token) {
        return {
          valid: false,
          error: "No authentication token provided",
        };
      }

      // Validate token format and signature
      const validation = await this.validateTokenFormat(token);
      
      if (!validation.valid) {
        return validation;
      }

      // Update lastUsedAt
      await this.updateLastUsed();

      return validation;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        error: this.lastError,
      };
    }
  }

  /**
   * Provide token for outbound request (called by OutboundTokenProvider)
   */
  async provideOutbound(targetUrl?: string): Promise<OutboundAuthResult> {
    try {
      // Get valid token (from cache or refresh)
      const tokenResult = await this.tokenLifecycle.getValidToken(
        this.adapter.id,
        'access',
        this.getScope()
      );

      let token: string;

      if (!tokenResult) {
        // No cached token, need to fetch fresh one
        await this.ensureCredentials();
        const refreshResult = await this.tokenLifecycle.refreshTokenWithLock(
          this.adapter.id,
          'access',
          this.getScope(),
          () => this.fetchFreshToken()
        );

        if (!refreshResult) {
          throw new Error("Token refresh in progress by another worker");
        }

        // Get the newly refreshed token
        const newToken = await this.tokenLifecycle.getValidToken(
          this.adapter.id,
          'access',
          this.getScope()
        );

        if (!newToken) {
          throw new Error("Failed to obtain token after refresh");
        }

        token = newToken.token;
      } else {
        token = tokenResult.token;
      }

      // Apply token to outbound request
      const result = await this.applyOutbound(token, targetUrl);

      // Update lastUsedAt
      await this.updateLastUsed();

      return result;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Manually refresh token (called by REST API or background job)
   */
  async refreshToken(): Promise<void> {
    await this.ensureCredentials();
    
    const success = await this.tokenLifecycle.refreshTokenWithLock(
      this.adapter.id,
      'access',
      this.getScope(),
      () => this.fetchFreshToken()
    );

    if (!success) {
      throw new Error("Token refresh already in progress");
    }
  }

  /**
   * Check if token is currently valid
   */
  async isTokenValid(): Promise<boolean> {
    return await this.tokenLifecycle.isTokenValid(
      this.adapter.id,
      'access',
      this.getScope()
    );
  }

  /**
   * Invalidate cached token (on 401/403 errors)
   */
  async invalidateToken(): Promise<void> {
    await this.tokenLifecycle.invalidateToken(
      this.adapter.id,
      'access',
      this.getScope()
    );
  }

  // ==========================================================================
  // Protected methods (to be overridden by concrete adapters)
  // ==========================================================================

  /**
   * Load and decrypt credentials from vault secret
   * Called once when adapter is first used
   */
  protected abstract hydrateCredentials(): Promise<void>;

  /**
   * Fetch fresh token from authentication provider
   * Called when token is missing or expired
   */
  protected abstract fetchFreshToken(): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number; // Seconds
    sessionData?: Record<string, unknown>;
  }>;

  /**
   * Validate token format and signature (inbound)
   * For JWT: verify signature
   * For OAuth2: introspect token
   * For Cookie: validate session data
   */
  protected abstract validateTokenFormat(token: string): Promise<InboundAuthResult>;

  /**
   * Apply token to outbound request
   * Different for each adapter type
   */
  protected abstract applyOutbound(token: string, targetUrl?: string): Promise<OutboundAuthResult>;

  /**
   * Get scope for token (OAuth2/JWT only)
   * Cookies return null
   */
  protected getScope(): string | undefined {
    return this.adapter.config.outbound?.scope;
  }

  // ==========================================================================
  // Private helper methods
  // ==========================================================================

  /**
   * Extract token from inbound request based on adapter config
   */
  private extractInboundToken(req: Request): string | null {
    const inbound = this.adapter.config.inbound;
    if (!inbound) return null;

    // Check header
    if (inbound.headerName) {
      const header = req.headers[inbound.headerName.toLowerCase()] as string;
      if (header) {
        const prefix = inbound.headerPrefix || '';
        return header.startsWith(prefix) ? header.slice(prefix.length).trim() : header;
      }
    }

    // Check cookie
    if (inbound.cookieName) {
      return req.cookies?.[inbound.cookieName] || null;
    }

    // Check query param
    if (inbound.queryParam) {
      return (req.query[inbound.queryParam] as string) || null;
    }

    // Check body field
    if (inbound.bodyField && req.body) {
      return req.body[inbound.bodyField] || null;
    }

    return null;
  }

  /**
   * Ensure credentials are loaded
   */
  private async ensureCredentials(): Promise<void> {
    if (!this.credentials) {
      await this.hydrateCredentials();
    }
  }

  /**
   * Update last used timestamp
   */
  private async updateLastUsed(): Promise<void> {
    await this.storage.updateAuthAdapter?.(this.adapter.id, {
      lastUsedAt: new Date().toISOString(),
    });
  }
}
