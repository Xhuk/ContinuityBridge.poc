#!/usr/bin/env tsx
/**
 * Seed Demo Data for Neon PostgreSQL
 * 
 * Migrates demo environment from setup-demo.ts to production database:
 * - Demo organization & license
 * - Demo users with API keys
 * - Mock interfaces (WMS, ERP, Marketplace, 3PL)
 * - Operational flows with BYDM examples
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DEMO_ORG_ID = 'demo-company-001';
const DEMO_ORG_NAME = 'Demo Logistics Inc.';

async function seedDemoData() {
  try {
    console.log('🎬 Seeding Demo Data to Neon PostgreSQL');
    console.log('=' .repeat(80));

    // Check if demo data already exists
    const existingCheck: any = await pool.query(
      "SELECT id FROM users WHERE email = 'admin@demo-logistics.com'"
    );

    if (existingCheck.rows.length > 0) {
      console.log('✅ Demo data already exists. Skipping seed.');
      return;
    }

    // Step 1: Create Demo Organization License
    console.log('\n📋 Step 1: Creating Demo Organization License...');
    
    const licenseId = randomUUID();
    await pool.query(`
      INSERT INTO customer_license (
        id, organization_id, organization_name, license_type, active,
        features, limits, pricing, valid_until, contract_number, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      licenseId,
      DEMO_ORG_ID,
      DEMO_ORG_NAME,
      'professional',
      true,
      JSON.stringify({
        flowEditor: true,
        dataSources: true,
        interfaces: true,
        mappingGenerator: true,
        advancedSettings: true,
        customNodes: true,
        canAddInterfaces: true,
        canDeleteResources: true,
      }),
      JSON.stringify({
        maxFlows: 20,
        maxDataSources: 10,
        maxInterfaces: 15,
        maxSystems: 10,
        maxUsers: 10,
        maxExecutionsPerMonth: 100000,
      }),
      JSON.stringify({
        basePlatform: 2400000,
        perInterface: 10000,
        perSystem: 15000,
        currency: 'USD',
        billingCycle: 'monthly',
      }),
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      'DEMO-2024-001',
      'Professional tier demo license - Full features enabled'
    ]);
    console.log('✅ Demo license created:', DEMO_ORG_NAME);

    // Step 2: Create Demo Users
    console.log('\n👥 Step 2: Creating Demo Users...');
    
    const adminId = randomUUID();
    const adminApiKey = `cb_demo_admin_${randomUUID().split('-')[0]}`;
    
    await pool.query(`
      INSERT INTO users (
        id, email, role, organization_id, organization_name,
        api_key, enabled, email_confirmed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      adminId,
      'admin@demo-logistics.com',
      'customer_admin',
      DEMO_ORG_ID,
      DEMO_ORG_NAME,
      adminApiKey,
      true,
      true
    ]);
    console.log('✅ Demo Admin created: admin@demo-logistics.com');
    console.log('   API Key:', adminApiKey);

    const userId = randomUUID();
    const userApiKey = `cb_demo_user_${randomUUID().split('-')[0]}`;
    
    await pool.query(`
      INSERT INTO users (
        id, email, role, organization_id, organization_name,
        api_key, enabled, email_confirmed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      userId,
      'user@demo-logistics.com',
      'customer_user',
      DEMO_ORG_ID,
      DEMO_ORG_NAME,
      userApiKey,
      true,
      true
    ]);
    console.log('✅ Demo User created: user@demo-logistics.com');
    console.log('   API Key:', userApiKey);

    // Step 3: Create Mock Interfaces
    console.log('\n🔌 Step 3: Creating Mock Host Systems...');
    
    const mockInterfaces = [
      {
        id: 'demo-wms-api',
        name: 'Demo WMS (Mock)',
        description: 'Mock Warehouse Management System API - Returns sample inventory data',
        type: 'wms',
        direction: 'bidirectional',
        protocol: 'rest_api',
        endpoint: 'http://localhost:5000/api/mock/wms',
        auth_type: 'api_key',
        http_config: JSON.stringify({
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'demo-wms-key' },
        }),
        enabled: true,
        tags: JSON.stringify(['demo', 'wms', 'mock']),
      },
      {
        id: 'demo-erp-api',
        name: 'Demo ERP (Mock)',
        description: 'Mock ERP System API - Returns sample order and customer data',
        type: 'erp',
        direction: 'bidirectional',
        protocol: 'rest_api',
        endpoint: 'http://localhost:5000/api/mock/erp',
        auth_type: 'api_key',
        http_config: JSON.stringify({
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'demo-erp-key' },
        }),
        enabled: true,
        tags: JSON.stringify(['demo', 'erp', 'mock']),
      },
      {
        id: 'demo-marketplace-api',
        name: 'Demo Marketplace (Mock)',
        description: 'Mock E-commerce Marketplace API - Simulates order webhooks',
        type: 'marketplace',
        direction: 'inbound',
        protocol: 'webhook',
        endpoint: 'http://localhost:5000/api/mock/marketplace',
        auth_type: 'bearer',
        http_config: JSON.stringify({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
        enabled: true,
        tags: JSON.stringify(['demo', 'marketplace', 'mock']),
      },
      {
        id: 'demo-3pl-api',
        name: 'Demo 3PL Carrier (Mock)',
        description: 'Mock Third-Party Logistics API - Returns shipping labels and tracking',
        type: '3pl',
        direction: 'outbound',
        protocol: 'rest_api',
        endpoint: 'http://localhost:5000/api/mock/3pl',
        auth_type: 'oauth2',
        oauth2_config: JSON.stringify({
          authUrl: 'http://localhost:5000/api/mock/3pl/auth',
          tokenUrl: 'http://localhost:5000/api/mock/3pl/token',
          clientId: 'demo-3pl-client',
          scope: 'shipments.read shipments.write',
        }),
        enabled: true,
        tags: JSON.stringify(['demo', '3pl', 'mock']),
      },
    ];

    for (const iface of mockInterfaces) {
      await pool.query(`
        INSERT INTO interfaces (
          id, name, description, type, direction, protocol,
          endpoint, auth_type, http_config, oauth2_config, enabled, tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        iface.id,
        iface.name,
        iface.description,
        iface.type,
        iface.direction,
        iface.protocol,
        iface.endpoint,
        iface.auth_type,
        iface.http_config || null,
        iface.oauth2_config || null,
        iface.enabled,
        iface.tags
      ]);
    }
    console.log(`✅ Created ${mockInterfaces.length} mock interfaces`);

    // Step 4: Create Demo Flows
    console.log('\n📊 Step 4: Creating Demo Flows...');
    
    const demoFlows = [
      {
        id: 'demo-flow-bydm-order',
        name: 'BYDM OrderRelease → Amazon SP-API',
        description: 'Transform BYDM order format to Amazon marketplace (real enterprise use case)',
        version: '1.0.0',
        enabled: true,
        tags: JSON.stringify(['demo', 'bydm', 'amazon', 'production-ready']),
        nodes: JSON.stringify([
          { id: 'bydm-parser', type: 'bydm_parser', position: { x: 50, y: 100 }, data: { label: 'Parse BYDM OrderRelease', type: 'bydm_parser', config: { version: 'auto', messageType: 'orderRelease', strict: false } } },
          { id: 'bydm-mapper', type: 'bydm_mapper', position: { x: 300, y: 100 }, data: { label: 'Map to Canonical Format', type: 'bydm_mapper', config: { autoSelectMapping: true, targetFormat: 'canonical-order' } } },
          { id: 'validator', type: 'validation', position: { x: 550, y: 100 }, data: { label: 'Validate Order', type: 'validation', config: { schemaRef: 'schemas/canonical/order.schema.json', strict: true } } },
          { id: 'amazon-api', type: 'interface_destination', position: { x: 800, y: 100 }, data: { label: 'Send to Amazon SP-API', type: 'interface_destination', interfaceId: 'demo-marketplace-api', config: { method: 'POST', endpoint: '/orders/create', templateId: 'amazon-sp-api' } } }
        ]),
        edges: JSON.stringify([
          { id: 'e1', source: 'bydm-parser', target: 'bydm-mapper' },
          { id: 'e2', source: 'bydm-mapper', target: 'validator' },
          { id: 'e3', source: 'validator', target: 'amazon-api' }
        ])
      },
      {
        id: 'demo-flow-order-processing',
        name: 'Simple Order Processing Pipeline',
        description: 'Basic end-to-end order processing: Marketplace → ERP → WMS',
        version: '1.0.0',
        enabled: true,
        tags: JSON.stringify(['demo', 'order-processing', 'e2e']),
        nodes: JSON.stringify([
          { id: 'trigger-1', type: 'manual_trigger', position: { x: 50, y: 100 }, data: { label: 'Manual Trigger', color: 'hsl(142 71% 45%)' } },
          { id: 'parse-order', type: 'json_parser', position: { x: 250, y: 100 }, data: { label: 'Parse Order JSON', config: { validateSchema: true } } },
          { id: 'validate-order', type: 'validation', position: { x: 450, y: 100 }, data: { label: 'Validate Order', config: { rules: [{ field: 'order_id', required: true }, { field: 'customer_email', required: true, pattern: '^[^@]+@[^@]+\\.[^@]+$' }, { field: 'items', required: true, minLength: 1 }] } } },
          { id: 'send-to-erp', type: 'interface_destination', position: { x: 650, y: 50 }, data: { label: 'Send to ERP', interfaceId: 'demo-erp-api', config: { method: 'POST', endpoint: '/orders' } } },
          { id: 'send-to-wms', type: 'interface_destination', position: { x: 650, y: 150 }, data: { label: 'Send to WMS', interfaceId: 'demo-wms-api', config: { method: 'POST', endpoint: '/fulfillment' } } }
        ]),
        edges: JSON.stringify([
          { id: 'e1', source: 'trigger-1', target: 'parse-order' },
          { id: 'e2', source: 'parse-order', target: 'validate-order' },
          { id: 'e3', source: 'validate-order', target: 'send-to-erp' },
          { id: 'e4', source: 'validate-order', target: 'send-to-wms' }
        ])
      },
      {
        id: 'demo-flow-inventory-sync',
        name: 'Inventory Synchronization',
        description: 'Hourly sync: WMS → ERP → Marketplace (keep stock levels updated)',
        version: '1.0.0',
        enabled: true,
        tags: JSON.stringify(['demo', 'inventory', 'scheduled']),
        nodes: JSON.stringify([
          { id: 'scheduler-1', type: 'scheduler', position: { x: 50, y: 100 }, data: { label: 'Hourly Sync', config: { cron: '0 * * * *', timezone: 'America/New_York' } } },
          { id: 'fetch-wms-inventory', type: 'interface_source', position: { x: 250, y: 100 }, data: { label: 'Fetch WMS Inventory', interfaceId: 'demo-wms-api', config: { method: 'GET', endpoint: '/inventory' } } },
          { id: 'transform-inventory', type: 'object_mapper', position: { x: 450, y: 100 }, data: { label: 'Transform to ERP Format', config: { mappings: [{ source: '$.sku', target: '$.product_code' }, { source: '$.quantity', target: '$.available_qty' }, { source: '$.location', target: '$.warehouse_location' }] } } },
          { id: 'update-erp', type: 'interface_destination', position: { x: 650, y: 100 }, data: { label: 'Update ERP Stock', interfaceId: 'demo-erp-api', config: { method: 'PUT', endpoint: '/inventory' } } }
        ]),
        edges: JSON.stringify([
          { id: 'e1', source: 'scheduler-1', target: 'fetch-wms-inventory' },
          { id: 'e2', source: 'fetch-wms-inventory', target: 'transform-inventory' },
          { id: 'e3', source: 'transform-inventory', target: 'update-erp' }
        ])
      },
      {
        id: 'demo-flow-shipping-notification',
        name: 'Shipping Label & Notification',
        description: 'Generate shipping label via 3PL and send tracking to customer',
        version: '1.0.0',
        enabled: true,
        tags: JSON.stringify(['demo', 'shipping', 'notification']),
        nodes: JSON.stringify([
          { id: 'webhook-trigger', type: 'ingress', position: { x: 50, y: 100 }, data: { label: 'Webhook: Order Shipped', config: { path: '/webhook/order-shipped' } } },
          { id: 'create-shipment', type: 'interface_destination', position: { x: 250, y: 100 }, data: { label: 'Create 3PL Shipment', interfaceId: 'demo-3pl-api', config: { method: 'POST', endpoint: '/shipments' } } },
          { id: 'conditional-success', type: 'conditional', position: { x: 450, y: 100 }, data: { label: 'Shipment Created?', config: { condition: '$.response.status === "success"' } } },
          { id: 'send-tracking-email', type: 'egress', position: { x: 650, y: 50 }, data: { label: 'Send Tracking Email', config: { to: '$.customer_email', subject: 'Your order has shipped!', template: 'shipping-notification' } } },
          { id: 'log-error', type: 'egress', position: { x: 650, y: 150 }, data: { label: 'Log Shipment Error', config: { logLevel: 'error' } } }
        ]),
        edges: JSON.stringify([
          { id: 'e1', source: 'webhook-trigger', target: 'create-shipment' },
          { id: 'e2', source: 'create-shipment', target: 'conditional-success' },
          { id: 'e3', source: 'conditional-success', target: 'send-tracking-email', label: 'Success' },
          { id: 'e4', source: 'conditional-success', target: 'log-error', label: 'Failure' }
        ])
      }
    ];

    for (const flow of demoFlows) {
      await pool.query(`
        INSERT INTO flow_definitions (id, name, description, version, enabled, tags, nodes, edges)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        flow.id,
        flow.name,
        flow.description,
        flow.version,
        flow.enabled,
        flow.tags,
        flow.nodes,
        flow.edges
      ]);
    }
    console.log(`✅ Created ${demoFlows.length} demo flows`);

    console.log('\n' + '='.repeat(80));
    console.log('✅ DEMO DATA SEEDED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log('\n📋 Demo Credentials:');
    console.log('   Admin: admin@demo-logistics.com');
    console.log('   User: user@demo-logistics.com');
    console.log(`\n🔌 ${mockInterfaces.length} mock interfaces created`);
    console.log(`📊 ${demoFlows.length} demo flows created`);
    console.log('');

  } catch (error: any) {
    console.error('❌ Seed failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDemoData();
