import { randomUUID } from "crypto";
import { FlowDefinition, FlowNode, FlowRun } from "@shared/schema";
import type { IStorage } from "../../storage";
import { NodeExecutor, ExecutionContext, NodeExecutionResult } from "./executors/types";
import { executeInterfaceSource } from "./executors/interface-source";
import { executeObjectMapper } from "./executors/object-mapper";
import { executeInterfaceDestination } from "./executors/interface-destination";
import { executeXmlParser } from "./executors/xml-parser";
import { executeJsonBuilder } from "./executors/json-builder";
import { executeCustomJavascript } from "./executors/custom-javascript";
import { executeConditional } from "./executors/conditional";
import { executeManualTrigger } from "./executors/manual-trigger";
import { executeCsvParser } from "./executors/csv-parser";
import { executeValidation } from "./executors/validation";

/**
 * Flow Orchestrator - Executes flows by traversing nodes and executing them in sequence
 * 
 * Architecture:
 * 1. Load flow definition from storage
 * 2. Create execution context (FlowRun)
 * 3. Start from trigger node (no incoming edges)
 * 4. Execute nodes in topological order (respecting edge dependencies)
 * 5. Track execution status, timing, and errors for each node
 * 6. Return final output or error
 */
export class FlowOrchestrator {
  private storage: IStorage;
  private executors: Map<string, NodeExecutor> = new Map();

  constructor(storageInstance: IStorage) {
    this.storage = storageInstance;
    
    // Register node executors
    this.registerExecutor("executeInterfaceSource", executeInterfaceSource);
    this.registerExecutor("executeObjectMapper", executeObjectMapper);
    this.registerExecutor("executeInterfaceDestination", executeInterfaceDestination);
    this.registerExecutor("executeXmlParser", executeXmlParser);
    this.registerExecutor("executeJsonBuilder", executeJsonBuilder);
    this.registerExecutor("executeCustomJavascript", executeCustomJavascript);
    this.registerExecutor("executeConditional", executeConditional);
    this.registerExecutor("executeManualTrigger", executeManualTrigger);
    this.registerExecutor("executeCsvParser", executeCsvParser);
    this.registerExecutor("executeValidation", executeValidation);
  }

  /**
   * Register a node executor function
   */
  private registerExecutor(name: string, executor: NodeExecutor): void {
    this.executors.set(name, executor);
  }

  /**
   * Execute a flow with given input data
   */
  async executeFlow(
    flowId: string,
    inputData: unknown,
    triggeredBy: FlowRun["triggeredBy"] = "manual"
  ): Promise<FlowRun> {
    const flow = await this.storage.getFlow(flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    if (!flow.enabled) {
      throw new Error(`Flow is disabled: ${flow.name}`);
    }

    const traceId = randomUUID();
    const startedAt = new Date().toISOString();

    // Create flow run record
    const flowRun = await this.storage.createFlowRun({
      flowId: flow.id,
      flowName: flow.name,
      flowVersion: flow.version,
      traceId,
      status: "running",
      startedAt,
      inputData,
      triggeredBy,
      executedNodes: [],
      nodeExecutions: [],
    });

    try {
      // Execute flow nodes
      const output = await this.executeNodes(flow, flowRun, inputData);

      // Mark as completed
      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

      await this.storage.updateFlowRun(flowRun.id, {
        status: "completed",
        completedAt,
        durationMs,
        outputData: output,
      });

      return (await this.storage.getFlowRun(flowRun.id))!;
    } catch (error) {
      // Mark as failed
      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

      await this.storage.updateFlowRun(flowRun.id, {
        status: "failed",
        completedAt,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Execute flow nodes in topological order
   */
  private async executeNodes(
    flow: FlowDefinition,
    flowRun: FlowRun,
    initialInput: unknown
  ): Promise<unknown> {
    const { nodes, edges } = flow;

    // Build adjacency map (node ID -> outgoing edges)
    const edgeMap = new Map<string, string[]>();
    edges.forEach((edge) => {
      const targets = edgeMap.get(edge.source) || [];
      targets.push(edge.target);
      edgeMap.set(edge.source, targets);
    });

    // Find entry node (trigger node with no incoming edges)
    const incomingEdges = new Set(edges.map((e) => e.target));
    const entryNode = nodes.find((n) => !incomingEdges.has(n.id));

    if (!entryNode) {
      throw new Error("No entry node found (trigger node with no incoming edges)");
    }

    // Execute nodes starting from entry
    const nodeOutputs = new Map<string, unknown>();
    const executedNodes: string[] = [];

    const context: ExecutionContext = {
      flowId: flow.id,
      flowName: flow.name,
      traceId: flowRun.traceId,
      runId: flowRun.id,
    };

    // Recursive execution
    const executeNode = async (nodeId: string, input: unknown): Promise<unknown> => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) {
        throw new Error(`Node not found: ${nodeId}`);
      }

      // Skip if already executed
      if (nodeOutputs.has(nodeId)) {
        return nodeOutputs.get(nodeId);
      }

      const nodeStartedAt = new Date().toISOString();
      executedNodes.push(nodeId);

      try {
        // Get executor for this node type
        const executorName = this.getExecutorName(node);
        const executor = this.executors.get(executorName);

        if (!executor) {
          throw new Error(`No executor found for node type: ${node.type} (executor: ${executorName})`);
        }

        // Execute node
        const result: NodeExecutionResult = await executor(node, input, context);

        const nodeCompletedAt = new Date().toISOString();
        const nodeDurationMs = new Date(nodeCompletedAt).getTime() - new Date(nodeStartedAt).getTime();

        // Record node execution (including metadata)
        const currentRun = await this.storage.getFlowRun(flowRun.id);
        await this.storage.updateFlowRun(flowRun.id, {
          executedNodes,
          nodeExecutions: [
            ...(currentRun?.nodeExecutions || []),
            {
              nodeId: node.id,
              nodeName: node.data.label || node.type,
              status: "completed",
              startedAt: nodeStartedAt,
              completedAt: nodeCompletedAt,
              durationMs: nodeDurationMs,
              input,
              output: result.output,
              metadata: result.metadata,  // ✅ Persist executor metadata
            },
          ],
        });

        // Store output and metadata
        nodeOutputs.set(nodeId, result.output);

        // Execute next nodes
        const outgoingEdges = edges.filter((e) => e.source === nodeId);
        
        if (outgoingEdges.length === 0) {
          // Terminal node - return its output
          return result.output;
        }

        if (outgoingEdges.length === 1) {
          // Single path - continue with output
          return executeNode(outgoingEdges[0].target, result.output);
        }

        // Multiple paths - handle conditional routing
        // Check if executor returned routing metadata (e.g., conditionMet)
        if (result.metadata?.conditionMet !== undefined) {
          // Find edge matching the condition result
          const targetEdge = outgoingEdges.find((edge) => {
            const edgeLabel = edge.label?.toLowerCase();
            const conditionMet = result.metadata!.conditionMet;
            
            // Match edge labels: "true"/"false", "yes"/"no", "success"/"error"
            if (conditionMet && (edgeLabel === "true" || edgeLabel === "yes" || edgeLabel === "success")) {
              return true;
            }
            if (!conditionMet && (edgeLabel === "false" || edgeLabel === "no" || edgeLabel === "error")) {
              return true;
            }
            return false;
          });

          if (targetEdge) {
            return executeNode(targetEdge.target, result.output);
          }
        }

        // Default: execute first path (backwards compatibility)
        return executeNode(outgoingEdges[0].target, result.output);
      } catch (error) {
        const nodeCompletedAt = new Date().toISOString();
        const nodeDurationMs = new Date(nodeCompletedAt).getTime() - new Date(nodeStartedAt).getTime();

        // Record failed node execution
        const currentRun = await this.storage.getFlowRun(flowRun.id);
        await this.storage.updateFlowRun(flowRun.id, {
          executedNodes,
          nodeExecutions: [
            ...(currentRun?.nodeExecutions || []),
            {
              nodeId: node.id,
              nodeName: node.data.label || node.type,
              status: "failed",
              startedAt: nodeStartedAt,
              completedAt: nodeCompletedAt,
              durationMs: nodeDurationMs,
              input,
              error: error instanceof Error ? error.message : String(error),
            },
          ],
          errorNode: nodeId,
        });

        throw error;
      }
    };

    return executeNode(entryNode.id, initialInput);
  }

  /**
   * Get executor name from node type
   * Maps node.type to the executor function name defined in YAML
   */
  private getExecutorName(node: FlowNode): string {
    // Map node types to executor names
    const executorMap: Record<string, string> = {
      interface_source: "executeInterfaceSource",
      object_mapper: "executeObjectMapper",
      interface_destination: "executeInterfaceDestination",
      xml_parser: "executeXmlParser",
      json_builder: "executeJsonBuilder",
      custom_javascript: "executeCustomJavascript",
      conditional: "executeConditional",
      manual_trigger: "executeManualTrigger",
      csv_parser: "executeCsvParser",
      validation: "executeValidation",
    };

    return executorMap[node.type] || node.type;
  }
}

// Export singleton instance
