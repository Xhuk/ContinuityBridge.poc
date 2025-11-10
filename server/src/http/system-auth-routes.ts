import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { IStorage } from "../../storage";
import type { SystemInstanceAuth } from "../../schema";

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
 * Validates that a system instance exists.
 * Returns true if exists, false otherwise.
 * 
 * TODO (CRITICAL - BLOCKS PRODUCTION): Tenant ownership validation not implemented.
 * 
 * CURRENT IMPLEMENTATION:
 * - ✅ Checks if system instance exists (returns 404 if not found)
 * - ❌ Does NOT verify tenant ownership (requires authentication middleware)
 * 
 * FOR PRODUCTION:
 * 1. Add authentication middleware to identify request tenant
 * 2. Load system instance → environment → ecosystem → tenant (via JOIN or cascade)
 * 3. Compare authenticated tenant ID to instance's tenant ID
 * 4. Return 403 if mismatch (cross-tenant access attempt)
 * 
 * SECURITY RISK: Without tenant verification, any caller who knows a system instance ID
 * can manage auth configs for that instance, even if it belongs to a different tenant.
 * 
 * MITIGATION: Do NOT register these routes until authentication middleware exists.
 * This function is implemented and tested but routes are gated from production use.
 */
async function ensureSystemInstanceExists(storage: IStorage, systemInstanceId: string): Promise<boolean> {
  if (!storage.getSystemInstance) {
    console.warn("[SystemAuthRoutes] getSystemInstance not implemented - skipping existence check (INSECURE)");
    return true;
  }

  const instance = await storage.getSystemInstance(systemInstanceId);
  return instance !== undefined;
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

      // Ensure system instance exists
      const exists = await ensureSystemInstanceExists(storage, id);
      if (!exists) {
        return errorResponse(res, 404, "System instance not found");
      }

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
      return errorResponse(res, 500, "Internal server error");
    }
  });

  /**
   * POST /api/system-instances/:id/auth
   * Create new auth configuration
   */
  app.post("/api/system-instances/:id/auth", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Ensure system instance exists
      const exists = await ensureSystemInstanceExists(storage, id);
      if (!exists) {
        return errorResponse(res, 404, "System instance not found");
      }

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
      return errorResponse(res, 500, "Internal server error");
    }
  });

  /**
   * PATCH /api/system-instances/:id/auth/:authId
   * Update existing auth configuration
   */
  app.patch("/api/system-instances/:id/auth/:authId", async (req: Request, res: Response) => {
    try {
      const { id, authId } = req.params;

      // Ensure system instance exists
      const exists = await ensureSystemInstanceExists(storage, id);
      if (!exists) {
        return errorResponse(res, 404, "System instance not found");
      }

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
      return errorResponse(res, 500, "Internal server error");
    }
  });

  /**
   * DELETE /api/system-instances/:id/auth/:authId
   * Delete auth configuration
   */
  app.delete("/api/system-instances/:id/auth/:authId", async (req: Request, res: Response) => {
    try {
      const { id, authId } = req.params;

      // Ensure system instance exists
      const exists = await ensureSystemInstanceExists(storage, id);
      if (!exists) {
        return errorResponse(res, 404, "System instance not found");
      }

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
      return errorResponse(res, 500, "Internal server error");
    }
  });

  console.log("[SystemAuthRoutes] System auth routes registered");
}
