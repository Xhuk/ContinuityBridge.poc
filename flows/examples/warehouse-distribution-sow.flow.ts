/**
 * Example: Multi-Warehouse Distribution (SOW-Aware)
 * 
 * This shows SOW enforcement - consultant can only use systems
 * that are authorized in the customer's SOW
 */

import { SOWFlowBuilder } from "../../server/src/dsl/BridgeScript";

// Define SOW constraints
const customerSOW = {
  systems: ["WMS", "ERP", "CARRIER"],  // Only these systems allowed
  maxInterfaces: 5,
  maxFlows: 10
};

// Create SOW-aware flow
const flow = new SOWFlowBuilder(
  "fulfillment-distribution",
  "1.0.0-custom.1",
  customerSOW
)
  .forCustomer("cliente-b", "dev")
  .extendsBase("1.0.0")
  .changes("minor", "Add parallel warehouse processing")
  .withMetadata({
    tags: ["fulfillment", "multi-warehouse", "parallel"],
    description: "Distribute order lines across warehouses in parallel"
  })
  
  // Receive order
  .receiveWebhook("/fulfillment/process", {
    auth: "hmac",
    secret: "${WEBHOOK_SECRET}"
  })
  
  // Validate order
  .validate({
    required: ["orderId", "lineItems"],
    mode: "strict"
  })
  
  // Split by warehouse
  .splitBy({
    strategy: "by_warehouse",
    splitField: "lineItems",
    groupBy: "warehouseCode",
    maxParallel: 10
  })
  
  // Check stock (this will work - WMS is in SOW)
  .sendTo("${WMS_API}/warehouses/{{warehouseCode}}/stock", {
    method: "POST",
    body: "{{context.input}}",
    timeout: 5000
  })
  
  // Reserve inventory (ERP is in SOW)
  .sendTo("${ERP_API}/inventory/reserve", {
    method: "POST",
    retries: 3
  })
  
  // Join results
  .joinAll({
    strategy: "all",
    timeout: 60000
  })
  
  // Create shipments (CARRIER is in SOW)
  .sendTo("${CARRIER_API}/shipments/create", {
    method: "POST"
  });

// This will succeed - all systems in SOW
console.log(flow.build());

// ============================================================================
// Example of SOW violation (commented out)
// ============================================================================

/*
const badFlow = new SOWFlowBuilder(
  "bad-flow",
  "1.0.0-custom.1",
  customerSOW
)
  .forCustomer("cliente-b", "dev")
  .receiveWebhook("/test")
  
  // This will THROW ERROR - CRM not in SOW
  .sendTo("${CRM_API}/customers/create");

// Error: SOW Violation:
// System "CRM" not authorized in SOW. Allowed: WMS, ERP, CARRIER
//
// Contact customer to update SOW or remove unauthorized systems.
*/
