import { randomBytes } from 'crypto';
import { BaseAuthAdapter, type InboundAuthResult, type OutboundAuthResult } from "../base-auth-adapter";
import type { CookieSecret } from '../../secrets/secret-validator';

/**
 * CookieAdapter
 * 
 * Implements cookie-based session authentication:
 * - Outbound: Generates session cookies with configurable options
 * - Inbound: Validates cookies and tracks idle timeout
 * - Session Management: 1-hour idle timeout, automatic renewal on activity
 * - Security: httpOnly, secure, sameSite support
 * 
 * Session cookies are stored in token cache with:
 * - expiresAt: Hard expiration (24 hours default)
 * - lastUsedAt: For idle timeout tracking (60 minutes default)
 * 
 * Limitations (MVP):
 * - Single session per adapter/scope (new login overwrites previous session)
 * - Cookie secret stored but not used for signing (opaque session ID approach)
 * - Multi-device concurrent sessions deferred to future enhancement
 * - userId must be set in sessionData by application layer after session creation
 *   (adapter generates session but doesn't know user identity until login succeeds)
 */
export class CookieAdapter extends BaseAuthAdapter {
  private readonly DEFAULT_IDLE_TIMEOUT_MINUTES = 60; // 1 hour
  private readonly DEFAULT_MAX_AGE_HOURS = 24; // 24 hours

  /**
   * Load cookie credentials from vault
   */
  protected async hydrateCredentials(): Promise<void> {
    if (!this.adapter.secretId) {
      throw new Error('No secret configured for Cookie adapter');
    }

    // Retrieve encrypted secret from vault
    const secret = await this.storage.getSecret?.(this.adapter.secretId);
    if (!secret) {
      throw new Error(`Secret not found: ${this.adapter.secretId}`);
    }

    // Decrypt secret payload
    const payload = await this.secretsService.retrieveSecret(secret) as CookieSecret;

    // Validate cookie credentials
    if (!payload.cookieSecret) {
      throw new Error('Cookie adapter requires cookieSecret');
    }

    this.credentials = {
      cookieSecret: payload.cookieSecret,
      cookieName: payload.cookieName || 'session',
      domain: payload.domain,
      path: payload.path || '/',
      httpOnly: payload.httpOnly !== false, // Default true
      secure: payload.secure !== false,     // Default true
      sameSite: payload.sameSite || 'lax',
    };
  }

  /**
   * Generate fresh session cookie
   */
  protected async fetchFreshToken(): Promise<{
    accessToken: string;
    expiresIn?: number;
    sessionData?: Record<string, unknown>;
  }> {
    if (!this.credentials) {
      await this.hydrateCredentials();
    }

    // Generate cryptographically secure session ID
    const sessionId = randomBytes(32).toString('hex');

    // Use default max age (24 hours)
    const expiresIn = this.DEFAULT_MAX_AGE_HOURS * 3600; // Convert hours to seconds

    // Session metadata
    const sessionData = {
      sessionId,
      createdAt: new Date().toISOString(),
      idleTimeoutMinutes: this.DEFAULT_IDLE_TIMEOUT_MINUTES,
    };

    return {
      accessToken: sessionId,
      expiresIn,
      sessionData,
    };
  }

  /**
   * Validate cookie session (inbound)
   * 
   * Uses TokenLifecycleService.getValidToken() which automatically:
   * - Updates lastUsedAt (for idle timeout tracking)
   * - Checks hard expiration and idle timeout
   * - Returns null if session is expired or invalid
   * 
   * Note: userId must be set in sessionData by application layer after session creation.
   * The adapter generates a session ID but doesn't know user identity until login succeeds.
   */
  protected async validateTokenFormat(token: string): Promise<InboundAuthResult> {
    // Cookie validation - verify it's a valid session ID format
    if (!token || token.length < 16) {
      return {
        valid: false,
        error: 'Invalid session cookie format',
      };
    }

    // Use TokenLifecycleService to get valid token (automatically updates lastUsedAt)
    // Pass idle timeout for session expiration checking
    const validToken = await this.tokenLifecycle.getValidToken(
      this.adapter.id,
      'access',
      this.getScope() || undefined,
      this.DEFAULT_IDLE_TIMEOUT_MINUTES  // ✅ Idle timeout enforcement
    );

    if (!validToken) {
      return {
        valid: false,
        error: 'Session not found or expired',
      };
    }

    // Verify session ID matches
    if (validToken.token !== token) {
      return {
        valid: false,
        error: 'Session ID mismatch',
      };
    }

    // Extract session data if available
    let sessionData: Record<string, unknown> = {};
    if (validToken.sessionData) {
      sessionData = validToken.sessionData;
    }

    return {
      valid: true,
      userId: sessionData.userId as string,
      metadata: {
        sessionId: token,
        ...sessionData,
      },
    };
  }

  /**
   * Apply cookie to outbound response
   */
  protected async applyOutbound(token: string, targetUrl?: string): Promise<OutboundAuthResult> {
    const outboundConfig = this.adapter.config.outbound;

    const cookieName = outboundConfig?.cookieName || this.credentials.cookieName;
    const domain = this.credentials.domain;
    const path = this.credentials.path;
    const maxAgeHours = this.DEFAULT_MAX_AGE_HOURS;

    // Cookie options from config or credentials
    const httpOnly = outboundConfig?.cookieOptions?.httpOnly ?? this.credentials.httpOnly;
    const secure = outboundConfig?.cookieOptions?.secure ?? this.credentials.secure;
    const sameSite = outboundConfig?.cookieOptions?.sameSite || this.credentials.sameSite;

    // Build cookie value with options
    const cookieOptions: string[] = [`${cookieName}=${token}`];

    if (domain) cookieOptions.push(`Domain=${domain}`);
    if (path) cookieOptions.push(`Path=${path}`);
    if (maxAgeHours) cookieOptions.push(`Max-Age=${maxAgeHours * 3600}`);
    if (httpOnly) cookieOptions.push('HttpOnly');
    if (secure) cookieOptions.push('Secure');
    if (sameSite) cookieOptions.push(`SameSite=${this.capitalizeFirst(sameSite)}`);

    return {
      cookies: {
        [cookieName]: token,
      },
      headers: {
        'Set-Cookie': cookieOptions.join('; '),
      },
    };
  }

  /**
   * Capitalize first letter (for SameSite)
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
