import type { Express } from "express";
import { createServer, type Server } from "http";
import { Pipeline } from "./src/core/pipeline.js";
import { registerRESTRoutes } from "./src/http/rest.js";
import { registerGraphQLServer } from "./src/http/graphql.js";
import { initializeQueue } from "./src/serverQueue.js";
import { getWorkerInstance } from "./src/workers/worker.js";
import { logger } from "./src/core/logger.js";

const log = logger.child("Server");

export async function registerRoutes(app: Express): Promise<Server> {
  try {
    // Initialize queue provider
    await initializeQueue();

    // Create pipeline instance
    const pipeline = new Pipeline();

    // Register REST API routes
    registerRESTRoutes(app, pipeline);

    // Register GraphQL server (standalone on port 4000)
    registerGraphQLServer().catch((err) => {
      log.error("Failed to start GraphQL server", err);
    });

    // Start worker (if enabled)
    const worker = getWorkerInstance();
    await worker.start();

    log.info("All routes and services registered successfully");

    const httpServer = createServer(app);
    return httpServer;
  } catch (error) {
    log.error("Failed to register routes", error);
    throw error;
  }
}
