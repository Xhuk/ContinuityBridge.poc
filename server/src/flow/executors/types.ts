import { FlowNode } from "@shared/schema";

/**
 * Execution Context - Available to all node executors
 */
export interface ExecutionContext {
  flowId: string;
  flowName: string;
  traceId: string;
  runId: string;
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
