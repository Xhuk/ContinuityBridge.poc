import { Request, Response, NextFunction } from "express";
import { logger as baseLogger } from "../core/logger.js";

const logger = baseLogger.child("AuthGuard");

export function createAuthGuard() {
  return function authGuard(req: Request, res: Response, next: NextFunction) {
    // Check for session authentication (Passport.js or similar)
    if (typeof (req as any).isAuthenticated === "function" && (req as any).isAuthenticated()) {
      logger.debug("Request authenticated via session", {
        path: req.path,
        method: req.method,
        user: (req as any).user?.id,
      });
      return next();
    }

    // Check for API key in header
    const apiKey = req.headers["x-api-key"];
    if (apiKey && typeof apiKey === "string") {
      // For MVP, accept any non-empty API key
      // TODO: Validate against stored API keys in production
      logger.debug("Request authenticated via API key", {
        path: req.path,
        method: req.method,
      });
      return next();
    }

    // Check for Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      // For MVP, accept any Bearer token
      // TODO: Validate token against secret in production
      logger.debug("Request authenticated via Bearer token", {
        path: req.path,
        method: req.method,
      });
      return next();
    }

    logger.warn("Unauthorized access attempt to protected endpoint", {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    res.status(401).json({
      error: "Unauthorized",
      message: "Authentication required. Provide X-API-Key header, Bearer token, or valid session.",
    });
  };
}
