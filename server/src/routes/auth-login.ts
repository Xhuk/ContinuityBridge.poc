import { Router, Request, Response } from "express";
import { db } from "../../db";
import { users } from "../../db";
import { eq } from "drizzle-orm";
import * as crypto from "crypto";
import jwt from "jsonwebtoken";
import { magicLinkService } from "../auth/magic-link-service";
import { authRateLimit, magicLinkRateLimit, emailValidation, validateRequest } from "../middleware/security";
import { findUserByEmail } from "../utils/email-utils.js";

const router = Router();

/**
 * POST /api/auth/login/magic-link
 * Request magic link (passwordless login)
 * 🔒 Rate limited: 3 requests per minute (production)
 */
router.post("/magic-link", magicLinkRateLimit, [emailValidation], validateRequest, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    console.log(`[Auth] Magic link requested for: ${email}`);
    console.log(`[Auth] DATABASE_URL configured: ${!!process.env.DATABASE_URL}`);

    // Check if user exists (with Gmail dot notation support)
    const user = await findUserByEmail(email);
    
    if (!user) {
      console.warn(`[Auth] ⚠️  User not found in database: ${email}`);
      return res.status(404).json({ 
        error: "User not found. Contact your administrator to create an account."
      });
    }
    
    console.log(`[Auth] User found - enabled: ${user.enabled}, role: ${user.role}`);

    // Generate magic link using the actual email from database
    const baseUrl = process.env.APP_URL || 
                    (process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : null) ||
                    `${req.protocol}://${req.get("host")}`;
    const result = await magicLinkService.generateMagicLink(user.email, baseUrl);

    console.log(`[Auth] ✅ Magic link generated successfully for ${user.email}`);

    // For admin@continuitybridge.local, fetch the API key
    let apiKey: string | undefined;
    if (user.email === "admin@continuitybridge.local") {
      apiKey = user.apiKey;
    }

    // Send email via Resend (for superadmin tasks)
    const { resendService } = await import("../notifications/resend-service.js");
    
    let emailSent = false;
    try {
      await resendService.sendMagicLinkEmail(user.email, result.magicLink, result.expiresAt);
      emailSent = true;
      console.log(`📧 Magic link sent to ${user.email} via Resend`);
      if (process.env.NODE_ENV === "development") {
        console.log(`🔗 Dev Link: ${result.magicLink}`);
      }
    } catch (error: any) {
      console.error("Resend failed, trying customer SMTP:", error);
      
      // Fallback to customer SMTP if Resend fails
      try {
        const { emailService } = await import("../notifications/index.js");
        const emailTemplate = magicLinkService.getEmailTemplate(
          user.email,
          result.magicLink,
          result.expiresAt
        );
        
        await emailService.sendEmail({
          to: user.email,
          subject: emailTemplate.subject,
          html: emailTemplate.html,
          text: emailTemplate.text,
        });
        emailSent = true;
        console.log(`📧 Magic link sent to ${user.email} via customer SMTP`);
      } catch (smtpError: any) {
        console.warn(`⚠️  Email sending failed for ${user.email}:`, smtpError.message);
        // Don't throw - continue and return magic link in dev mode
      }
    }

    res.json({
      success: true,
      message: emailSent 
        ? `Magic link sent to ${email}. Check your inbox!`
        : `Magic link generated for ${email}. Email delivery unavailable - use link below.`,
      expiresIn: "15 minutes",
      // In development or if email failed, return link for testing
      ...((process.env.NODE_ENV === "development" || !emailSent) && {
        devMagicLink: result.magicLink,
      }),
      // For admin@continuitybridge.local, return API key
      ...(apiKey && { apiKey }),
    });
  } catch (error: any) {
    console.error("Magic link generation failed:", error);
    const errorMessage = error?.message || error?.toString() || "Failed to generate magic link";
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/auth/login/verify
 * Verify magic link token
 */
router.get("/verify", async (req, res) => {
  try {
    const { token } = req.query;

    console.log("[Auth] Magic link verification attempt");

    if (!token || typeof token !== "string") {
      console.error("[Auth] Invalid token format");
      return res.status(400).json({ error: "Invalid token" });
    }

    console.log("[Auth] Verifying token with service...");
    const result = await magicLinkService.verifyMagicLink(token);

    if (!result.valid) {
      console.error("[Auth] Token verification failed:", result.error);
      return res.status(401).json({ error: result.error });
    }

    console.log("[Auth] Token verified successfully for user:", result.user?.email);

    // Set session cookie
    const cookieOptions: any = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    };

    // In production, set domain for cross-subdomain cookie sharing
    if (process.env.NODE_ENV === "production" && process.env.APP_DOMAIN) {
      cookieOptions.domain = process.env.APP_DOMAIN;
    }

    res.cookie("session", result.sessionToken, cookieOptions);

    console.log("[Auth] Session cookie set, responding with success", { domain: cookieOptions.domain });

    // Redirect to dashboard (or return JSON for SPA)
    if (req.headers.accept?.includes("application/json")) {
      res.json({
        success: true,
        user: result.user,
        sessionToken: result.sessionToken,
        message: "Login successful!",
      });
    } else {
      // Redirect to dashboard
      res.redirect("/");
    }
  } catch (error: any) {
    console.error("[Auth] Magic link verification error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/login/password
 * Traditional password login (for users who prefer it)
 * 🔒 Rate limited: 5 attempts per 15 min (production)
 */
router.post("/password", authRateLimit, [emailValidation], validateRequest, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Get user (with Gmail dot notation support)
    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.enabled) {
      return res.status(403).json({ error: "Account disabled. Contact administrator." });
    }

    if (!user.passwordHash) {
      return res.status(400).json({
        error: "No password set. Use magic link login or contact administrator.",
      });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Update last login
    await (db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id)) as any);

    // Generate session token
    const sessionToken = generateSessionToken(user);

    // Set session cookie
    const cookieOptions: any = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    };

    // In production, set domain for cross-subdomain cookie sharing
    if (process.env.NODE_ENV === "production" && process.env.APP_DOMAIN) {
      cookieOptions.domain = process.env.APP_DOMAIN;
    }

    res.cookie("session", sessionToken, cookieOptions);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      sessionToken,
      message: "Login successful!",
    });
  } catch (error: any) {
    console.error("Password login failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/logout
 * Logout user
 */
router.post("/logout", (req, res) => {
  res.clearCookie("session");
  res.json({ success: true, message: "Logged out successfully" });
});

/**
 * GET /api/auth/session
 * Get current session
 */
router.get("/session", async (req, res) => {
  try {
    const sessionToken = req.cookies?.session || req.headers.authorization?.replace("Bearer ", "");

    if (!sessionToken) {
      return res.status(401).json({ authenticated: false });
    }

    // Decode session token
    const decoded = decodeSessionToken(sessionToken);

    if (!decoded) {
      return res.status(401).json({ authenticated: false, error: "Invalid or expired session" });
    }

    // Get fresh user data
    const userResult = await (db.select().from(users).where(eq(users.id, decoded.id)) as any);
    const user = Array.isArray(userResult) ? userResult[0] : userResult;

    if (!user || !user.enabled) {
      return res.status(401).json({ authenticated: false, error: "User not found or disabled" });
    }

    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organizationName,
        assignedCustomers: decoded.assignedCustomers,
        selectedTenant: decoded.selectedTenant,
      },
      permissions: {
        canExport: user.role === "superadmin",
        canManageUsers: user.role === "superadmin",
        canBuildFlows: ["superadmin", "contractor"].includes(user.role),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions

function generateSessionToken(user: any): string {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("JWT_SECRET not configured - cannot generate session tokens");
  }

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  };

  // Generate JWT with 7-day expiration
  return jwt.sign(payload, jwtSecret, {
    expiresIn: "7d",
    issuer: "continuitybridge",
    audience: "continuitybridge-app",
  });
}

function decodeSessionToken(token: string): any {
  try {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error("JWT_SECRET not configured - cannot verify tokens");
      return null;
    }

    // Verify and decode JWT
    const decoded = jwt.verify(token, jwtSecret, {
      issuer: "continuitybridge",
      audience: "continuitybridge-app",
    });

    return decoded;
  } catch (error) {
    // Invalid or expired token
    return null;
  }
}

async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
      if (err) reject(err);
      resolve(key === derivedKey.toString("hex"));
    });
  });
}

export default router;
export { hashPassword, verifyPassword };

