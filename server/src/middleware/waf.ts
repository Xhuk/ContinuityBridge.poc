import { Request, Response, NextFunction } from "express";
import { logger } from "../core/logger.js";
import { checkRateLimit as valkeyRateLimit } from "../services/cache-service.js";

/**
 * WAF (Web Application Firewall) Middleware
 * Protects endpoints from:
 * - Bot crawling and automated scanners
 * - Brute force attacks
 * - Suspicious patterns and injections
 * - Excessive requests (distributed rate limiting via Valkey)
 */

interface RateLimitEntry {
  count: number;
  firstRequest: number;
  blocked: boolean;
  blockedUntil?: number;
}

// In-memory store for rate limiting (use Redis in production for multi-instance)
const rateLimitStore = new Map<string, RateLimitEntry>();
const blockedIPs = new Set<string>();

// Authenticated IP whitelist with grace period (24 hours after successful login)
interface AuthenticatedIP {
  ip: string;
  lastAuthenticated: number;
  userEmail?: string;
}
const authenticatedIPs = new Map<string, AuthenticatedIP>();
const AUTH_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours

// Suspicious patterns that indicate automated scanners/bots
const SUSPICIOUS_PATTERNS = [
  /\/\.env/i,
  /\/\.git/i,
  /\/admin/i,
  /\/phpmyadmin/i,
  /\/wp-admin/i,
  /\/wp-login/i,
  /\/xmlrpc\.php/i,
  /\/\.well-known/i,
  /\/api\/v1/i, // We don't have v1 API
  /\/graphql/i, // We don't expose GraphQL publicly
  /SELECT.*FROM/i, // SQL injection attempts
  /<script>/i, // XSS attempts
  /\.\.\/\.\.\//i, // Path traversal
  /\/etc\/passwd/i,
  /\/proc\/self/i,
  /eval\(/i,
  /base64_decode/i,
  /exec\(/i,
];

// Known bot user agents (crawlers, scanners, security tools)
const BOT_USER_AGENTS = [
  /bot/i,
  /crawl/i,
  /spider/i,
  /scrape/i,
  /curl/i,
  /wget/i,
  /python-requests/i,
  /go-http-client/i,
  /scanner/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /metasploit/i,
  /sqlmap/i,
  /burp/i,
  /acunetix/i,
  /nessus/i,
  /openvas/i,
  /qualys/i,
];

// Endpoints that should be protected from bots
const PROTECTED_ENDPOINTS = [
  '/api/users',
  '/api/auth',
  '/sys/auth/bridge',
  '/api/users/confirm-email',
];

export interface WAFConfig {
  rateLimit: {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;   // Max requests per window
    blockDurationMs: number; // How long to block after exceeding limit
  };
  blockBots: boolean;      // Block known bot user agents
  blockSuspicious: boolean; // Block suspicious URL patterns
  whitelist: string[];     // IP addresses to whitelist
}

const defaultConfig: WAFConfig = {
  rateLimit: {
    windowMs: 60000,        // 1 minute
    maxRequests: 20,        // 20 requests per minute
    blockDurationMs: 300000, // Block for 5 minutes
  },
  blockBots: true,
  blockSuspicious: true,
  whitelist: [],
};

/**
 * Get client IP address from request
 */
function getClientIP(req: Request): string {
  // Check X-Forwarded-For header (from proxies like Nginx, CloudFlare, Render)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    return ips[0].trim();
  }
  
  // Check X-Real-IP header
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return typeof realIP === 'string' ? realIP : realIP[0];
  }
  
  // Fallback to socket address
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Register IP as authenticated after successful login
 * IP will be whitelisted for 24 hours
 */
export function registerAuthenticatedIP(ip: string, userEmail?: string): void {
  authenticatedIPs.set(ip, {
    ip,
    lastAuthenticated: Date.now(),
    userEmail,
  });
  
  // Clear any rate limiting or blocking for this IP
  rateLimitStore.delete(ip);
  blockedIPs.delete(ip);
  
  logger.info('WAF: IP registered as authenticated', {
    scope: 'superadmin',
    ip,
    userEmail,
    gracePeriod: '24 hours',
  });
}

/**
 * Check if IP is in the authenticated whitelist (within grace period)
 */
function isAuthenticatedIP(ip: string): boolean {
  const authInfo = authenticatedIPs.get(ip);
  if (!authInfo) return false;
  
  const now = Date.now();
  const elapsed = now - authInfo.lastAuthenticated;
  
  if (elapsed > AUTH_GRACE_PERIOD_MS) {
    // Grace period expired, remove from whitelist
    authenticatedIPs.delete(ip);
    logger.info('WAF: Authenticated IP grace period expired', {
      scope: 'superadmin',
      ip,
      userEmail: authInfo.userEmail,
    });
    return false;
  }
  
  return true;
}

/**
 * Check if request matches suspicious patterns
 */
function isSuspiciousRequest(req: Request): boolean {
  const url = req.originalUrl || req.url;
  
  // Check URL patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(url)) {
      logger.warn('WAF: Suspicious URL pattern detected', {
        scope: 'superadmin',
        ip: getClientIP(req),
        url,
        pattern: pattern.source,
      });
      return true;
    }
  }
  
  // Check for suspicious query parameters
  const queryString = new URL(url, 'http://localhost').search;
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(queryString)) {
      logger.warn('WAF: Suspicious query parameter detected', {
        scope: 'superadmin',
        ip: getClientIP(req),
        query: queryString,
      });
      return true;
    }
  }
  
  return false;
}

/**
 * Check if user agent is a known bot
 */
function isBotUserAgent(req: Request): boolean {
  const userAgent = req.headers['user-agent'] || '';
  
  for (const pattern of BOT_USER_AGENTS) {
    if (pattern.test(userAgent)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if endpoint should be protected
 */
function isProtectedEndpoint(req: Request): boolean {
  const url = req.originalUrl || req.url;
  return PROTECTED_ENDPOINTS.some(endpoint => url.startsWith(endpoint));
}

/**
 * Rate limiting check using Valkey (distributed)
 */
async function checkDistributedRateLimit(ip: string, config: WAFConfig): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const windowSeconds = Math.floor(config.rateLimit.windowMs / 1000);
    const result = await valkeyRateLimit(
      `waf:${ip}`,
      config.rateLimit.maxRequests,
      windowSeconds
    );

    if (!result.allowed) {
      logger.warn('WAF: Valkey rate limit exceeded', {
        scope: 'superadmin',
        ip,
        current: result.current,
        limit: config.rateLimit.maxRequests,
      });

      const retryAfter = Math.ceil(config.rateLimit.blockDurationMs / 1000);
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  } catch (error) {
    // Fallback to in-memory if Valkey fails
    logger.error('WAF: Valkey rate limit check failed, falling back to in-memory', {
      scope: 'superadmin',
      error: (error as Error).message,
    });
    return inMemoryRateLimit(ip, config);
  }
}

/**
 * In-memory rate limiting fallback (original implementation)
 */
function inMemoryRateLimit(ip: string, config: WAFConfig): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  
  // Check if IP is currently blocked
  if (entry?.blocked && entry.blockedUntil) {
    if (now < entry.blockedUntil) {
      const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
      return { allowed: false, retryAfter };
    } else {
      // Block period expired, reset
      rateLimitStore.delete(ip);
    }
  }
  
  // No entry or entry expired
  if (!entry || now - entry.firstRequest > config.rateLimit.windowMs) {
    rateLimitStore.set(ip, {
      count: 1,
      firstRequest: now,
      blocked: false,
    });
    return { allowed: true };
  }
  
  // Increment counter
  entry.count++;
  
  // Check if limit exceeded
  if (entry.count > config.rateLimit.maxRequests) {
    entry.blocked = true;
    entry.blockedUntil = now + config.rateLimit.blockDurationMs;
    
    logger.warn('WAF: Rate limit exceeded, blocking IP', {
      scope: 'superadmin',
      ip,
      requests: entry.count,
      blockDuration: config.rateLimit.blockDurationMs / 1000 + 's',
    });
    
    const retryAfter = Math.ceil(config.rateLimit.blockDurationMs / 1000);
    return { allowed: false, retryAfter };
  }
  
  return { allowed: true };
}

/**
 * WAF Middleware
 */
export function wafMiddleware(config: Partial<WAFConfig> = {}) {
  const finalConfig: WAFConfig = { ...defaultConfig, ...config };
  
  // Cleanup old entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    const entries = Array.from(rateLimitStore.entries());
    for (const [ip, entry] of entries) {
      if (now - entry.firstRequest > finalConfig.rateLimit.windowMs * 2) {
        rateLimitStore.delete(ip);
      }
    }
  }, 300000);
  
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIP(req);
    const url = req.originalUrl || req.url;
    
    // ALWAYS allow static assets (CSS, JS, images, fonts)
    if (url.startsWith('/assets/') || url.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map)$/)) {
      return next();
    }
    
    // Check authenticated IP whitelist (24-hour grace period after login)
    if (isAuthenticatedIP(ip)) {
      return next();
    }
    
    // Whitelist check
    if (finalConfig.whitelist.includes(ip)) {
      return next();
    }
    
    // Check if IP is permanently blocked
    if (blockedIPs.has(ip)) {
      logger.warn('WAF: Blocked IP attempted access', {
        scope: 'superadmin',
        ip,
        url: req.originalUrl || req.url,
      });
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Check for suspicious patterns
    if (finalConfig.blockSuspicious && isSuspiciousRequest(req)) {
      // Block IP after 3 suspicious requests
      const suspiciousKey = `suspicious_${ip}`;
      const suspiciousCount = (rateLimitStore.get(suspiciousKey)?.count || 0) + 1;
      
      if (suspiciousCount >= 3) {
        blockedIPs.add(ip);
        logger.error('WAF: IP permanently blocked for suspicious activity', {
          scope: 'superadmin',
          ip,
          attempts: suspiciousCount,
        });
      } else {
        rateLimitStore.set(suspiciousKey, {
          count: suspiciousCount,
          firstRequest: Date.now(),
          blocked: false,
        });
      }
      
      return res.status(404).json({ error: 'Not Found' }); // Return 404 to hide endpoint existence
    }
    
    // Check for bot user agents on protected endpoints
    if (finalConfig.blockBots && isProtectedEndpoint(req) && isBotUserAgent(req)) {
      logger.warn('WAF: Bot user agent blocked', {
        scope: 'superadmin',
        ip,
        userAgent: req.headers['user-agent'],
        url: req.originalUrl || req.url,
      });
      
      // Return 404 instead of 403 to hide endpoint existence
      return res.status(404).json({ error: 'Not Found' });
    }
    
    // Rate limiting (distributed via Valkey)
    const rateLimitResult = await checkDistributedRateLimit(ip, finalConfig);
    if (!rateLimitResult.allowed) {
      res.setHeader('Retry-After', rateLimitResult.retryAfter?.toString() || '300');
      return res.status(429).json({
        error: 'Too Many Requests',
        retryAfter: rateLimitResult.retryAfter,
      });
    }
    
    next();
  };
}

/**
 * Manually block an IP address
 */
export function blockIP(ip: string): void {
  blockedIPs.add(ip);
  logger.info('WAF: IP manually blocked', {
    scope: 'superadmin',
    ip,
  });
}

/**
 * Manually unblock an IP address
 */
export function unblockIP(ip: string): void {
  blockedIPs.delete(ip);
  rateLimitStore.delete(ip);
  logger.info('WAF: IP manually unblocked', {
    scope: 'superadmin',
    ip,
  });
}

/**
 * Get WAF statistics
 */
export function getWAFStats() {
  return {
    blockedIPs: Array.from(blockedIPs),
    authenticatedIPs: Array.from(authenticatedIPs.values()).map(auth => ({
      ip: auth.ip,
      userEmail: auth.userEmail,
      lastAuthenticated: new Date(auth.lastAuthenticated).toISOString(),
      expiresAt: new Date(auth.lastAuthenticated + AUTH_GRACE_PERIOD_MS).toISOString(),
    })),
    rateLimitedIPs: Array.from(rateLimitStore.entries()).map(([ip, entry]) => ({
      ip,
      requests: entry.count,
      blocked: entry.blocked,
      blockedUntil: entry.blockedUntil,
    })),
  };
}
