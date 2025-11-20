import { db } from "../../../db.js";
import { pollerStates } from "../../../db";
import { eq } from "drizzle-orm";
import type { ExecutionContext, ExecutionResult } from "../orchestrator.js";

/**
 * Database Poller - Polls database for new/updated records
 * 
 * Configuration:
 * - dbType: postgres | mysql | mssql | mongodb | sqlite
 * - connectionString: Database connection string
 * - query: SQL/NoSQL query to execute
 * - trackingMode: "timestamp" | "sequence" | "checksum"
 * - trackingField: Field to track for new records (e.g., "created_at", "id")
 * - pollInterval: How often to poll (in seconds)
 * - outputField: Where to store polled records (default: "polledRecords")
 */

export const executeDatabasePoller = async (
  nodeId: string,
  config: Record<string, any>,
  input: unknown,
  context: ExecutionContext
): Promise<ExecutionResult> => {
  const {
    dbType = "postgres",
    connectionString,
    query,
    trackingMode = "timestamp",
    trackingField = "created_at",
    pollInterval = 300,
    outputField = "polledRecords",
  } = config;

  if (!connectionString || !query) {
    throw new Error("Database poller requires connectionString and query");
  }

  // Get or create poller state
  let pollerState = await (db.select() as any)
    .from(pollerStates)
    .where(eq(pollerStates.nodeId, nodeId))
    .get();

  if (!pollerState) {
    // Create initial poller state
    await (db.insert(pollerStates) as any).values({
      nodeId,
      pollerId: `db-poller-${nodeId}`,
      pollerType: "database",
      enabled: true,
      pollInterval,
      lastProcessedAt: null,
      lastProcessedValue: null,
      fileChecksums: null,
    });

    pollerState = await (db.select() as any)
      .from(pollerStates)
      .where(eq(pollerStates.nodeId, nodeId))
      .get();
  }

  if (context.emulationMode) {
    // Emulation mode - return mock records
    const mockRecords = [
      { id: 1, name: "Mock Record 1", created_at: new Date().toISOString() },
      { id: 2, name: "Mock Record 2", created_at: new Date().toISOString() },
    ];

    return {
      output: {
        ...input as any,
        [outputField]: mockRecords,
      },
      metadata: {
        pollerType: "database",
        dbType,
        recordsPolled: mockRecords.length,
        emulated: true,
      },
    };
  }

  // PRODUCTION MODE - Real database polling
  try {
    let records: any[] = [];
    let lastValue = pollerState.lastProcessedValue;

    // Build query with tracking filter
    const processedQuery = buildTrackingQuery(query, trackingMode, trackingField, lastValue);

    switch (dbType) {
      case "postgres": {
        const { Client } = await import("pg");
        const client = new Client({ connectionString });
        await client.connect();
        try {
          const res = await client.query(processedQuery);
          records = res.rows;
        } finally {
          await client.end();
        }
        break;
      }

      case "mysql": {
        const mysql = await import("mysql2/promise");
        const connection = await mysql.createConnection(connectionString);
        try {
          const [rows] = await connection.execute(processedQuery);
          records = rows as any[];
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
          records = res.recordset;
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
          // Parse collection and filter from query
          const match = processedQuery.match(/([\w]+)\.find\((.*)\)/);
          if (!match) throw new Error("Invalid MongoDB query format. Use: collection.find({...})");
          
          const [, collectionName, filterStr] = match;
          const collection = db.collection(collectionName);
          const filter = filterStr ? JSON.parse(filterStr) : {};
          
          records = await collection.find(filter).toArray();
        } finally {
          await client.close();
        }
        break;
      }

      default:
        throw new Error(`Unsupported database type: ${dbType}`);
    }

    // Update poller state with latest value
    if (records.length > 0) {
      const newLastValue = getLastTrackedValue(records, trackingField, trackingMode);
      
      await (db.update(pollerStates) as any)
        .set({
          lastProcessedAt: new Date().toISOString(),
          lastProcessedValue: newLastValue,
        })
        .where(eq(pollerStates.nodeId, nodeId));
    }

    return {
      output: {
        ...input as any,
        [outputField]: records,
      },
      metadata: {
        pollerType: "database",
        dbType,
        recordsPolled: records.length,
        lastTrackedValue: pollerState.lastProcessedValue,
      },
    };
  } catch (error: any) {
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
 * Build query with tracking filter to get only new records
 */
function buildTrackingQuery(
  baseQuery: string,
  trackingMode: string,
  trackingField: string,
  lastValue: string | null
): string {
  if (!lastValue) {
    return baseQuery; // First poll, return all records
  }

  // For SQL databases, append WHERE clause
  if (trackingMode === "timestamp") {
    if (baseQuery.toLowerCase().includes("where")) {
      return `${baseQuery} AND ${trackingField} > '${lastValue}'`;
    } else {
      return `${baseQuery} WHERE ${trackingField} > '${lastValue}'`;
    }
  } else if (trackingMode === "sequence") {
    if (baseQuery.toLowerCase().includes("where")) {
      return `${baseQuery} AND ${trackingField} > ${lastValue}`;
    } else {
      return `${baseQuery} WHERE ${trackingField} > ${lastValue}`;
    }
  }

  return baseQuery;
}

/**
 * Get the latest tracked value from records
 */
function getLastTrackedValue(
  records: any[],
  trackingField: string,
  trackingMode: string
): string {
  if (records.length === 0) return "";

  if (trackingMode === "timestamp" || trackingMode === "sequence") {
    // Find max value
    let maxValue = records[0][trackingField];
    for (const record of records) {
      const value = record[trackingField];
      if (value > maxValue) {
        maxValue = value;
      }
    }
    return String(maxValue);
  }

  return "";
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
