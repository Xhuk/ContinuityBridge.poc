#!/usr/bin/env tsx
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as loadYAML } from 'js-yaml';
import { JSONPath } from 'jsonpath-plus';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '../..');

async function runMappingDemo() {
  console.log('🔧 BYDM Mapping Engine Demo\n');

  const sampleDataPath = join(ROOT_DIR, 'examples/bydm/orderRelease.sample.json');
  const mappingPath = join(ROOT_DIR, 'mappings/bydm-to-canonical/order_release_to_canonical_order.yaml');
  const statusMapPath = join(ROOT_DIR, 'mappings/common/status_map.yaml');
  const uomMapPath = join(ROOT_DIR, 'mappings/common/uom.yaml');

  console.log('📥 Loading sample BYDM data...');
  const sampleData = JSON.parse(readFileSync(sampleDataPath, 'utf-8'));
  console.log(`   Document ID: ${sampleData.documentId}`);
  console.log(`   PO Number: ${sampleData.purchaseOrder.purchaseOrderNumber}`);
  console.log(`   Line Items: ${sampleData.lineItem.length}\n`);

  console.log('📄 Loading mapping definition...');
  const mapping: any = loadYAML(readFileSync(mappingPath, 'utf-8'));
  console.log(`   Mapping: ${mapping.sourceFormat} → ${mapping.targetFormat}\n`);

  console.log('🗂️  Loading lookup tables...');
  const statusMap: any = loadYAML(readFileSync(statusMapPath, 'utf-8'));
  const uomMap: any = loadYAML(readFileSync(uomMapPath, 'utf-8'));
  console.log(`   Status codes: ${Object.keys(statusMap.order || {}).length}`);
  console.log(`   UOM codes: ${Object.keys(uomMap.uom_map || {}).length}\n`);

  console.log('🔄 Applying mapping...');
  
  const canonicalOrder: any = {
    orderId: extractField(sampleData, mapping.mapping.orderId),
    externalOrderId: extractField(sampleData, mapping.mapping.externalOrderId),
    orderDate: extractField(sampleData, mapping.mapping.orderDate),
    requestedDeliveryDate: extractField(sampleData, mapping.mapping.requestedDeliveryDate),
    status: lookupValue(
      extractField(sampleData, mapping.mapping.status),
      statusMap.order,
      mapping.mapping.status.default
    ),
    customer: {
      customerId: extractField(sampleData, mapping.mapping.customer.customerId),
      name: extractField(sampleData, mapping.mapping.customer.name),
      email: extractField(sampleData, mapping.mapping.customer.email),
      phone: extractField(sampleData, mapping.mapping.customer.phone),
    },
    shipTo: {
      name: extractField(sampleData, mapping.mapping.shipTo.name),
      address1: extractField(sampleData, mapping.mapping.shipTo.address1),
      address2: extractField(sampleData, mapping.mapping.shipTo.address2),
      city: extractField(sampleData, mapping.mapping.shipTo.city),
      state: extractField(sampleData, mapping.mapping.shipTo.state),
      postalCode: extractField(sampleData, mapping.mapping.shipTo.postalCode),
      country: extractField(sampleData, mapping.mapping.shipTo.country),
    },
    items: [],
    warehouse: {
      warehouseId: extractField(sampleData, mapping.mapping.warehouse.warehouseId),
      name: extractField(sampleData, mapping.mapping.warehouse.name),
    },
    carrier: {
      carrierId: extractField(sampleData, mapping.mapping.carrier.carrierId),
      carrierName: extractField(sampleData, mapping.mapping.carrier.carrierName),
      serviceLevel: extractField(sampleData, mapping.mapping.carrier.serviceLevel),
    },
  };

  const itemsArray = JSONPath({ path: mapping.mapping.items.arrayPath, json: sampleData });
  for (const item of itemsArray) {
    const mappedItem: any = {
      lineNumber: parseInt(extractField(item, mapping.mapping.items.itemMapping.lineNumber)),
      sku: extractField(item, mapping.mapping.items.itemMapping.sku),
      description: extractField(item, mapping.mapping.items.itemMapping.description),
      quantity: parseFloat(extractField(item, mapping.mapping.items.itemMapping.quantity)),
      uom: lookupValue(
        extractField(item, mapping.mapping.items.itemMapping.uom),
        uomMap.uom_map,
        mapping.mapping.items.itemMapping.uom.default
      ),
      unitPrice: extractField(item, mapping.mapping.items.itemMapping.unitPrice),
      currency: extractField(item, mapping.mapping.items.itemMapping.currency),
    };
    canonicalOrder.items.push(mappedItem);
  }

  console.log('\n✅ Mapping complete!\n');
  console.log('📦 Canonical Order Output:');
  console.log(JSON.stringify(canonicalOrder, null, 2));
  
  console.log('\n✅ Demo complete!');
}

function extractField(data: any, fieldConfig: any): any {
  if (!fieldConfig) return undefined;
  
  const path = fieldConfig.path;
  if (!path) return undefined;

  let value = JSONPath({ path, json: data, wrap: false });

  if (value === undefined && fieldConfig.fallback) {
    value = JSONPath({ path: fieldConfig.fallback, json: data, wrap: false });
  }

  if (value === undefined && fieldConfig.default !== undefined) {
    return fieldConfig.default;
  }

  return value;
}

function lookupValue(key: any, table: any, defaultValue: any): any {
  if (!key || !table) return defaultValue;
  return table[key] || defaultValue;
}

runMappingDemo().catch(err => {
  console.error('❌ Demo failed:', err);
  process.exit(1);
});
