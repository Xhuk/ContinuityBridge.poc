import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { securityHeaders, corsConfig, apiRateLimit, authRateLimit, secretsVaultRateLimit, sanitizeRequest, isHealthCheck } from "./src/middleware/security.js";
import { wafMiddleware } from "./src/middleware/waf.js";
import { checkFirstRun, displayReadinessBanner } from "./src/setup/first-run.js";
import { validateAndLogEnvironment } from "./src/core/env-validator.js";

// Validate environment variables before starting server
validateAndLogEnvironment();

const app = express();

// Apply security headers (Helmet)
app.use((req, res, next) => {
  if (isHealthCheck(req)) return next();
  return securityHeaders(req, res, next);
});

// WAF Protection (Web Application Firewall)
app.use((req, res, next) => {
  if (isHealthCheck(req)) return next();
  if (process.env.NODE_ENV === 'production') {
    return wafMiddleware({
      rateLimit: {
        windowMs: 60000,       // 1 minute
        maxRequests: 30,       // 30 requests per minute
        blockDurationMs: 300000, // Block for 5 minutes
      },
      blockBots: true,         // Block known bot user agents
      blockSuspicious: true,   // Block suspicious URL patterns
      whitelist: [],           // Add trusted IPs here if needed
    })(req, res, next);
  }
  next();
});

// Apply CORS
app.use((req, res, next) => {
  // Skip CORS for health checks and static assets
  if (isHealthCheck(req) || req.path.startsWith('/assets/') || req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/)) {
    return next();
  }
  return corsConfig(req, res, next);
});

// Cookie parser (for session management)
app.use(cookieParser());

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Sanitize requests
app.use((req, res, next) => {
  if (isHealthCheck(req)) return next();
  return sanitizeRequest(req, res, next);
});

// Rate limiting (production only, bypassed for health checks)
app.use((req, res, next) => {
  if (isHealthCheck(req)) return next();
  if (process.env.NODE_ENV === 'production') {
    return apiRateLimit(req, res, next);
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Validate environment variables before startup
  validateAndLogEnvironment();

  // First-run setup and system readiness check
  const readiness = await checkFirstRun();
  displayReadinessBanner(readiness);

  if (!readiness.ready && process.env.NODE_ENV === 'production') {
    console.error("\n🛑 CRITICAL: System not ready for production deployment");
    console.error("Fix missing requirements before starting the application.\n");
    process.exit(1);
  }

  const server = await registerRoutes(app);

  // Setup static file serving BEFORE error handler
  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Global error handler (MUST be last middleware)
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    // Log error with context
    log(`❌ ERROR ${status}: ${message} on ${req.method} ${req.path}`);
    
    if (status === 500) {
      console.error("[ErrorHandler] Internal Server Error:", err);
    }
    
    // Send error response
    if (!res.headersSent) {
      res.status(status).json({ 
        error: status >= 500 ? "Internal Server Error" : message,
        message: status >= 500 ? "An unexpected error occurred" : message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      });
    }
  });

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
