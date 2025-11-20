import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { body, validationResult } from 'express-validator';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../core/logger.js';
import { db } from '../../db.js';
import { systemLogs } from '../../db';

const securityLog = logger.child("SecurityMiddleware");

/**
 * Security Middleware for Production Environment
 * 
 * Features:
 * - Rate limiting (prevent brute force)
 * - Helmet security headers
 * - CORS configuration
 * - Input validation
 * - Request sanitization
 * - Audit logging for security events
 */

const isProd = process.env.NODE_ENV === 'production';

/**
 * Enhanced Helmet - Security headers with comprehensive protection
 * CSP hardened for production (no unsafe-inline)
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"], // Removed 'unsafe-inline' - use nonces
      styleSrc: ["'self'", "https://fonts.googleapis.com"], // Removed 'unsafe-inline'
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  } : false, // Disable CSP in development for easier debugging
  hsts: isProd ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
  frameguard: {
    action: 'deny',
  },
  hidePoweredBy: true,
  noSniff: true,
  xssFilter: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: true,
  originAgentCluster: true,
  dnsPrefetchControl: true,
  ieNoOpen: true,
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },
});

/**
 * CORS - Cross-Origin Resource Sharing
 */
export const corsConfig = cors({
  origin: (origin, callback) => {
    if (!isProd) {
      // Development: Allow all origins
      callback(null, true);
      return;
    }

    // Production: Whitelist domains
    const allowedOrigins = [
      process.env.APP_URL,
      `https://${process.env.APP_DOMAIN}`,
      'https://networkvoid.xyz',
      'https://demo-poc-vuw3.onrender.com', // Render deployment
    ].filter(Boolean);

    // Allow requests with no origin (same-origin requests, static assets)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
});

/**
 * Rate Limiting - Prevent brute force attacks
 */

// General API rate limit
export const apiRateLimit = rateLimit({
  windowMs: isProd ? 15 * 60 * 1000 : 60 * 1000, // 15 min (prod) / 1 min (dev)
  max: isProd ? 100 : 1000, // 100 requests per window (prod) / 1000 (dev)
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development for localhost
    if (!isProd && (req.ip === '127.0.0.1' || req.ip === '::1')) {
      return true;
    }
    return false;
  },
});

// Strict rate limit for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: isProd ? 15 * 60 * 1000 : 60 * 1000,
  max: isProd ? 5 : 100, // 5 login attempts per 15 min (prod)
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true,
});

// Magic link rate limit (prevent email spam)
export const magicLinkRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isProd ? 3 : 20, // 3 magic links per minute (prod)
  message: 'Too many magic link requests, please wait before trying again',
});

// Export/License operations rate limit (expensive operations)
export const exportRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isProd ? 10 : 100, // 10 exports per hour (prod)
  message: 'Export limit reached, please try again later',
});

// Secrets vault rate limit (highly sensitive operations)
export const secretsVaultRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Only 3 attempts per 15 minutes
  message: 'Too many vault access attempts, please try again later',
  skipSuccessfulRequests: true,
  handler: async (req, res) => {
  // Log security event
  await securityAuditLog('Secrets vault rate limit exceeded', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    path: req.path,
    timestamp: new Date().toISOString(),
  });
    
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many vault access attempts, please try again later',
    });
  }
});

/**
 * Audit Logging for Security Events
 * Logs to BOTH file (Winston) AND database (systemLogs table)
 */
export const securityAuditLog = async (event: string, details: Record<string, any>) => {
  const logData = {
    ...details,
    timestamp: new Date().toISOString(),
  };
  
  // Log to file via Winston
  securityLog.info(`[Security Audit] ${event}`, logData);
  
  // Persist to database for compliance
  try {
    await db.insert(systemLogs).values({
      level: 'info',
      scope: 'superadmin',
      service: 'security',
      component: 'audit',
      message: `[Security Audit] ${event}`,
      metadata: logData,
      userId: details.userId || null,
      organizationId: details.organizationId || null,
      requestId: details.requestId || null,
      httpMethod: details.method || null,
      httpPath: details.path || null,
      httpStatus: details.status || null,
      createdAt: new Date(),
    });
  } catch (error) {
    // Don't fail the request if audit logging fails
    securityLog.error('Failed to persist security audit log to database', {
      error: (error as Error).message,
      event,
    });
  }
};

/**
 * Input Validation Middleware
 */
export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Create user-friendly error messages
    const userFriendlyErrors = errors.array().map(err => ({
      field: err.type === 'field' ? err.path : 'unknown',
      message: err.msg,
      // Provide more context for common validation errors
      ...(err.msg.includes('required') && { suggestion: 'This field is required' }),
      ...(err.msg.includes('email') && { suggestion: 'Please enter a valid email address' }),
      ...(err.msg.includes('password') && { suggestion: 'Password must be at least 8 characters with uppercase, lowercase, and number' }),
      ...(err.msg.includes('API key') && { suggestion: 'API key must be in the correct format' }),
    }));
    
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Please check the form and try again',
      details: userFriendlyErrors,
    });
  }
  next();
};

/**
 * Common Validation Rules
 */
export const emailValidation = body('email')
  .isEmail()
  .normalizeEmail()
  .withMessage('Valid email required');

export const passwordValidation = body('password')
  .isLength({ min: 12 })
  .withMessage('Password must be at least 12 characters')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/?])/)  
  .withMessage('Password must contain uppercase, lowercase, number, and special character');

export const apiKeyValidation = body('apiKey')
  .isLength({ min: 32 })
  .matches(/^cb_[a-f0-9]{32}$/)
  .withMessage('Invalid API key format');

/**
 * Request Sanitization
 */
export const sanitizeRequest = (req: Request, res: Response, next: NextFunction) => {
  // Remove null bytes
  if (req.body) {
    req.body = JSON.parse(JSON.stringify(req.body).replace(/\0/g, ''));
  }

  // Limit request size (already done by express.json({ limit: '10mb' }))
  
  next();
};

/**
 * Production-only middleware wrapper
 */
export const prodOnly = (middleware: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isProd) {
      return middleware(req, res, next);
    }
    next();
  };
};

/**
 * Environment guard - Block sensitive endpoints in development
 */
export const requireProduction = (req: Request, res: Response, next: NextFunction) => {
  if (!isProd) {
    return res.status(403).json({
      error: 'This endpoint is only available in production',
      environment: process.env.NODE_ENV,
    });
  }
  next();
};

/**
 * Health check - Bypasses all security
 */
export const isHealthCheck = (req: Request): boolean => {
  return req.path === '/health' || req.path === '/api/health';
};
