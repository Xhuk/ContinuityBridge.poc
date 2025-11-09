import type { Express } from "express";
import { createServer, type Server } from "http";
import { Pipeline } from "./src/core/pipeline.js";
import { FlowOrchestrator } from "./src/flow/orchestrator.js";
import { registerRESTRoutes } from "./src/http/rest.js";
import { registerGraphQLServer } from "./src/http/graphql.js";
import { initializeQueue } from "./src/serverQueue.js";
import { Worker, setWorkerInstance } from "./src/workers/worker.js";
import { logger } from "./src/core/logger.js";
import { storage } from "./storage.js";

const log = logger.child("Server");

export async function registerRoutes(app: Express): Promise<Server> {
  try {
    // Initialize queue provider
    await initializeQueue();

    // Create flow orchestrator (shared across pipeline and REST routes)
    const orchestrator = new FlowOrchestrator(storage);

    // Create pipeline instance with flow support
    const pipeline = new Pipeline({ orchestrator });

    // Register REST API routes with storage
    registerRESTRoutes(app, pipeline, orchestrator, storage);

    // Register GraphQL server (standalone on port 4000) with shared pipeline
    registerGraphQLServer(pipeline).catch((err) => {
      log.error("Failed to start GraphQL server", err);
    });

    // Initialize and start worker with shared pipeline
    const worker = new Worker(pipeline);
    setWorkerInstance(worker);
    await worker.start();

    log.info("All routes and services registered successfully");

    const httpServer = createServer(app);
    return httpServer;
  } catch (error) {
    log.error("Failed to register routes", error);
    throw error;
  }
}
