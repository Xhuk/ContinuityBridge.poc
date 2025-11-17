import { Request, Response, NextFunction } from "express";
import { db } from "../../db";
import { users } from "../../schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * RBAC Middleware - Role-Based Access Control
 * 
 * Roles:
 * - superadmin: Full system access (export, license generation, user management, all customers)
 * - consultant: Customer-scoped admin (manages assigned customers, creates/edits flows, views error dashboard)
 * - customer_admin: Self-service configuration (manages own company flows, users, error dashboard)
 * - customer_user: Read-only access (can only view and track errors on dashboard)
 */

export type UserRole = "superadmin" | "consultant" | "customer_admin" | "customer_user";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId?: string;
  assignedCustomers?: string[]; // For consultants with multi-customer access
  selectedTenant?: {
    tenantId: string;
    environment: "dev" | "test" | "staging" | "prod";
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Authenticate user from session/token
 * Supports optional bypass in development via AUTH_GUARD_ENABLED env variable
 * 
 * FOUNDERS INSTANCE (Render/Vercel):
 * - Production: ALWAYS enforced (cannot be disabled)
 * - Development: Optional toggle via AUTH_GUARD_ENABLED (default: false)
 * 
 * CUSTOMER EXPORTS:
 * - Receives configurable AUTH_GUARD_ENABLED in their .env template
 * - Can toggle for their development/testing environments
 */
export async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // PRODUCTION SECURITY: Authentication ALWAYS required
    // No bypass allowed - all requests must be authenticated via:
    // 1. API key (X-API-Key header)
    // 2. Bearer token (Authorization header)
    // 3. Session cookie (from magic link or password login)

    // Check for API key in header (for Render deployment)
    const apiKey = req.headers["x-api-key"] as string;
    const authHeader = req.headers["authorization"]?.replace("Bearer ", "");
    const sessionCookie = (req as any).cookies?.session; // From cookie-parser

    let user: AuthenticatedUser | null = null;

    if (apiKey) {
      // Validate API key (for superadmin/founder CLI access)
      // Check against SUPERADMIN_API_KEY or known founder keys
      const founderKeys = [
        process.env.SUPERADMIN_API_KEY,
        "cb_7c4b95070693970cd52ab9948ba71098b4b310a35a2c83b06794429bc3d145cb", // Jesus (Founder)
      ].filter(Boolean);

      if (founderKeys.includes(apiKey)) {
        const domain = process.env.APP_DOMAIN || "networkvoid.xyz";
        user = {
          id: "founder",
          email: `founder@${domain}`,
          role: "superadmin",
        };
      } else {
        // Check contractor API keys in database
        const userRecord = await (db
          .select()
          .from(users)
          .where(eq(users.apiKey, apiKey)) as any);

        const userData = userRecord[0];
        if (userData) {
          user = {
            id: userData.id,
            email: userData.email,
            role: userData.role as UserRole,
            organizationId: userData.organizationId || undefined,
            assignedCustomers: userData.assignedCustomers || undefined,
          };
        }
      }
    } else if (sessionCookie || authHeader) {
      // Validate session token (from magic link or password login)
      const sessionToken = sessionCookie || authHeader;
      const decoded = decodeSessionToken(sessionToken);
      
      if (decoded) {
        user = decoded;
      }
    }

    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    req.user = user;
    next();
  } catch (error: any) {
    console.error("Authentication error:", error);
    res.status(401).json({ error: "Invalid authentication" });
  }
}

/**
 * Require specific role(s)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        required: allowedRoles,
        current: req.user.role,
      });
    }

    next();
  };
}

/**
 * Require superadmin role (export/license operations)
 */
export const requireSuperAdmin = requireRole("superadmin");

/**
 * Require consultant or higher (flow building, customer management)
 */
export const requireConsultant = requireRole("superadmin", "consultant");

/**
 * Decode and verify JWT session token
 */
function decodeSessionToken(token: string): AuthenticatedUser | null {
  try {
    const jwtSecret = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
    
    if (!jwtSecret) {
      console.error("JWT_SECRET or ENCRYPTION_KEY not set - cannot verify tokens");
      return null;
    }

    // Verify and decode JWT
    const decoded = jwt.verify(token, jwtSecret) as any;
    
    // Validate required fields
    if (!decoded.id || !decoded.email || !decoded.role) {
      return null;
    }
    
    return {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      organizationId: decoded.organizationId,
      assignedCustomers: decoded.assignedCustomers,
      selectedTenant: decoded.selectedTenant,
    };
  } catch (error: any) {
    // JWT verification failed (expired, invalid signature, etc.)
    console.debug("JWT verification failed:", error.message);
    return null;
  }
}

/**
 * Generate JWT session token
 */
export function generateSessionToken(user: AuthenticatedUser, expiresIn: string = "7d"): string {
  const jwtSecret = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
  
  if (!jwtSecret) {
    throw new Error("JWT_SECRET or ENCRYPTION_KEY not set - cannot generate tokens");
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      assignedCustomers: user.assignedCustomers,
      selectedTenant: user.selectedTenant,
    },
    jwtSecret,
    { expiresIn } as jwt.SignOptions
  );
}
