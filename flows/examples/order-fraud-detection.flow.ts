/**
 * Example: Order Processing with Fraud Detection
 * 
 * This example shows how to customize the BASE order-processing flow
 * to add fraud detection and high-value order alerts
 */

import { FlowBuilder } from "../../server/src/dsl/BridgeScript";

// Create flow extending BASE v1.0.0
const flow = new FlowBuilder("order-processing", "1.0.0-custom.1")
  .forCustomer("cliente-a", "dev")
  .extendsBase("1.0.0")
  .changes("minor", "Add fraud detection and high-value alerts")
  .withMetadata({
    tags: ["orders", "fraud-detection", "alerts"],
    description: "Order processing with fraud check and email notifications"
  })
  
  // Add fraud detection after webhook
  .transformWith(`
    const order = context.input;
    
    // Calculate fraud score
    const fraudScore = calculateFraudScore({
      total: order.total,
      customerAge: order.customer.accountAge,
      shippingAddress: order.shipping,
      billingAddress: order.billing
    });
    
    return { ...order, fraudScore };
  `)
  
  // Check fraud threshold
  .when("context.output.fraudScore > 0.7")
    .then(flow => flow
      .sendEmail({
        to: "${FRAUD_ALERT_EMAIL}",
        subject: "FRAUD ALERT: Order {{order.id}}",
        body: "High fraud risk detected. Score: {{order.fraudScore}}"
      })
      .saveToDb({
        connection: "${DB_CONNECTION}",
        table: "fraud_review_queue",
        operation: "insert"
      })
    )
  .else(flow => flow
    // Continue normal processing
    .validate({
      required: ["orderId", "customer", "total"],
      mode: "strict"
    })
  )
  
  // Check for high-value orders
  .when("context.input.total > 10000")
    .then(flow => flow
      .sendEmail({
        to: "${SALES_MANAGER_EMAIL}",
        subject: "High Value Order: {{order.id}}",
        template: "high-value-order",
        attachData: true
      })
    )
  
  // Transform and send to ERP
  .transform("order-to-erp")
  .sendTo("${ERP_API}/orders", {
    method: "POST",
    retries: 3,
    timeout: 30000
  })
  
  // Handle errors
  .onError(flow => flow
    .sendEmail({
      to: "${ERROR_ALERT_EMAIL}",
      subject: "Order Processing Failed: {{order.id}}",
      body: "Error: {{error.message}}"
    })
    .saveToDb({
      connection: "${DB_CONNECTION}",
      table: "failed_orders",
      operation: "insert"
    })
  );

// Build YAML
console.log(flow.build());
