/**
 * API Rate Limiter Configuration
 * Protects endpoints from abuse and DDoS attacks
 */

import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import type { Request, Response } from 'express';

/**
 * Default rate limiter for general API endpoints
 * Limits: 100 requests per 15 minutes
 */
export const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes',
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please slow down.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

/**
 * Strict limiter for authentication endpoints
 * Limits: 5 login attempts per 15 minutes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // Don't count successful logins
  standardHeaders: true,
  message: {
    error: 'Too many login attempts, account temporarily locked',
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Account locked',
      message: 'Too many failed login attempts. Please try again after 15 minutes.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

/**
 * AI endpoint limiter (prevents token abuse)
 * Limits: 20 AI requests per 5 minutes
 */
export const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  standardHeaders: true,
  message: {
    error: 'AI rate limit exceeded',
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'AI request quota exceeded',
      message: 'Too many AI requests. Please wait before making more calls.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

/**
 * Webhook rate limiter
 * Limits: 1000 requests per minute (per webhook slug)
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000,
  standardHeaders: true,
  keyGenerator: (req: Request) => {
    // Rate limit per webhook slug + IP
    const webhookSlug = req.params.slug || 'unknown';
    return `${req.ip}-${webhookSlug}`;
  },
  message: {
    error: 'Webhook rate limit exceeded',
  },
});

/**
 * File upload limiter
 * Limits: 10 uploads per hour
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  message: {
    error: 'Upload quota exceeded',
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Upload limit exceeded',
      message: 'Too many file uploads. Please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

/**
 * API key creation limiter (prevent API key farming)
 * Limits: 3 API keys per hour
 */
export const apiKeyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  message: {
    error: 'API key creation limit exceeded',
  },
});

/**
 * Speed limiter (slows down responses after threshold)
 * Applies 100ms delay after 50 requests per 15 minutes
 */
export const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50, // Start delaying after 50 requests
  delayMs: (hits) => hits * 100, // 100ms delay per request over limit
  maxDelayMs: 5000, // Max delay of 5 seconds
});

/**
 * Organization-specific rate limiter
 * Limits based on license tier
 */
export const createOrgLimiter = (maxRequests: number, windowMs: number = 60000) => {
  return rateLimit({
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    keyGenerator: (req: Request) => {
      // Rate limit per organization
      const orgId = (req as any).user?.organizationId || req.ip;
      return `org-${orgId}`;
    },
    message: {
      error: 'Organization rate limit exceeded',
    },
  });
};

/**
 * Apply rate limiters based on endpoint sensitivity
 * 
 * Usage:
 * ```ts
 * import { authLimiter, defaultLimiter, aiLimiter } from './rate-limiters.js';
 * 
 * // Protect authentication
 * app.post('/api/auth/login', authLimiter, loginHandler);
 * 
 * // Protect AI endpoints
 * app.post('/api/ai/smart-mapping', aiLimiter, mappingHandler);
 * 
 * // General protection
 * app.use('/api/', defaultLimiter);
 * ```
 */

/**
 * Rate limit configuration for different license tiers
 */
export const TIER_LIMITS = {
  trial: {
    apiRequestsPerMinute: 30,
    webhooksPerMinute: 100,
    aiRequestsPerHour: 50,
  },
  annual: {
    apiRequestsPerMinute: 100,
    webhooksPerMinute: 500,
    aiRequestsPerHour: 200,
  },
  perpetual: {
    apiRequestsPerMinute: 200,
    webhooksPerMinute: 1000,
    aiRequestsPerHour: 500,
  },
  superadmin: {
    apiRequestsPerMinute: Infinity,
    webhooksPerMinute: Infinity,
    aiRequestsPerHour: Infinity,
  },
};
