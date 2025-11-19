/**
 * DEMO SCENARIO: E-Commerce Order Processing with Intelligence
 * 
 * This flow demonstrates BridgeScript building a complete real-world scenario:
 * 
 * BUSINESS LOGIC:
 * 1. Receive order from e-commerce webhook
 * 2. Run fraud detection algorithm
 * 3. If high-risk: Alert finance team and hold for review
 * 4. If low-risk: Process normally
 * 5. Split order lines across warehouses based on inventory
 * 6. Send fulfillment requests in parallel to WMS systems
 * 7. Generate shipping labels via 3PL
 * 8. Send confirmation email to customer
 * 
 * SOW Systems: SHOPIFY, WMS, ERP, 3PL, EMAIL
 */

import { SOWFlowBuilder } from "../../server/src/dsl/BridgeScript";

// Define customer SOW (authorized systems)
const customerSOW = {
  systems: ["SHOPIFY", "WMS", "ERP", "3PL", "EMAIL"],
  maxInterfaces: 10,
  maxFlows: 20,
};

// Build the flow using BridgeScript fluent API
const flow = new SOWFlowBuilder(
  "ecommerce-intelligent-fulfillment",
  "1.0.0-custom.1",
  customerSOW
)
  .forCustomer("demo-company-001", "dev")
  .extendsBase("1.0.0")
  .changes("minor", "Add fraud detection and intelligent warehouse distribution")
  .withMetadata({
    tags: ["demo", "ecommerce", "fraud-detection", "multi-warehouse"],
    description: "Complete e-commerce order processing with fraud check and smart fulfillment",
  })

  // ========================================
  // STEP 1: RECEIVE ORDER FROM SHOPIFY
  // ========================================
  .receiveWebhook("/shopify/orders/create", {
    auth: "hmac",
    secret: "${SHOPIFY_WEBHOOK_SECRET}",
    method: "POST",
  })

  // ========================================
  // STEP 2: VALIDATE ORDER STRUCTURE
  // ========================================
  .validate({
    required: ["order_id", "customer", "line_items", "total_price"],
    mode: "strict",
  })

  // ========================================
  // STEP 3: FRAUD DETECTION LOGIC
  // ========================================
  .transformWith(`
    const order = context.input;
    
    // Calculate fraud score based on multiple factors
    let fraudScore = 0;
    
    // Factor 1: High order value (>$500)
    if (order.total_price > 500) fraudScore += 30;
    
    // Factor 2: New customer (<30 days account age)
    const accountAge = Date.now() - new Date(order.customer.created_at).getTime();
    if (accountAge < 30 * 24 * 60 * 60 * 1000) fraudScore += 20;
    
    // Factor 3: Shipping address mismatch with billing
    if (order.shipping_address.country !== order.billing_address.country) {
      fraudScore += 25;
    }
    
    // Factor 4: Multiple high-value items
    if (order.line_items.filter(item => item.price > 200).length > 2) {
      fraudScore += 15;
    }
    
    // Factor 5: Expedited shipping on first order
    if (order.shipping_lines[0]?.code.includes('EXPRESS') && accountAge < 7 * 24 * 60 * 60 * 1000) {
      fraudScore += 10;
    }
    
    // Determine risk level
    const riskLevel = fraudScore > 60 ? 'HIGH' : fraudScore > 30 ? 'MEDIUM' : 'LOW';
    
    return {
      ...order,
      fraudAnalysis: {
        score: fraudScore,
        riskLevel,
        timestamp: new Date().toISOString(),
        factors: {
          highValue: order.total_price > 500,
          newCustomer: accountAge < 30 * 24 * 60 * 60 * 1000,
          addressMismatch: order.shipping_address.country !== order.billing_address.country,
        }
      }
    };
  `)

  // ========================================
  // STEP 4: CONDITIONAL ROUTING BY RISK
  // ========================================
  .when("$.fraudAnalysis.riskLevel === 'HIGH'")
    
    // HIGH RISK PATH: Hold and alert
    .then((flow) => {
      flow
        .sendEmail({
          to: "${FINANCE_TEAM_EMAIL}",
          subject: "⚠️ High-Risk Order Requires Review",
          template: "fraud-alert",
        })
        .transformWith(`
          return {
            ...context.input,
            status: 'HOLD_FOR_REVIEW',
            holdReason: 'High fraud risk score: ' + context.input.fraudAnalysis.score
          };
        `)
        .sendTo("${ERP_API}/orders/hold", {
          method: "POST",
          retries: 3,
        });
    })
    
    // LOW/MEDIUM RISK PATH: Process normally
    .else((flow) => {
      flow
        
        // ========================================
        // STEP 5: CHECK INVENTORY ACROSS WAREHOUSES
        // ========================================
        .sendTo("${WMS_API}/inventory/check", {
          method: "POST",
          retries: 2,
        })
        
        // ========================================
        // STEP 6: INTELLIGENT WAREHOUSE SPLIT
        // ========================================
        .transformWith(`
          const order = context.input;
          const inventoryData = context.previousResponse;
          
          // Group items by optimal warehouse
          const warehouseGroups = {};
          
          order.line_items.forEach((item, index) => {
            const itemInventory = inventoryData.items[index];
            
            // Find warehouse with best combination of:
            // 1. Stock availability
            // 2. Proximity to customer
            // 3. Shipping cost
            const bestWarehouse = itemInventory.warehouses
              .filter(wh => wh.quantity >= item.quantity)
              .sort((a, b) => {
                // Score based on distance and stock
                const scoreA = (1000 - a.distance_km) * (a.quantity / item.quantity);
                const scoreB = (1000 - b.distance_km) * (b.quantity / item.quantity);
                return scoreB - scoreA;
              })[0];
            
            if (!warehouseGroups[bestWarehouse.code]) {
              warehouseGroups[bestWarehouse.code] = {
                warehouse: bestWarehouse.code,
                location: bestWarehouse.location,
                items: []
              };
            }
            
            warehouseGroups[bestWarehouse.code].items.push(item);
          });
          
          return {
            orderId: order.order_id,
            customer: order.customer,
            warehouseAllocations: Object.values(warehouseGroups)
          };
        `)
        
        // ========================================
        // STEP 7: PARALLEL FULFILLMENT (using splitBy)
        // ========================================
        .splitBy({
          strategy: "by_field",
          splitField: "warehouseAllocations",
          maxParallel: 5,
        })
        .sendTo("${WMS_API}/fulfillment/create", {
          method: "POST",
          retries: 3,
        })
        .joinAll({
          strategy: "all",
          timeout: 60000,
        })
        
        // ========================================
        // STEP 8: CREATE SHIPPING LABELS VIA 3PL
        // ========================================
        .sendTo("${3PL_API}/shipments/create", {
          method: "POST",
          headers: {
            "Authorization": "Bearer ${3PL_API_TOKEN}",
          },
          retries: 2,
        })
        
        // ========================================
        // STEP 9: SEND CONFIRMATION EMAIL
        // ========================================
        .sendEmail({
          to: "finance@company.com",
          subject: "Order Confirmed - We're Processing Your Order!",
          template: "order-confirmation",
        })
        
        // ========================================
        // STEP 10: UPDATE ERP WITH FINAL STATUS
        // ========================================
        .sendTo("${ERP_API}/orders/update", {
          method: "PUT",
          retries: 3,
        });
    })
  
  // ========================================
  // BUILD AND OUTPUT
  // ========================================
  .build();

// Output the compiled YAML
console.log(flow);
