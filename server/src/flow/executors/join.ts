import { NodeExecutor, ExecutionContext, NodeExecutionResult } from "./types";
import { FlowNode } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "../../../db";
import { flowJoinStates } from "../../../schema";
import { eq, and } from "drizzle-orm";
import jsonpath from "jsonpath";

/**
 * Join Node Executor - Correlates and stitches data from multiple streams
 * 
 * Use Case:
 * - SAP Order arrives on Stream A → Stored with correlation key "order_123"
 * - WMS Shipment arrives on Stream B with same order_id → Matched and combined
 * - Output: { sap: {...}, wms: {...} }
 * 
 * Configuration:
 * - correlationKey: Field path to match (e.g., "order_id" or "$.data.order_number")
 * - streamAName: Label for first stream (e.g., "SAP Order")
 * - streamBName: Label for second stream (e.g., "WMS Shipment")
 * - streamAIdentifier: Field path + value to identify Stream A (e.g., "source=SAP")
 * - streamBIdentifier: Field path + value to identify Stream B (e.g., "source=WMS")
 * - timeoutMinutes: How long to wait for matching payload (default: 1440 = 24 hours)
 * - joinStrategy: "inner" (both required), "left" (A primary), "right" (B primary)
 */
export const executeJoin: NodeExecutor = async (
  node: FlowNode,
  input: unknown,
  context: ExecutionContext
): Promise<NodeExecutionResult> => {
  const config = (node as any).config || {};
  const {
    correlationKey = "id",
    streamAName = "Stream A",
    streamBName = "Stream B",
    streamAIdentifier = "", // e.g., "source" or "$.meta.type"
    streamAIdentifierValue = "", // e.g., "SAP" or "order"
    streamBIdentifier = "", // e.g., "source" or "$.meta.type"
    streamBIdentifierValue = "", // e.g., "WMS" or "shipment"
    timeoutMinutes = 1440, // 24 hours default
    joinStrategy = "inner",
  } = config;

  // Helper function to extract field value
  const extractFieldValue = (path: string): string => {
    try {
      if (path.startsWith("$.")) {
        const values = jsonpath.query(input, path);
        return values.length > 0 ? String(values[0]) : "";
      } else {
        return String((input as any)[path] || "");
      }
    } catch {
      return "";
    }
  };

  // Determine which stream this payload belongs to
  let isStreamA = false;
  let isStreamB = false;

  if (streamAIdentifier && streamAIdentifierValue) {
    const actualValue = extractFieldValue(streamAIdentifier);
    isStreamA = actualValue === streamAIdentifierValue;
  }

  if (streamBIdentifier && streamBIdentifierValue) {
    const actualValue = extractFieldValue(streamBIdentifier);
    isStreamB = actualValue === streamBIdentifierValue;
  }

  // Fallback: if no identifiers configured, use arrival order (first = A, second = B)
  const useArrivalOrder = !streamAIdentifier && !streamBIdentifier;

  if (!useArrivalOrder && !isStreamA && !isStreamB) {
    throw new Error(
      `Unable to identify stream. Payload does not match Stream A (${streamAIdentifier}=${streamAIdentifierValue}) ` +
      `or Stream B (${streamBIdentifier}=${streamBIdentifierValue}).`
    );
  }

  // Extract correlation value from input using JSONPath or direct key access
  let correlationValue: string;
  
  try {
    // Try JSONPath first (supports $.data.order_id)
    if (correlationKey.startsWith("$.")) {
      const values = jsonpath.query(input, correlationKey);
      if (values.length === 0) {
        throw new Error(`Correlation key path not found: ${correlationKey}`);
      }
      correlationValue = String(values[0]);
    } else {
      // Direct key access (supports order_id)
      correlationValue = String((input as any)[correlationKey]);
      if (!correlationValue || correlationValue === "undefined") {
        throw new Error(`Correlation key not found in input: ${correlationKey}`);
      }
    }
  } catch (error: any) {
    throw new Error(`Failed to extract correlation key "${correlationKey}": ${error.message}`);
  }

  // Calculate expiration time
  const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString();

  // Check if there's already a waiting payload with this correlation value
  const existingState = await db
    .select()
    .from(flowJoinStates)
    .where(
      and(
        eq(flowJoinStates.flowId, context.flowId),
        eq(flowJoinStates.nodeId, node.id),
        eq(flowJoinStates.correlationValue, correlationValue),
        eq(flowJoinStates.status, "waiting_a")
      )
    )
    .get();

  const existingStateB = await db
    .select()
    .from(flowJoinStates)
    .where(
      and(
        eq(flowJoinStates.flowId, context.flowId),
        eq(flowJoinStates.nodeId, node.id),
        eq(flowJoinStates.correlationValue, correlationValue),
        eq(flowJoinStates.status, "waiting_b")
      )
    )
    .get();

  // Determine which stream this payload belongs to
  // For now, we'll use a simple alternating pattern:
  // - If no state exists, this is Stream A
  // - If waiting_a exists, this is Stream B
  // - If waiting_b exists, this is Stream A
  
  if (existingState) {
    // Stream A is waiting, this must be Stream B → MATCH!
    // Verify if using identifiers
    if (!useArrivalOrder && !isStreamB) {
      throw new Error(
        `Stream A is waiting for Stream B, but incoming payload is identified as Stream A. ` +
        `Check your stream identifiers: ${streamBIdentifier}=${streamBIdentifierValue}`
      );
    }

    const combinedPayload = {
      [streamAName]: existingState.streamAPayload,
      [streamBName]: input,
      _metadata: {
        correlationKey,
        correlationValue,
        matchedAt: new Date().toISOString(),
        joinStrategy,
      },
    };

    // Update state to matched
    await db
      .update(flowJoinStates)
      .set({
        status: "matched",
        streamBPayload: JSON.stringify(input),
        matchedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(flowJoinStates.id, existingState.id))
      .run();

    return {
      output: combinedPayload,
      metadata: {
        joinState: "matched",
        correlationValue,
        waitTimeMs: new Date().getTime() - new Date(existingState.createdAt).getTime(),
      },
    };
  } else if (existingStateB) {
    // Stream B is waiting, this must be Stream A → MATCH!
    // Verify if using identifiers
    if (!useArrivalOrder && !isStreamA) {
      throw new Error(
        `Stream B is waiting for Stream A, but incoming payload is identified as Stream B. ` +
        `Check your stream identifiers: ${streamAIdentifier}=${streamAIdentifierValue}`
      );
    }

    const combinedPayload = {
      [streamAName]: input,
      [streamBName]: existingStateB.streamBPayload,
      _metadata: {
        correlationKey,
        correlationValue,
        matchedAt: new Date().toISOString(),
        joinStrategy,
      },
    };

    // Update state to matched
    await db
      .update(flowJoinStates)
      .set({
        status: "matched",
        streamAPayload: JSON.stringify(input),
        matchedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(flowJoinStates.id, existingStateB.id))
      .run();

    return {
      output: combinedPayload,
      metadata: {
        joinState: "matched",
        correlationValue,
        waitTimeMs: new Date().getTime() - new Date(existingStateB.createdAt).getTime(),
      },
    };
  } else {
    // No matching state found - create new waiting state
    // Determine if this is Stream A or B based on identifiers
    let waitingStatus: "waiting_a" | "waiting_b";
    let payloadForA: string | null;
    let payloadForB: string | null;
    let waitingForStream: string;

    if (useArrivalOrder || isStreamA) {
      // This is Stream A (or first arrival in arrival-order mode)
      waitingStatus = "waiting_a";
      payloadForA = JSON.stringify(input);
      payloadForB = null;
      waitingForStream = streamBName;
    } else if (isStreamB) {
      // This is Stream B
      waitingStatus = "waiting_b";
      payloadForA = null;
      payloadForB = JSON.stringify(input);
      waitingForStream = streamAName;
    } else {
      throw new Error("Unable to determine stream identity");
    }
    
    const joinStateId = randomUUID();
    
    await db.insert(flowJoinStates).values({
      id: joinStateId,
      flowId: context.flowId,
      nodeId: node.id,
      correlationKey,
      correlationValue,
      streamAPayload: payloadForA,
      streamBPayload: payloadForB,
      streamAName,
      streamBName,
      joinStrategy,
      status: waitingStatus,
      timeoutMinutes,
      expiresAt,
      matchedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    // For now, throw an error to halt execution
    // In production, this would trigger a "wait" state and resume when matched
    throw new Error(
      `Join node waiting for matching payload. Correlation: ${correlationKey}=${correlationValue}. ` +
      `Waiting for ${waitingForStream} to arrive (timeout: ${timeoutMinutes} minutes).`
    );
  }
};
