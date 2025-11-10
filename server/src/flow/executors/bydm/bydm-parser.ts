import { XMLParser } from "fast-xml-parser";
import { NodeExecutor } from "../types";

/**
 * BYDM Parser Executor
 * Parses BYDM messages (XML or JSON) and auto-detects version (2018/2025)
 * 
 * Input: BYDM XML string or JSON object
 * Output: { bydmPayload, version, messageType, metadata }
 */
export const executeBYDMParser: NodeExecutor = async (node, input, context) => {
  const config = node.data.config as any || {};
  const requestedVersion = config.version || 'auto';
  const requestedMessageType = config.messageType || 'auto';
  const strict = config.strict ?? false;

  let bydmPayload: any;
  let originalFormat: 'XML' | 'JSON';
  let detectedVersion: string;
  let detectedMessageType: string;

  // Step 1: Parse input (XML or JSON)
  if (typeof input === 'string') {
    // Try XML first
    const trimmed = input.trim();
    if (trimmed.startsWith('<')) {
      originalFormat = 'XML';
      bydmPayload = parseXML(trimmed);
    } else {
      // Assume JSON string
      try {
        bydmPayload = JSON.parse(trimmed);
        originalFormat = 'JSON';
      } catch {
        throw new Error('Input is not valid XML or JSON');
      }
    }
  } else if (typeof input === 'object' && input !== null) {
    bydmPayload = input;
    originalFormat = 'JSON';
  } else {
    throw new Error('BYDM Parser input must be XML string or JSON object');
  }

  // Step 2: Detect BYDM version
  if (requestedVersion === 'auto') {
    detectedVersion = detectBYDMVersion(bydmPayload, originalFormat);
  } else {
    detectedVersion = requestedVersion;
  }

  // Step 3: Detect message type
  if (requestedMessageType === 'auto') {
    detectedMessageType = detectMessageType(bydmPayload);
  } else {
    detectedMessageType = requestedMessageType;
  }

  // Step 4: Normalize payload (remove namespaces, flatten structure)
  const normalizedPayload = normalizePayload(bydmPayload, detectedVersion);

  // Step 5: Validate in strict mode
  if (strict) {
    validateBYDMStructure(normalizedPayload, detectedMessageType);
  }

  return {
    output: {
      bydmPayload: normalizedPayload,
      version: detectedVersion,
      messageType: detectedMessageType,
    },
    metadata: {
      originalFormat,
      detectedVersion,
      detectedMessageType,
      strict,
    },
  };
};

/**
 * Parse XML to JSON
 */
function parseXML(xml: string): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    ignoreDeclaration: true,
    removeNSPrefix: true,  // Strip namespace prefixes
    parseTagValue: true,
    parseAttributeValue: true,
  });

  return parser.parse(xml);
}

/**
 * Detect BYDM version from payload
 */
function detectBYDMVersion(payload: any, format: 'XML' | 'JSON'): string {
  // Check for version indicators
  const payloadStr = JSON.stringify(payload).toLowerCase();

  // BYDM 2025 indicators
  if (
    payloadStr.includes('2025') ||
    payloadStr.includes('urn:gs1:ecom:bydm:2025') ||
    payloadStr.includes('version="2025"')
  ) {
    return '2025';
  }

  // BYDM 2018 indicators
  if (
    payloadStr.includes('2018') ||
    payloadStr.includes('urn:gs1:ecom:bydm:2018') ||
    payloadStr.includes('version="2018"')
  ) {
    return '2018';
  }

  // Default to 2018 if ambiguous
  return '2018';
}

/**
 * Detect BYDM message type from payload structure
 */
function detectMessageType(payload: any): string {
  const keys = Object.keys(payload);

  // Check root element names (common patterns)
  if (keys.some(k => k.toLowerCase().includes('orderrelease'))) {
    return 'orderRelease';
  }
  if (keys.some(k => k.toLowerCase().includes('shipment'))) {
    return 'shipment';
  }
  if (keys.some(k => k.toLowerCase().includes('receivingadvice') || k.toLowerCase().includes('asn'))) {
    return 'receivingAdvice';
  }
  if (keys.some(k => k.toLowerCase().includes('inventory'))) {
    return 'inventoryReport';
  }

  // Check nested structure
  const firstKey = keys[0];
  if (firstKey && payload[firstKey]) {
    const nested = payload[firstKey];
    if (typeof nested === 'object') {
      return detectMessageType(nested);
    }
  }

  return 'unknown';
}

/**
 * Normalize BYDM payload (flatten and standardize)
 */
function normalizePayload(payload: any, version: string): any {
  // If payload is wrapped in root element, unwrap it
  const keys = Object.keys(payload);
  if (keys.length === 1 && typeof payload[keys[0]] === 'object') {
    const rootKey = keys[0];
    // Common BYDM root elements
    if (
      rootKey.toLowerCase().includes('bydm') ||
      rootKey.toLowerCase().includes('orderrelease') ||
      rootKey.toLowerCase().includes('shipment') ||
      rootKey.toLowerCase().includes('receivingadvice') ||
      rootKey.toLowerCase().includes('inventory')
    ) {
      return payload[rootKey];
    }
  }

  return payload;
}

/**
 * Validate BYDM structure in strict mode
 */
function validateBYDMStructure(payload: any, messageType: string): void {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid BYDM payload: must be an object');
  }

  // Basic validation by message type
  switch (messageType) {
    case 'orderRelease':
      if (!payload.documentId && !payload.orderId) {
        throw new Error('BYDM orderRelease must have documentId or orderId');
      }
      break;
    case 'shipment':
      if (!payload.shipmentId && !payload.documentId) {
        throw new Error('BYDM shipment must have shipmentId or documentId');
      }
      break;
    case 'receivingAdvice':
      if (!payload.receivingAdviceId && !payload.documentId) {
        throw new Error('BYDM receivingAdvice must have receivingAdviceId or documentId');
      }
      break;
    case 'inventoryReport':
      if (!payload.reportId && !payload.documentId) {
        throw new Error('BYDM inventoryReport must have reportId or documentId');
      }
      break;
  }
}
