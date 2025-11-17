import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { body, validationResult } from 'express-validator';
import type { Request, Response, NextFunction } from 'express';

/**
 * Security Middleware for Production Environment
 * 
 * Features:
 * - Rate limiting (prevent brute force)
 * - Helmet security headers
 * - CORS configuration
 * - Input validation
 * - Request sanitization
 */

const isProd = process.env.NODE_ENV === 'production';

/**
 * Helmet - Security headers
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  } : false,
  hsts: isProd ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
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
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
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

/**
 * Input Validation Middleware
 */
export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.type === 'field' ? err.path : undefined,
        message: err.msg,
      })),
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
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .withMessage('Password must contain uppercase, lowercase, and number');

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
