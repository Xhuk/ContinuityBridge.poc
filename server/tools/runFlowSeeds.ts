#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '../..');

async function seedFlows() {
  console.log('🌱 Seeding BYDM Flow Examples...\n');

  const flows = [
    {
      id: 'flow-bydm-amazon-order',
      name: 'BYDM OrderRelease → Amazon SP-API',
      description: 'Transform BYDM order to Amazon marketplace format',
      nodes: [
        {
          id: '1',
          type: 'bydm_parser',
          position: { x: 50, y: 100 },
          data: {
            label: 'Parse BYDM',
            config: {
              version: 'auto',
              messageType: 'orderRelease',
              strict: false
            }
          }
        },
        {
          id: '2',
          type: 'bydm_mapper',
          position: { x: 300, y: 100 },
          data: {
            label: 'Map to Canonical',
            config: {
              autoSelectMapping: true
            }
          }
        },
        {
          id: '3',
          type: 'validator',
          position: { x: 550, y: 100 },
          data: {
            label: 'Validate',
            config: {
              schemaRef: 'schemas/canonical/order.schema.json'
            }
          }
        },
        {
          id: '4',
          type: 'interface',
          position: { x: 800, y: 100 },
          data: {
            label: 'Amazon SP-API',
            config: {
              templateId: 'amazon-sp-api',
              operation: 'createOrder'
            }
          }
        }
      ],
      edges: [
        { id: 'e1-2', source: '1', target: '2' },
        { id: 'e2-3', source: '2', target: '3' },
        { id: 'e3-4', source: '3', target: '4' }
      ]
    },
    {
      id: 'flow-bydm-meli-shipment',
      name: 'BYDM Shipment → MercadoLibre',
      description: 'Transform BYDM shipment to MercadoLibre format',
      nodes: [
        {
          id: '1',
          type: 'bydm_parser',
          position: { x: 50, y: 100 },
          data: {
            label: 'Parse BYDM',
            config: {
              version: 'auto',
              messageType: 'shipment'
            }
          }
        },
        {
          id: '2',
          type: 'bydm_mapper',
          position: { x: 300, y: 100 },
          data: {
            label: 'Map to Canonical',
            config: {
              autoSelectMapping: true
            }
          }
        },
        {
          id: '3',
          type: 'validator',
          position: { x: 550, y: 100 },
          data: {
            label: 'Validate',
            config: {
              schemaRef: 'schemas/canonical/shipment.schema.json'
            }
          }
        },
        {
          id: '4',
          type: 'interface',
          position: { x: 800, y: 100 },
          data: {
            label: 'MercadoLibre',
            config: {
              templateId: 'mercadolibre-api',
              operation: 'updateShipment'
            }
          }
        }
      ],
      edges: [
        { id: 'e1-2', source: '1', target: '2' },
        { id: 'e2-3', source: '2', target: '3' },
        { id: 'e3-4', source: '3', target: '4' }
      ]
    }
  ];

  const outputDir = join(ROOT_DIR, 'examples/flows');
  
  try {
    const { mkdirSync } = await import('fs');
    mkdirSync(outputDir, { recursive: true });
  } catch {}

  for (const flow of flows) {
    const filePath = join(outputDir, `${flow.id}.json`);
    writeFileSync(filePath, JSON.stringify(flow, null, 2));
    console.log(`✅ Created: ${flow.name}`);
    console.log(`   File: examples/flows/${flow.id}.json`);
    console.log(`   Nodes: ${flow.nodes.length}`);
    console.log(`   Edges: ${flow.edges.length}\n`);
  }

  console.log('✅ Flow seeding complete!\n');
  console.log('📁 Generated files:');
  flows.forEach(f => console.log(`   examples/flows/${f.id}.json`));
}

seedFlows().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
