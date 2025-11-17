import { Request, Response, NextFunction } from "express";
import { logger as baseLogger } from "../core/logger.js";

const logger = baseLogger.child("AuthGuard");

export function createAuthGuard() {
  return async function authGuard(req: Request, res: Response, next: NextFunction) {
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
      // PRODUCTION: Validate API key against database
      try {
        const { db } = await import("../../db.js");
        const { users } = await import("../../schema.js");
        const { eq } = await import("drizzle-orm");
        
        // Check if API key exists and user is enabled
        const userRecord = await (db.select() as any)
          .from(users)
          .where(eq(users.apiKey, apiKey))
          .get();
        
        if (!userRecord) {
          logger.warn("Invalid API key attempted", {
            path: req.path,
            method: req.method,
            ip: req.ip,
          });
          return res.status(401).json({
            error: "Unauthorized",
            message: "Invalid API key",
          });
        }
        
        if (!userRecord.enabled) {
          logger.warn("Disabled user attempted access", {
            userId: userRecord.id,
            email: userRecord.email,
            path: req.path,
          });
          return res.status(403).json({
            error: "Forbidden",
            message: "Account disabled. Contact administrator.",
          });
        }
        
        logger.debug("Request authenticated via API key", {
          userId: userRecord.id,
          email: userRecord.email,
          path: req.path,
          method: req.method,
        });
        return next();
      } catch (error: any) {
        logger.error("API key validation failed", {
          error: error.message,
          path: req.path,
        });
        return res.status(500).json({
          error: "Internal Server Error",
          message: "Authentication validation failed",
        });
      }
    }

    // Check for Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      
      // PRODUCTION: Validate JWT token
      try {
        const jwt = await import("jsonwebtoken");
        const jwtSecret = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
        
        if (!jwtSecret) {
          logger.error("JWT_SECRET not configured");
          return res.status(500).json({
            error: "Internal Server Error",
            message: "Authentication not properly configured",
          });
        }
        
        // Verify JWT signature and expiration
        const decoded = jwt.verify(token, jwtSecret) as any;
        
        if (!decoded.id || !decoded.email || !decoded.role) {
          logger.warn("Invalid JWT payload", { path: req.path });
          return res.status(401).json({
            error: "Unauthorized",
            message: "Invalid authentication token",
          });
        }
        
        logger.debug("Request authenticated via Bearer token", {
          userId: decoded.id,
          email: decoded.email,
          path: req.path,
          method: req.method,
        });
        return next();
      } catch (error: any) {
        if (error.name === "TokenExpiredError") {
          logger.warn("Expired token attempted", {
            path: req.path,
            expiredAt: error.expiredAt,
          });
          return res.status(401).json({
            error: "Unauthorized",
            message: "Authentication token expired. Please login again.",
          });
        }
        
        logger.warn("Invalid Bearer token attempted", {
          error: error.message,
          path: req.path,
        });
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid authentication token",
        });
      }
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
