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

  // PRODUCTION MODE - Real database connections
  try {
    let result: any;

    // SECURITY WARNING: Query uses template replacement which can be vulnerable to SQL injection
    // TODO: Implement parameterized queries for production use
    // For now, only allow in controlled flow environment with trusted inputs
    if (!context.emulationMode) {
      console.warn('[DatabaseConnector] SECURITY: Using template-based queries. Ensure inputs are from trusted sources only.');
    }

    switch (dbType) {
      case "postgres": {
        const { Client } = await import("pg");
        const client = new Client({ connectionString });
        await client.connect();
        try {
          const res = await client.query(processedQuery);
          result = operation === "query" ? res.rows : { affectedRows: res.rowCount };
        } finally {
          await client.end();
        }
        break;
      }

      case "mysql": {
        const mysql = await import("mysql2/promise");
        const connection = await mysql.createConnection(connectionString);
        try {
          const [rows, fields] = await connection.execute(processedQuery);
          result = operation === "query" ? rows : { affectedRows: (rows as any).affectedRows };
        } finally {
          await connection.end();
        }
        break;
      }

      case "mssql": {
        const sql = await import("mssql");
        const pool = await sql.connect(connectionString);
        try {
          const res = await pool.request().query(processedQuery);
          result = operation === "query" ? res.recordset : { affectedRows: res.rowsAffected[0] };
        } finally {
          await pool.close();
        }
        break;
      }

      case "mongodb": {
        const { MongoClient } = await import("mongodb");
        const client = new MongoClient(connectionString);
        await client.connect();
        try {
          const db = client.db();
          // Parse collection and operation from query
          // Simple format: "collection.find({field: value})"
          const match = processedQuery.match(/([\w]+)\.([\w]+)\((.*)\)/);
          if (!match) throw new Error("Invalid MongoDB query format. Use: collection.method({...})");
          
          const [, collectionName, method, argsStr] = match;
          const collection = db.collection(collectionName);
          const args = argsStr ? JSON.parse(argsStr) : {};
          
          if (method === "find") {
            result = await collection.find(args).toArray();
          } else if (method === "insertOne") {
            const res = await collection.insertOne(args);
            result = { insertedId: res.insertedId, affectedRows: 1 };
          } else if (method === "updateOne") {
            const res = await collection.updateOne(args.filter || {}, args.update || {});
            result = { affectedRows: res.modifiedCount };
          } else if (method === "deleteOne") {
            const res = await collection.deleteOne(args);
            result = { affectedRows: res.deletedCount };
          } else {
            throw new Error(`Unsupported MongoDB method: ${method}`);
          }
        } finally {
          await client.close();
        }
        break;
      }

      default:
        throw new Error(`Unsupported database type: ${dbType}`);
    }

    // Return formatted response
    if (operation === "query") {
      return {
        output: {
          ...input as any,
          [outputField]: result,
        },
        metadata: {
          databaseOperation: operation,
          dbType,
          rowsAffected: Array.isArray(result) ? result.length : 1,
        },
      };
    } else {
      return {
        output: input,
        metadata: {
          databaseOperation: operation,
          dbType,
          rowsAffected: result.affectedRows || 0,
          insertId: result.insertedId || result.insertId,
        },
      };
    }
  } catch (error: any) {
    // If production libraries not installed, provide helpful error
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        `Database driver not installed for ${dbType}. ` +
        `Install: npm install ${getDatabaseDriver(dbType)}`
      );
    }
    throw error;
  }
};

/**
 * Replace template variables in query string
 * Example: "{{$.sku}}" -> "ABC123"
 * 
 * ⚠️ SECURITY WARNING: This performs string replacement, not parameterized queries.
 * Only use with trusted inputs from controlled flow environments.
 * Do NOT expose directly to user input without additional validation.
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
        // SECURITY: Escape single quotes and sanitize for SQL
        if (typeof value === "string") {
          // Basic SQL escaping (not a replacement for parameterized queries)
          return value
            .replace(/'/g, "''")
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"');
        }
        // Validate numeric types
        if (typeof value === "number") {
          return String(value);
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

/**
 * Get npm package name for database driver
 */
function getDatabaseDriver(dbType: string): string {
  const drivers: Record<string, string> = {
    postgres: "pg",
    mysql: "mysql2",
    mssql: "mssql",
    mongodb: "mongodb",
    sqlite: "better-sqlite3",
  };
  return drivers[dbType] || dbType;
}
