import type { Request, Response, NextFunction } from "express";
import type { IStorage } from "../../storage";
import { TokenLifecycleService } from "./token-lifecycle-service";
import { SecretsService } from "../secrets/secrets-service";
import { OAuth2Adapter } from "./adapters/oauth2-adapter";
import { JWTAdapter } from "./adapters/jwt-adapter";
import { CookieAdapter } from "./adapters/cookie-adapter";
import type { InboundAuthPolicy } from "../../schema";
import { logger } from "../core/logger";
import { match as pathMatch } from "path-to-regexp";

const log = logger.child("InboundAuthMiddleware");

export interface InboundAuthMiddlewareOptions {
  storage: IStorage;
  tokenLifecycle: TokenLifecycleService;
  secretsService: SecretsService;
}

export interface InboundAuthMiddlewareResult {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  reloadPolicies: () => Promise<void>;
}

/**
 * Create inbound authentication middleware
 * 
 * Validates incoming requests based on per-route policies stored in persistence.
 * - Bypass public routes (healthcheck, static assets, login)
 * - Validate machine-to-machine API calls via OAuth2/JWT/Cookie adapters
 * - Coexist with session-based auth (passport-local)
 * - Log all auth attempts to audit table
 * 
 * Returns { middleware, reloadPolicies } to allow cache invalidation when policies change.
 * 
 * Based on architect guidance for Task #14
 */
export function createInboundAuthMiddleware(options: InboundAuthMiddlewareOptions): InboundAuthMiddlewareResult {
  const { storage, tokenLifecycle, secretsService } = options;
  
  // Cache of route policies with compiled matchers
  const policyCache: Array<{
    policy: InboundAuthPolicy;
    matcher: ReturnType<typeof pathMatch>;
  }> = [];
  let policiesLoaded = false;

  // Load route policies into cache
  async function loadPolicies() {
    if (policiesLoaded) return;
    
    try {
      const policies = await storage.getInboundAuthPolicies?.() || [];
      policyCache.length = 0; // Clear array
      
      for (const policy of policies) {
        try {
          // Compile route pattern using path-to-regexp
          const matcher = pathMatch(policy.routePattern, { decode: decodeURIComponent });
          policyCache.push({ policy, matcher });
        } catch (error: any) {
          log.error("Failed to compile route pattern", {
            pattern: policy.routePattern,
            error: error.message,
          });
        }
      }
      
      policiesLoaded = true;
      log.info("Loaded inbound auth policies", { count: policyCache.length });
    } catch (error: any) {
      log.error("Failed to load inbound auth policies", { error: error.message });
    }
  }

  // Reload policies (called when policies are modified)
  async function reloadPolicies() {
    policiesLoaded = false;
    await loadPolicies();
  }

  // Middleware function
  function inboundAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    // Wrap in async IIFE to handle async operations
    (async () => {
      try {
        // Load policies on first request (lazy initialization)
        if (!policiesLoaded) {
          await loadPolicies();
        }

        // Skip if already authenticated via session (passport-local)
        // TypeScript doesn't know about passport's augmentation, so we check safely
        if (typeof (req as any).isAuthenticated === 'function' && (req as any).isAuthenticated()) {
          log.debug("Request authenticated via session, skipping adapter validation", {
            path: req.path,
            method: req.method,
          });
          return next();
        }

        // Find policy for this route
        const policy = await findMatchingPolicy(req.path, req.method);

      // If no policy or bypass mode, allow request
      if (!policy || policy.enforcementMode === "bypass") {
        return next();
      }

      // Get adapter ID (from policy or X-Auth-Adapter-ID header for multi-tenant)
      let adapterId = policy.adapterId;
      
      if (policy.multiTenant && req.headers["x-auth-adapter-id"]) {
        adapterId = req.headers["x-auth-adapter-id"] as string;
        log.debug("Using adapter from header for multi-tenant route", { adapterId, path: req.path });
      }

      // If optional mode and no adapter specified, allow request
      if (policy.enforcementMode === "optional" && !adapterId) {
        return next();
      }

      // Required mode: adapter must be specified
      if (!adapterId) {
        await logAuthFailure(req, policy, "no_adapter_configured", "No auth adapter configured for this route");
        return res.status(401).json({
          error: "Authentication required",
          message: "No authentication adapter configured for this route",
        });
      }

      // Load adapter configuration
      const adapterConfig = await storage.getAuthAdapter?.(adapterId);
      if (!adapterConfig) {
        await logAuthFailure(req, policy, "adapter_not_found", `Adapter not found: ${adapterId}`);
        return res.status(401).json({
          error: "Authentication failed",
          message: "Invalid authentication adapter",
          adapterId,
        });
      }

      // Check if adapter is activated
      if (!adapterConfig.activated) {
        await logAuthFailure(req, policy, "adapter_disabled", `Adapter disabled: ${adapterId}`);
        return res.status(401).json({
          error: "Authentication failed",
          message: "Authentication adapter is disabled",
          adapterId,
        });
      }

      // Create adapter instance
      const adapter = await createAdapter(adapterConfig);

      // Validate request
      const result = await adapter.validateInbound(req);

      if (!result.valid) {
        // Auth failed - log and return 401
        await logAuthFailure(req, policy, "validation_failed", result.error || "Token validation failed");
        
        // Include WWW-Authenticate header for OAuth2/JWT
        const headers: Record<string, string> = {};
        if (adapterConfig.type === "oauth2" || adapterConfig.type === "jwt") {
          headers["WWW-Authenticate"] = `Bearer realm="${req.hostname}", error="invalid_token"`;
        }

        return res.status(401).set(headers).json({
          error: "Authentication failed",
          message: result.error || "Invalid or missing authentication token",
          adapterId,
        });
      }

      // Auth succeeded - log and continue
      await logAuthSuccess(req, policy, adapterId, result);

      // Attach auth metadata to request for downstream handlers
      (req as any).auth = {
        adapterId,
        userId: result.userId,
        metadata: result.metadata,
      };

        next();
      } catch (error: any) {
        log.error("Inbound auth middleware error", {
          path: req.path,
          method: req.method,
          error: error.message,
        });

        // Internal error - don't expose details
        res.status(500).json({
          error: "Internal authentication error",
        });
      }
    })();
  }

  // Return middleware and reload function
  return {
    middleware: inboundAuthMiddleware,
    reloadPolicies,
  };

  // Helper: Find matching policy for route
  async function findMatchingPolicy(path: string, method: string): Promise<InboundAuthPolicy | undefined> {
    // Try to match each policy in order
    for (const { policy, matcher } of policyCache) {
      // Check HTTP method match
      if (policy.httpMethod !== "ALL" && policy.httpMethod !== method) {
        continue;
      }

      // Check path match using compiled path-to-regexp matcher
      const result = matcher(path);
      if (result) {
        log.debug("Matched policy", {
          pattern: policy.routePattern,
          path,
          method,
          params: result.params,
        });
        return policy;
      }
    }

    return undefined;
  }

  // Helper: Create adapter instance
  async function createAdapter(config: any) {
    switch (config.type) {
      case "oauth2":
        return new OAuth2Adapter(config, storage, tokenLifecycle, secretsService);
      case "jwt":
        return new JWTAdapter(config, storage, tokenLifecycle, secretsService);
      case "cookie":
        return new CookieAdapter(config, storage, tokenLifecycle, secretsService);
      default:
        throw new Error(`Unsupported adapter type: ${config.type}`);
    }
  }

  // Helper: Log successful auth
  async function logAuthSuccess(req: Request, policy: InboundAuthPolicy, adapterId: string, result: any) {
    log.info("Inbound auth succeeded", {
      adapterId,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userId: result.userId,
    });

    // Add to audit log
    await storage.addAuditLog?.({
      resourceType: "inbound_auth",
      resourceId: adapterId,
      action: "auth_success",
      timestamp: new Date().toISOString(),
      metadata: {
        route: req.path,
        method: req.method,
        ip: req.ip,
        userId: result.userId,
        policyId: policy.id,
      },
    });
  }

  // Helper: Log failed auth
  async function logAuthFailure(req: Request, policy: InboundAuthPolicy | undefined, reason: string, error: string) {
    log.warn("Inbound auth failed", {
      path: req.path,
      method: req.method,
      ip: req.ip,
      reason,
      error,
    });

    // Add to audit log
    await storage.addAuditLog?.({
      resourceType: "inbound_auth",
      resourceId: policy?.id || "unknown",
      action: "auth_failure",
      timestamp: new Date().toISOString(),
      metadata: {
        route: req.path,
        method: req.method,
        ip: req.ip,
        reason,
        error,
        policyId: policy?.id,
      },
    });
  }
}
