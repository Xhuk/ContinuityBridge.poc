#!/usr/bin/env tsx
/**
 * ContinuityBridge Demo Setup Script
 * 
 * Creates a complete demo environment with:
 * - Demo customer organization
 * - Demo users (admin + regular user)
 * - Operational flows (Order Processing, Inventory Sync, Shipping Notification)
 * - Mock host systems (WMS, ERP, Marketplace)
 * - Sample data for testing
 * 
 * Usage: npm run setup:demo
 */

import { db } from '../server/db';
import { users, customerLicense, flowDefinitions, interfaces } from '../server/schema';
import { randomUUID } from 'crypto';

const DEMO_ORG_ID = 'demo-company-001';
const DEMO_ORG_NAME = 'Demo Logistics Inc.';

async function setupDemoEnvironment() {
  console.log('🎬 ContinuityBridge Demo Setup');
  console.log('=' .repeat(80));

  try {
    // Step 1: Create Demo Organization License
    console.log('\n📋 Step 1: Creating Demo Organization License...');
    
    const demoLicense = {
      id: randomUUID(),
      organizationId: DEMO_ORG_ID,
      organizationName: DEMO_ORG_NAME,
      licenseType: 'professional' as const,
      active: true,
      
      features: {
        flowEditor: true,
        dataSources: true,
        interfaces: true,
        mappingGenerator: true,
        advancedSettings: true,
        customNodes: true,
        canAddInterfaces: true,
        canDeleteResources: true,
      },
      
      limits: {
        maxFlows: 20,
        maxDataSources: 10,
        maxInterfaces: 15,
        maxSystems: 10,
        maxUsers: 10,
        maxExecutionsPerMonth: 100000,
      },
      
      pricing: {
        basePlatform: 2400000, // $24,000/year = $2,000/month (in cents)
        perInterface: 10000, // $100/month per interface
        perSystem: 15000, // $150/month per system
        currency: 'USD',
        billingCycle: 'monthly',
      },
      
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
      contractNumber: 'DEMO-2024-001',
      notes: 'Professional tier demo license - Full features enabled',
    };

    await (db.insert(customerLicense) as any).values(demoLicense).run();
    console.log('✅ Demo license created:', DEMO_ORG_NAME);

    // Step 2: Create Demo Users
    console.log('\n👥 Step 2: Creating Demo Users...');
    
    const demoAdmin = {
      id: randomUUID(),
      email: 'admin@demo-logistics.com',
      role: 'customer_admin' as const,
      organizationId: DEMO_ORG_ID,
      organizationName: DEMO_ORG_NAME,
      apiKey: `cb_demo_admin_${randomUUID().split('-')[0]}`,
      enabled: true,
      emailConfirmed: true,
    };

    const demoUser = {
      id: randomUUID(),
      email: 'user@demo-logistics.com',
      role: 'customer_user' as const,
      organizationId: DEMO_ORG_ID,
      organizationName: DEMO_ORG_NAME,
      apiKey: `cb_demo_user_${randomUUID().split('-')[0]}`,
      enabled: true,
      emailConfirmed: true,
    };

    await (db.insert(users) as any).values([demoAdmin, demoUser]).run();
    console.log('✅ Demo Admin created:', demoAdmin.email);
    console.log('   API Key:', demoAdmin.apiKey);
    console.log('✅ Demo User created:', demoUser.email);
    console.log('   API Key:', demoUser.apiKey);

    // Step 3: Create Mock Host Systems (Interfaces)
    console.log('\n🔌 Step 3: Creating Mock Host Systems...');
    
    const mockInterfaces = [
      {
        id: 'demo-wms-api',
        name: 'Demo WMS (Mock)',
        description: 'Mock Warehouse Management System API - Returns sample inventory data',
        type: 'wms' as const,
        direction: 'bidirectional' as const,
        protocol: 'rest_api' as const,
        endpoint: 'http://localhost:5000/api/mock/wms',
        authType: 'api_key' as const,
        httpConfig: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'demo-wms-key' },
        },
        enabled: true,
        tags: ['demo', 'wms', 'mock'],
      },
      {
        id: 'demo-erp-api',
        name: 'Demo ERP (Mock)',
        description: 'Mock ERP System API - Returns sample order and customer data',
        type: 'erp' as const,
        direction: 'bidirectional' as const,
        protocol: 'rest_api' as const,
        endpoint: 'http://localhost:5000/api/mock/erp',
        authType: 'api_key' as const,
        httpConfig: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'demo-erp-key' },
        },
        enabled: true,
        tags: ['demo', 'erp', 'mock'],
      },
      {
        id: 'demo-marketplace-api',
        name: 'Demo Marketplace (Mock)',
        description: 'Mock E-commerce Marketplace API - Simulates order webhooks',
        type: 'marketplace' as const,
        direction: 'inbound' as const,
        protocol: 'webhook' as const,
        endpoint: 'http://localhost:5000/api/mock/marketplace',
        authType: 'bearer' as const,
        httpConfig: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        enabled: true,
        tags: ['demo', 'marketplace', 'mock'],
      },
      {
        id: 'demo-3pl-api',
        name: 'Demo 3PL Carrier (Mock)',
        description: 'Mock Third-Party Logistics API - Returns shipping labels and tracking',
        type: '3pl' as const,
        direction: 'outbound' as const,
        protocol: 'rest_api' as const,
        endpoint: 'http://localhost:5000/api/mock/3pl',
        authType: 'oauth2' as const,
        oauth2Config: {
          authUrl: 'http://localhost:5000/api/mock/3pl/auth',
          tokenUrl: 'http://localhost:5000/api/mock/3pl/token',
          clientId: 'demo-3pl-client',
          scope: 'shipments.read shipments.write',
        },
        enabled: true,
        tags: ['demo', '3pl', 'mock'],
      },
    ];

    await (db.insert(interfaces) as any).values(mockInterfaces).run();
    console.log(`✅ Created ${mockInterfaces.length} mock interfaces`);

    // Step 4: Create Demo Flows (including BYDM examples)
    console.log('\n📊 Step 4: Creating Operational Demo Flows (with BYDM examples)...');
    
    const demoFlows = [
      // Flow 1: BYDM Order Processing (Real-world example)
      {
        id: 'demo-flow-bydm-order',
        name: 'BYDM OrderRelease → Amazon SP-API',
        description: 'Transform BYDM order format to Amazon marketplace (real enterprise use case)',
        version: '1.0.0',
        enabled: true,
        tags: ['demo', 'bydm', 'amazon', 'production-ready'],
        nodes: [
          {
            id: 'bydm-parser',
            type: 'bydm_parser',
            position: { x: 50, y: 100 },
            data: {
              label: 'Parse BYDM OrderRelease',
              type: 'bydm_parser',
              config: {
                version: 'auto',
                messageType: 'orderRelease',
                strict: false,
              },
            },
          },
          {
            id: 'bydm-mapper',
            type: 'bydm_mapper',
            position: { x: 300, y: 100 },
            data: {
              label: 'Map to Canonical Format',
              type: 'bydm_mapper',
              config: {
                autoSelectMapping: true,
                targetFormat: 'canonical-order',
              },
            },
          },
          {
            id: 'validator',
            type: 'validation',
            position: { x: 550, y: 100 },
            data: {
              label: 'Validate Order',
              type: 'validation',
              config: {
                schemaRef: 'schemas/canonical/order.schema.json',
                strict: true,
              },
            },
          },
          {
            id: 'amazon-api',
            type: 'interface_destination',
            position: { x: 800, y: 100 },
            data: {
              label: 'Send to Amazon SP-API',
              type: 'interface_destination',
              interfaceId: 'demo-marketplace-api',
              config: {
                method: 'POST',
                endpoint: '/orders/create',
                templateId: 'amazon-sp-api',
              },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'bydm-parser', target: 'bydm-mapper' },
          { id: 'e2', source: 'bydm-mapper', target: 'validator' },
          { id: 'e3', source: 'validator', target: 'amazon-api' },
        ],
      },
      
      // Flow 2: Order Processing Pipeline (Simple demo)
      {
        id: 'demo-flow-order-processing',
        name: 'Simple Order Processing Pipeline',
        description: 'Basic end-to-end order processing: Marketplace → ERP → WMS',
        version: '1.0.0',
        nodes: [
          {
            id: 'trigger-1',
            type: 'manual_trigger',
            position: { x: 50, y: 100 },
            data: { label: 'Manual Trigger', color: 'hsl(142 71% 45%)' },
          },
          {
            id: 'parse-order',
            type: 'json_parser',
            position: { x: 250, y: 100 },
            data: { 
              label: 'Parse Order JSON',
              config: { validateSchema: true },
            },
          },
          {
            id: 'validate-order',
            type: 'validation',
            position: { x: 450, y: 100 },
            data: {
              label: 'Validate Order',
              config: {
                rules: [
                  { field: 'order_id', required: true },
                  { field: 'customer_email', required: true, pattern: '^[^@]+@[^@]+\\.[^@]+$' },
                  { field: 'items', required: true, minLength: 1 },
                ],
              },
            },
          },
          {
            id: 'send-to-erp',
            type: 'interface_destination',
            position: { x: 650, y: 50 },
            data: {
              label: 'Send to ERP',
              interfaceId: 'demo-erp-api',
              config: { method: 'POST', endpoint: '/orders' },
            },
          },
          {
            id: 'send-to-wms',
            type: 'interface_destination',
            position: { x: 650, y: 150 },
            data: {
              label: 'Send to WMS',
              interfaceId: 'demo-wms-api',
              config: { method: 'POST', endpoint: '/fulfillment' },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger-1', target: 'parse-order' },
          { id: 'e2', source: 'parse-order', target: 'validate-order' },
          { id: 'e3', source: 'validate-order', target: 'send-to-erp' },
          { id: 'e4', source: 'validate-order', target: 'send-to-wms' },
        ],
        version: '1.0.0',
        enabled: true,
        tags: ['demo', 'order-processing', 'e2e'],
      },

      // Flow 3: Inventory Sync
      {
        id: 'demo-flow-inventory-sync',
        name: 'Inventory Synchronization',
        description: 'Hourly sync: WMS → ERP → Marketplace (keep stock levels updated)',
        nodes: [
          {
            id: 'scheduler-1',
            type: 'scheduler',
            position: { x: 50, y: 100 },
            data: {
              label: 'Hourly Sync',
              config: { cron: '0 * * * *', timezone: 'America/New_York' },
            },
          },
          {
            id: 'fetch-wms-inventory',
            type: 'interface_source',
            position: { x: 250, y: 100 },
            data: {
              label: 'Fetch WMS Inventory',
              interfaceId: 'demo-wms-api',
              config: { method: 'GET', endpoint: '/inventory' },
            },
          },
          {
            id: 'transform-inventory',
            type: 'object_mapper',
            position: { x: 450, y: 100 },
            data: {
              label: 'Transform to ERP Format',
              config: {
                mappings: [
                  { source: '$.sku', target: '$.product_code' },
                  { source: '$.quantity', target: '$.available_qty' },
                  { source: '$.location', target: '$.warehouse_location' },
                ],
              },
            },
          },
          {
            id: 'update-erp',
            type: 'interface_destination',
            position: { x: 650, y: 100 },
            data: {
              label: 'Update ERP Stock',
              interfaceId: 'demo-erp-api',
              config: { method: 'PUT', endpoint: '/inventory' },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'scheduler-1', target: 'fetch-wms-inventory' },
          { id: 'e2', source: 'fetch-wms-inventory', target: 'transform-inventory' },
          { id: 'e3', source: 'transform-inventory', target: 'update-erp' },
        ],
        version: '1.0.0',
        enabled: true,
        tags: ['demo', 'inventory', 'scheduled'],
      },

      // Flow 4: Shipping Notification
      {
        id: 'demo-flow-shipping-notification',
        name: 'Shipping Label & Notification',
        description: 'Generate shipping label via 3PL and send tracking to customer',
        nodes: [
          {
            id: 'webhook-trigger',
            type: 'ingress',
            position: { x: 50, y: 100 },
            data: {
              label: 'Webhook: Order Shipped',
              config: { path: '/webhook/order-shipped' },
            },
          },
          {
            id: 'create-shipment',
            type: 'interface_destination',
            position: { x: 250, y: 100 },
            data: {
              label: 'Create 3PL Shipment',
              interfaceId: 'demo-3pl-api',
              config: { method: 'POST', endpoint: '/shipments' },
            },
          },
          {
            id: 'conditional-success',
            type: 'conditional',
            position: { x: 450, y: 100 },
            data: {
              label: 'Shipment Created?',
              config: {
                condition: '$.response.status === "success"',
              },
            },
          },
          {
            id: 'send-tracking-email',
            type: 'egress',
            position: { x: 650, y: 50 },
            data: {
              label: 'Send Tracking Email',
              config: {
                to: '$.customer_email',
                subject: 'Your order has shipped!',
                template: 'shipping-notification',
              },
            },
          },
          {
            id: 'log-error',
            type: 'egress',
            position: { x: 650, y: 150 },
            data: {
              label: 'Log Shipment Error',
              config: { logLevel: 'error' },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'webhook-trigger', target: 'create-shipment' },
          { id: 'e2', source: 'create-shipment', target: 'conditional-success' },
          { id: 'e3', source: 'conditional-success', target: 'send-tracking-email', label: 'Success' },
          { id: 'e4', source: 'conditional-success', target: 'log-error', label: 'Failure' },
        ],
        version: '1.0.0',
        enabled: true,
        tags: ['demo', 'shipping', 'notification'],
      },
    ];

    await (db.insert(flowDefinitions) as any).values(demoFlows).run();
    console.log(`✅ Created ${demoFlows.length} operational flows`);

    // Step 5: Display Demo Credentials
    console.log('\n' + '='.repeat(80));
    console.log('✅ DEMO ENVIRONMENT SETUP COMPLETE!');
    console.log('='.repeat(80));
    
    console.log('\n📋 DEMO CREDENTIALS:');
    console.log('-------------------');
    console.log('Organization:', DEMO_ORG_NAME);
    console.log('Organization ID:', DEMO_ORG_ID);
    console.log('');
    console.log('👤 Admin User:');
    console.log('   Email:', demoAdmin.email);
    console.log('   API Key:', demoAdmin.apiKey);
    console.log('');
    console.log('👤 Regular User:');
    console.log('   Email:', demoUser.email);
    console.log('   API Key:', demoUser.apiKey);

    console.log('\n🔌 MOCK INTERFACES:');
    console.log('-------------------');
    mockInterfaces.forEach(iface => {
      console.log(`• ${iface.name} (${iface.type})`);
      console.log(`  Endpoint: ${iface.endpoint}`);
    });

    console.log('\n📊 DEMO FLOWS:');
    console.log('--------------');
    demoFlows.forEach(flow => {
      console.log(`• ${flow.name}`);
      console.log(`  ${flow.description}`);
      console.log(`  Nodes: ${flow.nodes.length}, Enabled: ${flow.enabled}`);
    });

    console.log('\n🚀 NEXT STEPS:');
    console.log('--------------');
    console.log('1. Start mock server: npm run mock:server');
    console.log('2. Login with admin credentials');
    console.log('3. View flows at: /flows');
    console.log('4. Test flows with sample data: npm run test:demo');
    console.log('');
    console.log('💡 TIP: Use Postman collection in examples/demo-postman.json');
    console.log('');

  } catch (error: any) {
    console.error('❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run setup
setupDemoEnvironment()
  .then(() => {
    console.log('✅ Demo setup completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
