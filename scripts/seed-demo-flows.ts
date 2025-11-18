/**
 * Demo Flow Seeder
 * 
 * Creates realistic integration flows to showcase ContinuityBridge capabilities
 * Run: npm run seed:demo
 */

import { db } from "../server/db.js";
import { flowDefinitions } from "../server/schema.js";
import { logger } from "../server/src/core/logger.js";

const log = logger.child("DemoSeeder");

export const DEMO_FLOWS = [
  {
    id: "demo-shopify-to-wms",
    name: "🛒 Shopify Order → WMS Integration",
    description: "Process Shopify orders and route to warehouse (3PL) based on inventory location",
    enabled: true,
    version: "1.0.0",
    tags: ["demo", "e-commerce", "3pl", "shopify"],
    metadata: {
      organizationId: "demo-org",
      useCase: "E-commerce order fulfillment",
      complexity: "medium",
      isDemo: true,
    },
    nodes: [
      // 1. Webhook Trigger
      {
        id: "webhook-1",
        type: "webhook_trigger",
        position: { x: 50, y: 200 },
        data: {
          label: "Shopify Webhook",
          webhookMethod: "POST",
          config: {
            description: "Receives order webhooks from Shopify",
            expectedFormat: "json",
          },
        },
      },
      
      // 2. Transform - Extract Order Data
      {
        id: "transform-1",
        type: "transform",
        position: { x: 300, y: 200 },
        data: {
          label: "Extract Order",
          config: {
            transformationType: "jq",
            jqExpression: `{
  orderId: .id,
  customerName: .customer.name,
  email: .customer.email,
  items: .line_items | map({
    sku: .sku,
    quantity: .quantity,
    price: .price
  }),
  shippingAddress: .shipping_address,
  totalAmount: .total_price,
  currency: .currency,
  orderDate: .created_at
}`,
          },
        },
      },
      
      // 3. Conditional Router - Route by Inventory Location
      {
        id: "router-1",
        type: "conditional_router",
        position: { x: 600, y: 200 },
        data: {
          label: "Route by Region",
          config: {
            rules: [
              {
                id: "rule-east",
                name: "East Coast",
                field: "$.shippingAddress.province",
                operator: "in",
                value: "NY,NJ,PA,MA,FL",
                outputPort: "east",
              },
              {
                id: "rule-west",
                name: "West Coast",
                field: "$.shippingAddress.province",
                operator: "in",
                value: "CA,WA,OR,NV,AZ",
                outputPort: "west",
              },
            ],
            defaultOutput: "central",
          },
        },
      },
      
      // 4a. Transform - East Coast WMS Format
      {
        id: "transform-east",
        type: "transform",
        position: { x: 900, y: 50 },
        data: {
          label: "East WMS Format",
          config: {
            transformationType: "jq",
            jqExpression: `{
  warehouse: "NJ-01",
  orderNumber: .orderId,
  customer: .customerName,
  shipTo: .shippingAddress,
  lineItems: .items
}`,
          },
        },
      },
      
      // 4b. Transform - West Coast WMS Format
      {
        id: "transform-west",
        type: "transform",
        position: { x: 900, y: 200 },
        data: {
          label: "West WMS Format",
          config: {
            transformationType: "jq",
            jqExpression: `{
  warehouse: "CA-01",
  orderNumber: .orderId,
  customer: .customerName,
  shipTo: .shippingAddress,
  lineItems: .items
}`,
          },
        },
      },
      
      // 4c. Transform - Central WMS Format
      {
        id: "transform-central",
        type: "transform",
        position: { x: 900, y: 350 },
        data: {
          label: "Central WMS Format",
          config: {
            transformationType: "jq",
            jqExpression: `{
  warehouse: "TX-01",
  orderNumber: .orderId,
  customer: .customerName,
  shipTo: .shippingAddress,
  lineItems: .items
}`,
          },
        },
      },
      
      // 5a. Interface - East Coast WMS
      {
        id: "interface-east",
        type: "interface_destination",
        position: { x: 1200, y: 50 },
        data: {
          label: "East WMS API",
          config: {
            interfaceId: "wms-east-api",
            operation: "createOrder",
            method: "POST",
            endpoint: "/api/orders",
          },
        },
      },
      
      // 5b. Interface - West Coast WMS
      {
        id: "interface-west",
        type: "interface_destination",
        position: { x: 1200, y: 200 },
        data: {
          label: "West WMS API",
          config: {
            interfaceId: "wms-west-api",
            operation: "createOrder",
            method: "POST",
            endpoint: "/api/orders",
          },
        },
      },
      
      // 5c. Interface - Central WMS
      {
        id: "interface-central",
        type: "interface_destination",
        position: { x: 1200, y: 350 },
        data: {
          label: "Central WMS API",
          config: {
            interfaceId: "wms-central-api",
            operation: "createOrder",
            method: "POST",
            endpoint: "/api/orders",
          },
        },
      },
      
      // 6. Email Notification
      {
        id: "email-1",
        type: "email",
        position: { x: 1500, y: 200 },
        data: {
          label: "Order Confirmation",
          config: {
            to: "{{ email }}",
            subject: "Order {{ orderId }} Confirmed",
            body: `Hi {{ customerName }},

Your order {{ orderId }} has been received and sent to warehouse {{ warehouse }}.

Order Details:
{{ items | length }} items
Total: {{ totalAmount }} {{ currency }}

Thank you for your order!`,
          },
        },
      },
    ],
    edges: [
      { id: "e1", source: "webhook-1", target: "transform-1" },
      { id: "e2", source: "transform-1", target: "router-1" },
      
      // East Coast path
      { id: "e3-east", source: "router-1", sourceHandle: "east", target: "transform-east" },
      { id: "e4-east", source: "transform-east", target: "interface-east" },
      { id: "e5-east", source: "interface-east", target: "email-1" },
      
      // West Coast path
      { id: "e3-west", source: "router-1", sourceHandle: "west", target: "transform-west" },
      { id: "e4-west", source: "transform-west", target: "interface-west" },
      { id: "e5-west", source: "interface-west", target: "email-1" },
      
      // Central path
      { id: "e3-central", source: "router-1", sourceHandle: "default", target: "transform-central" },
      { id: "e4-central", source: "transform-central", target: "interface-central" },
      { id: "e5-central", source: "interface-central", target: "email-1" },
    ],
  },
  
  {
    id: "demo-inventory-sync",
    name: "📦 Real-time Inventory Sync (WMS ↔ Shopify)",
    description: "Sync inventory levels from warehouse to Shopify every 15 minutes",
    enabled: true,
    version: "1.0.0",
    tags: ["demo", "inventory", "scheduler", "bi-directional"],
    metadata: {
      organizationId: "demo-org",
      useCase: "Inventory synchronization",
      complexity: "low",
      isDemo: true,
    },
    nodes: [
      // 1. Scheduler Trigger
      {
        id: "scheduler-1",
        type: "scheduler",
        position: { x: 50, y: 200 },
        data: {
          label: "Every 15 min",
          config: {
            cron: "*/15 * * * *",
            timezone: "America/New_York",
          },
        },
      },
      
      // 2. Interface Source - WMS Inventory
      {
        id: "interface-source-1",
        type: "interface_source",
        position: { x: 300, y: 200 },
        data: {
          label: "WMS Inventory API",
          config: {
            interfaceId: "wms-inventory-api",
            operation: "getInventory",
            method: "GET",
            endpoint: "/api/inventory",
          },
        },
      },
      
      // 3. Transform - Map to Shopify Format
      {
        id: "transform-1",
        type: "transform",
        position: { x: 600, y: 200 },
        data: {
          label: "Map to Shopify",
          config: {
            transformationType: "jq",
            jqExpression: `.items | map({
  inventory_item_id: .shopify_variant_id,
  location_id: "shopify-main-warehouse",
  available: .quantity_available
})`,
          },
        },
      },
      
      // 4. Interface Destination - Shopify Inventory
      {
        id: "interface-dest-1",
        type: "interface_destination",
        position: { x: 900, y: 200 },
        data: {
          label: "Shopify Inventory",
          config: {
            interfaceId: "shopify-inventory-api",
            operation: "updateInventory",
            method: "POST",
            endpoint: "/admin/api/2024-01/inventory_levels/set.json",
          },
        },
      },
      
      // 5. Logger
      {
        id: "logger-1",
        type: "logger",
        position: { x: 1200, y: 200 },
        data: {
          label: "Log Sync",
          config: {
            level: "info",
            message: "Inventory synced: {{ items | length }} SKUs updated",
          },
        },
      },
    ],
    edges: [
      { id: "e1", source: "scheduler-1", target: "interface-source-1" },
      { id: "e2", source: "interface-source-1", target: "transform-1" },
      { id: "e3", source: "transform-1", target: "interface-dest-1" },
      { id: "e4", source: "interface-dest-1", target: "logger-1" },
    ],
  },
  
  {
    id: "demo-shipment-tracking",
    name: "🚚 Shipment Tracking Updates",
    description: "Receive carrier tracking updates and notify customers via email",
    enabled: true,
    version: "1.0.0",
    tags: ["demo", "shipping", "notifications", "customer-service"],
    metadata: {
      organizationId: "demo-org",
      useCase: "Shipment tracking notifications",
      complexity: "low",
      isDemo: true,
    },
    nodes: [
      // 1. Webhook Trigger
      {
        id: "webhook-1",
        type: "webhook_trigger",
        position: { x: 50, y: 200 },
        data: {
          label: "Carrier Webhook",
          webhookMethod: "POST",
          config: {
            description: "FedEx/UPS tracking updates",
          },
        },
      },
      
      // 2. Transform - Extract Tracking Info
      {
        id: "transform-1",
        type: "transform",
        position: { x: 300, y: 200 },
        data: {
          label: "Extract Info",
          config: {
            transformationType: "jq",
            jqExpression: `{
  trackingNumber: .tracking_number,
  status: .status,
  location: .current_location.city,
  estimatedDelivery: .estimated_delivery,
  orderId: .reference_number
}`,
          },
        },
      },
      
      // 3. Database Lookup - Get Customer Email
      {
        id: "db-query-1",
        type: "database_query",
        position: { x: 600, y: 200 },
        data: {
          label: "Get Customer",
          config: {
            connectionId: "main-db",
            query: "SELECT customer_email FROM orders WHERE order_id = :orderId",
            parameters: {
              orderId: "{{ orderId }}",
            },
          },
        },
      },
      
      // 4. Email - Customer Notification
      {
        id: "email-1",
        type: "email",
        position: { x: 900, y: 200 },
        data: {
          label: "Tracking Update",
          config: {
            to: "{{ customer_email }}",
            subject: "📦 Your package is on the way!",
            body: `Tracking Update

Your order {{ orderId }} is currently {{ status }}.

Tracking #: {{ trackingNumber }}
Current Location: {{ location }}
Estimated Delivery: {{ estimatedDelivery }}

Track online: https://track.example.com/{{ trackingNumber }}`,
          },
        },
      },
    ],
    edges: [
      { id: "e1", source: "webhook-1", target: "transform-1" },
      { id: "e2", source: "transform-1", target: "db-query-1" },
      { id: "e3", source: "db-query-1", target: "email-1" },
    ],
  },
];

async function seedDemoFlows() {
  log.info("🌱 Seeding demo flows...");

  try {
    for (const flow of DEMO_FLOWS) {
      // Check if flow already exists
      const existing = await db.query.flowDefinitions.findFirst({
        where: (flowDefinitions, { eq }) => eq(flowDefinitions.id, flow.id),
      });

      if (existing) {
        log.info(`⏭️  Skipping ${flow.name} (already exists)`);
        continue;
      }

      // Insert flow
      await db.insert(flowDefinitions).values({
        id: flow.id,
        name: flow.name,
        description: flow.description,
        enabled: flow.enabled,
        version: flow.version,
        nodes: JSON.stringify(flow.nodes),
        edges: JSON.stringify(flow.edges),
        tags: JSON.stringify(flow.tags),
        metadata: JSON.stringify(flow.metadata),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      log.info(`✅ Created: ${flow.name}`);
      log.info(`   Nodes: ${flow.nodes.length}, Edges: ${flow.edges.length}`);
    }

    log.info("");
    log.info("✅ Demo flow seeding complete!");
    log.info(`📦 Created ${DEMO_FLOWS.length} demo flows`);
    log.info("");
    log.info("🎯 Demo Flows:");
    DEMO_FLOWS.forEach((f) => {
      log.info(`   • ${f.name}`);
    });
  } catch (error: any) {
    log.error("❌ Seeding failed:", error);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoFlows()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export default seedDemoFlows;
