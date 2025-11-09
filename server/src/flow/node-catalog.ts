import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { NodeDefinition, nodeDefinitionSchema } from "@shared/schema";

/**
 * Node Catalog Manager
 * Loads and validates YAML node definitions from disk
 */
export class NodeCatalog {
  private static instance: NodeCatalog;
  private nodes: Map<string, NodeDefinition> = new Map();
  private loaded = false;

  private constructor() {}

  static getInstance(): NodeCatalog {
    if (!NodeCatalog.instance) {
      NodeCatalog.instance = new NodeCatalog();
    }
    return NodeCatalog.instance;
  }

  /**
   * Load all YAML node definitions from server/src/flow/nodes/
   */
  loadNodes(): void {
    if (this.loaded) {
      return; // Already loaded
    }

    const nodesDir = path.join(__dirname, "nodes");
    
    if (!fs.existsSync(nodesDir)) {
      console.warn(`[NodeCatalog] Nodes directory not found: ${nodesDir}`);
      return;
    }

    const files = fs.readdirSync(nodesDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

    console.log(`[NodeCatalog] Loading ${files.length} node definitions...`);

    for (const file of files) {
      try {
        const filePath = path.join(nodesDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const data = yaml.load(content);

        // Validate against NodeDefinition schema
        const validated = nodeDefinitionSchema.parse(data);

        this.nodes.set(validated.id, validated);
        console.log(`[NodeCatalog] ✓ Loaded: ${validated.id} (${validated.category})`);
      } catch (error) {
        console.error(`[NodeCatalog] ✗ Failed to load ${file}:`, error);
      }
    }

    this.loaded = true;
    console.log(`[NodeCatalog] Loaded ${this.nodes.size} node types successfully`);
  }

  /**
   * Get all available node definitions
   */
  getAllNodes(): NodeDefinition[] {
    if (!this.loaded) {
      this.loadNodes();
    }
    return Array.from(this.nodes.values());
  }

  /**
   * Get nodes by category
   */
  getNodesByCategory(category: NodeDefinition["category"]): NodeDefinition[] {
    return this.getAllNodes().filter((n) => n.category === category);
  }

  /**
   * Get a specific node definition by ID
   */
  getNode(id: string): NodeDefinition | undefined {
    if (!this.loaded) {
      this.loadNodes();
    }
    return this.nodes.get(id);
  }

  /**
   * Check if a node type exists
   */
  hasNode(id: string): boolean {
    if (!this.loaded) {
      this.loadNodes();
    }
    return this.nodes.has(id);
  }

  /**
   * Reload all node definitions (for development/hot-reload)
   */
  reload(): void {
    this.nodes.clear();
    this.loaded = false;
    this.loadNodes();
  }
}

// Export singleton instance
export const nodeCatalog = NodeCatalog.getInstance();
