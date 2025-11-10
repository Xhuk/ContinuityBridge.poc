# BYDM Integration - Production Implementation Plan

## Overview
Full integration of BYDM (By Delivery Message) transformation capabilities into ContinuityBridge's Flow Builder architecture.

## Current Status: POC Complete ✅
- ✅ Canonical order schema created
- ✅ Status mapping tables (order, shipment, receiving, Amazon, MercadoLibre)
- ✅ UOM mapping and conversion tables
- ✅ BYDM orderRelease → canonical order mapping YAML
- ✅ Sample BYDM orderRelease JSON for testing

## Production Requirements

### 1. Additional Canonical Schemas
Create JSON schemas for remaining BYDM message types:

**Files to create:**
- `schemas/canonical/shipment.schema.json` - Canonical shipment format
- `schemas/canonical/inbound.schema.json` - Canonical inbound/receiving format
- `schemas/canonical/inventory.schema.json` - Canonical inventory format

**Schema structure:**
Each schema should follow the same pattern as `order.schema.json`:
- Required core fields
- Optional extended fields
- Normalized status enums
- ISO standard codes (country, currency, UOM)
- Nested objects for addresses, items, etc.

---

### 2. Additional BYDM Mappings
Create mapping YAMLs for all BYDM message types:

**Files to create:**
- `mappings/bydm-to-canonical/shipment_to_canonical_shipment.yaml`
- `mappings/bydm-to-canonical/receiving_advice_to_canonical_inbound.yaml`
- `mappings/bydm-to-canonical/inventory_report_to_canonical_inventory.yaml`

**Each mapping should include:**
- JSONPath expressions for field extraction
- Lookup tables for status/UOM normalization
- Transform functions (toISO8601, parseInt, etc.)
- Fallback values and defaults
- Validation rules

---

### 3. BYDMParser Node Implementation

**File:** `server/src/orchestration/executors/bydm-parser.ts`

**Functionality:**
```typescript
export async function executeBYDMParser(
  node: FlowNode,
  context: ExecutionContext
): Promise<ExecutionResult> {
  // 1. Auto-detect input format (XML vs JSON)
  // 2. Auto-detect BYDM version (2018 vs 2025)
  // 3. Normalize namespaces and tags
  // 4. Parse to normalized JSON structure
  // 5. Output: { bydmPayload: object, version: string, messageType: string }
}
```

**Configuration options:**
- `version`: "auto" | "2018" | "2025" (default: "auto")
- `messageType`: "orderRelease" | "shipment" | "receivingAdvice" | "inventoryReport" | "auto"
- `strict`: boolean (strict validation vs permissive)

**Version detection logic:**
- Check XML namespace URIs
- Check for version-specific tags
- Check datetime format patterns
- Fallback to 2018 if ambiguous

**Output schema:**
```json
{
  "bydmPayload": { /* normalized BYDM object */ },
  "version": "2025",
  "messageType": "orderRelease",
  "metadata": {
    "originalFormat": "XML",
    "detectedVersion": "2025",
    "namespaces": { ... }
  }
}
```

---

### 4. BYDMMapper Node Implementation

**File:** `server/src/orchestration/executors/bydm-mapper.ts`

**Functionality:**
```typescript
export async function executeBYDMMapper(
  node: FlowNode,
  context: ExecutionContext
): Promise<ExecutionResult> {
  // 1. Load mapping YAML (from node.config.mappingRef)
  // 2. Load included lookups (status_map, uom)
  // 3. Apply JSONPath extractions
  // 4. Apply transforms and lookups
  // 5. Build canonical output
  // 6. Output: { canonicalPayload: object }
}
```

**Configuration options:**
- `mappingRef`: string (path to mapping YAML)
- `autoSelectMapping`: boolean (auto-select based on messageType)
- `overrides`: object (customer-specific field overrides)

**Mapping resolution:**
```
1. Check node.config.mappingRef (explicit path)
2. If autoSelectMapping: use context.bydmPayload.messageType
   - orderRelease → order_release_to_canonical_order.yaml
   - shipment → shipment_to_canonical_shipment.yaml
   - etc.
3. Apply customer overrides if present:
   - mappings/overrides/{customerId}/{mappingName}.yaml
```

**Transform functions to implement:**
- `toISO8601`: BYDM datetime → ISO 8601
- `toISO3166Alpha2`: Country code normalization
- `parseInt`, `parseFloat`: String → Number
- `lookup(table, key)`: Table-based mapping
- `concat(...values)`: String concatenation
- `firstNonNull(...values)`: Coalesce
- `uomConvert(value, from, to)`: UOM conversion

**Output schema:**
```json
{
  "canonicalPayload": { /* canonical order/shipment/etc */ },
  "metadata": {
    "mappingUsed": "order_release_to_canonical_order.yaml",
    "transformsApplied": ["toISO8601", "lookup"],
    "fieldsValidated": 15
  }
}
```

---

### 5. Node Catalog Definitions

**File:** `server/catalogs/nodes/bydm_parser.yaml`

```yaml
id: bydm_parser
name: BYDM Parser
category: parsers
description: Parse and normalize BYDM messages (XML/JSON) with auto-detection of version (2018/2025)
icon: file-code
color: "#3B82F6"

inputs:
  - name: data
    type: string
    required: true
    description: Raw BYDM XML or JSON string

outputs:
  - name: bydmPayload
    type: object
    description: Normalized BYDM message as JSON
  - name: version
    type: string
    description: Detected BYDM version (2018 or 2025)
  - name: messageType
    type: string
    description: BYDM message type (orderRelease, shipment, etc.)

config:
  - name: version
    type: select
    options: ["auto", "2018", "2025"]
    default: "auto"
    description: BYDM version (auto-detect or explicit)
    
  - name: messageType
    type: select
    options: ["auto", "orderRelease", "shipment", "receivingAdvice", "inventoryReport"]
    default: "auto"
    description: BYDM message type
    
  - name: strict
    type: boolean
    default: false
    description: Strict validation mode

executor: bydm-parser
```

**File:** `server/catalogs/nodes/bydm_mapper.yaml`

```yaml
id: bydm_mapper
name: BYDM Mapper
category: transformers
description: Map BYDM messages to canonical format using YAML mapping definitions
icon: arrows-right-left
color: "#10B981"

inputs:
  - name: bydmPayload
    type: object
    required: true
    description: Normalized BYDM message from BYDMParser
  - name: messageType
    type: string
    description: BYDM message type (for auto-mapping)

outputs:
  - name: canonicalPayload
    type: object
    description: Canonical order/shipment/inbound/inventory object

config:
  - name: mappingRef
    type: string
    description: Path to mapping YAML file (optional if autoSelectMapping is true)
    
  - name: autoSelectMapping
    type: boolean
    default: true
    description: Auto-select mapping based on messageType
    
  - name: customerId
    type: string
    description: Customer ID for override mappings (optional)

executor: bydm-mapper
```

---

### 6. Executor Registration

**File:** `server/src/orchestration/flow-orchestrator.ts`

Add to executor map:
```typescript
import { executeBYDMParser } from "./executors/bydm-parser";
import { executeBYDMMapper } from "./executors/bydm-mapper";

const NODE_EXECUTORS = {
  // ... existing executors
  "bydm_parser": executeBYDMParser,
  "bydm_mapper": executeBYDMMapper,
};
```

---

### 7. Example Flows

**OrderRelease → Amazon SP-API:**
```json
{
  "id": "flow-bydm-amazon-order",
  "name": "BYDM OrderRelease → Amazon SP-API",
  "nodes": [
    {
      "id": "1",
      "type": "bydm_parser",
      "config": { "version": "auto", "messageType": "orderRelease" }
    },
    {
      "id": "2",
      "type": "bydm_mapper",
      "config": { "autoSelectMapping": true }
    },
    {
      "id": "3",
      "type": "validator",
      "config": { "schemaRef": "schemas/canonical/order.schema.json" }
    },
    {
      "id": "4",
      "type": "interface",
      "config": {
        "templateId": "amazon-sp-api",
        "operation": "createOrder"
      }
    }
  ],
  "edges": [
    { "source": "1", "target": "2" },
    { "source": "2", "target": "3" },
    { "source": "3", "target": "4" }
  ]
}
```

**Shipment → MercadoLibre:**
```json
{
  "id": "flow-bydm-meli-shipment",
  "name": "BYDM Shipment → MercadoLibre",
  "nodes": [
    {
      "id": "1",
      "type": "bydm_parser",
      "config": { "version": "auto", "messageType": "shipment" }
    },
    {
      "id": "2",
      "type": "bydm_mapper",
      "config": { "autoSelectMapping": true }
    },
    {
      "id": "3",
      "type": "validator",
      "config": { "schemaRef": "schemas/canonical/shipment.schema.json" }
    },
    {
      "id": "4",
      "type": "interface",
      "config": {
        "templateId": "mercadolibre-api",
        "operation": "updateShipment"
      }
    }
  ],
  "edges": [
    { "source": "1", "target": "2" },
    { "source": "2", "target": "3" },
    { "source": "3", "target": "4" }
  ]
}
```

**ReceivingAdvice → WMS:**
```json
{
  "id": "flow-bydm-wms-inbound",
  "name": "BYDM ReceivingAdvice → WMS",
  "nodes": [
    {
      "id": "1",
      "type": "bydm_parser",
      "config": { "version": "2025", "messageType": "receivingAdvice" }
    },
    {
      "id": "2",
      "type": "bydm_mapper",
      "config": { "autoSelectMapping": true }
    },
    {
      "id": "3",
      "type": "validator",
      "config": { "schemaRef": "schemas/canonical/inbound.schema.json" }
    },
    {
      "id": "4",
      "type": "interface",
      "config": {
        "templateId": "manhattan-wms",
        "operation": "createASN"
      }
    }
  ],
  "edges": [
    { "source": "1", "target": "2" },
    { "source": "2", "target": "3" },
    { "source": "3", "target": "4" }
  ]
}
```

---

### 8. UI Integration

**Flow Builder Updates:**

1. **Add BYDM nodes to palette:**
   - Parser icon: `<FileCode />` (blue)
   - Mapper icon: `<ArrowsRightLeft />` (green)

2. **Node configuration panels:**
   - BYDM Parser: Version dropdown, message type dropdown, strict mode toggle
   - BYDM Mapper: Mapping file selector, auto-mapping toggle, customer ID input

3. **Sample data testing:**
   - Upload BYDM sample file (XML/JSON)
   - Execute flow with test file
   - Show canonical output in preview panel

---

### 9. Version Management

**2018 vs 2025 Support:**

**Namespace detection:**
```typescript
const BYDM_NAMESPACES = {
  "2018": "urn:gs1:ecom:bydm:2018",
  "2025": "urn:gs1:ecom:bydm:2025"
};
```

**Mapping versioning:**
- Single mapping file supports both versions via conditional paths
- OR separate files: `order_release_2018.yaml`, `order_release_2025.yaml`

**Recommendation:** Single file with version-aware paths:
```yaml
orderId:
  path:
    "2018": "$.documentId"
    "2025": "$.header.documentId"
```

---

### 10. Customer Overrides

**Directory structure:**
```
mappings/
  ├── bydm-to-canonical/
  │   ├── order_release_to_canonical_order.yaml
  │   └── ...
  ├── common/
  │   ├── status_map.yaml
  │   └── uom.yaml
  └── overrides/
      ├── accel/
      │   ├── order_release_override.yaml
      │   └── status_map_override.yaml
      └── customerB/
          └── ...
```

**Override logic:**
```typescript
// 1. Load base mapping
const baseMapping = loadYAML(`mappings/bydm-to-canonical/${mappingName}.yaml`);

// 2. Check for customer override
const override = loadYAML(`mappings/overrides/${customerId}/${mappingName}_override.yaml`);

// 3. Merge (override wins)
const finalMapping = { ...baseMapping, ...override };
```

---

### 11. Error Handling

**Parser errors:**
- Invalid XML/JSON syntax → 400 error with line/column
- Unknown BYDM version → Fallback to 2018, log warning
- Missing required fields → 422 error with field list

**Mapper errors:**
- Missing mapping file → 500 error
- JSONPath extraction failure → Use fallback value or null
- Validation failure → 422 error with schema violations

**Logging:**
```typescript
logger.info("[BYDMParser] Detected BYDM 2025 orderRelease");
logger.warn("[BYDMMapper] Field 'buyer.email' not found, using null");
logger.error("[BYDMMapper] Validation failed", { errors: [...] });
```

---

### 12. Testing Strategy

**Unit tests:**
- Parser: Test 2018 vs 2025 detection
- Mapper: Test all transform functions
- Mapper: Test lookup tables

**Integration tests:**
- Full flow: BYDM XML → Canonical JSON
- Validation: Canonical output validates against schema
- Error cases: Invalid XML, missing fields

**Sample data:**
- Real BYDM 2025 samples from customer
- Edge cases: Missing optional fields, fallback values
- Multiple versions: Same logical order in 2018 vs 2025 format

---

### 13. Performance Considerations

**Caching:**
- Cache loaded mapping YAMLs (don't reload per message)
- Cache parsed schemas (Ajv)
- Cache lookup tables (status_map, uom)

**Optimization:**
- Lazy-load mapping files (only when needed)
- Stream large XML files (SAX parser)
- Batch validation (validate array items in parallel)

---

### 14. Documentation

**Files to create:**
- `docs/BYDM_INTEGRATION_GUIDE.md` - User guide
- `docs/BYDM_MAPPING_SYNTAX.md` - Mapping YAML syntax reference
- `docs/BYDM_TRANSFORMS.md` - Transform function reference

**User guide topics:**
- How to create a BYDM flow
- How to test with sample data
- How to customize mappings
- How to handle different BYDM versions
- Troubleshooting common issues

---

### 15. Implementation Phases

**Phase 1: Core Infrastructure (POC - DONE ✅)**
- Canonical order schema
- Status/UOM mapping tables
- OrderRelease mapping YAML
- Sample data

**Phase 2: Parser & Mapper Executors**
- BYDMParser implementation
- BYDMMapper implementation
- Transform functions
- Lookup table loading

**Phase 3: Remaining Schemas & Mappings**
- Shipment, Inbound, Inventory schemas
- Corresponding mapping YAMLs
- Additional status mappings

**Phase 4: Flow Builder Integration**
- Add nodes to catalog
- UI configuration panels
- Sample data upload
- Output preview

**Phase 5: Version Management**
- 2018 vs 2025 detection
- Version-aware mappings
- Backward compatibility

**Phase 6: Customer Overrides**
- Override directory structure
- Override merge logic
- Per-customer configuration

**Phase 7: Testing & Documentation**
- Integration tests
- User documentation
- Migration guide (for existing BYDM flows)

---

## Dependencies

**NPM packages:**
- `fast-xml-parser` (already installed) - XML parsing
- `jsonpath-plus` - JSONPath queries
- `js-yaml` (already installed) - YAML loading
- `ajv` - JSON schema validation

**No new external dependencies required!**

---

## Estimated Effort

- **Phase 1 (POC):** 2-4 hours ✅ DONE
- **Phase 2 (Executors):** 4-6 hours
- **Phase 3 (Schemas):** 3-4 hours
- **Phase 4 (UI):** 4-6 hours
- **Phase 5 (Versioning):** 2-3 hours
- **Phase 6 (Overrides):** 2-3 hours
- **Phase 7 (Testing/Docs):** 4-6 hours

**Total:** 21-32 hours of development

---

## Success Criteria

✅ BYDM messages (2018 & 2025) parse correctly
✅ All 4 message types map to canonical format
✅ Canonical output validates against schemas
✅ Flows execute end-to-end (BYDM → Amazon/MELI/WMS)
✅ Visual Flow Builder supports BYDM nodes
✅ Customer overrides work correctly
✅ Documentation complete
✅ Integration tests passing

---

## Next Steps

1. Review this plan with stakeholders
2. Prioritize phases based on business needs
3. Begin Phase 2 implementation when approved
4. Set up demo environment with sample BYDM data
5. Schedule customer feedback sessions

---

**Status:** POC complete, awaiting approval for full production implementation.
