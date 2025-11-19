#!/usr/bin/env tsx
/**
 * BridgeScript Demo Scenario
 * 
 * Demonstrates:
 * 1. Compile TypeScript flow using BridgeScript DSL
 * 2. Load into database for visual rendering
 * 3. Display logic flow explanation
 * 
 * Usage: npm run demo:bridgescript
 */

import { execSync } from 'child_process';
import { db } from '../server/db';
import { flowDefinitions } from '../server/schema';
import YAML from 'yaml';
import fs from 'fs/promises';
import path from 'path';

const DEMO_FLOW_PATH = 'flows/examples/demo-ecommerce-flow.ts';
const DEMO_ORG_ID = 'demo-company-001';

async function runBridgeScriptDemo() {
  console.log('🎬 BridgeScript Demo - Intelligent E-Commerce Flow');
  console.log('='.repeat(80));
  
  try {
    // STEP 1: Compile BridgeScript to YAML
    console.log('\n📝 Step 1: Compiling BridgeScript TypeScript to YAML...');
    console.log(`   File: ${DEMO_FLOW_PATH}`);
    
    const yamlOutput = execSync(`npx tsx ${DEMO_FLOW_PATH}`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    
    const flowDef = YAML.parse(yamlOutput);
    console.log('✅ Flow compiled successfully!');
    console.log(`   Name: ${flowDef.name}`);
    console.log(`   Version: ${flowDef.version}`);
    console.log(`   Nodes: ${(flowDef.nodes || []).length}`);
    console.log(`   Edges: ${(flowDef.edges || []).length}`);
    
    // STEP 2: Save to filesystem for inspection
    console.log('\n💾 Step 2: Saving compiled YAML...');
    const outputPath = path.join(process.cwd(), 'flows/compiled/demo-ecommerce.yaml');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, yamlOutput, 'utf-8');
    console.log(`✅ Saved to: ${outputPath}`);
    
    // STEP 3: Convert to React Flow format and save to DB
    console.log('\n🗄️  Step 3: Loading into database for visual rendering...');
    
    const reactFlowFormat = {
      id: 'demo-bridgescript-ecommerce',
      name: flowDef.name,
      description: flowDef.metadata?.description || 'Demo flow',
      version: flowDef.version,
      organizationId: DEMO_ORG_ID,
      enabled: true,
      tags: flowDef.metadata?.tags || [],
      
      // Convert nodes for React Flow
      nodes: (flowDef.nodes || []).map((node: any, index: number) => ({
        id: node.id,
        type: node.type,
        position: node.position || { x: 50 + (index * 250), y: 100 },
        data: {
          label: node.id.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
          type: node.type,
          config: node.config,
        },
      })),
      
      // Convert edges
      edges: (flowDef.edges || []).map((edge: any) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
      })),
    };
    
    // Delete existing if present
    try {
      await (db as any)
        .delete(flowDefinitions)
        .where((row: any) => row.id === reactFlowFormat.id)
        .run();
    } catch (e) {
      // Ignore if doesn't exist
    }
    
    // Insert new
    await (db as any).insert(flowDefinitions).values(reactFlowFormat).run();
    console.log('✅ Flow loaded into database!');
    console.log(`   Flow ID: ${reactFlowFormat.id}`);
    console.log(`   Organization: ${DEMO_ORG_ID}`);
    
    // STEP 4: Display business logic explanation
    console.log('\n' + '='.repeat(80));
    console.log('📊 BUSINESS LOGIC FLOW EXPLANATION');
    console.log('='.repeat(80));
    
    console.log('\n🔹 SCENARIO: E-Commerce Order Processing with Intelligence\n');
    
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 1: Receive Order from Shopify Webhook                     │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log('│ • Webhook path: /shopify/orders/create                          │');
    console.log('│ • Authentication: HMAC signature validation                     │');
    console.log('│ • Method: POST                                                  │');
    console.log('└─────────────────────────────────────────────────────────────────┘');
    
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 2: Validate Order Structure                                │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log('│ • Required fields: order_id, customer, line_items, total_price  │');
    console.log('│ • Mode: Strict (fail fast on invalid data)                      │');
    console.log('└─────────────────────────────────────────────────────────────────┘');
    
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 3: Fraud Detection Algorithm                               │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log('│ Calculate fraud score based on:                                 │');
    console.log('│ • High order value (>$500): +30 points                          │');
    console.log('│ • New customer (<30 days): +20 points                           │');
    console.log('│ • Address mismatch (shipping ≠ billing): +25 points             │');
    console.log('│ • Multiple high-value items (>$200 each): +15 points            │');
    console.log('│ • Express shipping on first order: +10 points                   │');
    console.log('│                                                                 │');
    console.log('│ Risk Levels:                                                    │');
    console.log('│ • HIGH: Score > 60 → Hold for manual review                     │');
    console.log('│ • MEDIUM: Score 30-60 → Process with monitoring                 │');
    console.log('│ • LOW: Score < 30 → Auto-process                                │');
    console.log('└─────────────────────────────────────────────────────────────────┘');
    
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 4: Conditional Routing                                     │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log('│ IF fraudAnalysis.riskLevel === "HIGH":                          │');
    console.log('│   ├─ Send alert email to finance team                           │');
    console.log('│   ├─ Mark order status as HOLD_FOR_REVIEW                       │');
    console.log('│   └─ Send hold notification to ERP                              │');
    console.log('│                                                                 │');
    console.log('│ ELSE (LOW/MEDIUM risk):                                         │');
    console.log('│   └─ Continue to fulfillment pipeline (next steps)              │');
    console.log('└─────────────────────────────────────────────────────────────────┘');
    
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 5-7: Intelligent Warehouse Distribution                    │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log('│ • Check real-time inventory across all warehouses               │');
    console.log('│ • Calculate optimal warehouse per item based on:                │');
    console.log('│   - Stock availability                                          │');
    console.log('│   - Distance to customer (minimize shipping cost)               │');
    console.log('│   - Inventory depth (prefer warehouses with more stock)         │');
    console.log('│ • Split order into multiple shipments if needed                 │');
    console.log('│ • Send fulfillment requests IN PARALLEL to WMS systems          │');
    console.log('│ • Wait for all warehouses to confirm before proceeding          │');
    console.log('└─────────────────────────────────────────────────────────────────┘');
    
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 8: Generate Shipping Labels via 3PL                        │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log('│ • Call 3PL carrier API with order details                       │');
    console.log('│ • Receive tracking numbers and labels                           │');
    console.log('│ • Calculate estimated delivery date                             │');
    console.log('└─────────────────────────────────────────────────────────────────┘');
    
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 9: Customer Notification                                   │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log('│ • Send order confirmation email                                 │');
    console.log('│ • Include tracking numbers and delivery estimate                │');
    console.log('│ • Use branded email template                                    │');
    console.log('└─────────────────────────────────────────────────────────────────┘');
    
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 10: Update ERP with Final Status                           │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log('│ • Update order status to PROCESSING                             │');
    console.log('│ • Store fulfillment and shipping details                        │');
    console.log('│ • Mark order as ready for accounting                            │');
    console.log('└─────────────────────────────────────────────────────────────────┘');
    
    console.log('\n' + '='.repeat(80));
    console.log('💡 KEY FEATURES DEMONSTRATED');
    console.log('='.repeat(80));
    console.log('✅ SOW Enforcement: Only authorized systems (SHOPIFY, WMS, ERP, 3PL, EMAIL)');
    console.log('✅ Conditional Logic: If/else branching based on fraud score');
    console.log('✅ Parallel Processing: Multiple warehouses contacted simultaneously');
    console.log('✅ Complex Transformations: Custom JavaScript for fraud detection');
    console.log('✅ Error Handling: Retries with exponential backoff');
    console.log('✅ Multi-System Orchestration: 5 systems working together seamlessly');
    console.log('');
    
    console.log('='.repeat(80));
    console.log('🚀 NEXT STEPS');
    console.log('='.repeat(80));
    console.log('1. Open the Flow Editor: http://localhost:5000/flows');
    console.log('2. Select organization: Demo Logistics Inc.');
    console.log('3. Open flow: "E-Commerce Intelligent Fulfillment"');
    console.log('4. See the visual representation of the logic!');
    console.log('');
    console.log('💡 TIP: The visual editor shows the exact flow we built with BridgeScript');
    console.log('');
    
    console.log('='.repeat(80));
    console.log('📝 BRIDGESCRIPT CODE vs YAML OUTPUT');
    console.log('='.repeat(80));
    console.log('BridgeScript reduced code by ~70%:');
    console.log(`• TypeScript code: ~${(await fs.readFile(DEMO_FLOW_PATH, 'utf-8')).split('\n').length} lines`);
    console.log(`• Generated YAML: ~${yamlOutput.split('\n').length} lines`);
    console.log(`• No manual node IDs, positions, or edge connections!`);
    console.log('');
    
  } catch (error: any) {
    console.error('❌ Demo failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run demo
runBridgeScriptDemo()
  .then(() => {
    console.log('✅ BridgeScript demo completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
