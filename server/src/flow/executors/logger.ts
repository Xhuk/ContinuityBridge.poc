import { NodeExecutor, ExecutionContext, NodeExecutionResult } from "./types";
import { FlowNode } from "@shared/schema";
import { logger } from "../../core/logger";

/**
 * Logger Node Executor - Logs payload for debugging
 * 
 * Use Case:
 * - Place after Join, Transformer, or Distributor to inspect data structure
 * - Debug what data looks like before it moves to next step
 * - Track execution flow in production
 * 
 * Configuration:
 * - logLevel: "debug" | "info" | "warn" | "error" (default: "info")
 * - includeHeaders: boolean (default: true)
 * - includeBody: boolean (default: true)
 * - prettyPrint: boolean (default: true)
 * - logMessage: string (custom message prefix)
 */
export const executeLogger: NodeExecutor = async (
  node: FlowNode,
  input: unknown,
  context: ExecutionContext
): Promise<NodeExecutionResult> => {
  const config = (node as any).config || {};
  const {
    logLevel = "info",
    includeHeaders = true,
    includeBody = true,
    prettyPrint = true,
    logMessage = "",
  } = config;

  // Create logger instance
  const log = logger.child(`Flow:${context.flowName}:Logger:${node.id}`);

  // Prepare log data
  const logData: Record<string, unknown> = {
    nodeId: node.id,
    nodeName: (node as any).name || "Logger",
    flowId: context.flowId,
    flowName: context.flowName,
    traceId: context.traceId,
    runId: context.runId,
  };

  if (includeHeaders && typeof input === "object" && input !== null) {
    const headers = (input as any)._headers || (input as any).headers;
    if (headers) {
      logData.headers = headers;
    }
  }

  if (includeBody) {
    if (prettyPrint) {
      logData.payload = JSON.stringify(input, null, 2);
    } else {
      logData.payload = input;
    }
  }

  // Add custom message if provided
  const logPrefix = logMessage ? `[${logMessage}] ` : "";
  const message = `${logPrefix}Logger node executed`;

  // Log based on level
  switch (logLevel) {
    case "debug":
      log.debug(message, logData);
      break;
    case "warn":
      log.warn(message, logData);
      break;
    case "error":
      log.error(message, logData);
      break;
    case "info":
    default:
      log.info(message, logData);
      break;
  }

  // Pass through the input unchanged
  return {
    output: input,
    metadata: {
      logged: true,
      logLevel,
      timestamp: new Date().toISOString(),
    },
  };
};
