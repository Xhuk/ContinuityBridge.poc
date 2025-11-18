import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import Redis from "ioredis"; // Compatible with Valkey
import type { Request, Response } from "express";
import { logger } from "../core/logger.js";
import type { TenantQuotaManager } from "../core/tenant-quotas.js";

const log = logger.child("RateLimiter");

// Valkey/Redis client (optional - falls back to in-memory)
// ioredis is 100% compatible with Valkey (Redis fork)
let valkeyClient: Redis | null = null;

/**
 * Initialize Valkey connection if VALKEY_URL is provided
 * Falls back to in-memory storage if Valkey is unavailable
 * 
 * Valkey is a Redis fork (Linux Foundation) - 100% protocol compatible
 * Use this for self-hosted monolith deployments
 */
export function initializeRedis(): void {
  // Support both VALKEY_URL and REDIS_URL for backwards compatibility
  const connectionUrl = process.env.VALKEY_URL || process.env.REDIS_URL;
  const enabled = process.env.VALKEY_ENABLED === "true" || process.env.REDIS_ENABLED === "true";

  if (connectionUrl && enabled) {
    try {
      valkeyClient = new Redis(connectionUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError(err) {
          log.warn("Valkey reconnect on error", { error: err.message });
          return true;
        },
      });

      valkeyClient.on("connect", () => {
        log.info("Valkey connected successfully", { 
          url: connectionUrl.replace(/:[^:]*@/, ":***@"),
          mode: "valkey"
        });
      });

      valkeyClient.on("error", (err) => {
        log.error("Valkey connection error", { error: err.message });
      });

      valkeyClient.on("close", () => {
        log.warn("Valkey connection closed");
      });
    } catch (error: any) {
      log.error("Failed to initialize Valkey - falling back to in-memory", {
        error: error.message,
      });
      valkeyClient = null;
    }
  } else {
    log.info("Valkey disabled - using in-memory rate limiting");
  }
}

/**
 * Valkey store for express-rate-limit
 * Compatible with Redis protocol
 */
class ValkeyStore {
  private prefix: string;
  private client: Redis;

  constructor(client: Redis, prefix: string = "rl:") {
    this.client = client;
    this.prefix = prefix;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const fullKey = this.prefix + key;
    const ttl = 60; // 1 minute window

    const multi = this.client.multi();
    multi.incr(fullKey);
    multi.expire(fullKey, ttl);
    const results = await multi.exec();

    const totalHits = results?.[0]?.[1] as number || 0;
    const resetTime = new Date(Date.now() + ttl * 1000);

    return { totalHits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    await this.client.decr(this.prefix + key);
  }

  async resetKey(key: string): Promise<void> {
    await this.client.del(this.prefix + key);
  }
}

/**
 * Tenant-aware rate limiter
 * Uses organizationId from request for multi-tenant isolation
 */
export function createTenantRateLimiter(quotaManager: TenantQuotaManager) {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    
    max: async (req: Request) => {
      const organizationId = (req as any).organizationId || "anonymous";
      const quota = await quotaManager.getQuota(organizationId);
      return quota?.maxApiCallsPerMinute || 100; // Default 100 req/min
    },
    
    keyGenerator: (req: Request) => {
      const organizationId = (req as any).organizationId || "anonymous";
      const userId = (req as any).userId || "guest";
      return `${organizationId}:${userId}:${req.ip}`;
    },
    
    // Use Valkey store if available, otherwise in-memory
    store: valkeyClient ? new ValkeyStore(valkeyClient, "rl:tenant:") : undefined,
    
    standardHeaders: true,
    legacyHeaders: false,
    
    handler: (req: Request, res: Response) => {
      const organizationId = (req as any).organizationId || "anonymous";
      
      log.warn("Rate limit exceeded", {
        organizationId,
        path: req.path,
        ip: req.ip,
      });
      
      res.status(429).json({
        error: "Too many requests",
        message: "You have exceeded your API quota. Please try again later.",
        retryAfter: res.getHeader("Retry-After"),
      });
    },
    
    skip: (req: Request) => {
      // Skip rate limiting for health checks
      return req.path === "/health" || req.path === "/api/health";
    },
  });
}

/**
 * Progressive slowdown middleware
 * Gradually increases response time as limits approach
 */
export function createUsageTracker(quotaManager: TenantQuotaManager) {
  return slowDown({
    windowMs: 60 * 1000, // 1 minute
    
    delayAfter: async (req: Request) => {
      const organizationId = (req as any).organizationId || "anonymous";
      const quota = await quotaManager.getQuota(organizationId);
      const limit = quota?.maxApiCallsPerMinute || 100;
      return Math.floor(limit * 0.7); // Start slowing at 70% of limit
    },
    
    delayMs: (used: number, req: Request) => {
      // Progressive delay: 100ms, 200ms, 400ms, 800ms...
      const excessRequests = used - 1;
      return Math.min(100 * Math.pow(2, excessRequests), 3000); // Max 3s delay
    },
    
    maxDelayMs: 5000, // Maximum 5 second delay
    
    keyGenerator: (req: Request) => {
      const organizationId = (req as any).organizationId || "anonymous";
      const userId = (req as any).userId || "guest";
      return `${organizationId}:${userId}:${req.ip}`;
    },
    
    // Use Valkey store if available
    store: valkeyClient ? new ValkeyStore(valkeyClient, "sd:tenant:") : undefined,
    
    skip: (req: Request) => {
      return req.path === "/health" || req.path === "/api/health";
    },
  });
}

/**
 * Webhook-specific rate limiter
 * More strict limits for webhook endpoints
 */
export function createWebhookRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute per webhook
    
    keyGenerator: (req: Request) => {
      const webhookSlug = req.params.slug || "unknown";
      const organizationId = (req as any).organizationId || "anonymous";
      return `webhook:${organizationId}:${webhookSlug}`;
    },
    
    store: valkeyClient ? new ValkeyStore(valkeyClient, "rl:webhook:") : undefined,
    
    standardHeaders: true,
    legacyHeaders: false,
    
    handler: (req: Request, res: Response) => {
      log.warn("Webhook rate limit exceeded", {
        slug: req.params.slug,
        organizationId: (req as any).organizationId,
        ip: req.ip,
      });
      
      res.status(429).json({
        error: "Webhook rate limit exceeded",
        message: "This webhook is receiving too many requests. Please reduce the frequency.",
        retryAfter: res.getHeader("Retry-After"),
      });
    },
  });
}

/**
 * Get Valkey client stats for monitoring
 */
export function getRedisStats() {
  if (!valkeyClient) {
    return {
      enabled: false,
      status: "disabled",
      mode: "in-memory",
    };
  }

  return {
    enabled: true,
    status: valkeyClient.status,
    mode: "valkey",
    connected: valkeyClient.status === "ready",
  };
}

/**
 * Gracefully close Valkey connection
 */
export async function closeRedis(): Promise<void> {
  if (valkeyClient) {
    log.info("Closing Valkey connection");
    await valkeyClient.quit();
    valkeyClient = null;
  }
}
