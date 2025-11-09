import type { TokenLifecycleService } from "./token-lifecycle-service";
import { logger } from "../core/logger.js";

const log = logger.child("AuthErrorHandler");

export interface AuthErrorContext {
  adapterId: number;
  interfaceId?: number;
  operation?: string;
}

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public context: AuthErrorContext,
    public retriable: boolean = true
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

/**
 * AuthErrorHandler wraps outbound HTTP calls and handles authentication errors.
 * 
 * Flow:
 * 1. Execute HTTP request
 * 2. If 401/403 received:
 *    - Invalidate cached token
 *    - Trigger refresh via adapter
 *    - Throw AuthenticationError (RetryManager will requeue)
 * 3. If refresh succeeds on retry, request will have fresh token
 */
export class AuthErrorHandler {
  constructor(
    private tokenLifecycle: TokenLifecycleService
  ) {}

  /**
   * Wrap an HTTP request with automatic auth error handling
   * 
   * @param fn - Function that makes the HTTP request
   * @param context - Context about which adapter to refresh
   * @returns Result of the HTTP request
   * @throws AuthenticationError on 401/403 (retriable)
   */
  async wrapRequest<T>(
    fn: () => Promise<T>,
    context: AuthErrorContext
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      // Check if this is an HTTP auth error
      const statusCode = error.response?.status || error.statusCode || error.status;
      
      if (statusCode === 401 || statusCode === 403) {
        log.warn("Authentication error detected", {
          statusCode,
          adapterId: context.adapterId,
          interfaceId: context.interfaceId,
          operation: context.operation,
        });

        // Invalidate cached token
        await this.handleAuthError(context);

        // Throw retriable error for RetryManager
        throw new AuthenticationError(
          `Authentication failed with ${statusCode}: ${error.message || 'Unauthorized'}`,
          statusCode,
          context,
          true // retriable
        );
      }

      // Not an auth error, re-throw as-is
      throw error;
    }
  }

  /**
   * Handle authentication error by invalidating stale token.
   * 
   * Note: We do NOT attempt immediate refresh here because:
   * 1. Adapter creation requires hydrated secrets (not available from raw DB config)
   * 2. Token refresh will happen automatically on retry via normal token provision flow
   * 3. TokenLifecycleService.getValidToken() → refreshTokenWithLock() handles refresh
   * 
   * Flow:
   * - Invalidate stale token
   * - Throw retriable error (RetryManager requeues)
   * - On retry: Token provision flow detects no cached token → triggers refresh
   */
  private async handleAuthError(context: AuthErrorContext): Promise<void> {
    try {
      // Invalidate cached token (forces refresh on next request)
      await this.tokenLifecycle.invalidateToken(String(context.adapterId));
      log.info("Invalidated stale token - refresh will occur on retry", { 
        adapterId: context.adapterId 
      });
    } catch (error: any) {
      log.error("Error invalidating token", {
        adapterId: context.adapterId,
        error: error.message,
      });
      // Don't throw - let RetryManager handle retry even if invalidation fails
    }
  }

  /**
   * Check if an error is a retriable authentication error
   */
  static isAuthError(error: any): error is AuthenticationError {
    return error instanceof AuthenticationError && error.retriable;
  }

  /**
   * Extract auth context from error for logging/debugging
   */
  static getContext(error: any): AuthErrorContext | null {
    if (error instanceof AuthenticationError) {
      return error.context;
    }
    return null;
  }
}
