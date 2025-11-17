import { FlowNode } from "@shared/schema";
import type { IStorage } from "../../../storage/index.js";

/**
 * Execution Context - Available to all node executors
 */
export interface ExecutionContext {
  flowId: string;
  flowName: string;
  traceId: string;
  runId: string;
  emulationMode?: boolean;  // Test mode - bypass live auth, use mocked headers
  storage?: IStorage;  // Storage instance for logging errors to events
}

/**
 * Node Execution Result
 */
export interface NodeExecutionResult {
  output: unknown;  // Data to pass to next node
  metadata?: Record<string, unknown>;  // Optional execution metadata
}

/**
 * Node Executor Function Type
 * Takes a node configuration, input data, and context
 * Returns the output data to pass to the next node
 */
export type NodeExecutor = (
  node: FlowNode,
  input: unknown,
  context: ExecutionContext
) => Promise<NodeExecutionResult>;
