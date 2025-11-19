/**
 * Flow Customization Validator
 * 
 * Validates CUSTOM flows against DSL rules and BASE compatibility
 * Ensures customizations don't break existing flows or introduce security issues
 */

import { FlowDefinition } from "@shared/schema";
import { logger } from "../core/logger.js";

const log = logger.child("FlowCustomizationValidator");

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

export interface ValidationError {
  code: string;
  message: string;
  severity: "error" | "critical";
  nodeId?: string;
  field?: string;
  suggestion?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  nodeId?: string;
  field?: string;
}

export class FlowCustomizationValidator {
  /**
   * Validate CUSTOM flow against BASE flow
   */
  async validateCustomFlow(
    customFlow: FlowDefinition,
    baseFlow?: FlowDefinition
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    // 1. Schema validation
    this.validateSchema(customFlow, result);

    // 2. Security validation
    this.validateSecurity(customFlow, result);

    // 3. Performance validation
    this.validatePerformance(customFlow, result);

    // 4. Compatibility validation (if BASE provided)
    if (baseFlow) {
      this.validateCompatibility(customFlow, baseFlow, result);
    }

    // 5. Node configuration validation
    this.validateNodeConfigurations(customFlow, result);

    // 6. Edge validation
    this.validateEdges(customFlow, result);

    // Set overall validity
    result.valid = result.errors.length === 0;

    if (!result.valid) {
      log.warn("Flow validation failed", {
        flowName: customFlow.name,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
      });
    }

    return result;
  }

  /**
   * Validate flow schema structure
   */
  private validateSchema(flow: FlowDefinition, result: ValidationResult): void {
    // Required fields
    if (!flow.name) {
      result.errors.push({
        code: "MISSING_NAME",
        message: "Flow name is required",
        severity: "critical",
        suggestion: "Add 'name' field to flow definition",
      });
    }

    if (!flow.version) {
      result.errors.push({
        code: "MISSING_VERSION",
        message: "Flow version is required",
        severity: "critical",
        suggestion: "Add 'version' field with semantic versioning (e.g., 1.0.0-custom.1)",
      });
    }

    // Validate version format for CUSTOM flows
    if (flow.version && (flow as any).source === "custom") {
      const versionPattern = /^\d+\.\d+\.\d+-custom\.\d+$/;
      if (!versionPattern.test(flow.version)) {
        result.errors.push({
          code: "INVALID_CUSTOM_VERSION",
          message: `Invalid CUSTOM version format: ${flow.version}`,
          severity: "error",
          field: "version",
          suggestion: "Use format: MAJOR.MINOR.PATCH-custom.INCREMENT (e.g., 1.0.0-custom.1)",
        });
      }
    }

    // Validate nodes exist
    if (!flow.nodes || flow.nodes.length === 0) {
      result.errors.push({
        code: "NO_NODES",
        message: "Flow must have at least one node",
        severity: "critical",
      });
    }

    // Validate edges exist
    if (!flow.edges || flow.edges.length === 0) {
      result.errors.push({
        code: "NO_EDGES",
        message: "Flow must have at least one edge",
        severity: "error",
        suggestion: "Add edges to connect nodes",
      });
    }

    // Validate baseVersion for CUSTOM flows
    if ((flow as any).source === "custom" && !(flow as any).baseVersion) {
      result.warnings.push({
        code: "MISSING_BASE_VERSION",
        message: "CUSTOM flow should reference baseVersion",
        field: "baseVersion",
      });
    }
  }

  /**
   * Validate security concerns
   */
  private validateSecurity(flow: FlowDefinition, result: ValidationResult): void {
    // Check for hardcoded secrets
    const flowJson = JSON.stringify(flow);
    
    // Patterns that might indicate hardcoded secrets
    const secretPatterns = [
      { pattern: /"password"\s*:\s*"[^$]/i, message: "Hardcoded password detected" },
      { pattern: /"apiKey"\s*:\s*"[^$]/i, message: "Hardcoded API key detected" },
      { pattern: /"token"\s*:\s*"[^$]/i, message: "Hardcoded token detected" },
      { pattern: /"secret"\s*:\s*"[^$]/i, message: "Hardcoded secret detected" },
      { pattern: /sk_live_/i, message: "API key pattern detected" },
      { pattern: /Bearer [A-Za-z0-9-._~+/]+=*/i, message: "Bearer token pattern detected" },
    ];

    for (const { pattern, message } of secretPatterns) {
      if (pattern.test(flowJson)) {
        result.errors.push({
          code: "HARDCODED_SECRET",
          message,
          severity: "critical",
          suggestion: "Use environment variables: ${VARIABLE_NAME}",
        });
      }
    }

    // Check custom_script nodes for dangerous operations
    for (const node of flow.nodes || []) {
      const nodeType = node.type as string;
      if (nodeType === "custom_script" || nodeType === "javascript") {
        const script = (node as any).config?.script || "";
        
        // Dangerous operations
        const dangerousPatterns = [
          { pattern: /eval\(/i, message: "eval() is not allowed" },
          { pattern: /Function\(/i, message: "Function() constructor is not allowed" },
          { pattern: /require\(/i, message: "require() is not allowed (use allowedModules)" },
          { pattern: /import\(/i, message: "dynamic import() is not allowed" },
          { pattern: /process\.exit/i, message: "process.exit() is not allowed" },
          { pattern: /child_process/i, message: "child_process is not allowed" },
          { pattern: /fs\./i, message: "Direct file system access is not allowed" },
        ];

        for (const { pattern, message } of dangerousPatterns) {
          if (pattern.test(script)) {
            result.errors.push({
              code: "DANGEROUS_OPERATION",
              message,
              severity: "critical",
              nodeId: node.id,
            });
          }
        }
      }
    }
  }

  /**
   * Validate performance concerns
   */
  private validatePerformance(flow: FlowDefinition, result: ValidationResult): void {
    // Check for nodes without timeouts
    for (const node of flow.nodes || []) {
      if (["http_post", "http_get", "interface_destination"].includes(node.type)) {
        const timeout = (node as any).config?.timeout;
        
        if (!timeout) {
          result.warnings.push({
            code: "MISSING_TIMEOUT",
            message: `Node ${node.id} should have a timeout configured`,
            nodeId: node.id,
          });
        } else if (timeout > 60000) {
          result.warnings.push({
            code: "LONG_TIMEOUT",
            message: `Node ${node.id} has a very long timeout (${timeout}ms)`,
            nodeId: node.id,
          });
        }
      }
    }

    // Check for loops without max iterations
    for (const node of flow.nodes || []) {
      if ((node as any).config?.maxIterations !== undefined) {
        const maxIterations = (node as any).config.maxIterations;
        
        if (maxIterations > 10000) {
          result.warnings.push({
            code: "HIGH_ITERATION_LIMIT",
            message: `Node ${node.id} has very high iteration limit (${maxIterations})`,
            nodeId: node.id,
          });
        }
      }
    }

    // Check for potential memory issues with distributors
    for (const node of flow.nodes || []) {
      if (node.type === "distributor") {
        const maxParallel = (node as any).config?.maxParallel;
        
        if (!maxParallel) {
          result.warnings.push({
            code: "UNLIMITED_PARALLEL",
            message: `Distributor ${node.id} should have maxParallel configured`,
            nodeId: node.id,
          });
        } else if (maxParallel > 50) {
          result.warnings.push({
            code: "HIGH_PARALLELISM",
            message: `Distributor ${node.id} has high parallelism (${maxParallel})`,
            nodeId: node.id,
          });
        }
      }
    }
  }

  /**
   * Validate compatibility with BASE flow
   */
  private validateCompatibility(
    customFlow: FlowDefinition,
    baseFlow: FlowDefinition,
    result: ValidationResult
  ): void {
    const baseNodeIds = new Set(baseFlow.nodes.map(n => n.id));
    const customNodeIds = new Set(customFlow.nodes.map(n => n.id));

    // Check for missing BASE nodes (unless explicitly replaced)
    for (const baseNode of baseFlow.nodes) {
      if (!customNodeIds.has(baseNode.id)) {
        const customNodes = (customFlow as any).customNodes || [];
        const isReplaced = customNodes.some(
          (cn: any) => cn.replaceNode === baseNode.id
        );

        if (!isReplaced && baseNode.type === "webhook_trigger") {
          result.errors.push({
            code: "MISSING_TRIGGER",
            message: `CUSTOM flow must preserve trigger node: ${baseNode.id}`,
            severity: "critical",
            nodeId: baseNode.id,
          });
        }
      }
    }

    // Validate insertBefore/insertAfter references
    const customNodes = (customFlow as any).customNodes || [];
    for (const customNode of customNodes) {
      if (customNode.insertBefore && !baseNodeIds.has(customNode.insertBefore)) {
        result.errors.push({
          code: "INVALID_INSERT_REFERENCE",
          message: `insertBefore references non-existent BASE node: ${customNode.insertBefore}`,
          severity: "error",
          nodeId: customNode.id,
        });
      }

      if (customNode.insertAfter && !baseNodeIds.has(customNode.insertAfter)) {
        result.errors.push({
          code: "INVALID_INSERT_REFERENCE",
          message: `insertAfter references non-existent BASE node: ${customNode.insertAfter}`,
          severity: "error",
          nodeId: customNode.id,
        });
      }

      if (customNode.replaceNode && !baseNodeIds.has(customNode.replaceNode)) {
        result.errors.push({
          code: "INVALID_REPLACE_REFERENCE",
          message: `replaceNode references non-existent BASE node: ${customNode.replaceNode}`,
          severity: "error",
          nodeId: customNode.id,
        });
      }
    }

    // Validate that output structure is compatible
    const baseOutput = (baseFlow as any).metadata?.outputSchema;
    const customOutput = (customFlow as any).metadata?.outputSchema;

    if (baseOutput && customOutput) {
      // Check that all required BASE output fields are present
      const baseRequiredFields = baseOutput.required || [];
      const customOutputFields = Object.keys(customOutput.properties || {});

      for (const requiredField of baseRequiredFields) {
        if (!customOutputFields.includes(requiredField)) {
          result.warnings.push({
            code: "MISSING_OUTPUT_FIELD",
            message: `CUSTOM flow should preserve BASE output field: ${requiredField}`,
            field: requiredField,
          });
        }
      }
    }
  }

  /**
   * Validate individual node configurations
   */
  private validateNodeConfigurations(flow: FlowDefinition, result: ValidationResult): void {
    for (const node of flow.nodes || []) {
      const config = (node as any).config || {};

      // Type-specific validation
      const nodeType = node.type as string;
      switch (nodeType) {
        case "webhook":
        case "webhook_trigger":
          this.validateWebhookNode(node, config, result);
          break;
        case "http-request":
        case "http_post":
        case "http_get":
          this.validateHttpRequestNode(node, config, result);
          break;
        case "email":
          this.validateEmailNode(node, config, result);
          break;
        case "condition":
          this.validateConditionNode(node, config, result);
          break;
        case "mapping":
        case "object_mapper":
          this.validateMappingNode(node, config, result);
          break;
        case "javascript":
        case "custom_script":
          this.validateJavaScriptNode(node, config, result);
          break;
      }
    }
  }

  private validateWebhookNode(node: any, config: any, result: ValidationResult): void {
    if (!config.path) {
      result.errors.push({
        code: "MISSING_WEBHOOK_PATH",
        message: "Webhook node must have path configured",
        severity: "error",
        nodeId: node.id,
      });
    }

    if (!config.authentication) {
      result.warnings.push({
        code: "WEBHOOK_NO_AUTH",
        message: "Webhook should have authentication configured",
        nodeId: node.id,
      });
    }
  }

  private validateHttpRequestNode(node: any, config: any, result: ValidationResult): void {
    if (!config.url) {
      result.errors.push({
        code: "MISSING_URL",
        message: "HTTP request node must have url configured",
        severity: "error",
        nodeId: node.id,
      });
    }

    // Check for environment variable usage
    if (config.url && !config.url.includes("${")) {
      result.warnings.push({
        code: "HARDCODED_URL",
        message: "Consider using environment variable for URL",
        nodeId: node.id,
      });
    }

    if (!config.retries) {
      result.suggestions.push(
        `Consider adding retries to http-request node: ${node.id}`
      );
    }
  }

  private validateEmailNode(node: any, config: any, result: ValidationResult): void {
    if (!config.to && !config.toVariable) {
      result.errors.push({
        code: "MISSING_EMAIL_RECIPIENT",
        message: "Email node must have 'to' or 'toVariable' configured",
        severity: "error",
        nodeId: node.id,
      });
    }

    if (!config.subject) {
      result.errors.push({
        code: "MISSING_EMAIL_SUBJECT",
        message: "Email node must have subject configured",
        severity: "error",
        nodeId: node.id,
      });
    }

    if (!config.template && !config.body) {
      result.errors.push({
        code: "MISSING_EMAIL_BODY",
        message: "Email node must have template or body configured",
        severity: "error",
        nodeId: node.id,
      });
    }
  }

  private validateConditionNode(node: any, config: any, result: ValidationResult): void {
    if (!config.expression && !config.conditions) {
      result.errors.push({
        code: "MISSING_CONDITION",
        message: "Condition node must have expression or conditions configured",
        severity: "error",
        nodeId: node.id,
      });
    }
  }

  private validateMappingNode(node: any, config: any, result: ValidationResult): void {
    if (!config.mappingId && !config.mapping) {
      result.errors.push({
        code: "MISSING_MAPPING",
        message: "Mapping node must have mappingId or inline mapping configured",
        severity: "error",
        nodeId: node.id,
      });
    }
  }

  private validateJavaScriptNode(node: any, config: any, result: ValidationResult): void {
    if (!config.script) {
      result.errors.push({
        code: "MISSING_SCRIPT",
        message: "JavaScript node must have script configured",
        severity: "error",
        nodeId: node.id,
      });
    }

    // Check script length
    if (config.script && config.script.length > 10000) {
      result.warnings.push({
        code: "LARGE_SCRIPT",
        message: "JavaScript script is very large, consider splitting into multiple nodes",
        nodeId: node.id,
      });
    }
  }

  /**
   * Validate edge connections
   */
  private validateEdges(flow: FlowDefinition, result: ValidationResult): void {
    const nodeIds = new Set(flow.nodes.map(n => n.id));
    const edgeMap = new Map<string, number>();

    for (const edge of flow.edges || []) {
      // Edges use 'source' and 'target' in schema
      const from = edge.source;
      const to = edge.target;
      
      // Validate from/to nodes exist
      if (!nodeIds.has(from)) {
        result.errors.push({
          code: "INVALID_EDGE_SOURCE",
          message: `Edge references non-existent source node: ${from}`,
          severity: "error",
        });
      }

      if (!nodeIds.has(to)) {
        result.errors.push({
          code: "INVALID_EDGE_TARGET",
          message: `Edge references non-existent target node: ${to}`,
          severity: "error",
        });
      }

      // Track edges for cycle detection
      const key = `${from}->${to}`;
      edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
    }

    // Check for duplicate edges
    for (const [key, count] of Array.from(edgeMap.entries())) {
      if (count > 1) {
        result.warnings.push({
          code: "DUPLICATE_EDGE",
          message: `Duplicate edge detected: ${key}`,
        });
      }
    }

    // Check for orphaned nodes
    const connectedNodes = new Set<string>();
    for (const edge of flow.edges || []) {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    }

    for (const node of flow.nodes || []) {
      const isTrigger = node.type.includes("trigger");
      if (!connectedNodes.has(node.id) && !isTrigger) {
        result.warnings.push({
          code: "ORPHANED_NODE",
          message: `Node ${node.id} is not connected to any edges`,
          nodeId: node.id,
        });
      }
    }
  }

  /**
   * Generate validation report
   */
  generateReport(result: ValidationResult): string {
    const lines: string[] = [];

    lines.push("=".repeat(60));
    lines.push("FLOW VALIDATION REPORT");
    lines.push("=".repeat(60));
    lines.push("");

    if (result.valid) {
      lines.push("✅ VALIDATION PASSED");
    } else {
      lines.push("❌ VALIDATION FAILED");
    }

    lines.push("");
    lines.push(`Errors: ${result.errors.length}`);
    lines.push(`Warnings: ${result.warnings.length}`);
    lines.push(`Suggestions: ${result.suggestions.length}`);
    lines.push("");

    if (result.errors.length > 0) {
      lines.push("ERRORS:");
      lines.push("-".repeat(60));
      for (const error of result.errors) {
        lines.push(`[${error.code}] ${error.message}`);
        if (error.nodeId) lines.push(`  Node: ${error.nodeId}`);
        if (error.suggestion) lines.push(`  💡 ${error.suggestion}`);
        lines.push("");
      }
    }

    if (result.warnings.length > 0) {
      lines.push("WARNINGS:");
      lines.push("-".repeat(60));
      for (const warning of result.warnings) {
        lines.push(`[${warning.code}] ${warning.message}`);
        if (warning.nodeId) lines.push(`  Node: ${warning.nodeId}`);
        lines.push("");
      }
    }

    if (result.suggestions.length > 0) {
      lines.push("SUGGESTIONS:");
      lines.push("-".repeat(60));
      for (const suggestion of result.suggestions) {
        lines.push(`💡 ${suggestion}`);
      }
      lines.push("");
    }

    lines.push("=".repeat(60));

    return lines.join("\n");
  }
}
