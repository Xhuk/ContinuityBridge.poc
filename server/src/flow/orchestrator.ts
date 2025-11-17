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
import { executeBYDMParser } from "./executors/bydm/bydm-parser";
import { executeBYDMMapper } from "./executors/bydm/bydm-mapper";
import { executeJoin } from "./executors/join";
import { executeLogger } from "./executors/logger";
import { executeDatabaseConnector } from "./executors/database-connector";
import { executeSftpConnector } from "./executors/sftp-connector";
import { executeAzureBlobConnector } from "./executors/azure-blob-connector";
import { executeSftpPoller } from "./executors/sftp-poller";
import { executeAzureBlobPoller } from "./executors/azure-blob-poller";
import { executeDatabasePoller } from "./executors/database-poller";
import { executeScheduler } from "./executors/scheduler";
import { executeHttpRequest } from "./executors/http-request";
import { executeEmailNotification } from "./executors/email-notification";
import { executeErrorHandler } from "./executors/error-handler";

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
    this.registerExecutor("executeBYDMParser", executeBYDMParser);
    this.registerExecutor("executeBYDMMapper", executeBYDMMapper);
    this.registerExecutor("executeJoin", executeJoin);
    this.registerExecutor("executeLogger", executeLogger);
    this.registerExecutor("executeDatabaseConnector", executeDatabaseConnector);
    this.registerExecutor("executeSftpConnector", executeSftpConnector);
    this.registerExecutor("executeAzureBlobConnector", executeAzureBlobConnector);
    this.registerExecutor("executeSftpPoller", executeSftpPoller);
    this.registerExecutor("executeAzureBlobPoller", executeAzureBlobPoller);
    this.registerExecutor("executeDatabasePoller", executeDatabasePoller);
    this.registerExecutor("executeScheduler", executeScheduler);
    this.registerExecutor("executeHttpRequest", executeHttpRequest);
    this.registerExecutor("executeEmailNotification", executeEmailNotification);
    this.registerExecutor("executeErrorHandler", executeErrorHandler);
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
    triggeredBy: FlowRun["triggeredBy"] = "manual",
    emulationMode: boolean = false
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
      const output = await this.executeNodes(flow, flowRun, inputData, emulationMode);

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
    initialInput: unknown,
    emulationMode: boolean = false
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
      emulationMode,
      storage: this.storage,  // Pass storage for error logging
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

        // 🔥 AUTO-REPORT ERROR TO TRIAGE SYSTEM (PRODUCTION ONLY)
        if (!emulationMode && context.runId) {
          await this.captureErrorReport({
            flow,
            flowRun: currentRun!,
            node,
            error,
            input,
            executionMode: context.emulationMode ? "test" : "production",
            environment: process.env.NODE_ENV === "production" ? "prod" : "dev",
          });
        }

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
      bydm_parser: "executeBYDMParser",
      bydm_mapper: "executeBYDMMapper",
      join: "executeJoin",
      logger: "executeLogger",
      database_connector: "executeDatabaseConnector",
      sftp_connector: "executeSftpConnector",
      azure_blob_connector: "executeAzureBlobConnector",
      database_poller: "executeDatabasePoller",
      sftp_poller: "executeSftpPoller",
      azure_blob_poller: "executeAzureBlobPoller",
      scheduler: "executeScheduler",
      http_request: "executeHttpRequest",
      email_notification: "executeEmailNotification",
      error_handler: "executeErrorHandler",
    };

    return executorMap[node.type] || node.type;
  }

  /**
   * Capture production error to Error Triage System
   * Called automatically when a flow node fails in production mode
   */
  private async captureErrorReport(params: {
    flow: FlowDefinition;
    flowRun: FlowRun;
    node: FlowNode;
    error: unknown;
    input: unknown;
    executionMode: "test" | "production";
    environment: "dev" | "staging" | "prod";
  }): Promise<void> {
    try {
      const { flow, flowRun, node, error, input, executionMode, environment } = params;

      // Extract error details
      const errorMessage = error instanceof Error ? error.message : String(error);
      const stackTrace = error instanceof Error ? error.stack : undefined;

      // Generate simple user-friendly error message
      const nodeLabel = node.data.label || node.type;
      const errorMessageSimple = `${nodeLabel}: ${errorMessage}`;

      // Determine error type based on error message
      let errorType: string = "unknown";
      if (errorMessage.toLowerCase().includes("validation")) {
        errorType = "validation";
      } else if (errorMessage.toLowerCase().includes("transform")) {
        errorType = "transformation";
      } else if (errorMessage.toLowerCase().includes("api") || errorMessage.toLowerCase().includes("http")) {
        errorType = "api_error";
      } else if (errorMessage.toLowerCase().includes("timeout")) {
        errorType = "timeout";
      } else if (errorMessage.toLowerCase().includes("connection")) {
        errorType = "connection";
      } else if (errorMessage.toLowerCase().includes("auth")) {
        errorType = "authentication";
      } else if (node.type.includes("mapper")) {
        errorType = "transformation";
      } else {
        errorType = "node_failure";
      }

      // Auto-determine severity
      let severity: "low" | "medium" | "high" | "critical" = "medium";
      if (environment === "prod") {
        severity = "high"; // Production failures are always high severity
      }
      if (errorMessage.toLowerCase().includes("critical") || errorMessage.toLowerCase().includes("fatal")) {
        severity = "critical";
      }

      // Prepare error report payload
      const errorReportPayload = {
        organizationId: (flow as any).metadata?.organizationId || "system",
        organizationName: (flow as any).metadata?.organizationName || "System",
        flowId: flow.id,
        flowName: flow.name,
        flowVersion: flow.version,
        runId: flowRun.id,
        traceId: flowRun.traceId,
        nodeId: node.id,
        nodeName: nodeLabel,
        nodeType: node.type,
        errorType,
        errorMessageSimple,
        errorMessageTechnical: errorMessage,
        payloadSnapshot: this.sanitizePayload(input), // Truncate large payloads
        stackTrace,
        nodeConfig: node.data.config || {},
        environment,
        executionMode,
        severity,
        metadata: {
          httpStatus: (error as any)?.statusCode,
          httpMethod: (error as any)?.method,
          endpoint: (error as any)?.url,
        },
      };

      // POST to error triage API
      const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/error-triage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(errorReportPayload),
      });

      if (!response.ok) {
        console.error("Failed to capture error report:", await response.text());
      }
    } catch (captureError) {
      // Silently log capture failures (don't fail the flow twice)
      console.error("Error capturing error report:", captureError);
    }
  }

  /**
   * Sanitize payload to prevent storing huge objects
   */
  private sanitizePayload(payload: unknown): any {
    try {
      const jsonString = JSON.stringify(payload);
      const maxSize = 50000; // 50KB limit

      if (jsonString.length > maxSize) {
        return {
          _truncated: true,
          _originalSize: jsonString.length,
          _preview: jsonString.substring(0, maxSize) + "... [TRUNCATED]",
        };
      }

      return payload;
    } catch {
      return { _error: "Unable to serialize payload" };
    }
  }
}

// Export singleton instance
