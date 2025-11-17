import { db } from "../../db.js";
import { users, systemLogs } from "../../schema.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { hashPassword } from "../routes/auth-login.js";
import { logger } from "../core/logger.js";

/**
 * First-Run Setup
 * 
 * On first deployment to Render (or any environment):
 * 1. Check if superadmin exists
 * 2. If not, create jesus.cruzado@gmail.com as superadmin
 * 3. Validate required environment variables
 * 4. Initialize system defaults
 */

const SUPERADMIN_EMAIL = "jesus.cruzado@gmail.com";

export interface SystemReadiness {
  ready: boolean;
  firstRun: boolean;
  superadminExists: boolean;
  missingRequirements: string[];
  warnings: string[];
}

/**
 * Check if this is first run and setup system
 */
export async function checkFirstRun(): Promise<SystemReadiness> {
  const result: SystemReadiness = {
    ready: false,
    firstRun: false,
    superadminExists: false,
    missingRequirements: [],
    warnings: [],
  };

  try {
    // Check if superadmin exists
    const superadminResult = await (db.select() as any)
      .from(users)
      .where(eq(users.email, SUPERADMIN_EMAIL))
      .limit(1);
    
    const superadmin = superadminResult[0];
    result.superadminExists = !!superadmin;

    if (!superadmin) {
      result.firstRun = true;
      logger.info("First run detected - creating superadmin", {
        scope: "superadmin",
        email: SUPERADMIN_EMAIL,
      });

      // Create superadmin with default password
      const apiKey = `cb_${randomUUID().replace(/-/g, "")}`;
      const tempPassword = await hashPassword(generateTempPassword());

      await (db.insert(users) as any).values({
        id: randomUUID(),
        email: SUPERADMIN_EMAIL,
        passwordHash: tempPassword,
        role: "superadmin",
        apiKey,
        organizationId: null,
        organizationName: "ContinuityBridge Admin",
        enabled: true,
        metadata: {
          createdBySystem: true,
          firstRun: true,
          mustChangePassword: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      logger.info("Superadmin created successfully", {
        scope: "superadmin",
        email: SUPERADMIN_EMAIL,
        apiKey: apiKey.substring(0, 10) + "...",
      });

      result.warnings.push(
        `Superadmin account created: ${SUPERADMIN_EMAIL}`,
        `Temporary password has been set - YOU MUST CHANGE IT ON FIRST LOGIN`,
        `API Key: ${apiKey} (save this securely!)`
      );
    }

    // Check required environment variables
    result.missingRequirements = checkRequiredEnvironment();

    // System is ready if superadmin exists and no critical missing vars
    result.ready = result.superadminExists && result.missingRequirements.length === 0;

    return result;
  } catch (error: any) {
    logger.error("First run check failed", error, {
      scope: "superadmin",
    });
    result.missingRequirements.push(`Database connection failed: ${error.message}`);
    return result;
  }
}

/**
 * Check required environment variables
 */
function checkRequiredEnvironment(): string[] {
  const missing: string[] = [];
  const isProd = process.env.NODE_ENV === "production";

  // Critical for production
  if (isProd) {
    if (!process.env.SUPERADMIN_API_KEY) {
      missing.push("SUPERADMIN_API_KEY");
    }
    if (!process.env.ENCRYPTION_KEY) {
      missing.push("ENCRYPTION_KEY");
    }
    if (!process.env.APP_URL && !process.env.APP_DOMAIN) {
      missing.push("APP_URL or APP_DOMAIN");
    }
  }

  // Important for email functionality
  if (!process.env.RESEND_API_KEY) {
    missing.push("RESEND_API_KEY (magic links won't work)");
  }

  // OAuth2 (optional but recommended)
  if (!process.env.GOOGLE_CLIENT_ID && isProd) {
    missing.push("GOOGLE_CLIENT_ID (OAuth2 login disabled)");
  }

  return missing;
}

/**
 * Generate secure temporary password
 */
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*";
  let password = "";
  
  // Ensure complexity requirements
  password += "CB"; // Uppercase
  password += "temp"; // Lowercase
  password += "2025"; // Numbers
  password += "!"; // Special
  
  // Add random chars
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return password;
}

/**
 * Display system readiness banner
 */
export function displayReadinessBanner(readiness: SystemReadiness): void {
  console.log("\n" + "=".repeat(70));
  console.log("  CONTINUITY BRIDGE - SYSTEM READINESS CHECK");
  console.log("=".repeat(70));
  
  if (readiness.firstRun) {
    console.log("\n🎉 FIRST RUN DETECTED");
    console.log("─".repeat(70));
  }

  if (readiness.superadminExists) {
    console.log("\n✅ Superadmin Account: EXISTS");
    console.log(`   Email: ${SUPERADMIN_EMAIL}`);
  } else {
    console.log("\n❌ Superadmin Account: NOT FOUND");
  }

  if (readiness.missingRequirements.length > 0) {
    console.log("\n⚠️  MISSING REQUIREMENTS:");
    console.log("─".repeat(70));
    readiness.missingRequirements.forEach((req) => {
      console.log(`   ❌ ${req}`);
    });
  } else {
    console.log("\n✅ All required environment variables present");
  }

  if (readiness.warnings.length > 0) {
    console.log("\n⚠️  WARNINGS:");
    console.log("─".repeat(70));
    readiness.warnings.forEach((warning) => {
      console.log(`   ⚠️  ${warning}`);
    });
  }

  console.log("\n" + "─".repeat(70));
  
  if (readiness.ready) {
    console.log("✅ SYSTEM READY");
    console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🔗 Domain: ${process.env.APP_DOMAIN || "localhost"}`);
  } else {
    console.log("❌ SYSTEM NOT READY - Fix issues above");
  }
  
  console.log("=".repeat(70) + "\n");
}

/**
 * Get system requirements status (for API endpoint)
 */
export async function getSystemRequirements(): Promise<{
  environment: string;
  database: { connected: boolean; type: string };
  email: { configured: boolean; provider: string };
  oauth: { google: boolean; configured: boolean };
  domain: { configured: boolean; url: string };
  superadmin: { exists: boolean; email: string };
  security: { apiKeySet: boolean; encryptionKeySet: boolean };
}> {
  let dbConnected = false;
  try {
    await (db.select() as any).from(users).limit(1);
    dbConnected = true;
  } catch {}

  const superadminResult = await (db.select() as any)
    .from(users)
    .where(eq(users.email, SUPERADMIN_EMAIL))
    .limit(1);
  
  const superadmin = superadminResult[0];

  return {
    environment: process.env.NODE_ENV || "development",
    database: {
      connected: dbConnected,
      type: process.env.DB_TYPE || "sqlite",
    },
    email: {
      configured: !!process.env.RESEND_API_KEY,
      provider: process.env.RESEND_API_KEY ? "Resend" : "None",
    },
    oauth: {
      google: !!process.env.GOOGLE_CLIENT_ID,
      configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    domain: {
      configured: !!(process.env.APP_URL || process.env.APP_DOMAIN),
      url: process.env.APP_URL || `https://${process.env.APP_DOMAIN}` || "http://localhost:5000",
    },
    superadmin: {
      exists: !!superadmin,
      email: SUPERADMIN_EMAIL,
    },
    security: {
      apiKeySet: !!process.env.SUPERADMIN_API_KEY,
      encryptionKeySet: !!process.env.ENCRYPTION_KEY,
    },
  };
}
