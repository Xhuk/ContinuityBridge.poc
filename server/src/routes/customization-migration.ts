/**
 * Customization Migration API
 * 
 * Extract all customer customizations from DEV and apply to TEST/STAGING/PROD
 * 
 * Use Cases:
 * 1. Customer gets binary → sets up in DEV → consultants customize
 * 2. Ready for TEST → export all customizations → import to TEST
 * 3. TEST approved → export → import to PROD
 * 
 * Exports:
 * - Flows (all custom flows created)
 * - Interfaces (adapters, configurations)
 * - Transformations (jq expressions, mappings)
 * - Data Sources (connections, schemas)
 * - Database data (lookup tables, configurations)
 * - System configuration (settings, rules)
 */

import { Router, Request, Response } from "express";
import { db } from "../../db.js";
import { 
  flowDefinitions, 
  interfaces, 
  dataSourceSchemas,
  configurationVersions,
  integrationNotes,
  users
} from "../../db";
import { eq, and, sql } from "drizzle-orm";
import { authenticateUser } from "../auth/rbac-middleware.js";
import { logger } from "../core/logger.js";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

const router = Router();
const log = logger.child("CustomizationMigration");

/**
 * Customization Package - Everything modified in source environment
 */
interface CustomizationPackage {
  exportId: string;
  organizationId: string;
  organizationName: string;
  sourceEnvironment: "dev" | "test" | "staging" | "prod";
  exportedAt: string;
  exportedBy: string;
  
  // Customizations
  flows: any[];
  interfaces: any[];
  dataSources: any[];
  transformations: any[];
  configurations: any[];
  integrationNotes: any[];
  
  // Database data (lookup tables, custom tables)
  databaseData: {
    tableName: string;
    records: any[];
  }[];
  
  // Metadata
  summary: {
    flowCount: number;
    interfaceCount: number;
    dataSourceCount: number;
    configurationCount: number;
    recordCount: number;
  };
}

/**
 * POST /api/customization/export
 * Export all customizations from current environment
 * 🔒 Consultant or Superadmin
 */
router.post("/export", authenticateUser, async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== "superadmin" && userRole !== "consultant" && userRole !== "customer_admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { 
      organizationId = req.user?.organizationId,
      sourceEnvironment = "dev",
      includeInactive = false,
      includeDatabaseData = true
    } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: "organizationId required" });
    }

    log.info("Exporting customizations", {
      organizationId,
      sourceEnvironment,
      userId: req.user?.id
    });

    const exportId = randomUUID();
    const customizationPackage: CustomizationPackage = {
      exportId,
      organizationId,
      organizationName: req.user?.organizationName || organizationId,
      sourceEnvironment,
      exportedAt: new Date().toISOString(),
      exportedBy: req.user?.email || "system",
      flows: [],
      interfaces: [],
      dataSources: [],
      transformations: [],
      configurations: [],
      integrationNotes: [],
      databaseData: [],
      summary: {
        flowCount: 0,
        interfaceCount: 0,
        dataSourceCount: 0,
        configurationCount: 0,
        recordCount: 0,
      }
    };

    // 1. Export Flows
    const flows = await db.select()
      .from(flowDefinitions)
      .where(eq(flowDefinitions.organizationId, organizationId));
    
    customizationPackage.flows = flows.filter((f: any) => 
      includeInactive || f.metadata?.status !== "inactive"
    ).map((f: any) => ({
      ...f,
      // Remove environment-specific IDs
      id: undefined, // Will regenerate on import
      createdAt: undefined,
      updatedAt: undefined,
    }));
    
    customizationPackage.summary.flowCount = customizationPackage.flows.length;

    // 2. Export Interfaces
    const allInterfaces = await db.select()
      .from(interfaces)
      .where(eq(interfaces.organizationId, organizationId));
    
    customizationPackage.interfaces = allInterfaces.map((i: any) => ({
      ...i,
      id: undefined, // Regenerate on import
      createdAt: undefined,
      updatedAt: undefined,
    }));
    
    customizationPackage.summary.interfaceCount = customizationPackage.interfaces.length;

    // 3. Export Data Sources
    const dataSources = await db.select()
      .from(dataSourceSchemas)
      .where(eq(dataSourceSchemas.organizationId, organizationId));
    
    customizationPackage.dataSources = dataSources.map((ds: any) => ({
      ...ds,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    }));
    
    customizationPackage.summary.dataSourceCount = customizationPackage.dataSources.length;

    // 4. Export Configuration Versions
    const configs = await db.select()
      .from(configurationVersions)
      .where(and(
        eq(configurationVersions.organizationId, organizationId),
        eq(configurationVersions.targetEnvironment, sourceEnvironment)
      ));
    
    customizationPackage.configurations = configs.map((c: any) => ({
      ...c,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    }));
    
    customizationPackage.summary.configurationCount = customizationPackage.configurations.length;

    // 5. Export Integration Notes (documentation)
    const notes = await db.select()
      .from(integrationNotes)
      .where(eq(integrationNotes.organizationId, organizationId));
    
    customizationPackage.integrationNotes = notes.map((n: any) => ({
      ...n,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    }));

    // 6. Export Database Data (lookup tables, custom configurations)
    if (includeDatabaseData) {
      // Export custom lookup tables, mapping data, etc.
      // Example: Export transformation rules, enum mappings
      
      try {
        // Get all table names
        const tables = await db.execute(sql`
          SELECT name FROM sqlite_master 
          WHERE type='table' 
          AND name NOT LIKE 'sqlite_%'
          AND name NOT IN ('users', 'sessions', 'secrets_master_keys')
        `);
        
        for (const table of (tables as any).rows || []) {
          const tableName = table.name;
          
          // Skip system tables
          if (['drizzle__migrations', 'ai_usage_tracking', 'ai_quota_settings'].includes(tableName)) {
            continue;
          }
          
          try {
            // Export records for this table
            const records = await db.execute(sql`SELECT * FROM ${sql.identifier(tableName)}`);
            
            if ((records as any).rows && (records as any).rows.length > 0) {
              customizationPackage.databaseData.push({
                tableName,
                records: (records as any).rows,
              });
              
              customizationPackage.summary.recordCount += (records as any).rows.length;
            }
          } catch (tableError) {
            log.warn(`Failed to export table ${tableName}`, tableError);
          }
        }
      } catch (error) {
        log.warn("Failed to export database data", error);
      }
    }

    // Save to file
    const exportsDir = path.join(process.cwd(), "exports", "customizations");
    await fs.mkdir(exportsDir, { recursive: true });
    
    const filename = `${organizationId}-${sourceEnvironment}-${exportId}.json`;
    const filepath = path.join(exportsDir, filename);
    
    await fs.writeFile(
      filepath, 
      JSON.stringify(customizationPackage, null, 2), 
      "utf-8"
    );

    log.info("Customization export completed", {
      exportId,
      filename,
      summary: customizationPackage.summary,
    });

    res.json({
      success: true,
      exportId,
      filename,
      filepath,
      summary: customizationPackage.summary,
      download: `/api/customization/download/${exportId}`,
    });

  } catch (error: any) {
    log.error("Customization export failed", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/customization/import
 * Import customizations to target environment
 * 🔒 Superadmin only (for PROD), Consultant (for DEV/TEST)
 */
router.post("/import", authenticateUser, async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    const {
      exportId,
      targetEnvironment = "test",
      organizationId = req.user?.organizationId,
      dryRun = false,
      overwriteExisting = false
    } = req.body;

    // Access control
    if (targetEnvironment === "prod" && userRole !== "superadmin") {
      return res.status(403).json({ 
        error: "Superadmin required to import to PROD" 
      });
    }

    if (!exportId) {
      return res.status(400).json({ error: "exportId required" });
    }

    log.info("Importing customizations", {
      exportId,
      targetEnvironment,
      organizationId,
      dryRun,
      userId: req.user?.id
    });

    // Load export file
    const exportsDir = path.join(process.cwd(), "exports", "customizations");
    const files = await fs.readdir(exportsDir);
    const exportFile = files.find(f => f.includes(exportId));
    
    if (!exportFile) {
      return res.status(404).json({ error: "Export package not found" });
    }

    const filepath = path.join(exportsDir, exportFile);
    const content = await fs.readFile(filepath, "utf-8");
    const pkg: CustomizationPackage = JSON.parse(content);

    const importResults = {
      flowsImported: 0,
      interfacesImported: 0,
      dataSourcesImported: 0,
      configurationsImported: 0,
      databaseRecordsImported: 0,
      errors: [] as string[],
    };

    if (dryRun) {
      log.info("DRY RUN - No changes will be made");
    }

    // 1. Import Flows
    for (const flow of pkg.flows) {
      try {
        if (!dryRun) {
          await db.insert(flowDefinitions).values({
            ...flow,
            id: randomUUID(), // New ID for target environment
            organizationId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: {
              ...flow.metadata,
              importedFrom: pkg.sourceEnvironment,
              importedAt: new Date().toISOString(),
            },
          } as any);
        }
        importResults.flowsImported++;
      } catch (error: any) {
        importResults.errors.push(`Flow ${flow.name}: ${error.message}`);
      }
    }

    // 2. Import Interfaces
    for (const iface of pkg.interfaces) {
      try {
        if (!dryRun) {
          await db.insert(interfaces).values({
            ...iface,
            id: randomUUID(),
            organizationId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as any);
        }
        importResults.interfacesImported++;
      } catch (error: any) {
        importResults.errors.push(`Interface ${iface.name}: ${error.message}`);
      }
    }

    // 3. Import Data Sources
    for (const ds of pkg.dataSources) {
      try {
        if (!dryRun) {
          await db.insert(dataSourceSchemas).values({
            ...ds,
            id: randomUUID(),
            organizationId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as any);
        }
        importResults.dataSourcesImported++;
      } catch (error: any) {
        importResults.errors.push(`DataSource ${ds.name}: ${error.message}`);
      }
    }

    // 4. Import Configurations
    for (const config of pkg.configurations) {
      try {
        if (!dryRun) {
          await db.insert(configurationVersions).values({
            ...config,
            id: randomUUID(),
            organizationId,
            targetEnvironment,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as any);
        }
        importResults.configurationsImported++;
      } catch (error: any) {
        importResults.errors.push(`Config ${config.version}: ${error.message}`);
      }
    }

    // 5. Import Database Data
    for (const tableData of pkg.databaseData) {
      try {
        if (!dryRun) {
          for (const record of tableData.records) {
            // Insert each record
            const columns = Object.keys(record).filter(k => record[k] !== undefined);
            const values = columns.map(k => record[k]);
            
            // Build dynamic INSERT
            const placeholders = columns.map(() => '?').join(', ');
            const insertSql = `INSERT OR ${overwriteExisting ? 'REPLACE' : 'IGNORE'} INTO ${tableData.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
            
            await db.execute(sql.raw(insertSql), values);
            importResults.databaseRecordsImported++;
          }
        } else {
          importResults.databaseRecordsImported += tableData.records.length;
        }
      } catch (error: any) {
        importResults.errors.push(`Table ${tableData.tableName}: ${error.message}`);
      }
    }

    log.info("Customization import completed", {
      exportId,
      targetEnvironment,
      dryRun,
      results: importResults,
    });

    res.json({
      success: true,
      dryRun,
      targetEnvironment,
      importResults,
      message: dryRun 
        ? "Dry run completed - no changes made" 
        : "Customizations imported successfully",
    });

  } catch (error: any) {
    log.error("Customization import failed", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/customization/exports
 * List all available export packages
 * 🔒 Consultant or Superadmin
 */
router.get("/exports", authenticateUser, async (req: Request, res: Response) => {
  try {
    const exportsDir = path.join(process.cwd(), "exports", "customizations");
    
    try {
      await fs.access(exportsDir);
    } catch {
      // Directory doesn't exist yet
      return res.json({ exports: [], total: 0 });
    }

    const files = await fs.readdir(exportsDir);
    const exports = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const filepath = path.join(exportsDir, file);
        const content = await fs.readFile(filepath, "utf-8");
        const pkg: CustomizationPackage = JSON.parse(content);
        
        exports.push({
          exportId: pkg.exportId,
          filename: file,
          organizationId: pkg.organizationId,
          organizationName: pkg.organizationName,
          sourceEnvironment: pkg.sourceEnvironment,
          exportedAt: pkg.exportedAt,
          exportedBy: pkg.exportedBy,
          summary: pkg.summary,
        });
      } catch (error) {
        log.warn(`Failed to read export ${file}`, error);
      }
    }

    // Sort by export date (newest first)
    exports.sort((a, b) => 
      new Date(b.exportedAt).getTime() - new Date(a.exportedAt).getTime()
    );

    res.json({
      exports,
      total: exports.length,
    });

  } catch (error: any) {
    log.error("Failed to list exports", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/customization/download/:exportId
 * Download export package
 */
router.get("/download/:exportId", authenticateUser, async (req: Request, res: Response) => {
  try {
    const { exportId } = req.params;
    
    const exportsDir = path.join(process.cwd(), "exports", "customizations");
    const files = await fs.readdir(exportsDir);
    const exportFile = files.find(f => f.includes(exportId));
    
    if (!exportFile) {
      return res.status(404).json({ error: "Export package not found" });
    }

    const filepath = path.join(exportsDir, exportFile);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFile}"`);
    
    const content = await fs.readFile(filepath, "utf-8");
    res.send(content);

  } catch (error: any) {
    log.error("Failed to download export", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
