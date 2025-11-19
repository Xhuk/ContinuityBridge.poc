import { Router, Request, Response } from "express";
import { logger } from "../core/logger";

const router = Router();

/**
 * Mock Host Systems API
 * Simulates WMS, ERP, Marketplace, and 3PL systems for demo purposes
 */

// ============================================================================
// MOCK WMS (Warehouse Management System)
// ============================================================================

router.post("/wms/inventory", (req: Request, res: Response) => {
  logger.info("Mock WMS: Inventory query", { body: req.body });
  
  // Simulate WMS inventory response
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    warehouse: "DEMO-WH-001",
    inventory: [
      {
        sku: "DEMO-SKU-001",
        product_name: "Widget Pro 3000",
        quantity: 150,
        location: "A-12-03",
        reserved: 25,
        available: 125,
        last_updated: new Date().toISOString(),
      },
      {
        sku: "DEMO-SKU-002",
        product_name: "Gadget Elite",
        quantity: 87,
        location: "B-05-12",
        reserved: 10,
        available: 77,
        last_updated: new Date().toISOString(),
      },
      {
        sku: "DEMO-SKU-003",
        product_name: "Tool Master Plus",
        quantity: 243,
        location: "C-18-07",
        reserved: 50,
        available: 193,
        last_updated: new Date().toISOString(),
      },
    ],
  });
});

router.get("/wms/inventory", (req: Request, res: Response) => {
  // Full inventory snapshot
  res.json({
    success: true,
    warehouse: "DEMO-WH-001",
    total_skus: 3,
    total_quantity: 480,
    inventory: [
      { sku: "DEMO-SKU-001", quantity: 150, available: 125, location: "A-12-03" },
      { sku: "DEMO-SKU-002", quantity: 87, available: 77, location: "B-05-12" },
      { sku: "DEMO-SKU-003", quantity: 243, available: 193, location: "C-18-07" },
    ],
  });
});

router.post("/wms/fulfillment", (req: Request, res: Response) => {
  const { order_id, items } = req.body;
  
  logger.info("Mock WMS: Fulfillment request", { order_id, items_count: items?.length });
  
  // Simulate picking and packing
  res.json({
    success: true,
    fulfillment_id: `FUL-${Date.now()}`,
    order_id,
    status: "picking_in_progress",
    items_picked: items?.map((item: any) => ({
      sku: item.sku,
      quantity_picked: item.quantity,
      picker: "DEMO-PICKER-01",
      location: "A-12-03",
    })),
    estimated_ship_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
});

// ============================================================================
// MOCK ERP (Enterprise Resource Planning)
// ============================================================================

router.post("/erp/orders", (req: Request, res: Response) => {
  const { order_id, customer_email, items, total } = req.body;
  
  logger.info("Mock ERP: Order creation", { order_id, customer_email });
  
  res.json({
    success: true,
    erp_order_id: `ERP-ORD-${Date.now()}`,
    external_order_id: order_id,
    customer: {
      email: customer_email,
      customer_id: `CUST-${Math.floor(Math.random() * 10000)}`,
      credit_status: "approved",
    },
    order_status: "confirmed",
    payment_status: "pending",
    items: items,
    total_amount: total || 0,
    created_at: new Date().toISOString(),
  });
});

router.get("/erp/orders/:orderId", (req: Request, res: Response) => {
  res.json({
    success: true,
    order_id: req.params.orderId,
    status: "processing",
    customer_email: "demo@customer.com",
    items: [
      { sku: "DEMO-SKU-001", quantity: 2, price: 49.99 },
      { sku: "DEMO-SKU-002", quantity: 1, price: 79.99 },
    ],
    total: 179.97,
    created_at: new Date(Date.now() - 3600000).toISOString(),
  });
});

router.put("/erp/inventory", (req: Request, res: Response) => {
  const { updates } = req.body;
  
  logger.info("Mock ERP: Inventory update", { updates_count: updates?.length });
  
  res.json({
    success: true,
    updated_count: updates?.length || 0,
    updates: updates?.map((u: any) => ({
      product_code: u.product_code,
      previous_qty: Math.floor(Math.random() * 200),
      new_qty: u.available_qty,
      updated_at: new Date().toISOString(),
    })),
  });
});

// ============================================================================
// MOCK MARKETPLACE (E-commerce Platform)
// ============================================================================

router.post("/marketplace/webhook", (req: Request, res: Response) => {
  // Simulate marketplace webhook (order created, order cancelled, etc.)
  logger.info("Mock Marketplace: Webhook received", { event: req.body.event_type });
  
  res.status(200).json({
    received: true,
    event_id: `EVT-${Date.now()}`,
    processed_at: new Date().toISOString(),
  });
});

router.get("/marketplace/orders", (req: Request, res: Response) => {
  // Return sample marketplace orders
  res.json({
    success: true,
    orders: [
      {
        order_id: "MKT-ORD-12345",
        customer: {
          email: "john.doe@example.com",
          name: "John Doe",
          shipping_address: {
            street: "123 Main St",
            city: "New York",
            state: "NY",
            zip: "10001",
            country: "US",
          },
        },
        items: [
          { sku: "DEMO-SKU-001", name: "Widget Pro 3000", quantity: 2, price: 49.99 },
          { sku: "DEMO-SKU-002", name: "Gadget Elite", quantity: 1, price: 79.99 },
        ],
        total: 179.97,
        status: "pending_fulfillment",
        created_at: new Date(Date.now() - 7200000).toISOString(),
      },
    ],
  });
});

// ============================================================================
// MOCK 3PL (Third-Party Logistics / Carrier)
// ============================================================================

router.post("/3pl/auth", (req: Request, res: Response) => {
  // OAuth2 auth endpoint (not used in demo, but for completeness)
  res.json({
    auth_url: "http://localhost:5000/api/mock/3pl/authorize",
    client_id: req.body.client_id,
  });
});

router.post("/3pl/token", (req: Request, res: Response) => {
  // OAuth2 token endpoint
  res.json({
    access_token: `demo_3pl_token_${Date.now()}`,
    token_type: "Bearer",
    expires_in: 3600,
    scope: "shipments.read shipments.write",
  });
});

router.post("/3pl/shipments", (req: Request, res: Response) => {
  const { order_id, destination, items, carrier_service } = req.body;
  
  logger.info("Mock 3PL: Shipment creation", { order_id, carrier: carrier_service });
  
  // Simulate carrier rate calculation
  const weight = items?.reduce((acc: number, item: any) => acc + (item.weight || 1) * item.quantity, 0) || 5;
  const rate = weight * 1.5 + 7.99; // Base rate + weight-based
  
  res.json({
    success: true,
    shipment_id: `SHIP-${Date.now()}`,
    tracking_number: `1Z999AA1${Math.floor(Math.random() * 100000000)}`,
    carrier: carrier_service || "DEMO_EXPRESS",
    service_level: "ground",
    label_url: `http://localhost:5000/api/mock/3pl/label/${Date.now()}.pdf`,
    tracking_url: `http://localhost:5000/api/mock/3pl/track/${Date.now()}`,
    estimated_delivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    cost: {
      base_rate: 7.99,
      weight_charge: weight * 1.5,
      total: rate.toFixed(2),
      currency: "USD",
    },
    created_at: new Date().toISOString(),
  });
});

router.get("/3pl/track/:trackingNumber", (req: Request, res: Response) => {
  const { trackingNumber } = req.params;
  
  // Simulate tracking info
  res.json({
    success: true,
    tracking_number: trackingNumber,
    status: "in_transit",
    carrier: "DEMO_EXPRESS",
    origin: "New York, NY",
    destination: "Los Angeles, CA",
    estimated_delivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    tracking_events: [
      {
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        status: "picked_up",
        location: "New York, NY 10001",
        description: "Package picked up by carrier",
      },
      {
        timestamp: new Date(Date.now() - 43200000).toISOString(),
        status: "in_transit",
        location: "Philadelphia, PA 19019",
        description: "In transit to next facility",
      },
      {
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        status: "in_transit",
        location: "Chicago, IL 60666",
        description: "Arrived at sorting facility",
      },
    ],
  });
});

// ============================================================================
// DEMO TEST DATA GENERATOR
// ============================================================================

router.get("/demo/sample-order", (req: Request, res: Response) => {
  // Generate a complete sample order for testing
  res.json({
    order_id: `DEMO-ORD-${Date.now()}`,
    marketplace: "Demo E-commerce",
    customer: {
      email: "demo.customer@example.com",
      name: "Demo Customer",
      phone: "+1-555-0123",
      shipping_address: {
        street: "456 Demo Street",
        city: "Demo City",
        state: "CA",
        zip: "90210",
        country: "US",
      },
      billing_address: {
        street: "456 Demo Street",
        city: "Demo City",
        state: "CA",
        zip: "90210",
        country: "US",
      },
    },
    items: [
      {
        sku: "DEMO-SKU-001",
        name: "Widget Pro 3000",
        quantity: 2,
        price: 49.99,
        weight: 2.5,
      },
      {
        sku: "DEMO-SKU-002",
        name: "Gadget Elite",
        quantity: 1,
        price: 79.99,
        weight: 1.8,
      },
    ],
    subtotal: 179.97,
    shipping_cost: 12.99,
    tax: 15.36,
    total: 208.32,
    payment_method: "credit_card",
    payment_status: "authorized",
    notes: "Demo order - Leave at door if not home",
    created_at: new Date().toISOString(),
  });
});

// BYDM to Amazon SP-API transformation (with mapping metadata)
router.post("/amazon/sp-api/orders", (req: Request, res: Response) => {
  logger.info("Mock Amazon SP-API: Order creation", { body: req.body });
  
  // Simulate Amazon SP-API response with mapping metadata
  res.json({
    success: true,
    orderId: `AMZN-${Date.now()}`,
    sellerFulfillmentOrderId: req.body.sellerFulfillmentOrderId || `ORD-${Date.now()}`,
    displayableOrderId: req.body.displayableOrderId,
    status: "Received",
    statusUpdatedDate: new Date().toISOString(),
    
    // Mapping metadata for debug visualization
    __mapping_metadata: {
      total_fields: 23,
      mapped_fields: 23,
      unmapped_fields: 0,
      confidence_score: 100,
      missing_required_fields: [],
      warnings: [],
      bydm_source: "orderRelease",
    },
  });
});

// BYDM to MercadoLibre transformation (with mapping metadata)
router.post("/mercadolibre/orders", (req: Request, res: Response) => {
  logger.info("Mock MercadoLibre API: Order creation", { body: req.body });
  
  // Simulate MercadoLibre response with mapping warnings
  res.json({
    success: true,
    id: Date.now(),
    order_id: req.body.order_id || `MELI-ORD-${Date.now()}`,
    external_reference: req.body.external_reference,
    status: "confirmed",
    status_detail: null,
    date_created: new Date().toISOString(),
    
    // Mapping metadata for debug visualization (partial mapping)
    __mapping_metadata: {
      total_fields: 47,
      mapped_fields: 38,
      unmapped_fields: 9,
      confidence_score: 81,
      missing_required_fields: [],
      missing_optional_fields: [
        "shipping.receiver_address.latitude",
        "shipping.receiver_address.longitude",
        "order_items[0].item.category_id",
        "order_items[0].item.global_price",
        "order_items[0].item.net_weight",
        "order_items[1].item.category_id",
        "order_items[1].item.global_price",
        "order_items[1].item.net_weight",
        "payments[0].date_approved",
      ],
      warnings: [
        "⚠️ Missing product weights - may affect shipping calculations",
        "⚠️ Missing geolocation - delivery estimates may be inaccurate",
        "⚠️ Missing category_id - product classification incomplete",
      ],
      bydm_source: "orderRelease",
    },
  });
});

router.get("/demo/health", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Mock systems are operational",
    systems: {
      wms: "online",
      erp: "online",
      marketplace: "online",
      "3pl": "online",
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
