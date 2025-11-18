import type { NodeExecutor } from "./executors/types";
import type { FlowNode } from "@shared/schema";
import { logger } from "../core/logger.js";

const registryLog = logger.child("NodeRegistry");

/**
 * Node Plugin Interface
 */
export interface NodePlugin {
  type: string;
  category: "trigger" | "parser" | "transform" | "builder" | "output" | "logic";
  label: string;
  description: string;
  icon: string;
  executor: NodeExecutor;
  configSchema?: Record<string, any>;
  requires?: {
    packages?: string[];
    permissions?: string[];
    features?: string[];
  };
}

/**
 * Dynamic Node Registry with Multi-Tenant Support
 */
export class NodeRegistry {
  private static registryInstance: NodeRegistry;
  private executors: Map<string, NodeExecutor> = new Map();
  private plugins: Map<string, NodePlugin> = new Map();
  private orgPlugins: Map<string, Map<string, NodePlugin>> = new Map();
  
  private constructor() {
    registryLog.info("Node Registry initialized");
  }
  
  static getInstance(): NodeRegistry {
    if (!NodeRegistry.registryInstance) {
      NodeRegistry.registryInstance = new NodeRegistry();
    }
    return NodeRegistry.registryInstance;
  }
  
  registerExecutor(name: string, executor: NodeExecutor): void {
    this.executors.set(name, executor);
    registryLog.debug(`Registered executor: ${name}`);
  }
  
  registerPlugin(plugin: NodePlugin): void {
    if (this.plugins.has(plugin.type)) {
      throw new Error(`Plugin type '${plugin.type}' already registered`);
    }
    
    this.plugins.set(plugin.type, plugin);
    this.executors.set(this.getExecutorName(plugin.type), plugin.executor);
    registryLog.info(`Registered plugin: ${plugin.type}`);
  }
  
  registerOrgPlugin(organizationId: string, plugin: NodePlugin): void {
    if (!this.orgPlugins.has(organizationId)) {
      this.orgPlugins.set(organizationId, new Map());
    }
    
    const orgRegistry = this.orgPlugins.get(organizationId)!;
    orgRegistry.set(plugin.type, plugin);
    
    const executorName = `${organizationId}::${plugin.type}`;
    this.executors.set(executorName, plugin.executor);
    registryLog.info(`Registered org plugin: ${plugin.type} for ${organizationId}`);
  }
  
  getExecutor(nodeType: string, organizationId?: string): NodeExecutor | null {
    if (organizationId) {
      const orgExecutorName = `${organizationId}::${nodeType}`;
      if (this.executors.has(orgExecutorName)) {
        return this.executors.get(orgExecutorName)!;
      }
    }
    
    const executorName = this.getExecutorName(nodeType);
    return this.executors.get(executorName) || null;
  }
  
  getAvailablePlugins(organizationId?: string): NodePlugin[] {
    const globalPlugins = Array.from(this.plugins.values());
    
    if (!organizationId) {
      return globalPlugins;
    }
    
    const orgRegistry = this.orgPlugins.get(organizationId);
    const orgPlugins = orgRegistry ? Array.from(orgRegistry.values()) : [];
    
    return [...globalPlugins, ...orgPlugins];
  }
  
  unregisterPlugin(pluginType: string, organizationId?: string): void {
    if (organizationId) {
      const orgRegistry = this.orgPlugins.get(organizationId);
      if (orgRegistry) {
        orgRegistry.delete(pluginType);
        this.executors.delete(`${organizationId}::${pluginType}`);
      }
    } else {
      this.plugins.delete(pluginType);
      this.executors.delete(this.getExecutorName(pluginType));
    }
  }
  
  private getExecutorName(nodeType: string): string {
    const camelCase = nodeType
      .split("_")
      .map((word, index) => 
        index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join("");
    
    return `execute${camelCase.charAt(0).toUpperCase() + camelCase.slice(1)}`;
  }
}

export const nodeRegistry = NodeRegistry.getInstance();
