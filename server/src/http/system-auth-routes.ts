/**
 * ⚠️ CRITICAL SECURITY WARNING ⚠️
 * 
 * DO NOT REGISTER THESE ROUTES IN PRODUCTION!
 * 
 * These routes implement per-system authentication configuration but lack
 * tenant ownership verification. Any caller who knows a system instance ID
 * can manage auth configs for that instance, even across different tenants.
 * 
 * BLOCKING DEPENDENCY: Authentication middleware required
 * 
 * Routes must NOT be registered until:
 * 1. Authentication middleware identifies request tenant (session/JWT/API key)
 * 2. ensureSystemInstanceExists() verifies tenant ownership
 * 3. Integration tests validate 403 responses for cross-tenant access
 * 
 * Current state: Code complete, security gap prevents deployment
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { IStorage } from "../../storage";
import type { SystemInstanceAuth } from "../../db";

// ============================================================================
// Zod Validation Schemas
// ============================================================================

// OAuth2 config schema
const oauth2ConfigSchema = z.object({
  inbound: z.object({
    headerName: z.string().optional(),
    headerPrefix: z.string().optional(),
    cookieName: z.string().optional(),
    queryParam: z.string().optional(),
    bodyField: z.string().optional(),
    introspectionUrl: z.string().optional(),
    introspectionMethod: z.enum(["POST", "GET", "PUT", "PATCH", "DELETE"]).optional(),
    introspectionHeaders: z.record(z.string()).optional(),
  }).optional(),
  outbound: z.object({
    tokenUrl: z.string(),
    tokenRequestMethod: z.enum(["POST", "GET", "PUT", "PATCH", "DELETE"]).default("POST"),
    tokenRequestHeaders: z.record(z.string()).optional(),
    grantType: z.enum(["client_credentials", "authorization_code", "refresh_token"]).default("client_credentials"),
    scope: z.string().optional(),
    audience: z.string().optional(),
    placement: z.enum(["header", "cookie", "query", "body"]),
    headerName: z.string().optional(),
    headerPrefix: z.string().optional(),
    cookieName: z.string().optional(),
    cookieOptions: z.object({
      httpOnly: z.boolean().optional(),
      secure: z.boolean().optional(),
      sameSite: z.enum(["strict", "lax", "none"]).optional(),
    }).optional(),
    queryParam: z.string().optional(),
    bodyField: z.string().optional(),
    bodyEncoding: z.enum(["json", "form"]).optional(),
  }).optional(),
}).refine(
  (data) => data.inbound || data.outbound,
  { message: "At least one of inbound or outbound config must be provided" }
);

// JWT config schema
const jwtConfigSchema = z.object({
  inbound: z.object({
    headerName: z.string().optional(),
    headerPrefix: z.string().optional(),
    cookieName: z.string().optional(),
    queryParam: z.string().optional(),
    bodyField: z.string().optional(),
    jwtAlgorithm: z.string().optional(),
    jwtIssuer: z.string().optional(),
    jwtAudience: z.string().optional(),
  }).optional(),
  outbound: z.object({
    placement: z.enum(["header", "cookie", "query", "body"]),
    headerName: z.string().optional(),
    headerPrefix: z.string().optional(),
    cookieName: z.string().optional(),
    queryParam: z.string().optional(),
    bodyField: z.string().optional(),
    jwtAlgorithm: z.string().optional(),
    jwtExpiresIn: z.string().optional(),
    jwtClaims: z.record(z.unknown()).optional(),
  }).optional(),
}).refine(
  (data) => data.inbound || data.outbound,
  { message: "At least one of inbound or outbound config must be provided" }
);

// Cookie config schema
const cookieConfigSchema = z.object({
  inbound: z.object({
    cookieName: z.string(),
    idleTimeout: z.number().optional(),
  }).optional(),
  outbound: z.object({
    placement: z.enum(["header", "cookie", "query", "body"]),
    cookieName: z.string().optional(),
    cookieOptions: z.object({
      httpOnly: z.boolean().optional(),
      secure: z.boolean().optional(),
      sameSite: z.enum(["strict", "lax", "none"]).optional(),
    }).optional(),
  }).optional(),
}).refine(
  (data) => data.inbound || data.outbound,
  { message: "At least one of inbound or outbound config must be provided" }
);

// API Key config schema
const apikeyConfigSchema = z.object({
  inbound: z.object({
    headerName: z.string().optional(),
    headerPrefix: z.string().optional(),
    queryParam: z.string().optional(),
    bodyField: z.string().optional(),
  }).optional(),
  outbound: z.object({
    placement: z.enum(["header", "cookie", "query", "body"]),
    headerName: z.string().optional(),
    headerPrefix: z.string().optional(),
    queryParam: z.string().optional(),
    bodyField: z.string().optional(),
  }).optional(),
}).refine(
  (data) => data.inbound || data.outbound,
  { message: "At least one of inbound or outbound config must be provided" }
);

// Base create schema with discriminated union for config
const createSystemAuthSchema = z.discriminatedUnion("adapterType", [
  z.object({
    adapterType: z.literal("oauth2"),
    name: z.string().min(1),
    description: z.string().optional(),
    direction: z.enum(["inbound", "outbound", "bidirectional"]),
    secretRef: z.string().optional(),
    config: oauth2ConfigSchema,
    enabled: z.boolean().optional(),
  }),
  z.object({
    adapterType: z.literal("jwt"),
    name: z.string().min(1),
    description: z.string().optional(),
    direction: z.enum(["inbound", "outbound", "bidirectional"]),
    secretRef: z.string().optional(),
    config: jwtConfigSchema,
    enabled: z.boolean().optional(),
  }),
  z.object({
    adapterType: z.literal("cookie"),
    name: z.string().min(1),
    description: z.string().optional(),
    direction: z.enum(["inbound", "outbound", "bidirectional"]),
    secretRef: z.string().optional(),
    config: cookieConfigSchema,
    enabled: z.boolean().optional(),
  }),
  z.object({
    adapterType: z.literal("apikey"),
    name: z.string().min(1),
    description: z.string().optional(),
    direction: z.enum(["inbound", "outbound", "bidirectional"]),
    secretRef: z.string().optional(),
    config: apikeyConfigSchema,
    enabled: z.boolean().optional(),
  }),
]);

// Partial update schema (allows partial config updates)
const updateSystemAuthSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  config: z.object({}).passthrough().optional(), // Accept any config structure for now
  enabled: z.boolean().optional(),
  secretRef: z.string().optional(),
}).strict();

// Query filter schema for GET endpoint
const queryFiltersSchema = z.object({
  direction: z.enum(["inbound", "outbound", "bidirectional"]).optional(),
  enabled: z.enum(["true", "false"]).optional(),
  adapterType: z.enum(["oauth2", "jwt", "cookie", "apikey"]).optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates that a system instance exists AND belongs to the authenticated user's organization.
 * Returns the instance if valid, throws error otherwise.
 * 
 * PRODUCTION IMPLEMENTATION:
 * - ✅ Checks if system instance exists (returns 404 if not found)
 * - ✅ Verifies tenant ownership via organizationId matching
 * - ✅ Superadmin can access all instances
 * - ✅ Consultants can access assigned customer instances
 * - ✅ Customers can only access their own instances
 * 
 * SECURITY: Prevents cross-tenant access attempts
 */
async function validateSystemInstanceAccess(
  storage: IStorage,
  systemInstanceId: string,
  user?: { id: string; role: string; organizationId?: string; assignedCustomers?: string[] }
): Promise<any> {
  if (!storage.getSystemInstance) {
    throw new Error("getSystemInstance not implemented");
  }

  const instance = await storage.getSystemInstance(systemInstanceId);
  if (!instance) {
    const error: any = new Error("System instance not found");
    error.statusCode = 404;
    throw error;
  }

  // If no user provided (unauthenticated), deny access
  if (!user) {
    const error: any = new Error("Authentication required");
    error.statusCode = 401;
    throw error;
  }

  // Superadmin can access all instances
  if (user.role === "superadmin") {
    return instance;
  }

  // Get the organizationId from the instance's hierarchy
  // System Instance → Environment → Ecosystem → Tenant
  let instanceOrgId: string | undefined;
  
  // Use metadata or environmentId to determine ownership
  if ((instance as any).organizationId) {
    instanceOrgId = (instance as any).organizationId;
  } else if (instance.metadata && typeof instance.metadata === 'object') {
    // Check metadata for organizationId
    instanceOrgId = (instance.metadata as any).organizationId;
  }
  
  // If environmentId exists, try to fetch hierarchy (if methods available)
  if (!instanceOrgId && instance.environmentId) {
    try {
      const { db } = await import("../../db.js");
      const { environments, ecosystems } = await import("../../schema.js");
      const { eq } = await import("drizzle-orm");
      
      const environment = await (db.select() as any)
        .from(environments)
        .where(eq(environments.id, instance.environmentId))
        .get();
      
      if (environment?.ecosystemId) {
        const ecosystem = await (db.select() as any)
          .from(ecosystems)
          .where(eq(ecosystems.id, environment.ecosystemId))
          .get();
        
        if (ecosystem?.tenantId) {
          instanceOrgId = ecosystem.tenantId;
        }
      }
    } catch (dbError) {
      // If hierarchy lookup fails, continue without organizationId
      console.warn("[SystemAuthRoutes] Failed to lookup instance hierarchy:", dbError);
    }
  }

  // If we can't determine organizationId, deny access (fail-safe)
  if (!instanceOrgId) {
    const error: any = new Error("Unable to determine instance ownership");
    error.statusCode = 403;
    throw error;
  }

  // Check tenant ownership
  if (user.role === "consultant") {
    // Consultant must have this org in assigned customers
    const assignedCustomers = user.assignedCustomers || [];
    if (!assignedCustomers.includes(instanceOrgId)) {
      const error: any = new Error("Access denied: Instance belongs to unassigned customer");
      error.statusCode = 403;
      throw error;
    }
  } else {
    // Customer admin/user must match organizationId
    if (user.organizationId !== instanceOrgId) {
      const error: any = new Error("Access denied: Cross-tenant access not allowed");
      error.statusCode = 403;
      throw error;
    }
  }

  return instance;
}

/**
 * Standard error response format
 */
function errorResponse(res: Response, status: number, error: string, details?: unknown) {
  const response: { error: string; message: string; details?: unknown } = {
    error,
    message: error,
  };
  
  if (details) {
    response.details = details;
  }
  
  return res.status(status).json(response);
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Register system auth routes
 */
export function registerSystemAuthRoutes(app: Express, storage: IStorage) {
  /**
   * GET /api/system-instances/:id/auth
   * List auth configurations with optional filtering
   */
  app.get("/api/system-instances/:id/auth", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Validate access and tenant ownership
      await validateSystemInstanceAccess(storage, id, (req as any).user);

      // Parse and validate query filters
      const queryResult = queryFiltersSchema.safeParse(req.query);
      if (!queryResult.success) {
        return errorResponse(res, 400, "Invalid query parameters", queryResult.error.errors);
      }

      const filters = {
        direction: queryResult.data.direction,
        enabled: queryResult.data.enabled === "true" ? true : queryResult.data.enabled === "false" ? false : undefined,
        adapterType: queryResult.data.adapterType,
      };

      const auths = await storage.getSystemAuths!(id, filters);
      return res.json(auths);
    } catch (error: any) {
      console.error("[SystemAuthRoutes] Error listing auth configs:", error);
      const statusCode = error.statusCode || 500;
      return errorResponse(res, statusCode, error.message || "Internal server error");
    }
  });

  /**
   * POST /api/system-instances/:id/auth
   * Create new auth configuration
   */
  app.post("/api/system-instances/:id/auth", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Validate access and tenant ownership
      await validateSystemInstanceAccess(storage, id, (req as any).user);

      // Validate request body
      const validationResult = createSystemAuthSchema.safeParse(req.body);
      if (!validationResult.success) {
        return errorResponse(res, 400, "Validation failed", validationResult.error.errors);
      }

      const data = validationResult.data;

      // Check for duplicate name (pre-check)
      const existing = await storage.getSystemAuthByName!(id, data.name);
      if (existing) {
        return errorResponse(res, 409, "Auth configuration with this name already exists");
      }

      // Create auth config
      try {
        const auth = await storage.createSystemAuth!({
          systemInstanceId: id,
          name: data.name,
          description: data.description,
          adapterType: data.adapterType,
          direction: data.direction,
          secretRef: data.secretRef,
          config: data.config as any,
          enabled: data.enabled,
        });

        return res.status(201).json(auth);
      } catch (dbError: any) {
        // Catch UNIQUE constraint violation as fallback
        if (dbError.message?.includes("UNIQUE") || dbError.message?.includes("unique")) {
          return errorResponse(res, 409, "Auth configuration with this name already exists");
        }
        throw dbError;
      }
    } catch (error: any) {
      console.error("[SystemAuthRoutes] Error creating auth config:", error);
      const statusCode = error.statusCode || 500;
      return errorResponse(res, statusCode, error.message || "Internal server error");
    }
  });

  /**
   * PATCH /api/system-instances/:id/auth/:authId
   * Update existing auth configuration
   */
  app.patch("/api/system-instances/:id/auth/:authId", async (req: Request, res: Response) => {
    try {
      const { id, authId } = req.params;

      // Validate access and tenant ownership
      await validateSystemInstanceAccess(storage, id, (req as any).user);

      // Validate request body
      const validationResult = updateSystemAuthSchema.safeParse(req.body);
      if (!validationResult.success) {
        return errorResponse(res, 400, "Validation failed", validationResult.error.errors);
      }

      const data = validationResult.data;

      // Check if auth config exists
      const existingAuth = await storage.getSystemAuth!(authId);
      if (!existingAuth) {
        return errorResponse(res, 404, "Auth configuration not found");
      }

      // Verify auth config belongs to this system instance
      if (existingAuth.systemInstanceId !== id) {
        return errorResponse(res, 404, "Auth configuration not found");
      }

      // Check for duplicate name if renaming (pre-check)
      if (data.name && data.name !== existingAuth.name) {
        const duplicate = await storage.getSystemAuthByName!(id, data.name);
        if (duplicate && duplicate.id !== authId) {
          return errorResponse(res, 409, "Auth configuration with this name already exists");
        }
      }

      // Update auth config
      try {
        const auth = await storage.updateSystemAuth!(authId, data);

        if (!auth) {
          return errorResponse(res, 404, "Auth configuration not found");
        }

        return res.json(auth);
      } catch (dbError: any) {
        // Catch UNIQUE constraint violation as fallback
        if (dbError.message?.includes("UNIQUE") || dbError.message?.includes("unique")) {
          return errorResponse(res, 409, "Auth configuration with this name already exists");
        }
        throw dbError;
      }
    } catch (error: any) {
      console.error("[SystemAuthRoutes] Error updating auth config:", error);
      const statusCode = error.statusCode || 500;
      return errorResponse(res, statusCode, error.message || "Internal server error");
    }
  });

  /**
   * DELETE /api/system-instances/:id/auth/:authId
   * Delete auth configuration
   */
  app.delete("/api/system-instances/:id/auth/:authId", async (req: Request, res: Response) => {
    try {
      const { id, authId } = req.params;

      // Validate access and tenant ownership
      await validateSystemInstanceAccess(storage, id, (req as any).user);

      // Check if auth config exists and belongs to this system instance
      const existingAuth = await storage.getSystemAuth!(authId);
      if (!existingAuth || existingAuth.systemInstanceId !== id) {
        return errorResponse(res, 404, "Auth configuration not found");
      }

      // Delete auth config
      const deleted = await storage.deleteSystemAuth!(authId);

      if (!deleted) {
        return errorResponse(res, 404, "Auth configuration not found");
      }

      return res.status(204).send();
    } catch (error: any) {
      console.error("[SystemAuthRoutes] Error deleting auth config:", error);
      const statusCode = error.statusCode || 500;
      return errorResponse(res, statusCode, error.message || "Internal server error");
    }
  });

  console.log("[SystemAuthRoutes] System auth routes registered with tenant ownership validation");
}
