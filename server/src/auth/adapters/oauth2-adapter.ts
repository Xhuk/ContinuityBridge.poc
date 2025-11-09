import { BaseAuthAdapter, type InboundAuthResult, type OutboundAuthResult } from "../base-auth-adapter";

/**
 * OAuth2Adapter
 * 
 * Implements OAuth2 authentication flows per RFC 6749:
 * - Outbound: client_credentials grant for machine-to-machine
 * - Outbound: refresh_token grant for token renewal
 * - Inbound: Token introspection (optional) or opaque token validation
 * 
 * Supports automatic token refresh before expiration.
 */
export class OAuth2Adapter extends BaseAuthAdapter {
  /**
   * Load OAuth2 credentials from vault
   */
  protected async hydrateCredentials(): Promise<void> {
    if (!this.adapter.secretId) {
      throw new Error('No secret configured for OAuth2 adapter');
    }

    // Retrieve encrypted secret from vault
    const secret = await this.storage.getSecret?.(this.adapter.secretId);
    if (!secret) {
      throw new Error(`Secret not found: ${this.adapter.secretId}`);
    }

    // Decrypt secret payload
    const payload = await this.secretsService.retrieveSecret(
      secret.id,
      async (id) => await this.storage.getSecret?.(id)
    );

    // Validate OAuth2 credentials
    if (!payload.clientId || !payload.clientSecret || !payload.tokenUrl) {
      throw new Error('Invalid OAuth2 credentials - missing clientId, clientSecret, or tokenUrl');
    }

    this.credentials = {
      clientId: payload.clientId,
      clientSecret: payload.clientSecret,
      tokenUrl: payload.tokenUrl,
      authorizationUrl: payload.authorizationUrl,
      scope: payload.scope,
      audience: payload.audience,
    };
  }

  /**
   * Fetch fresh OAuth2 token using client_credentials or refresh_token grant
   */
  protected async fetchFreshToken(): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    sessionData?: Record<string, unknown>;
  }> {
    if (!this.credentials) {
      await this.hydrateCredentials();
    }

    const outboundConfig = this.adapter.config.outbound;
    const grantType = outboundConfig?.grantType || 'client_credentials';

    // Check if we have a refresh token in cache
    const cachedRefreshToken = await this.getCachedRefreshToken();

    if (cachedRefreshToken && grantType === 'refresh_token') {
      return this.refreshWithRefreshToken(cachedRefreshToken);
    }

    // Fall back to client_credentials grant
    return this.fetchWithClientCredentials();
  }

  /**
   * Fetch token using client_credentials grant
   */
  private async fetchWithClientCredentials(): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }> {
    const tokenUrl = this.credentials.tokenUrl;
    const scope = this.adapter.config.outbound?.scope || this.credentials.scope;
    const audience = this.adapter.config.outbound?.audience || this.credentials.audience;

    // Build form-encoded body
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
    });

    if (scope) params.append('scope', scope);
    if (audience) params.append('audience', audience);

    // Make token request
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth2 token request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in, // Seconds
    };
  }

  /**
   * Refresh token using refresh_token grant
   */
  private async refreshWithRefreshToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }> {
    const tokenUrl = this.credentials.tokenUrl;

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      refresh_token: refreshToken,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      // Refresh token expired or invalid, fall back to client_credentials
      return this.fetchWithClientCredentials();
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Keep old refresh token if not provided
      expiresIn: data.expires_in,
    };
  }

  /**
   * Get cached refresh token (if exists)
   * Note: refreshToken is stored alongside accessToken in the same "access" cache entry
   */
  private async getCachedRefreshToken(): Promise<string | null> {
    // Retrieve the "access" cache entry which also contains refreshToken
    const cached = await this.storage.getTokenCache?.(
      this.adapter.id,
      'access',  // Changed from 'refresh' to 'access'
      this.getScope()
    );

    if (!cached || !cached.refreshToken) {
      return null;
    }

    // Decrypt refresh token
    return await this.secretsService.decrypt(cached.refreshToken);
  }

  /**
   * Validate OAuth2 token (inbound)
   * 
   * For OAuth2, we can either:
   * 1. Use token introspection endpoint (if configured)
   * 2. Treat as opaque token and validate by calling a protected resource
   */
  protected async validateTokenFormat(token: string): Promise<InboundAuthResult> {
    const inboundConfig = this.adapter.config.inbound;

    // If introspection URL configured, use it
    if (inboundConfig?.introspectionUrl) {
      return this.introspectToken(token, inboundConfig.introspectionUrl);
    }

    // Otherwise, basic format validation (OAuth2 tokens are opaque)
    if (!token || token.length < 10) {
      return {
        valid: false,
        error: 'Invalid OAuth2 token format',
      };
    }

    return {
      valid: true,
      metadata: { tokenType: 'oauth2' },
    };
  }

  /**
   * Introspect OAuth2 token (RFC 7662)
   */
  private async introspectToken(token: string, introspectionUrl: string): Promise<InboundAuthResult> {
    if (!this.credentials) {
      await this.hydrateCredentials();
    }

    const params = new URLSearchParams({
      token,
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
    });

    const response = await fetch(introspectionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      return {
        valid: false,
        error: `Token introspection failed: ${response.status}`,
      };
    }

    const data = await response.json();

    if (!data.active) {
      return {
        valid: false,
        error: 'Token is not active',
      };
    }

    return {
      valid: true,
      userId: data.sub || data.username,
      metadata: {
        scope: data.scope,
        clientId: data.client_id,
        expiresAt: data.exp ? new Date(data.exp * 1000).toISOString() : undefined,
      },
    };
  }

  /**
   * Apply OAuth2 token to outbound request
   */
  protected async applyOutbound(token: string, targetUrl?: string): Promise<OutboundAuthResult> {
    const outboundConfig = this.adapter.config.outbound;
    const placement = outboundConfig?.placement || 'header';

    switch (placement) {
      case 'header':
        const headerName = outboundConfig?.headerName || 'Authorization';
        const headerPrefix = outboundConfig?.headerPrefix || 'Bearer ';
        return {
          headers: {
            [headerName]: `${headerPrefix}${token}`,
          },
        };

      case 'query':
        const queryParam = outboundConfig?.queryParam || 'access_token';
        return {
          queryParams: {
            [queryParam]: token,
          },
        };

      case 'body':
        const bodyField = outboundConfig?.bodyField || 'access_token';
        return {
          bodyFields: {
            [bodyField]: token,
          },
        };

      default:
        throw new Error(`Unsupported OAuth2 token placement: ${placement}`);
    }
  }
}
