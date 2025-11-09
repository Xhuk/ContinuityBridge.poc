import type { IStorage } from "../../storage";
import type { TokenCache, AuthAdapter } from "../../schema";
import { SecretsService } from "../secrets/secrets-service";
import { randomUUID } from "crypto";

/**
 * TokenLifecycleService
 * 
 * Centralized service for token lifecycle management and refresh coordination.
 * Uses optimistic locking (compare-and-swap) to prevent race conditions when
 * multiple workers attempt to refresh the same token simultaneously.
 * 
 * Responsibilities:
 * - Get valid tokens (check expiration, return cached or refresh)
 * - Refresh tokens with optimistic locking (version-based CAS)
 * - Track token usage for cookie idle timeout
 * - Encrypt/decrypt tokens via SecretsService
 * 
 * Shared by:
 * - OutboundTokenProvider (provides tokens to workers/pipelines)
 * - Background refresh job (preemptive refresh)
 * - Auth adapters (delegate refresh logic)
 */
export class TokenLifecycleService {
  constructor(
    private storage: IStorage,
    private secretsService: SecretsService
  ) {}

  /**
   * Get a valid token for the given adapter.
   * If token is expired or doesn't exist, triggers refresh.
   * If refresh is already in flight, waits and retries.
   * 
   * @param idleTimeoutMinutes - Optional idle timeout in minutes (for cookie sessions)
   */
  async getValidToken(
    adapterId: string,
    tokenType: TokenCache['tokenType'] = 'access',
    scope?: string,
    idleTimeoutMinutes?: number
  ): Promise<{ token: string; expiresAt?: string; sessionData?: Record<string, unknown> } | null> {
    const cached = await this.storage.getTokenCache?.(adapterId, tokenType, scope);

    if (!cached) {
      // No cached token, needs refresh (will be handled by adapter)
      return null;
    }

    // Check if token is expired (hard expiration)
    if (cached.expiresAt && new Date(cached.expiresAt) <= new Date()) {
      // Token expired, invalidate and return null (adapter will refresh)
      await this.storage.deleteTokenCache?.(cached.id);
      return null;
    }

    // Check idle timeout (for cookie sessions)
    if (idleTimeoutMinutes && cached.lastUsedAt) {
      const lastUsed = new Date(cached.lastUsedAt);
      const now = new Date();
      const idleMinutes = (now.getTime() - lastUsed.getTime()) / (1000 * 60);

      if (idleMinutes > idleTimeoutMinutes) {
        // Session idle timeout exceeded, invalidate and return null
        await this.storage.deleteTokenCache?.(cached.id);
        return null;
      }
    }

    // Check if refresh is in flight (another worker is refreshing)
    if (cached.refreshInFlight) {
      const startedAt = cached.refreshStartedAt ? new Date(cached.refreshStartedAt) : null;
      const now = new Date();
      
      // If refresh stuck for >60 seconds, clear the flag
      if (startedAt && (now.getTime() - startedAt.getTime()) > 60000) {
        await this.storage.updateTokenCache?.(cached.id, {
          refreshInFlight: false,
          refreshStartedAt: null,
        });
      } else {
        // Refresh in flight, wait 500ms and retry
        await new Promise(resolve => setTimeout(resolve, 500));
        // ✅ Propagate idleTimeoutMinutes through recursive call
        return this.getValidToken(adapterId, tokenType, scope, idleTimeoutMinutes);
      }
    }

    // Decrypt token
    const decrypted = cached.accessToken 
      ? await this.secretsService.decrypt(cached.accessToken)
      : null;

    if (!decrypted) {
      return null;
    }

    // Update lastUsedAt for cookie idle timeout tracking
    await this.storage.updateTokenCache?.(cached.id, {
      lastUsedAt: new Date().toISOString(),
    });

    // Parse sessionData if present
    let sessionData: Record<string, unknown> | undefined;
    if (cached.sessionData) {
      try {
        sessionData = typeof cached.sessionData === 'string'
          ? JSON.parse(cached.sessionData)
          : cached.sessionData;
      } catch {
        // Ignore parse errors
        sessionData = undefined;
      }
    }

    return {
      token: decrypted,
      expiresAt: cached.expiresAt || undefined,
      sessionData,
    };
  }

  /**
   * Refresh token with optimistic locking (compare-and-swap).
   * 
   * Returns true if refresh succeeded, false if another worker won the race.
   * Adapter should call fetchFreshToken() to get new token data.
   */
  async refreshTokenWithLock(
    adapterId: string,
    tokenType: TokenCache['tokenType'],
    scope: string | undefined,
    fetchFreshToken: () => Promise<{
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number; // Seconds
      sessionData?: Record<string, unknown>;
    }>
  ): Promise<boolean> {
    // Get current cached token
    const cached = await this.storage.getTokenCache?.(adapterId, tokenType, scope);

    if (!cached) {
      // No existing token, create new cache entry with lock
      return this.createTokenCacheWithLock(adapterId, tokenType, scope, fetchFreshToken);
    }

    // Acquire lock using optimistic locking (CAS on version)
    const lockAcquired = await this.storage.updateTokenCacheOptimistic?.(
      cached.id,
      cached.version,
      {
        refreshInFlight: true,
        refreshStartedAt: new Date().toISOString(),
        version: cached.version + 1,
      }
    );

    if (!lockAcquired) {
      // Another worker won the race, they will handle refresh
      return false;
    }

    try {
      // Fetch fresh token from external auth provider
      const freshToken = await fetchFreshToken();

      // Encrypt tokens
      const encryptedAccessToken = await this.secretsService.encrypt(freshToken.accessToken);
      const encryptedRefreshToken = freshToken.refreshToken
        ? await this.secretsService.encrypt(freshToken.refreshToken)
        : null;

      // Calculate expiration time
      const expiresAt = freshToken.expiresIn
        ? new Date(Date.now() + freshToken.expiresIn * 1000).toISOString()
        : null;

      // Update cache with new token
      await this.storage.updateTokenCache?.(cached.id, {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken || cached.refreshToken,
        sessionData: freshToken.sessionData || cached.sessionData,
        expiresAt: expiresAt || cached.expiresAt,
        issuedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        refreshInFlight: false,
        refreshStartedAt: null,
        metadata: {
          ...cached.metadata,
          lastRefreshError: undefined,
        },
      });

      return true;
    } catch (error) {
      // Refresh failed, release lock and store error
      await this.storage.updateTokenCache?.(cached.id, {
        refreshInFlight: false,
        refreshStartedAt: null,
        metadata: {
          ...cached.metadata,
          lastRefreshError: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  /**
   * Create new token cache entry with initial lock
   */
  private async createTokenCacheWithLock(
    adapterId: string,
    tokenType: TokenCache['tokenType'],
    scope: string | undefined,
    fetchFreshToken: () => Promise<{
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      sessionData?: Record<string, unknown>;
    }>
  ): Promise<boolean> {
    try {
      // Fetch fresh token
      const freshToken = await fetchFreshToken();

      // Encrypt tokens
      const encryptedAccessToken = await this.secretsService.encrypt(freshToken.accessToken);
      const encryptedRefreshToken = freshToken.refreshToken
        ? await this.secretsService.encrypt(freshToken.refreshToken)
        : null;

      // Calculate expiration
      const expiresAt = freshToken.expiresIn
        ? new Date(Date.now() + freshToken.expiresIn * 1000).toISOString()
        : null;

      const now = new Date().toISOString();

      // Create new cache entry
      await this.storage.saveTokenCache?.({
        id: randomUUID(),
        adapterId,
        tokenType,
        scope: scope || null,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken || null,
        sessionData: freshToken.sessionData || null,
        expiresAt,
        lastUsedAt: now,
        issuedAt: now,
        version: 1,
        refreshInFlight: false,
        refreshStartedAt: null,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      });

      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Invalidate (delete) cached tokens for an adapter.
   * 
   * If tokenType and scope are provided, deletes only that specific token.
   * If tokenType/scope are omitted, deletes ALL tokens for the adapter (useful for auth errors).
   */
  async invalidateToken(adapterId: string, tokenType?: TokenCache['tokenType'], scope?: string): Promise<void> {
    if (tokenType !== undefined || scope !== undefined) {
      // Specific token requested
      const cached = await this.storage.getTokenCache?.(adapterId, tokenType, scope);
      if (cached) {
        await this.storage.deleteTokenCache?.(cached.id);
      }
    } else {
      // No specific token - delete ALL tokens for this adapter
      // This is useful when handling auth errors (401/403) where we don't know which token failed
      await this.storage.deleteTokenCacheByAdapter?.(adapterId);
    }
  }

  /**
   * Get tokens expiring soon (for background refresh job)
   */
  async getExpiringSoonTokens(minutesBeforeExpiry: number = 5): Promise<TokenCache[]> {
    return await this.storage.getExpiringSoonTokens?.(minutesBeforeExpiry) || [];
  }

  /**
   * Check if token is valid (not expired, not in refresh)
   */
  async isTokenValid(adapterId: string, tokenType?: TokenCache['tokenType'], scope?: string): Promise<boolean> {
    const cached = await this.storage.getTokenCache?.(adapterId, tokenType, scope);
    
    if (!cached) return false;
    if (cached.refreshInFlight) return false;
    if (cached.expiresAt && new Date(cached.expiresAt) <= new Date()) return false;
    
    return true;
  }
}
