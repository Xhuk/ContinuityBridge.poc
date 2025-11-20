import { Request, Response, NextFunction } from "express";
import { logger } from "../core/logger.js";

const log = logger.child("VersionContext");

/**
 * Version Context Interface
 * Defines which organization and environment the current request is scoped to
 */
export interface VersionContext {
  organizationId: string;
  environment: "dev" | "test" | "staging" | "prod";
  source: "consultant-selection" | "user-org" | "default";
}

/**
 * Extend Express Request with version context
 */
declare global {
  namespace Express {
    interface Request {
      versionContext?: VersionContext;
    }
  }
}

/**
 * Version Context Middleware
 * 
 * Extracts organization and environment from authenticated user session
 * and attaches it to the request for use in database queries.
 * 
 * Priority:
 * 1. Consultant's selected tenant (from JWT selectedTenant)
 * 2. User's own organizationId (for customer users)
 * 3. No context (superadmin sees all, but shouldn't modify customer data)
 * 
 * Usage:
 * - All queries filtering by organizationId should use req.versionContext.organizationId
 * - All queries filtering by environment should use req.versionContext.environment
 * 
 * Example:
 * ```typescript
 * const flows = await db.select()
 *   .from(flowDefinitions)
 *   .where(
 *     and(
 *       eq(flowDefinitions.organizationId, req.versionContext.organizationId),
 *       eq(flowDefinitions.targetEnvironment, req.versionContext.environment),
 *       eq(flowDefinitions.status, "deployed")
 *     )
 *   );
 * ```
 */
export function versionContextMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;

    if (!user) {
      // No authentication - skip version context
      return next();
    }

    // Priority 1: Consultant's selected tenant
    if (user.role === "consultant" && user.selectedTenant) {
      req.versionContext = {
        organizationId: user.selectedTenant.tenantId,
        environment: user.selectedTenant.environment,
        source: "consultant-selection",
      };

      log.debug("Version context set from consultant selection", {
        consultantEmail: user.email,
        organizationId: req.versionContext.organizationId,
        environment: req.versionContext.environment,
      });

      return next();
    }

    // Priority 2: User's own organization (customer_admin, customer_user)
    if (user.organizationId && ["customer_admin", "customer_user"].includes(user.role)) {
      req.versionContext = {
        organizationId: user.organizationId,
        environment: "prod", // Customers always see PROD by default
        source: "user-org",
      };

      log.debug("Version context set from user organization", {
        userEmail: user.email,
        role: user.role,
        organizationId: req.versionContext.organizationId,
      });

      return next();
    }

    // Priority 3: Superadmin - no version context (sees all)
    if (user.role === "superadmin") {
      // Superadmins don't have version context - they can see all orgs
      log.debug("Superadmin request - no version context applied", {
        userEmail: user.email,
      });

      return next();
    }

    // No version context available
    log.debug("No version context available for user", {
      userEmail: user.email,
      role: user.role,
    });

    next();
  } catch (error: any) {
    log.error("Failed to set version context", error, {
      userId: req.user?.id,
    });
    next(); // Continue without version context
  }
}

/**
 * Helper function to get version context from request
 * Throws error if version context is required but not available
 */
export function requireVersionContext(req: Request): VersionContext {
  if (!req.versionContext) {
    throw new Error("Version context required but not available. User must select an organization/environment.");
  }
  return req.versionContext;
}

/**
 * Helper function to get version context or return null
 */
export function getVersionContext(req: Request): VersionContext | null {
  return req.versionContext || null;
}
