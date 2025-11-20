/**
 * Cache Service - High-level caching utilities
 * Integrates Valkey cache with application logic
 */

import { getCache } from "../cache/valkey-cache.js";
import { logger } from "../core/logger.js";
import { db } from "../../db.js";
import { customerLicense, users, organizations } from "../../db";
import { eq } from "drizzle-orm";

const log = logger.child("CacheService");
const cache = getCache();

/**
 * Cache-aside pattern helper
 * Checks cache first, falls back to loader function
 */
export async function cacheAside<T>(
  key: string,
  loader: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // Try cache first
  const cached = await cache.get<T>(key);
  if (cached !== null) {
    log.debug("Cache HIT", { key });
    return cached;
  }

  // Cache miss - load from source
  log.debug("Cache MISS", { key });
  const data = await loader();

  // Store in cache
  await cache.set(key, data, ttl);

  return data;
}

/**
 * License lookup with caching
 */
export async function getCachedLicense(
  licenseKey: string
): Promise<any | null> {
  const cacheKey = `license:${licenseKey}`;
  
  return cacheAside(
    cacheKey,
    async () => {
      const [license] = await db
        .select()
        .from(customerLicense)
        .where(eq(customerLicense.licenseKey, licenseKey))
        .limit(1);

      return license || null;
    },
    3600 // Cache for 1 hour
  );
}

/**
 * User lookup with caching
 */
export async function getCachedUser(userId: string): Promise<any | null> {
  const cacheKey = `user:${userId}`;
  
  return cacheAside(
    cacheKey,
    async () => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return user || null;
    },
    600 // Cache for 10 minutes
  );
}

/**
 * User lookup by email with caching
 */
export async function getCachedUserByEmail(email: string): Promise<any | null> {
  const cacheKey = `user:email:${email}`;
  
  return cacheAside(
    cacheKey,
    async () => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      return user || null;
    },
    600 // Cache for 10 minutes
  );
}

/**
 * Organization lookup with caching
 */
export async function getCachedOrganization(orgId: string): Promise<any | null> {
  const cacheKey = `org:${orgId}`;
  
  return cacheAside(
    cacheKey,
    async () => {
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      return org || null;
    },
    1800 // Cache for 30 minutes
  );
}

/**
 * Invalidate user cache
 */
export async function invalidateUserCache(userId: string, email?: string): Promise<void> {
  await cache.del(`user:${userId}`);
  if (email) {
    await cache.del(`user:email:${email}`);
  }
  log.debug("User cache invalidated", { userId, email });
}

/**
 * Invalidate license cache
 */
export async function invalidateLicenseCache(licenseKey: string): Promise<void> {
  await cache.del(`license:${licenseKey}`);
  log.debug("License cache invalidated", { licenseKey });
}

/**
 * Invalidate organization cache
 */
export async function invalidateOrgCache(orgId: string): Promise<void> {
  await cache.del(`org:${orgId}`);
  log.debug("Organization cache invalidated", { orgId });
}

/**
 * Rate limiting using cache
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; current: number; remaining: number }> {
  const cacheKey = `ratelimit:${key}`;
  
  const current = await cache.incr(cacheKey);
  
  if (current === 1) {
    // First request in window, set expiry
    await cache.expire(cacheKey, windowSeconds);
  }

  const allowed = current <= limit;
  const remaining = Math.max(0, limit - current);

  return { allowed, current, remaining };
}
