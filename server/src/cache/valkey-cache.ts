/**
 * Valkey Cache Manager
 * Open-source alternative to Redis (fork maintained by Linux Foundation)
 * Use for high-traffic scenarios to cache frequently accessed data
 */

import { createClient } from "redis"; // Valkey is Redis-compatible
import { logger } from "../core/logger.js";

const log = logger.child("ValkeyCache");

interface CacheConfig {
  enabled: boolean;
  host: string;
  port: number;
  password?: string;
  db: number;
  ttl: number; // Default TTL in seconds
}

export class ValkeyCache {
  private client: ReturnType<typeof createClient> | null = null;
  private config: CacheConfig;
  private connected = false;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? process.env.VALKEY_ENABLED === "true",
      host: config.host ?? process.env.VALKEY_HOST ?? "localhost",
      port: config.port ?? parseInt(process.env.VALKEY_PORT || "6379"),
      password: config.password ?? process.env.VALKEY_PASSWORD,
      db: config.db ?? parseInt(process.env.VALKEY_DB || "0"),
      ttl: config.ttl ?? parseInt(process.env.VALKEY_TTL || "3600"), // 1 hour default
    };
  }

  /**
   * Connect to Valkey server
   */
  async connect(): Promise<void> {
    if (!this.config.enabled) {
      log.info("Valkey cache is disabled");
      return;
    }

    if (this.connected) {
      log.warn("Valkey already connected");
      return;
    }

    try {
      this.client = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
        },
        password: this.config.password,
        database: this.config.db,
      });

      this.client.on("error", (err) => {
        log.error("Valkey error", err);
      });

      this.client.on("connect", () => {
        log.info("Valkey connected", {
          host: this.config.host,
          port: this.config.port,
          db: this.config.db,
        });
      });

      this.client.on("ready", () => {
        this.connected = true;
        log.info("Valkey ready for operations");
      });

      await this.client.connect();
    } catch (error: any) {
      log.error("Failed to connect to Valkey", error);
      this.config.enabled = false; // Disable on connection failure
    }
  }

  /**
   * Disconnect from Valkey
   */
  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
      log.info("Valkey disconnected");
    }
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.config.enabled || !this.connected) {
      return null;
    }

    try {
      const value = await this.client!.get(key);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error: any) {
      log.error(`Cache GET failed for key: ${key}`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    if (!this.config.enabled || !this.connected) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl ?? this.config.ttl;

      await this.client!.setEx(key, expiry, serialized);
      return true;
    } catch (error: any) {
      log.error(`Cache SET failed for key: ${key}`, error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<boolean> {
    if (!this.config.enabled || !this.connected) {
      return false;
    }

    try {
      await this.client!.del(key);
      return true;
    } catch (error: any) {
      log.error(`Cache DEL failed for key: ${key}`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern: string): Promise<number> {
    if (!this.config.enabled || !this.connected) {
      return 0;
    }

    try {
      const keys = await this.client!.keys(pattern);
      if (keys.length === 0) return 0;

      await this.client!.del(keys);
      return keys.length;
    } catch (error: any) {
      log.error(`Cache DEL pattern failed for: ${pattern}`, error);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.config.enabled || !this.connected) {
      return false;
    }

    try {
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error: any) {
      log.error(`Cache EXISTS failed for key: ${key}`, error);
      return false;
    }
  }

  /**
   * Set expiry on existing key
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    if (!this.config.enabled || !this.connected) {
      return false;
    }

    try {
      await this.client!.expire(key, ttl);
      return true;
    } catch (error: any) {
      log.error(`Cache EXPIRE failed for key: ${key}`, error);
      return false;
    }
  }

  /**
   * Increment counter
   */
  async incr(key: string): Promise<number> {
    if (!this.config.enabled || !this.connected) {
      return 0;
    }

    try {
      return await this.client!.incr(key);
    } catch (error: any) {
      log.error(`Cache INCR failed for key: ${key}`, error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ keys: number; memory: string; hits: number; misses: number }> {
    if (!this.config.enabled || !this.connected) {
      return { keys: 0, memory: "0B", hits: 0, misses: 0 };
    }

    try {
      const info = await this.client!.info("stats");
      const keyspace = await this.client!.info("keyspace");

      // Parse keyspace info
      const dbMatch = keyspace.match(/db0:keys=(\d+)/);
      const keys = dbMatch ? parseInt(dbMatch[1]) : 0;

      // Parse stats info
      const hitsMatch = info.match(/keyspace_hits:(\d+)/);
      const missesMatch = info.match(/keyspace_misses:(\d+)/);
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);

      return {
        keys,
        memory: memoryMatch ? memoryMatch[1].trim() : "0B",
        hits: hitsMatch ? parseInt(hitsMatch[1]) : 0,
        misses: missesMatch ? parseInt(missesMatch[1]) : 0,
      };
    } catch (error: any) {
      log.error("Failed to get cache stats", error);
      return { keys: 0, memory: "0B", hits: 0, misses: 0 };
    }
  }

  /**
   * Flush all cache data (use with caution!)
   */
  async flushAll(): Promise<boolean> {
    if (!this.config.enabled || !this.connected) {
      return false;
    }

    try {
      await this.client!.flushAll();
      log.warn("Cache flushed - all data deleted");
      return true;
    } catch (error: any) {
      log.error("Cache FLUSH failed", error);
      return false;
    }
  }

  /**
   * Check if cache is enabled and connected
   */
  isReady(): boolean {
    return this.config.enabled && this.connected;
  }
}

// Singleton instance
let cacheInstance: ValkeyCache | null = null;

export function getCache(config?: Partial<CacheConfig>): ValkeyCache {
  if (!cacheInstance) {
    cacheInstance = new ValkeyCache(config);
  }
  return cacheInstance;
}
/**
 * Valkey Cache Manager
 * Open-source alternative to Redis (fork maintained by Linux Foundation)
 * Use for high-traffic scenarios to cache frequently accessed data
 */

import { createClient } from "redis"; // Valkey is Redis-compatible
import { logger } from "../core/logger.js";

const log = logger.child("ValkeyCache");

interface CacheConfig {
  enabled: boolean;
  host: string;
  port: number;
  password?: string;
  db: number;
  ttl: number; // Default TTL in seconds
}

export class ValkeyCache {
  private client: ReturnType<typeof createClient> | null = null;
  private config: CacheConfig;
  private connected = false;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? process.env.VALKEY_ENABLED === "true",
      host: config.host ?? process.env.VALKEY_HOST ?? "localhost",
      port: config.port ?? parseInt(process.env.VALKEY_PORT || "6379"),
      password: config.password ?? process.env.VALKEY_PASSWORD,
      db: config.db ?? parseInt(process.env.VALKEY_DB || "0"),
      ttl: config.ttl ?? parseInt(process.env.VALKEY_TTL || "3600"), // 1 hour default
    };
  }

  /**
   * Connect to Valkey server
   */
  async connect(): Promise<void> {
    if (!this.config.enabled) {
      log.info("Valkey cache is disabled");
      return;
    }

    if (this.connected) {
      log.warn("Valkey already connected");
      return;
    }

    try {
      this.client = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
        },
        password: this.config.password,
        database: this.config.db,
      });

      this.client.on("error", (err) => {
        log.error("Valkey error", err);
      });

      this.client.on("connect", () => {
        log.info("Valkey connected", {
          host: this.config.host,
          port: this.config.port,
          db: this.config.db,
        });
      });

      this.client.on("ready", () => {
        this.connected = true;
        log.info("Valkey ready for operations");
      });

      await this.client.connect();
    } catch (error: any) {
      log.error("Failed to connect to Valkey", error);
      this.config.enabled = false; // Disable on connection failure
    }
  }

  /**
   * Disconnect from Valkey
   */
  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
      log.info("Valkey disconnected");
    }
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.config.enabled || !this.connected) {
      return null;
    }

    try {
      const value = await this.client!.get(key);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error: any) {
      log.error(`Cache GET failed for key: ${key}`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    if (!this.config.enabled || !this.connected) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl ?? this.config.ttl;

      await this.client!.setEx(key, expiry, serialized);
      return true;
    } catch (error: any) {
      log.error(`Cache SET failed for key: ${key}`, error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<boolean> {
    if (!this.config.enabled || !this.connected) {
      return false;
    }

    try {
      await this.client!.del(key);
      return true;
    } catch (error: any) {
      log.error(`Cache DEL failed for key: ${key}`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern: string): Promise<number> {
    if (!this.config.enabled || !this.connected) {
      return 0;
    }

    try {
      const keys = await this.client!.keys(pattern);
      if (keys.length === 0) return 0;

      await this.client!.del(keys);
      return keys.length;
    } catch (error: any) {
      log.error(`Cache DEL pattern failed for: ${pattern}`, error);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.config.enabled || !this.connected) {
      return false;
    }

    try {
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error: any) {
      log.error(`Cache EXISTS failed for key: ${key}`, error);
      return false;
    }
  }

  /**
   * Set expiry on existing key
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    if (!this.config.enabled || !this.connected) {
      return false;
    }

    try {
      await this.client!.expire(key, ttl);
      return true;
    } catch (error: any) {
      log.error(`Cache EXPIRE failed for key: ${key}`, error);
      return false;
    }
  }

  /**
   * Increment counter
   */
  async incr(key: string): Promise<number> {
    if (!this.config.enabled || !this.connected) {
      return 0;
    }

    try {
      return await this.client!.incr(key);
    } catch (error: any) {
      log.error(`Cache INCR failed for key: ${key}`, error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ keys: number; memory: string; hits: number; misses: number }> {
    if (!this.config.enabled || !this.connected) {
      return { keys: 0, memory: "0B", hits: 0, misses: 0 };
    }

    try {
      const info = await this.client!.info("stats");
      const keyspace = await this.client!.info("keyspace");

      // Parse keyspace info
      const dbMatch = keyspace.match(/db0:keys=(\d+)/);
      const keys = dbMatch ? parseInt(dbMatch[1]) : 0;

      // Parse stats info
      const hitsMatch = info.match(/keyspace_hits:(\d+)/);
      const missesMatch = info.match(/keyspace_misses:(\d+)/);
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);

      return {
        keys,
        memory: memoryMatch ? memoryMatch[1].trim() : "0B",
        hits: hitsMatch ? parseInt(hitsMatch[1]) : 0,
        misses: missesMatch ? parseInt(missesMatch[1]) : 0,
      };
    } catch (error: any) {
      log.error("Failed to get cache stats", error);
      return { keys: 0, memory: "0B", hits: 0, misses: 0 };
    }
  }

  /**
   * Flush all cache data (use with caution!)
   */
  async flushAll(): Promise<boolean> {
    if (!this.config.enabled || !this.connected) {
      return false;
    }

    try {
      await this.client!.flushAll();
      log.warn("Cache flushed - all data deleted");
      return true;
    } catch (error: any) {
      log.error("Cache FLUSH failed", error);
      return false;
    }
  }

  /**
   * Check if cache is enabled and connected
   */
  isReady(): boolean {
    return this.config.enabled && this.connected;
  }
}

// Singleton instance
let cacheInstance: ValkeyCache | null = null;

export function getCache(config?: Partial<CacheConfig>): ValkeyCache {
  if (!cacheInstance) {
    cacheInstance = new ValkeyCache(config);
  }
  return cacheInstance;
}
