import { NodeExecutor } from "./types";

/**
 * Manual Trigger Executor
 * Simply passes through the input data (flow was triggered manually)
 */
export const executeManualTrigger: NodeExecutor = async (node, input, context) => {
  // Manual trigger just passes the input data through
  return {
    output: input,
  };
};
