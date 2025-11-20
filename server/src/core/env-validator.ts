import { logger } from "./logger.js";

const log = logger.child("env-validator");

/**
 * Environment Variable Validator
 * Validates required environment variables on startup
 * Prevents runtime failures from missing configuration
 */

interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validate required production environment variables
 */
export function validateEnvironment(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  const isProd = process.env.NODE_ENV === "production";

  // CRITICAL - Required in all environments
  const critical = {
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    DATABASE_URL: process.env.DATABASE_URL, // Always required for PostgreSQL
  };

  // PRODUCTION - Required for production deployment
  const production = {
    SUPERADMIN_API_KEY: process.env.SUPERADMIN_API_KEY,
    APP_URL: process.env.APP_URL || process.env.APP_DOMAIN,
    JWT_SECRET: process.env.JWT_SECRET,
  };

  // DATABASE - Check based on DB_TYPE
  const dbType = process.env.DB_TYPE || "postgres";
  if (dbType === "postgres" && !process.env.DATABASE_URL) {
    missing.push("DATABASE_URL (required when DB_TYPE=postgres)");
  }

  // Warn if using SQLite in production
  if (isProd && dbType === "sqlite") {
    warnings.push("Using SQLite in PRODUCTION (consider PostgreSQL for better concurrency)");
  }

  // OPTIONAL - Recommended but not blocking
  const optional = {
    RESEND_API_KEY: process.env.RESEND_API_KEY, // Magic links
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID, // OAuth
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    VALKEY_URL: process.env.VALKEY_URL || process.env.REDIS_URL, // Distributed caching
  };

  // Check critical variables (all environments)
  Object.entries(critical).forEach(([key, value]) => {
    if (!value) {
      missing.push(key);
    }
  });

  // Check production variables (production only)
  if (isProd) {
    Object.entries(production).forEach(([key, value]) => {
      if (!value) {
        missing.push(key);
      }
    });
  }

  // Check optional variables (warnings only)
  Object.entries(optional).forEach(([key, value]) => {
    if (!value) {
      warnings.push(key);
    }
  });

  // Validate specific formats
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
    missing.push("ENCRYPTION_KEY (must be at least 32 characters, use: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\");
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    missing.push("JWT_SECRET (must be at least 32 characters)");
  }

  if (isProd && process.env.SUPERADMIN_API_KEY && !process.env.SUPERADMIN_API_KEY.startsWith("cb_")) {
    warnings.push("SUPERADMIN_API_KEY (should start with 'cb_' prefix)");
  }

  // Validate DATABASE_URL format if present
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("postgresql://")) {
    warnings.push("DATABASE_URL (should start with 'postgresql://' for PostgreSQL)");
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Validate environment and log results
 * Exits process if critical variables are missing in production
 */
export function validateAndLogEnvironment(): void {
  const result = validateEnvironment();
  const isProd = process.env.NODE_ENV === "production";

  if (!result.valid) {
    log.error("❌ Environment validation failed", {
      missing: result.missing,
      environment: process.env.NODE_ENV,
    });

    console.error("\n🚨 CRITICAL: Missing required environment variables:");
    result.missing.forEach((key) => {
      console.error(`   ❌ ${key}`);
    });
    console.error("\nSet these variables in your .env file or environment.\n");

    if (isProd) {
      console.error("💥 Cannot start in PRODUCTION mode without required variables.\n");
      process.exit(1);
    } else {
      console.error("⚠️  Continuing in DEVELOPMENT mode, but some features may not work.\n");
    }
  } else {
    log.info("✅ Environment validation passed", {
      environment: process.env.NODE_ENV,
      warnings: result.warnings.length,
    });
  }

  // Log warnings for optional variables
  if (result.warnings.length > 0) {
    log.warn("⚠️  Optional environment variables missing:", {
      warnings: result.warnings,
    });
    console.warn("\n⚠️  Optional variables not set (some features disabled):");
    result.warnings.forEach((key) => {
      console.warn(`   • ${key}`);
    });
    console.warn("");
  }
}

/**
 * Get environment variable with fallback
 */
export function getEnvOrThrow(key: string, fallback?: string): string {
  const value = process.env[key] || fallback;
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Get JWT secret (required for authentication)
 */
export function getJwtSecret(): string {
  return getEnvOrThrow("JWT_SECRET", process.env.ENCRYPTION_KEY);
}
