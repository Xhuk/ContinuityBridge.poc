import { readFileSync } from 'fs';
import { join } from 'path';
import { load as loadYAML } from 'js-yaml';
import { JSONPath } from 'jsonpath-plus';
import { NodeExecutor } from "../types";
import * as transforms from './transform-helpers';

/**
 * BYDM Mapper Executor
 * Maps BYDM payload to canonical format using YAML mapping definitions
 * 
 * Input: { bydmPayload, version?, messageType? } from BYDMParser
 * Output: { canonicalPayload }
 */
export const executeBYDMMapper: NodeExecutor = async (node, input, context) => {
  const config = node.data.config as any || {};
  
  // Validate input structure
  if (!input || typeof input !== 'object') {
    throw new Error('BYDMMapper requires object input from BYDMParser');
  }

  const inputData = input as any;
  const bydmPayload = inputData.bydmPayload || inputData;
  const messageType = inputData.messageType || config.messageType;
  const version = inputData.version || config.version;

  // Step 1: Resolve mapping file
  const mappingRef = resolveMappingRef(
    config.mappingRef,
    config.autoSelectMapping !== false, // default true
    messageType
  );

  // Step 2: Load mapping definition
  const mapping = loadMapping(mappingRef);

  // Step 3: Load lookup tables (includes)
  const lookupTables = loadLookupTables(mapping.includes || []);

  // Step 4: Apply mapping
  const canonicalPayload = applyMapping(
    bydmPayload,
    mapping.mapping,
    lookupTables,
    config.overrides
  );

  return {
    output: {
      canonicalPayload,
    },
    metadata: {
      mappingUsed: mappingRef,
      sourceFormat: mapping.sourceFormat,
      targetFormat: mapping.targetFormat,
      version,
      messageType,
    },
  };
};

/**
 * Resolve mapping reference (file path)
 */
function resolveMappingRef(
  explicitRef: string | undefined,
  autoSelect: boolean,
  messageType: string | undefined
): string {
  // Explicit reference takes precedence
  if (explicitRef) {
    return explicitRef;
  }

  // Auto-select based on message type
  if (autoSelect && messageType) {
    const mappingMap: Record<string, string> = {
      orderRelease: 'mappings/bydm-to-canonical/order_release_to_canonical_order.yaml',
      shipment: 'mappings/bydm-to-canonical/shipment_to_canonical_shipment.yaml',
      receivingAdvice: 'mappings/bydm-to-canonical/receiving_advice_to_canonical_inbound.yaml',
      inventoryReport: 'mappings/bydm-to-canonical/inventory_report_to_canonical_inventory.yaml',
    };

    const ref = mappingMap[messageType];
    if (ref) {
      return ref;
    }
  }

  throw new Error('No mapping reference provided and auto-selection failed');
}

/**
 * Load YAML mapping definition from filesystem
 */
function loadMapping(mappingRef: string): any {
  try {
    // Support both absolute and relative paths
    const fullPath = mappingRef.startsWith('/') 
      ? mappingRef 
      : join(process.cwd(), mappingRef);

    const content = readFileSync(fullPath, 'utf-8');
    const mapping = loadYAML(content);

    if (!mapping || typeof mapping !== 'object') {
      throw new Error('Invalid mapping YAML structure');
    }

    if (!mapping.mapping) {
      throw new Error('Mapping YAML must contain "mapping" field');
    }

    return mapping;
  } catch (error) {
    throw new Error(`Failed to load mapping ${mappingRef}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Load lookup tables (status_map, uom, etc.)
 */
function loadLookupTables(includes: string[]): Record<string, any> {
  const tables: Record<string, any> = {};

  for (const includePath of includes) {
    try {
      const fullPath = includePath.startsWith('/') 
        ? includePath 
        : join(process.cwd(), includePath);

      const content = readFileSync(fullPath, 'utf-8');
      const table = loadYAML(content);

      // Extract filename without extension as table name
      const fileName = includePath.split('/').pop()?.replace('.yaml', '').replace('.yml', '') || 'lookup';
      tables[fileName] = table;
    } catch (error) {
      console.warn(`Failed to load lookup table ${includePath}:`, error);
    }
  }

  return tables;
}

/**
 * Apply mapping definition to BYDM payload
 */
function applyMapping(
  bydmPayload: any,
  mappingDef: any,
  lookupTables: Record<string, any>,
  overrides?: any
): any {
  const result: any = {};

  for (const [targetField, fieldConfig] of Object.entries(mappingDef)) {
    // Handle nested objects
    if (isNestedMapping(fieldConfig)) {
      result[targetField] = applyMapping(bydmPayload, fieldConfig, lookupTables, overrides?.[targetField]);
      continue;
    }

    // Handle array mappings
    if (isArrayMapping(fieldConfig as any)) {
      result[targetField] = applyArrayMapping(bydmPayload, fieldConfig as any, lookupTables);
      continue;
    }

    // Handle simple field mapping
    const value = extractAndTransform(bydmPayload, fieldConfig as any, lookupTables);
    
    // Apply overrides if present
    const finalValue = overrides?.[targetField] !== undefined 
      ? overrides[targetField] 
      : value;

    // Only set if not undefined (unless optional: false)
    if (finalValue !== undefined || !(fieldConfig as any).optional) {
      result[targetField] = finalValue;
    }
  }

  return result;
}

/**
 * Check if field config is a nested object mapping
 */
function isNestedMapping(fieldConfig: any): boolean {
  return (
    typeof fieldConfig === 'object' &&
    fieldConfig !== null &&
    !fieldConfig.path &&
    !fieldConfig.arrayPath &&
    !Array.isArray(fieldConfig)
  );
}

/**
 * Check if field config is an array mapping
 */
function isArrayMapping(fieldConfig: any): boolean {
  return !!(fieldConfig?.arrayPath && fieldConfig?.itemMapping);
}

/**
 * Apply array mapping
 */
function applyArrayMapping(
  bydmPayload: any,
  arrayConfig: any,
  lookupTables: Record<string, any>
): any[] {
  const arrayPath = arrayConfig.arrayPath;
  const itemMapping = arrayConfig.itemMapping;

  // Extract array using JSONPath
  const items = JSONPath({ path: arrayPath, json: bydmPayload });

  if (!Array.isArray(items)) {
    return [];
  }

  // Map each item
  return items.map(item => {
    const mappedItem: any = {};
    for (const [targetField, fieldConfig] of Object.entries(itemMapping)) {
      const value = extractAndTransform(item, fieldConfig as any, lookupTables);
      if (value !== undefined || !(fieldConfig as any).optional) {
        mappedItem[targetField] = value;
      }
    }
    return mappedItem;
  });
}

/**
 * Extract value from source and apply transformations
 */
function extractAndTransform(
  source: any,
  fieldConfig: any,
  lookupTables: Record<string, any>
): any {
  let value: any;

  // Extract value using JSONPath
  if (fieldConfig.path) {
    value = JSONPath({ path: fieldConfig.path, json: source, wrap: false });
  }

  // Try fallback if value is undefined
  if (value === undefined && fieldConfig.fallback) {
    value = JSONPath({ path: fieldConfig.fallback, json: source, wrap: false });
  }

  // Use default if still undefined
  if (value === undefined && fieldConfig.default !== undefined) {
    return fieldConfig.default;
  }

  // Apply transform if specified
  if (value !== undefined && fieldConfig.transform) {
    value = applyTransformFn(value, fieldConfig.transform);
  }

  // Apply lookup if specified
  if (value !== undefined && fieldConfig.lookup) {
    value = applyLookup(value, fieldConfig.lookup, lookupTables, fieldConfig.default);
  }

  return value;
}

/**
 * Apply transform function
 */
function applyTransformFn(value: any, transformName: string): any {
  return transforms.applyTransform(transformName, value);
}

/**
 * Apply lookup table transformation
 */
function applyLookup(
  value: any,
  lookupRef: string,
  lookupTables: Record<string, any>,
  defaultValue?: any
): any {
  // Parse lookup reference: "tableName.key" or "tableName"
  const parts = lookupRef.split('.');
  const tableName = parts[0];
  const tableKey = parts[1];

  const table = lookupTables[tableName];
  if (!table) {
    console.warn(`Lookup table not found: ${tableName}`);
    return defaultValue;
  }

  // Navigate nested lookup table
  const lookupTable = tableKey ? table[tableKey] : table;
  
  if (typeof lookupTable !== 'object') {
    console.warn(`Invalid lookup table structure: ${lookupRef}`);
    return defaultValue;
  }

  return transforms.lookup(value, lookupTable, defaultValue);
}
