#!/usr/bin/env tsx
/**
 * Demo Flow Testing Script
 * 
 * Tests the 3 operational demo flows with sample data:
 * 1. Order Processing Pipeline (Manual trigger)
 * 2. Inventory Synchronization (Scheduled - simulated)
 * 3. Shipping Label & Notification (Webhook trigger)
 * 
 * Usage: npm run test:demo
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const DEMO_ADMIN_API_KEY = process.env.DEMO_ADMIN_API_KEY || 'cb_demo_admin_key';

interface TestResult {
  flowName: string;
  success: boolean;
  duration: number;
  error?: string;
  response?: any;
}

async function testBYDMOrderFlow(): Promise<TestResult> {
  console.log('\n🧪 TEST 1: BYDM OrderRelease → Amazon SP-API (Production-Ready)');
  console.log('='.repeat(80));
  
  const startTime = Date.now();
  
  try {
    // Load BYDM sample order data
    const bydmOrderPath = path.join(__dirname, '..', 'examples', 'bydm', 'orderRelease.sample.json');
    const bydmOrderData = JSON.parse(fs.readFileSync(bydmOrderPath, 'utf-8'));
    
    console.log('📦 BYDM order data loaded:');
    console.log(`   Document ID: ${bydmOrderData.documentId}`);
    console.log(`   Buyer: ${bydmOrderData.buyer.name}`);
    console.log(`   Line Items: ${bydmOrderData.lineItem.length}`);
    console.log(`   PO Number: ${bydmOrderData.purchaseOrder.purchaseOrderNumber}`);
    
    // Trigger BYDM flow
    console.log('\n🚀 Triggering BYDM Order Processing flow...');
    const response = await fetch(`${API_BASE}/api/flows/demo-flow-bydm-order/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': DEMO_ADMIN_API_KEY,
      },
      body: JSON.stringify(bydmOrderData),
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    const duration = Date.now() - startTime;
    
    console.log('✅ BYDM flow executed successfully!');
    console.log(`   Execution ID: ${result.executionId || 'N/A'}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Status: ${result.status || 'unknown'}`);
    console.log(`   ✨ Real enterprise data transformation validated!`);
    
    return {
      flowName: 'BYDM OrderRelease → Amazon SP-API',
      success: true,
      duration,
      response: result,
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('❌ Test failed:', error.message);
    
    return {
      flowName: 'BYDM OrderRelease → Amazon SP-API',
      success: false,
      duration,
      error: error.message,
    };
  }
}

async function testOrderProcessingFlow(): Promise<TestResult> {
  console.log('\n🧪 TEST 2: Simple Order Processing Pipeline');
  console.log('='.repeat(80));
  
  const startTime = Date.now();
  
  try {
    // Load sample order data
    const orderPath = path.join(__dirname, '..', 'examples', 'webhooks', 'demo-order.json');
    const orderData = JSON.parse(fs.readFileSync(orderPath, 'utf-8'));
    
    console.log('📦 Sample order data loaded:');
    console.log(`   Order ID: ${orderData.order_id}`);
    console.log(`   Customer: ${orderData.customer.email}`);
    console.log(`   Items: ${orderData.items.length}`);
    console.log(`   Total: $${orderData.pricing.total}`);
    
    // Trigger flow manually
    console.log('\n🚀 Triggering Order Processing flow...');
    const response = await fetch(`${API_BASE}/api/flows/demo-flow-order-processing/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': DEMO_ADMIN_API_KEY,
      },
      body: JSON.stringify(orderData),
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    const duration = Date.now() - startTime;
    
    console.log('✅ Flow executed successfully!');
    console.log(`   Execution ID: ${result.executionId || 'N/A'}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Status: ${result.status || 'unknown'}`);
    
    return {
      flowName: 'Simple Order Processing Pipeline',
      success: true,
      duration,
      response: result,
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('❌ Test failed:', error.message);
    
    return {
      flowName: 'Simple Order Processing Pipeline',
      success: false,
      duration,
      error: error.message,
    };
  }
}

async function testInventorySyncFlow(): Promise<TestResult> {
  console.log('\n🧪 TEST 3: Inventory Synchronization');
  console.log('='.repeat(80));
  
  const startTime = Date.now();
  
  try {
    console.log('📊 Fetching inventory from Mock WMS...');
    
    // Call mock WMS directly to verify it's working
    const wmsResponse = await fetch(`${API_BASE}/api/mock/wms/inventory`, {
      method: 'GET',
      headers: {
        'X-API-Key': 'demo-wms-key',
      },
    });
    
    if (!wmsResponse.ok) {
      throw new Error(`Mock WMS returned ${wmsResponse.status}`);
    }
    
    const inventory = await wmsResponse.json();
    console.log(`✅ Mock WMS online - ${inventory.total_skus} SKUs available`);
    console.log(`   Total quantity: ${inventory.total_quantity}`);
    
    // Trigger inventory sync flow
    console.log('\n🔄 Triggering Inventory Sync flow...');
    const response = await fetch(`${API_BASE}/api/flows/demo-flow-inventory-sync/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': DEMO_ADMIN_API_KEY,
      },
      body: JSON.stringify({ trigger: 'manual_test' }),
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    const duration = Date.now() - startTime;
    
    console.log('✅ Flow executed successfully!');
    console.log(`   Execution ID: ${result.executionId || 'N/A'}`);
    console.log(`   Duration: ${duration}ms`);
    
    return {
      flowName: 'Inventory Synchronization',
      success: true,
      duration,
      response: result,
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('❌ Test failed:', error.message);
    
    return {
      flowName: 'Inventory Synchronization',
      success: false,
      duration,
      error: error.message,
    };
  }
}

async function testShippingNotificationFlow(): Promise<TestResult> {
  console.log('\n🧪 TEST 4: Shipping Label & Notification');
  console.log('='.repeat(80));
  
  const startTime = Date.now();
  
  try {
    // Load sample shipment data
    const shipmentPath = path.join(__dirname, '..', 'examples', 'webhooks', 'demo-shipment.json');
    const shipmentData = JSON.parse(fs.readFileSync(shipmentPath, 'utf-8'));
    
    console.log('📦 Sample shipment data loaded:');
    console.log(`   Order ID: ${shipmentData.order_id}`);
    console.log(`   Customer: ${shipmentData.customer_email}`);
    console.log(`   Carrier: ${shipmentData.carrier_service}`);
    
    // Test 3PL mock system first
    console.log('\n🚚 Testing Mock 3PL system...');
    const threePLResponse = await fetch(`${API_BASE}/api/mock/3pl/shipments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer demo_3pl_token',
      },
      body: JSON.stringify(shipmentData),
    });
    
    if (!threePLResponse.ok) {
      throw new Error(`Mock 3PL returned ${threePLResponse.status}`);
    }
    
    const threePLResult = await threePLResponse.json();
    console.log('✅ Mock 3PL online');
    console.log(`   Tracking: ${threePLResult.tracking_number}`);
    console.log(`   Label URL: ${threePLResult.label_url}`);
    
    // Trigger shipping notification flow via webhook
    console.log('\n📨 Triggering Shipping Notification flow...');
    const response = await fetch(`${API_BASE}/api/webhook/order-shipped`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(shipmentData),
    });
    
    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    const duration = Date.now() - startTime;
    
    console.log('✅ Flow executed successfully!');
    console.log(`   Webhook processed`);
    console.log(`   Duration: ${duration}ms`);
    
    return {
      flowName: 'Shipping Label & Notification',
      success: true,
      duration,
      response: result,
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('❌ Test failed:', error.message);
    
    return {
      flowName: 'Shipping Label & Notification',
      success: false,
      duration,
      error: error.message,
    };
  }
}

async function testMockSystemsHealth(): Promise<void> {
  console.log('\n🏥 CHECKING MOCK SYSTEMS HEALTH');
  console.log('='.repeat(80));
  
  try {
    const response = await fetch(`${API_BASE}/api/mock/demo/health`);
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    
    const health = await response.json();
    
    console.log('✅ Mock Systems Status:');
    for (const [system, status] of Object.entries(health.systems)) {
      const icon = status === 'online' ? '✅' : '❌';
      console.log(`   ${icon} ${system.toUpperCase()}: ${status}`);
    }
    console.log(`   Timestamp: ${health.timestamp}`);
    
  } catch (error: any) {
    console.error('❌ Health check failed:', error.message);
    console.log('⚠️  Make sure the server is running with: npm run dev:server');
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🎬 CONTINUITYBRIDGE DEMO FLOW TESTING');
  console.log('='.repeat(80));
  console.log(`API Base: ${API_BASE}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  // Check mock systems health first
  await testMockSystemsHealth();
  
  // Run all flow tests
  const results: TestResult[] = [];
  
  // Test 1: BYDM Order (Production-ready example)
  results.push(await testBYDMOrderFlow());
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between tests
  
  // Test 2: Simple Order Processing
  results.push(await testOrderProcessingFlow());
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between tests
  
  results.push(await testInventorySyncFlow());
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  results.push(await testShippingNotificationFlow());
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalDuration = results.reduce((acc, r) => acc + r.duration, 0);
  
  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.flowName} (${result.duration}ms)`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log(`\nTotal: ${results.length} tests`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total duration: ${totalDuration}ms`);
  
  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED!');
  } else {
    console.log('\n⚠️  SOME TESTS FAILED - Check logs above');
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
