import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from "./types.js";
import { logger } from "../../core/logger.js";
import type { IStorage } from "../../../storage/index.js";

const log = logger.child("error-handler");

/**
 * Error Handler Executor - Try/catch wrapper for graceful error handling
 * Provides alternative error path and retry logic
 * Logs errors to Event page for visibility
 */
export const executeErrorHandler: NodeExecutor = async (
  node: any,
  input: unknown,
  context: ExecutionContext
): Promise<NodeExecutionResult> => {
  const config = (node as any).config || {};
  const {
    errorHandlingStrategy = "catch_and_continue",
    retryAttempts = 3,
    retryDelay = 1000,
    logErrors = true,
    includeStackTrace = true,
    defaultValue = "{}",
    errorField = "error",
  } = config;

  try {
    // In emulation mode, always succeed
    if (context.emulationMode) {
      return {
        output: {
          ...input as object,
          errorHandlerStatus: 'success',
          emulated: true,
        },
        metadata: {
          emulated: true,
          strategy: errorHandlingStrategy,
        },
      };
    }

    // PRODUCTION MODE
    // Note: Error Handler works by wrapping the NEXT node in the flow
    // The orchestrator will catch errors from the next node and route to error output
    // This is a special node that modifies flow execution behavior
    
    // For now, pass through input successfully
    // The orchestrator handles the actual error catching logic
    return {
      output: {
        ...input as object,
        errorHandlerActive: true,
        strategy: errorHandlingStrategy,
        retryConfig: {
          attempts: retryAttempts,
          delay: retryDelay,
        },
      },
      metadata: {
        errorHandlerActive: true,
        strategy: errorHandlingStrategy,
      },
    };
  } catch (error: any) {
    // Handle errors within the error handler itself
    const errorMessage = error.message || String(error);
    const errorStack = includeStackTrace ? error.stack : undefined;
    
    if (logErrors) {
      log.error("Error in error handler node", {
        error: errorMessage,
        stack: errorStack,
        nodeId: node.id,
        flowId: context.flowId,
        runId: context.runId,
      });
    }

    // Log error to Event page (storage)
    // NOTE: Storage instance needs to be passed via context
    // This will create an event record that appears on the Events page
    if (context.storage) {
      try {
        await context.storage.createEvent({
          type: 'flow.error',
          source: `flow:${context.flowId}`,
          data: {
            flowId: context.flowId,
            flowName: context.flowName,
            runId: context.runId,
            nodeId: node.id,
            nodeType: node.type,
            error: errorMessage,
            stack: errorStack,
            input: input,
            strategy: errorHandlingStrategy,
            timestamp: new Date().toISOString(),
          },
          retryCount: 0,
        });
      } catch (eventError: any) {
        log.error("Failed to log error to events", {
          originalError: errorMessage,
          eventError: eventError.message,
        });
      }
    }

    // Parse default value
    let defaultOutput: any;
    try {
      defaultOutput = typeof defaultValue === 'string' ? JSON.parse(defaultValue) : defaultValue;
    } catch {
      defaultOutput = { status: 'error', message: 'Error handler failed' };
    }

    // Return error information
    return {
      output: {
        ...input as object,
        [errorField]: {
          message: errorMessage,
          stack: errorStack,
          timestamp: new Date().toISOString(),
        },
        ...defaultOutput,
      },
      metadata: {
        errorOccurred: true,
        errorMessage: errorMessage,
        loggedToEvents: !!context.storage,
      },
    };
  }
};
