import { FlowDefinition, FlowNode, FlowEdge } from "@shared/schema";
import { randomUUID } from "crypto";
import * as yaml from "yaml";

/**
 * Flow DSL (Domain-Specific Language)
 * Enables flow-as-code using YAML/JSON
 * 
 * Example YAML:
 * ```yaml
 * name: SFTP to API Flow
 * version: 1.0.0
 * organizationId: org-123
 * triggers:
 *   - type: sftp_poller
 *     config:
 *       host: sftp.example.com
 *       directory: /inbound
 *       interval: 300
 * 
 * steps:
 *   - id: parse_csv
 *     type: csv_parser
 *     config:
 *       delimiter: ","
 *       headers: true
 *   
 *   - id: map_data
 *     type: object_mapper
 *     config:
 *       mappings:
 *         - source: $.customer_id
 *           target: $.customerId
 *   
 *   - id: send_to_api
 *     type: interface_destination
 *     config:
 *       interfaceId: api-endpoint-1
 * ```
 */

export interface FlowDSL {
  name: string;
  description?: string;
  version: string;
  organizationId?: string;
  organizationName?: string;
  tags?: string[];
  enabled?: boolean;
  
  // Triggers (entry nodes)
  triggers: FlowNodeDSL[];
  
  // Processing steps
  steps: FlowNodeDSL[];
  
  // Metadata
  metadata?: {
    author?: string;
    createdAt?: string;
    updatedAt?: string;
    category?: string;
    [key: string]: any;
  };
}

export interface FlowNodeDSL {
  id: string;
  type: string;
  label?: string;
  config: Record<string, any>;
  
  // Conditional routing
  onSuccess?: string; // Next step ID on success
  onError?: string;   // Next step ID on error
  
  // Position hints (optional, for UI)
  position?: { x: number; y: number };
}

export class FlowDSLParser {
  /**
   * Parse YAML/JSON DSL to FlowDefinition
   */
  static parse(dsl: string | FlowDSL, format: "yaml" | "json" = "yaml"): FlowDefinition {
    let flowDSL: FlowDSL;
    
    if (typeof dsl === "string") {
      flowDSL = format === "yaml" ? yaml.parse(dsl) : JSON.parse(dsl);
    } else {
      flowDSL = dsl;
    }
    
    // Validate required fields
    if (!flowDSL.name || !flowDSL.version) {
      throw new Error("Flow DSL must include 'name' and 'version'");
    }
    
    if (!flowDSL.triggers || flowDSL.triggers.length === 0) {
      throw new Error("Flow DSL must include at least one trigger");
    }
    
    const flowId = randomUUID();
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    
    // Convert triggers to nodes
    let yPosition = 100;
    flowDSL.triggers.forEach((trigger, index) => {
      nodes.push({
        id: trigger.id || `trigger_${index}`,
        type: trigger.type as any, // DSL allows custom types
        position: trigger.position || { x: 100, y: yPosition },
        data: {
          label: trigger.label || `Trigger: ${trigger.type}`,
          config: trigger.config,
        },
      });
      yPosition += 150;
    });
    
    // Convert steps to nodes
    let xPosition = 400;
    flowDSL.steps.forEach((step, index) => {
      nodes.push({
        id: step.id,
        type: step.type as any, // DSL allows custom types
        position: step.position || { x: xPosition, y: 100 + (index * 150) },
        data: {
          label: step.label || step.type,
          config: step.config,
        },
      });
    });
    
    // Create edges based on step order and routing
    for (let i = 0; i < flowDSL.steps.length; i++) {
      const currentStep = flowDSL.steps[i];
      const prevStep = i === 0 ? flowDSL.triggers[0] : flowDSL.steps[i - 1];
      
      // Default linear flow
      if (prevStep) {
        edges.push({
          id: `edge_${prevStep.id}_${currentStep.id}`,
          source: prevStep.id,
          target: currentStep.id,
          animated: false,
          label: "success",
        });
      }
      
      // Conditional routing
      if (currentStep.onSuccess && currentStep.onSuccess !== flowDSL.steps[i + 1]?.id) {
        edges.push({
          id: `edge_${currentStep.id}_${currentStep.onSuccess}`,
          source: currentStep.id,
          target: currentStep.onSuccess,
          animated: false,
          label: "true",
        });
      }
      
      if (currentStep.onError) {
        edges.push({
          id: `edge_${currentStep.id}_${currentStep.onError}`,
          source: currentStep.id,
          target: currentStep.onError,
          animated: false,
          label: "error",
        });
      }
    }
    
    // Build FlowDefinition
    const flowDefinition: FlowDefinition = {
      id: flowId,
      name: flowDSL.name,
      description: flowDSL.description || "",
      version: flowDSL.version,
      nodes,
      edges,
      enabled: flowDSL.enabled !== false,
      tags: flowDSL.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(flowDSL.organizationId && { 
        metadata: { 
          organizationId: flowDSL.organizationId,
          organizationName: flowDSL.organizationName,
          ...flowDSL.metadata 
        } 
      }),
    } as FlowDefinition;
    
    return flowDefinition;
  }
  
  /**
   * Export FlowDefinition to DSL format
   */
  static export(flow: FlowDefinition, format: "yaml" | "json" = "yaml"): string {
    // Find trigger nodes (no incoming edges)
    const incomingEdges = new Set(flow.edges.map(e => e.target));
    const triggers = flow.nodes
      .filter(n => !incomingEdges.has(n.id))
      .map(n => this.nodeToNodeDSL(n, flow.edges));
    
    // Find processing steps (non-triggers)
    const steps = flow.nodes
      .filter(n => incomingEdges.has(n.id))
      .map(n => this.nodeToNodeDSL(n, flow.edges));
    
    const flowDSL: FlowDSL = {
      name: flow.name,
      description: flow.description || undefined,
      version: flow.version,
      organizationId: (flow as any).organizationId || (flow as any).metadata?.organizationId,
      organizationName: (flow as any).organizationName || (flow as any).metadata?.organizationName,
      tags: flow.tags || undefined,
      enabled: flow.enabled,
      triggers,
      steps,
      metadata: {
        ...(flow as any).metadata,
        exportedAt: new Date().toISOString(),
      },
    };
    
    return format === "yaml" 
      ? yaml.stringify(flowDSL)
      : JSON.stringify(flowDSL, null, 2);
  }
  
  /**
   * Convert FlowNode to NodeDSL
   */
  private static nodeToNodeDSL(node: FlowNode, edges: FlowEdge[]): FlowNodeDSL {
    const outgoingEdges = edges.filter(e => e.source === node.id);
    
    // Find conditional routing
    const successEdge = outgoingEdges.find(e => 
      e.label?.toLowerCase().includes("success") || 
      e.label?.toLowerCase().includes("true")
    );
    const errorEdge = outgoingEdges.find(e => 
      e.label?.toLowerCase().includes("error") || 
      e.label?.toLowerCase().includes("false")
    );
    
    return {
      id: node.id,
      type: node.type,
      label: node.data.label || undefined,
      config: node.data.config || {},
      onSuccess: successEdge?.target,
      onError: errorEdge?.target,
      position: node.position,
    };
  }
}
