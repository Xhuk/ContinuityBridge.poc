import { createSign, createVerify, createHmac, timingSafeEqual } from 'crypto';
import { BaseAuthAdapter, type InboundAuthResult, type OutboundAuthResult } from "../base-auth-adapter";
import type { JWTSecret } from '../../secrets/secret-validator';

/**
 * JWTAdapter
 * 
 * Implements JWT authentication with signing and verification:
 * - Outbound: Sign JWTs with configurable claims (iss, aud, exp, sub)
 * - Inbound: Verify JWT signature and validate claims
 * - Supports: HS256, HS512 (symmetric) and RS256, RS512 (asymmetric)
 * - Auto re-signs tokens before expiration
 * 
 * Key Rotation: Outbound includes kid in header. Inbound uses single key from
 * credentials (manual rotation via vault updates). Multi-key rotation support
 * deferred to future enhancement.
 */
export class JWTAdapter extends BaseAuthAdapter {
  private algorithm: 'HS256' | 'HS512' | 'RS256' | 'RS512' = 'HS256';

  /**
   * Load JWT credentials from vault
   */
  protected async hydrateCredentials(): Promise<void> {
    if (!this.adapter.secretId) {
      throw new Error('No secret configured for JWT adapter');
    }

    // Retrieve encrypted secret from vault
    const secret = await this.storage.getSecret?.(this.adapter.secretId);
    if (!secret) {
      throw new Error(`Secret not found: ${this.adapter.secretId}`);
    }

    // Decrypt secret payload
    const payload = await this.secretsService.retrieveSecret(secret) as JWTSecret;

    // Determine algorithm
    this.algorithm = payload.algorithm || 'HS256';

    // Validate credentials based on algorithm
    if (this.algorithm.startsWith('HS')) {
      // HMAC algorithms require a shared secret
      if (!payload.secret) {
        throw new Error('JWT HS256/HS512 requires a secret');
      }
      this.credentials = {
        algorithm: this.algorithm,
        secret: payload.secret,
        issuer: payload.issuer,
        audience: payload.audience,
        keyId: payload.keyId,
      };
    } else {
      // RSA algorithms require private/public key pair
      if (!payload.privateKey || !payload.publicKey) {
        throw new Error('JWT RS256/RS512 requires privateKey and publicKey');
      }
      this.credentials = {
        algorithm: this.algorithm,
        privateKey: payload.privateKey,
        publicKey: payload.publicKey,
        issuer: payload.issuer,
        audience: payload.audience,
        keyId: payload.keyId,
      };
    }
  }

  /**
   * Generate fresh JWT token
   */
  protected async fetchFreshToken(): Promise<{
    accessToken: string;
    expiresIn?: number;
    sessionData?: Record<string, unknown>;
  }> {
    if (!this.credentials) {
      await this.hydrateCredentials();
    }

    const outboundConfig = this.adapter.config.outbound;
    
    // Build JWT payload
    const now = Math.floor(Date.now() / 1000);
    
    // Parse jwtExpiresIn (e.g., "1h", "30m") or default to 3600 seconds
    const expiresIn = this.parseExpiresIn(outboundConfig?.jwtExpiresIn) || 3600;
    
    const payload: Record<string, any> = {
      iat: now,
      exp: now + expiresIn,
    };

    // Add custom claims first (these take precedence)
    if (outboundConfig?.jwtClaims) {
      Object.assign(payload, outboundConfig.jwtClaims);
    }

    // Add standard claims from credentials as fallback (only if not already set)
    if (!payload.iss && this.credentials.issuer) {
      payload.iss = this.credentials.issuer;
    }
    if (!payload.aud && this.credentials.audience) {
      payload.aud = this.credentials.audience;
    }

    // Sign JWT
    const jwt = this.signJWT(payload);

    return {
      accessToken: jwt,
      expiresIn,
      sessionData: payload,
    };
  }

  /**
   * Sign JWT using configured algorithm
   */
  private signJWT(payload: Record<string, any>): string {
    const header: Record<string, any> = {
      alg: this.algorithm,
      typ: 'JWT',
    };

    // Include keyId for key rotation support (RS algorithms)
    if (this.credentials.keyId && this.algorithm.startsWith('RS')) {
      header.kid = this.credentials.keyId;
    }

    // Encode header and payload
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    let signature: string;

    if (this.algorithm.startsWith('HS')) {
      // HMAC signing (HS256, HS512)
      const hmacAlgorithm = this.algorithm === 'HS256' ? 'sha256' : 'sha512';
      const hmac = createHmac(hmacAlgorithm, this.credentials.secret);
      hmac.update(signingInput);
      signature = this.base64UrlEncode(hmac.digest());
    } else {
      // RSA signing (RS256, RS512)
      const rsaAlgorithm = this.algorithm === 'RS256' ? 'RSA-SHA256' : 'RSA-SHA512';
      const sign = createSign(rsaAlgorithm);
      sign.update(signingInput);
      sign.end();
      signature = this.base64UrlEncode(sign.sign(this.credentials.privateKey));
    }

    return `${signingInput}.${signature}`;
  }

  /**
   * Validate JWT token (inbound)
   */
  protected async validateTokenFormat(token: string): Promise<InboundAuthResult> {
    if (!this.credentials) {
      await this.hydrateCredentials();
    }

    try {
      // Parse JWT
      const parts = token.split('.');
      if (parts.length !== 3) {
        return {
          valid: false,
          error: 'Invalid JWT format - expected 3 parts',
        };
      }

      const [encodedHeader, encodedPayload, encodedSignature] = parts;

      // Decode header and payload
      const header = JSON.parse(this.base64UrlDecode(encodedHeader));
      const payload = JSON.parse(this.base64UrlDecode(encodedPayload));

      // Verify algorithm matches
      if (header.alg !== this.algorithm) {
        return {
          valid: false,
          error: `Algorithm mismatch: expected ${this.algorithm}, got ${header.alg}`,
        };
      }

      // Verify signature
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const isValid = this.verifySignature(signingInput, encodedSignature);

      if (!isValid) {
        return {
          valid: false,
          error: 'Invalid JWT signature',
        };
      }

      // Verify expiration
      if (payload.exp) {
        const now = Math.floor(Date.now() / 1000);
        if (now >= payload.exp) {
          return {
            valid: false,
            error: 'JWT has expired',
          };
        }
      }

      // Verify issuer if configured
      const inboundConfig = this.adapter.config.inbound;
      if (inboundConfig?.jwtIssuer && payload.iss !== inboundConfig.jwtIssuer) {
        return {
          valid: false,
          error: `Invalid issuer: expected ${inboundConfig.jwtIssuer}, got ${payload.iss}`,
        };
      }

      // Verify audience if configured
      if (inboundConfig?.jwtAudience) {
        const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (!audiences.includes(inboundConfig.jwtAudience)) {
          return {
            valid: false,
            error: `Invalid audience: expected ${inboundConfig.jwtAudience}`,
          };
        }
      }

      return {
        valid: true,
        userId: payload.sub,
        metadata: {
          issuer: payload.iss,
          audience: payload.aud,
          expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : undefined,
          claims: payload,
        },
      };
    } catch (error: any) {
      return {
        valid: false,
        error: `JWT validation error: ${error.message}`,
      };
    }
  }

  /**
   * Verify JWT signature
   * Uses timing-safe comparison for HMAC to prevent timing side-channel attacks
   */
  private verifySignature(signingInput: string, encodedSignature: string): boolean {
    try {
      if (this.algorithm.startsWith('HS')) {
        // HMAC verification with timing-safe comparison
        const hmacAlgorithm = this.algorithm === 'HS256' ? 'sha256' : 'sha512';
        const hmac = createHmac(hmacAlgorithm, this.credentials.secret);
        hmac.update(signingInput);
        const expectedSignatureBuffer = hmac.digest();
        
        // Decode received signature to Buffer (binary-safe)
        const receivedSignatureBuffer = this.base64UrlDecodeToBuffer(encodedSignature);

        // Use timing-safe comparison to prevent side-channel attacks
        if (expectedSignatureBuffer.length !== receivedSignatureBuffer.length) {
          return false;
        }
        return timingSafeEqual(expectedSignatureBuffer, receivedSignatureBuffer);
      } else {
        // RSA verification
        const rsaAlgorithm = this.algorithm === 'RS256' ? 'RSA-SHA256' : 'RSA-SHA512';
        const verify = createVerify(rsaAlgorithm);
        verify.update(signingInput);
        verify.end();
        const signature = this.base64UrlDecodeToBuffer(encodedSignature);
        return verify.verify(this.credentials.publicKey, signature);
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Apply JWT to outbound request
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
        const queryParam = outboundConfig?.queryParam || 'token';
        return {
          queryParams: {
            [queryParam]: token,
          },
        };

      case 'cookie':
        const cookieName = outboundConfig?.cookieName || 'jwt';
        return {
          cookies: {
            [cookieName]: token,
          },
        };

      case 'body':
        const bodyField = outboundConfig?.bodyField || 'token';
        return {
          bodyFields: {
            [bodyField]: token,
          },
        };

      default:
        throw new Error(`Unsupported JWT placement: ${placement}`);
    }
  }

  /**
   * Base64URL encode
   */
  private base64UrlEncode(input: string | Buffer): string {
    const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Base64URL decode to string (for JSON header/payload)
   */
  private base64UrlDecode(input: string): string {
    // Pad string to multiple of 4
    let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  /**
   * Base64URL decode to Buffer (for binary signatures)
   * Preserves binary data without UTF-8 conversion
   */
  private base64UrlDecodeToBuffer(input: string): Buffer {
    // Pad string to multiple of 4
    let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64');
  }

  /**
   * Parse JWT expiration time string to seconds
   * Supports: "1h", "30m", "3600s", "1d"
   */
  private parseExpiresIn(expiresIn?: string): number | undefined {
    if (!expiresIn) return undefined;

    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      // Try to parse as raw number
      const num = parseInt(expiresIn, 10);
      return isNaN(num) ? undefined : num;
    }

    const [, value, unit] = match;
    const num = parseInt(value, 10);

    switch (unit) {
      case 's': return num;
      case 'm': return num * 60;
      case 'h': return num * 3600;
      case 'd': return num * 86400;
      default: return undefined;
    }
  }
}
