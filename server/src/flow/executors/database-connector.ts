import { NodeExecutor, ExecutionContext, NodeExecutionResult } from "./types";
import { FlowNode } from "@shared/schema";

/**
 * Database Connector Node Executor - Query/Insert data for enrichment or logging
 * 
 * Use Case:
 * - Query product database to get weight/dimensions for order SKU
 * - Insert order record into audit log
 * - Update inventory counts
 * 
 * Configuration:
 * - operation: "query" | "insert" | "update" | "delete"
 * - dbType: "postgres" | "mysql" | "mssql" | "mongodb" | "sqlite"
 * - connectionString: Database connection URL
 * - query: SQL statement with template variables {{$.field}}
 * - outputField: Field name to store query results (for query operations)
 * 
 * Template Variables:
 * - {{$.sku}} → Replaced with value from input.sku
 * - {{$.order.id}} → Replaced with value from input.order.id
 */
export const executeDatabaseConnector: NodeExecutor = async (
  node: FlowNode,
  input: unknown,
  context: ExecutionContext
): Promise<NodeExecutionResult> => {
  const config = (node as any).config || {};
  const {
    operation = "query",
    dbType = "postgres",
    connectionString = "",
    query = "",
    outputField = "dbResult",
  } = config;

  if (!connectionString) {
    throw new Error("Database connection string is required");
  }

  if (!query) {
    throw new Error("SQL query/statement is required");
  }

  // Replace template variables in query
  // Example: SELECT * FROM products WHERE sku = '{{$.sku}}'
  // Becomes: SELECT * FROM products WHERE sku = 'ABC123'
  const processedQuery = replaceTemplateVariables(query, input);

  // FOR NOW: Return mock data instead of real DB connection
  // TODO: Implement actual database connections using pg, mysql2, mssql, mongodb, sqlite3
  
  if (context.emulationMode) {
    // In emulation mode, return mock data
    const mockResult = generateMockDatabaseResult(operation, processedQuery);
    
    if (operation === "query") {
      // Add query results to the payload
      return {
        output: {
          ...input as any,
          [outputField]: mockResult,
        },
        metadata: {
          databaseOperation: operation,
          dbType,
          rowsAffected: Array.isArray(mockResult) ? mockResult.length : 1,
          emulated: true,
        },
      };
    } else {
      // For insert/update/delete, pass through input and add metadata
      return {
        output: input,
        metadata: {
          databaseOperation: operation,
          dbType,
          rowsAffected: 1,
          emulated: true,
        },
      };
    }
  }

  // Production mode - Execute real database query
  throw new Error(
    `Database connector not yet implemented for production. ` +
    `Database: ${dbType}, Operation: ${operation}. ` +
    `Use emulation mode for testing, or implement database client libraries.`
  );
};

/**
 * Replace template variables in query string
 * Example: "{{$.sku}}" -> "ABC123"
 */
function replaceTemplateVariables(template: string, data: unknown): string {
  const variableRegex = /\{\{(\$\.[^}]+)\}\}/g;
  
  return template.replace(variableRegex, (_match: string, path: string) => {
    try {
      // Simple JSONPath-like extraction: $.field or $.nested.field
      const pathParts = path.substring(2).split('.');
      let value: any = data;
      
      for (const part of pathParts) {
        if (value && typeof value === 'object') {
          value = value[part];
        } else {
          return _match; // Keep original if path fails
        }
      }
      
      if (value !== undefined && value !== null) {
        // Escape single quotes for SQL safety
        if (typeof value === "string") {
          return value.replace(/'/g, "''");
        }
        return String(value);
      }
      return _match; // Keep original if not found
    } catch {
      return _match;
    }
  });
}

/**
 * Generate mock database results for emulation/testing
 */
function generateMockDatabaseResult(operation: string, query: string): any {
  if (operation === "query") {
    // Return mock product enrichment data
    if (query.toLowerCase().includes("products") || query.toLowerCase().includes("sku")) {
      return [
        {
          sku: "ABC123",
          name: "Sample Product",
          weight: 2.5,
          dimensions: { length: 10, width: 8, height: 5 },
          price: 29.99,
          inStock: true,
        },
      ];
    }
    
    // Return generic mock data
    return [
      { id: 1, result: "Mock database query result" },
    ];
  } else {
    // For insert/update/delete, return affected rows count
    return { affectedRows: 1, insertId: Math.floor(Math.random() * 10000) };
  }
}
