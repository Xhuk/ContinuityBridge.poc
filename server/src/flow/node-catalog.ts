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
   * Load all YAML node definitions from server/catalogs/nodes/
   */
  loadNodes(): void {
    if (this.loaded) {
      console.log('[NodeCatalog] Already loaded, skipping reload');
      return; // Already loaded
    }

    // Look in server/catalogs/nodes/ instead of server/src/flow/nodes/
    const nodesDir = path.join(import.meta.dirname, "../../catalogs/nodes");
    
    console.log(`[NodeCatalog] Loading nodes from: ${nodesDir}`);
    
    if (!fs.existsSync(nodesDir)) {
      console.error(`[NodeCatalog] Nodes directory not found: ${nodesDir}`);
      console.log('[NodeCatalog] Current directory:', import.meta.dirname);
      console.log('[NodeCatalog] Attempting to list parent directories...');
      
      try {
        const parentDir = path.join(import.meta.dirname, "../../");
        const parentContents = fs.readdirSync(parentDir);
        console.log('[NodeCatalog] Parent directory contents:', parentContents);
        
        if (parentContents.includes('catalogs')) {
          const catalogsContents = fs.readdirSync(path.join(parentDir, 'catalogs'));
          console.log('[NodeCatalog] Catalogs directory contents:', catalogsContents);
        }
      } catch (dirError) {
        console.error('[NodeCatalog] Error listing directories:', dirError);
      }
      
      return;
    }

    const files = fs.readdirSync(nodesDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

    console.log(`[NodeCatalog] Found ${files.length} YAML files in ${nodesDir}`);
    console.log(`[NodeCatalog] Files:`, files);

    for (const file of files) {
      try {
        const filePath = path.join(nodesDir, file);
        console.log(`[NodeCatalog] Loading file: ${filePath}`);
        
        const content = fs.readFileSync(filePath, "utf-8");
        console.log(`[NodeCatalog] File ${file} size: ${content.length} bytes`);
        
        const data = yaml.load(content);
        console.log(`[NodeCatalog] Parsed YAML for ${file}:`, JSON.stringify(data, null, 2));

        // Validate against NodeDefinition schema
        const validated = nodeDefinitionSchema.parse(data);
        console.log(`[NodeCatalog] Validated node definition:`, {
          id: validated.id,
          category: validated.category,
          label: validated.label,
          configFieldsCount: validated.configFields?.length || 0,
        });

        this.nodes.set(validated.id, validated);
        console.log(`[NodeCatalog] ✓ Loaded: ${validated.id} (${validated.category}) with ${validated.configFields?.length || 0} config fields`);
      } catch (error: any) {
        console.error(`[NodeCatalog] ✗ Failed to load ${file}:`, {
          error: error.message,
          stack: error.stack,
          yamlErrors: error.errors || [],
        });
      }
    }

    this.loaded = true;
    console.log(`[NodeCatalog] ═══════════════════════════════════════════`);
    console.log(`[NodeCatalog] Loaded ${this.nodes.size} node types successfully`);
    console.log(`[NodeCatalog] Available node IDs:`, Array.from(this.nodes.keys()));
    console.log(`[NodeCatalog] ═══════════════════════════════════════════`);
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
