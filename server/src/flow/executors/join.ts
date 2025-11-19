/**
 * Join Executor (Caso 1: Split & Join)
 * Waits for multiple parallel flows to complete before continuing
 * Example: Wait for warehouse confirmation + store pickup + dropship confirmation
 */

import { NodeExecutor } from "./types.js";
import { logger } from "../../core/logger.js";

const log = logger.child("JoinExecutor");

// Store pending joins in memory (in production, use Redis/DB)
const pendingJoins = new Map<string, {
  requiredCount: number;
  received: any[];
  strategy: string;
  timeout?: NodeJS.Timeout;
}>();

export const executeJoin: NodeExecutor = async (node, input, context) => {
  const joinStrategy = node.data.joinStrategy || "all";
  const joinTimeout = node.data.joinTimeout || 300000; // 5 minutes default
  const minimumJoins = node.data.minimumJoins || 1;

  log.info("Executing join node", {
    nodeId: node.id,
    strategy: joinStrategy,
    timeout: joinTimeout,
  });

  try {
    // Extract join context from input
    const joinContext = extractJoinContext(input);

    if (!joinContext || !joinContext.joinId) {
      throw new Error("Invalid input: missing joinId for coordination");
    }

    const { joinId, data, totalExpected } = joinContext;

    // Get or create join state
    let joinState = pendingJoins.get(joinId);
    
    if (!joinState) {
      // First arrival - initialize join state
      joinState = {
        requiredCount: totalExpected || 2, // Default to 2 if not specified
        received: [],
        strategy: joinStrategy,
      };

      // Set timeout for join
      if (joinTimeout > 0) {
        joinState.timeout = setTimeout(() => {
          handleJoinTimeout(joinId, node.id);
        }, joinTimeout);
      }

      pendingJoins.set(joinId, joinState);
      log.info("Join initialized", {
        nodeId: node.id,
        joinId,
        requiredCount: joinState.requiredCount,
      });
    }

    // Add incoming data to received collection
    joinState.received.push({
      data,
      receivedAt: new Date().toISOString(),
      source: (input as any).source || "unknown",
    });

    log.info("Join data received", {
      nodeId: node.id,
      joinId,
      received: joinState.received.length,
      required: joinState.requiredCount,
    });

    // Check if join condition is met
    const isComplete = checkJoinComplete(joinState, joinStrategy, minimumJoins);

    if (isComplete) {
      // Clear timeout
      if (joinState.timeout) {
        clearTimeout(joinState.timeout);
      }

      // Collect all data
      const allData = joinState.received.map(r => r.data);

      // Clean up
      pendingJoins.delete(joinId);

      log.info("Join completed", {
        nodeId: node.id,
        joinId,
        dataCount: allData.length,
      });

      return {
        success: true,
        output: {
          joinId,
          strategy: joinStrategy,
          results: allData,
          completedAt: new Date().toISOString(),
          totalReceived: allData.length,
        },
        metadata: {
          joinComplete: true,
          dataCount: allData.length,
        },
      };
    } else {
      // Join not yet complete - suspend execution
      log.info("Join waiting for more data", {
        nodeId: node.id,
        joinId,
        received: joinState.received.length,
        required: joinState.requiredCount,
      });

      return {
        success: true,
        output: {
          joinId,
          status: "waiting",
          received: joinState.received.length,
          required: joinState.requiredCount,
        },
        metadata: {
          joinComplete: false,
          suspended: true,
        },
      };
    }
  } catch (error: any) {
    log.error("Join execution failed", {
      nodeId: node.id,
      error: error.message,
    });

    return {
      success: false,
      output: null,
      error: `Join failed: ${error.message}`,
    };
  }
};

/**
 * Extract join context from input
 */
function extractJoinContext(input: any): any {
  if (input?.joinId) return input;
  if (input?.data?.joinId) return input.data;
  
  // Try to extract from distributor output
  if (input?.originalOrder?.id) {
    return {
      joinId: input.originalOrder.id,
      data: input,
      totalExpected: input.distributions?.length || 2,
    };
  }

  return null;
}

/**
 * Check if join is complete based on strategy
 */
function checkJoinComplete(
  joinState: any,
  strategy: string,
  minimumJoins: number
): boolean {
  const received = joinState.received.length;
  const required = joinState.requiredCount;

  switch (strategy) {
    case "all":
      // All expected inputs must arrive
      return received >= required;
    
    case "any":
      // At least one input is sufficient
      return received >= 1;
    
    case "majority":
      // More than half of expected inputs
      return received > Math.floor(required / 2);
    
    case "timeout":
      // Wait for timeout (completion handled by timeout handler)
      return false;
    
    case "minimum":
      // At least minimumJoins inputs
      return received >= minimumJoins;
    
    default:
      return received >= required;
  }
}

/**
 * Handle join timeout
 */
function handleJoinTimeout(joinId: string, nodeId: string): void {
  const joinState = pendingJoins.get(joinId);
  
  if (!joinState) return;

  log.warn("Join timeout reached", {
    nodeId,
    joinId,
    received: joinState.received.length,
    required: joinState.requiredCount,
  });

  // For timeout strategy, complete with partial data
  if (joinState.strategy === "timeout" && joinState.received.length > 0) {
    log.info("Join completing with partial data due to timeout", {
      joinId,
      dataCount: joinState.received.length,
    });
    
    // Join will complete on next check
    // (orchestrator needs to poll for timeout completions)
  } else {
    // Mark as failed
    log.error("Join failed due to timeout", {
      joinId,
      received: joinState.received.length,
      required: joinState.requiredCount,
    });
    
    // Clean up
    pendingJoins.delete(joinId);
  }
}

/**
 * Get pending joins (for monitoring/debugging)
 */
export function getPendingJoins(): any[] {
  return Array.from(pendingJoins.entries()).map(([joinId, state]) => ({
    joinId,
    received: state.received.length,
    required: state.requiredCount,
    strategy: state.strategy,
  }));
}

/**
 * Clear join state (for cleanup/testing)
 */
export function clearJoinState(joinId: string): boolean {
  const state = pendingJoins.get(joinId);
  if (state?.timeout) {
    clearTimeout(state.timeout);
  }
  return pendingJoins.delete(joinId);
}
