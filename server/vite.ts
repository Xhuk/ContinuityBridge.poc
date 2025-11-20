import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Try multiple possible paths for the dist/public directory
  const possiblePaths = [
    path.resolve(process.cwd(), "dist", "public"),           // From project root
    path.resolve(import.meta.dirname, "public"),              // If running from dist/
    path.resolve(import.meta.dirname, "..", "public"),       // If in dist/server/
    path.join(process.cwd(), "dist", "public"),              // Alternative join syntax
  ];

  console.log(`[Static] Current working directory: ${process.cwd()}`);
  console.log(`[Static] import.meta.dirname: ${import.meta.dirname}`);
  console.log(`[Static] Trying paths:`);
  
  let distPath: string | null = null;
  for (const testPath of possiblePaths) {
    const exists = fs.existsSync(testPath);
    console.log(`[Static]   ${exists ? '✓' : '✗'} ${testPath}`);
    if (exists && !distPath) {
      distPath = testPath;
      // Don't break - show all results for debugging
    }
  }

  if (!distPath) {
    console.error(`[Static] ❌ Could not find dist/public in any of the tried locations`);
    console.error(`[Static] Directory listing of cwd:`);
    try {
      const files = fs.readdirSync(process.cwd());
      files.forEach(f => console.error(`[Static]   - ${f}`));
    } catch (e) {
      console.error(`[Static] Could not list directory:`, e);
    }
    throw new Error(
      `Could not find the build directory. Tried: ${possiblePaths.join(', ')}`,
    );
  }

  console.log(`[Static] ✓ Serving static files from: ${distPath}`);
  
  // Serve static files with explicit error handling
  app.use((req, res, next) => {
    // Only handle requests for static assets and HTML files
    if (req.path.startsWith('/assets/') || req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|html)$/)) {
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          // Ensure correct MIME types
          if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
          } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
          } else if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
          }
        }
      })(req, res, next);
    } else {
      next();
    }
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath!, "index.html"));
  });
}
