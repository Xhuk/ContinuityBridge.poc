/**
 * Transform Helper Functions for BYDM Mapping
 * Used by BYDMMapper to apply transformations defined in YAML mappings
 */

/**
 * Convert BYDM datetime to ISO 8601
 * Handles both BYDM 2018 (CCYY-MM-DDTHH:MM:SS) and 2025 formats
 */
export function toISO8601(value: any): string | undefined {
  if (!value) return undefined;
  
  const str = String(value);
  
  // Already ISO 8601
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) {
    // Add 'Z' if no timezone specified
    return str.includes('Z') || str.includes('+') || str.includes('-') 
      ? str 
      : `${str}Z`;
  }
  
  // Try parsing as date
  try {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  } catch {
    // Fall through
  }
  
  return undefined;
}

/**
 * Convert to ISO 3166-1 alpha-2 country code
 */
export function toISO3166Alpha2(value: any): string | undefined {
  if (!value) return undefined;
  
  const code = String(value).toUpperCase();
  
  // Already 2-letter
  if (code.length === 2) {
    return code;
  }
  
  // 3-letter to 2-letter mapping (common cases)
  const mapping: Record<string, string> = {
    'USA': 'US',
    'CAN': 'CA',
    'MEX': 'MX',
    'GBR': 'GB',
    'FRA': 'FR',
    'DEU': 'DE',
    'ITA': 'IT',
    'ESP': 'ES',
    'BRA': 'BR',
    'ARG': 'AR',
    'CHL': 'CL',
    'COL': 'CO',
    'PER': 'PE',
    'CHN': 'CN',
    'JPN': 'JP',
    'KOR': 'KR',
    'IND': 'IN',
    'AUS': 'AU',
    'NZL': 'NZ',
  };
  
  return mapping[code] || code.substring(0, 2);
}

/**
 * Parse string to integer
 */
export function parseInt(value: any): number {
  if (typeof value === 'number') return Math.floor(value);
  if (!value) return 0;
  
  const parsed = Number.parseInt(String(value), 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse string to float
 */
export function parseFloat(value: any): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  
  const parsed = Number.parseFloat(String(value));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Lookup value in a table
 */
export function lookup(value: any, table: Record<string, any>, defaultValue?: any): any {
  if (!value || !table) return defaultValue;
  
  const key = String(value);
  return table[key] !== undefined ? table[key] : defaultValue;
}

/**
 * Concatenate values
 */
export function concat(...values: any[]): string {
  return values
    .filter(v => v !== undefined && v !== null)
    .map(v => String(v))
    .join('');
}

/**
 * Return first non-null value (coalesce)
 */
export function firstNonNull(...values: any[]): any {
  return values.find(v => v !== undefined && v !== null);
}

/**
 * Convert UOM with quantity
 */
export function uomConvert(
  value: number, 
  fromUom: string, 
  toUom: string,
  conversionTable: Record<string, number>
): number {
  if (!value || !fromUom || !toUom) return value;
  if (fromUom === toUom) return value;
  
  const fromFactor = conversionTable[fromUom.toUpperCase()];
  const toFactor = conversionTable[toUom.toUpperCase()];
  
  if (!fromFactor || !toFactor) return value;
  
  // Convert to base unit, then to target
  return (value * fromFactor) / toFactor;
}

/**
 * Apply transformation by name
 */
export function applyTransform(
  transformName: string, 
  value: any,
  ...args: any[]
): any {
  const transforms: Record<string, Function> = {
    toISO8601,
    toISO3166Alpha2,
    parseInt,
    parseFloat,
    lookup,
    concat,
    firstNonNull,
    uomConvert,
  };
  
  const transform = transforms[transformName];
  if (!transform) {
    console.warn(`Unknown transform: ${transformName}`);
    return value;
  }
  
  try {
    return transform(value, ...args);
  } catch (error) {
    console.error(`Transform ${transformName} failed:`, error);
    return value;
  }
}
