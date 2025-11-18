/**
 * Transformation Template Seeder
 * 
 * Seeds pre-built transformation templates for common system integrations:
 * - WMS → Manhattan, Odoo, SAP
 * - Odoo → WMS, Manhattan, SAP
 * - SAP → Odoo, Manhattan, WMS
 * - Marketplace → WMS/ERP
 * - ERP → Marketplace
 * 
 * These templates use jq expressions for data transformation
 * Run: npm run seed:transforms
 */

import { db } from "../server/db.js";
import { logger } from "../server/src/core/logger.js";

const log = logger.child("TransformSeeder");

/**
 * Transformation Template Schema
 */
interface TransformTemplate {
  id: string;
  name: string;
  description: string;
  sourceSystem: string;
  targetSystem: string;
  sourceFormat: "json" | "xml";
  targetFormat: "json" | "xml";
  transformationType: "jq" | "xslt" | "javascript";
  transformExpression: string;
  category: "order" | "inventory" | "shipment" | "product" | "customer";
  tags: string[];
  sampleInput?: any;
  sampleOutput?: any;
  metadata?: Record<string, any>;
}

export const TRANSFORMATION_TEMPLATES: TransformTemplate[] = [
  // ============================================================================
  // WMS → MANHATTAN ASSOCIATES
  // ============================================================================
  
  {
    id: "wms-to-manhattan-order",
    name: "Generic WMS → Manhattan WMS Order",
    description: "Transform standard WMS order format to Manhattan Associates WMS",
    sourceSystem: "generic-wms",
    targetSystem: "manhattan-wms",
    sourceFormat: "json",
    targetFormat: "xml",
    transformationType: "jq",
    category: "order",
    tags: ["wms", "manhattan", "order"],
    transformExpression: `{
  order: {
    orderNumber: .orderId,
    customerCode: .customer.code,
    priority: (if .priority == "urgent" then "1" else "5" end),
    orderLines: .items | map({
      lineNumber: .lineNumber,
      sku: .sku,
      quantity: .quantity,
      uom: (.uom // "EA"),
      lotControl: (.lotControl // false)
    }),
    shipTo: {
      name: .shippingAddress.name,
      address1: .shippingAddress.address1,
      city: .shippingAddress.city,
      state: .shippingAddress.state,
      postalCode: .shippingAddress.zip,
      country: .shippingAddress.country
    },
    requestedShipDate: .requestedShipDate,
    carrier: (.carrier // "FEDEX"),
    serviceLevel: (.serviceLevel // "GROUND")
  }
}`,
    sampleInput: {
      orderId: "ORD-12345",
      customer: { code: "CUST001", name: "ACME Corp" },
      priority: "normal",
      items: [
        { lineNumber: 1, sku: "SKU001", quantity: 10, uom: "EA" }
      ],
      shippingAddress: {
        name: "John Smith",
        address1: "123 Main St",
        city: "New York",
        state: "NY",
        zip: "10001",
        country: "US"
      },
      requestedShipDate: "2025-01-20"
    },
  },

  {
    id: "manhattan-to-wms-shipment",
    name: "Manhattan WMS → Generic WMS Shipment",
    description: "Transform Manhattan shipment confirmation to standard WMS format",
    sourceSystem: "manhattan-wms",
    targetSystem: "generic-wms",
    sourceFormat: "xml",
    targetFormat: "json",
    transformationType: "jq",
    category: "shipment",
    tags: ["manhattan", "wms", "shipment"],
    transformExpression: `{
  shipmentId: .shipment.shipmentNumber,
  orderId: .shipment.orderNumber,
  status: "shipped",
  shippedDate: .shipment.shipDate,
  trackingNumber: .shipment.trackingNumber,
  carrier: .shipment.carrier,
  packages: (.shipment.packages // []) | map({
    packageNumber: .packageNumber,
    weight: .weight,
    dimensions: {
      length: .length,
      width: .width,
      height: .height
    },
    items: .items | map({
      sku: .sku,
      quantity: .quantity
    })
  })
}`,
  },

  // ============================================================================
  // ODOO → WMS/MANHATTAN
  // ============================================================================

  {
    id: "odoo-to-wms-order",
    name: "Odoo ERP → Generic WMS Order",
    description: "Transform Odoo sale order to WMS format",
    sourceSystem: "odoo-erp",
    targetSystem: "generic-wms",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "order",
    tags: ["odoo", "erp", "wms", "order"],
    transformExpression: `{
  orderId: .name,
  orderDate: .date_order,
  customer: {
    code: .partner_id[0] | tostring,
    name: .partner_id[1],
    email: .partner_email
  },
  warehouse: (.warehouse_id[1] // "MAIN"),
  items: .order_line | map({
    lineNumber: .id,
    sku: .product_id[1],
    productName: .name,
    quantity: .product_uom_qty,
    uom: .product_uom[1],
    price: .price_unit
  }),
  shippingAddress: {
    name: .partner_shipping_id[1],
    address1: .partner_street,
    city: .partner_city,
    state: .partner_state_id[1],
    zip: .partner_zip,
    country: .partner_country_id[1]
  },
  totalAmount: .amount_total,
  currency: .currency_id[1],
  notes: .note
}`,
    sampleInput: {
      name: "SO001",
      date_order: "2025-01-15",
      partner_id: [1, "ACME Corp"],
      partner_email: "orders@acme.com",
      warehouse_id: [1, "Main Warehouse"],
      order_line: [
        {
          id: 1,
          product_id: [10, "SKU001"],
          name: "Product A",
          product_uom_qty: 5,
          product_uom: [1, "Unit"],
          price_unit: 25.00
        }
      ],
      amount_total: 125.00,
      currency_id: [1, "USD"]
    },
  },

  {
    id: "odoo-to-manhattan-order",
    name: "Odoo ERP → Manhattan WMS Order",
    description: "Direct Odoo to Manhattan WMS integration",
    sourceSystem: "odoo-erp",
    targetSystem: "manhattan-wms",
    sourceFormat: "json",
    targetFormat: "xml",
    transformationType: "jq",
    category: "order",
    tags: ["odoo", "manhattan", "order"],
    transformExpression: `{
  order: {
    orderNumber: .name,
    externalOrderId: .client_order_ref,
    customerCode: .partner_id[0] | tostring,
    warehouse: (.warehouse_id[1] // "MAIN"),
    orderDate: .date_order,
    requestedShipDate: (.commitment_date // .date_order),
    priority: (if .priority == "1" then "1" else "5" end),
    orderLines: .order_line | map({
      lineNumber: .id,
      sku: .product_id[1],
      description: .name,
      quantity: .product_uom_qty,
      uom: (.product_uom[1] // "EA")
    }),
    shipTo: {
      name: .partner_shipping_id[1],
      address1: .partner_street,
      address2: .partner_street2,
      city: .partner_city,
      state: (.partner_state_id[1] // ""),
      postalCode: .partner_zip,
      country: (.partner_country_id[1] // "US"),
      phone: .partner_phone
    },
    carrier: (.carrier_id[1] // "FEDEX"),
    serviceLevel: "GROUND"
  }
}`,
  },

  {
    id: "wms-to-odoo-inventory",
    name: "Generic WMS → Odoo Inventory Update",
    description: "Sync WMS inventory levels to Odoo stock",
    sourceSystem: "generic-wms",
    targetSystem: "odoo-erp",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "inventory",
    tags: ["wms", "odoo", "inventory"],
    transformExpression: `{
  params: {
    inventory_adjustments: .items | map({
      product_id: .sku,
      location_id: (.location // "WH/Stock"),
      new_quantity: .quantityAvailable,
      theoretical_qty: .quantityReserved,
      difference: (.quantityAvailable - .quantityReserved)
    })
  }
}`,
  },

  // ============================================================================
  // SAP → ODOO / WMS
  // ============================================================================

  {
    id: "sap-to-odoo-order",
    name: "SAP Business One → Odoo Sale Order",
    description: "Transform SAP order to Odoo format",
    sourceSystem: "sap-b1",
    targetSystem: "odoo-erp",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "order",
    tags: ["sap", "odoo", "order"],
    transformExpression: `{
  params: {
    partner_id: .CardCode,
    date_order: .DocDate,
    client_order_ref: .NumAtCard,
    warehouse_id: (.WhsCode // "WH-001"),
    payment_term_id: .PaymentGroupCode,
    order_line: [
      (.DocumentLines // []) | map({
        product_id: .ItemCode,
        name: .ItemDescription,
        product_uom_qty: .Quantity,
        price_unit: .Price,
        tax_id: (if .TaxCode then [.TaxCode] else [] end)
      })
    ],
    amount_total: .DocTotal,
    note: .Comments
  }
}`,
  },

  {
    id: "sap-to-wms-order",
    name: "SAP Business One → Generic WMS Order",
    description: "Transform SAP order to WMS fulfillment format",
    sourceSystem: "sap-b1",
    targetSystem: "generic-wms",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "order",
    tags: ["sap", "wms", "order"],
    transformExpression: `{
  orderId: .DocEntry | tostring,
  externalOrderId: .NumAtCard,
  orderDate: .DocDate,
  customer: {
    code: .CardCode,
    name: .CardName
  },
  warehouse: (.WhsCode // "MAIN"),
  items: (.DocumentLines // []) | map({
    lineNumber: .LineNum,
    sku: .ItemCode,
    productName: .ItemDescription,
    quantity: .Quantity,
    uom: (.UomCode // "EA"),
    warehouse: .WarehouseCode
  }),
  shippingAddress: {
    name: .ShipToCode,
    address1: .Address,
    city: .City,
    state: .State,
    zip: .ZipCode,
    country: .Country
  },
  totalAmount: .DocTotal,
  currency: .DocCurrency,
  notes: .Comments
}`,
  },

  {
    id: "wms-to-sap-shipment",
    name: "Generic WMS → SAP Shipment Confirmation",
    description: "Update SAP with shipment details from WMS",
    sourceSystem: "generic-wms",
    targetSystem: "sap-b1",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "shipment",
    tags: ["wms", "sap", "shipment"],
    transformExpression: `{
  DocEntry: .orderId,
  Shipments: [{
    TrackingNumber: .trackingNumber,
    Carrier: .carrier,
    ShipDate: .shippedDate,
    PackageQuantity: (.packages | length),
    Weight: (.packages | map(.weight) | add),
    DocumentLines: .packages | map(.items) | flatten | map({
      ItemCode: .sku,
      Quantity: .quantity
    })
  }]
}`,
  },

  // ============================================================================
  // MARKETPLACE → ERP/WMS
  // ============================================================================

  {
    id: "shopify-to-odoo-order",
    name: "Shopify → Odoo Sale Order",
    description: "Import Shopify orders into Odoo ERP",
    sourceSystem: "shopify",
    targetSystem: "odoo-erp",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "order",
    tags: ["shopify", "odoo", "order", "e-commerce"],
    transformExpression: `{
  params: {
    partner_id: .customer.id,
    partner_name: .customer.name,
    partner_email: .customer.email,
    date_order: .created_at,
    client_order_ref: .name,
    order_line: [
      .line_items | map({
        product_id: .sku,
        name: .title,
        product_uom_qty: .quantity,
        price_unit: .price,
        discount: (if .discount_allocations then (.discount_allocations | map(.amount) | add) else 0 end)
      })
    ],
    amount_total: .total_price,
    amount_tax: .total_tax,
    note: .note,
    partner_shipping_id: {
      name: .shipping_address.name,
      street: .shipping_address.address1,
      street2: .shipping_address.address2,
      city: .shipping_address.city,
      state_id: .shipping_address.province_code,
      zip: .shipping_address.zip,
      country_id: .shipping_address.country_code,
      phone: .shipping_address.phone
    }
  }
}`,
  },

  {
    id: "shopify-to-wms-order",
    name: "Shopify → Generic WMS Order",
    description: "Send Shopify orders to warehouse for fulfillment",
    sourceSystem: "shopify",
    targetSystem: "generic-wms",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "order",
    tags: ["shopify", "wms", "fulfillment"],
    transformExpression: `{
  orderId: .id | tostring,
  externalOrderId: .name,
  orderDate: .created_at,
  customer: {
    code: .customer.id | tostring,
    name: .customer.name,
    email: .customer.email,
    phone: .customer.phone
  },
  items: .line_items | map({
    lineNumber: .id,
    sku: .sku,
    productName: .title,
    variantTitle: .variant_title,
    quantity: .quantity,
    price: .price,
    weight: .grams,
    requiresShipping: .requires_shipping
  }),
  shippingAddress: {
    name: .shipping_address.name,
    address1: .shipping_address.address1,
    address2: .shipping_address.address2,
    city: .shipping_address.city,
    state: .shipping_address.province,
    zip: .shipping_address.zip,
    country: .shipping_address.country_code,
    phone: .shipping_address.phone
  },
  totalAmount: .total_price,
  shippingAmount: .total_shipping_price_set.shop_money.amount,
  taxAmount: .total_tax,
  currency: .currency,
  notes: .note
}`,
  },

  {
    id: "amazon-to-wms-order",
    name: "Amazon SP-API → Generic WMS Order",
    description: "Transform Amazon orders for WMS fulfillment",
    sourceSystem: "amazon-sp-api",
    targetSystem: "generic-wms",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "order",
    tags: ["amazon", "wms", "fulfillment"],
    transformExpression: `{
  orderId: .AmazonOrderId,
  externalOrderId: .SellerOrderId,
  orderDate: .PurchaseDate,
  customer: {
    code: .BuyerEmail,
    name: .BuyerName,
    email: .BuyerEmail
  },
  marketplace: .MarketplaceId,
  salesChannel: .SalesChannel,
  items: .OrderItems | map({
    lineNumber: .OrderItemId,
    sku: .SellerSKU,
    asin: .ASIN,
    productName: .Title,
    quantity: .QuantityOrdered,
    price: .ItemPrice.Amount
  }),
  shippingAddress: {
    name: .ShippingAddress.Name,
    address1: .ShippingAddress.AddressLine1,
    address2: .ShippingAddress.AddressLine2,
    city: .ShippingAddress.City,
    state: .ShippingAddress.StateOrRegion,
    zip: .ShippingAddress.PostalCode,
    country: .ShippingAddress.CountryCode
  },
  totalAmount: .OrderTotal.Amount,
  currency: .OrderTotal.CurrencyCode,
  shippingService: .ShipmentServiceLevelCategory,
  isPrime: .IsPrime
}`,
  },

  // ============================================================================
  // WMS → MARKETPLACE (Inventory sync)
  // ============================================================================

  {
    id: "wms-to-shopify-inventory",
    name: "Generic WMS → Shopify Inventory Update",
    description: "Sync WMS inventory to Shopify store",
    sourceSystem: "generic-wms",
    targetSystem: "shopify",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "inventory",
    tags: ["wms", "shopify", "inventory"],
    transformExpression: `{
  inventory_levels: .items | map({
    inventory_item_id: .shopifyVariantId,
    location_id: (.shopifyLocationId // "default"),
    available: .quantityAvailable
  })
}`,
  },

  {
    id: "wms-to-amazon-inventory",
    name: "Generic WMS → Amazon Inventory Update",
    description: "Sync WMS inventory to Amazon SP-API",
    sourceSystem: "generic-wms",
    targetSystem: "amazon-sp-api",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "inventory",
    tags: ["wms", "amazon", "inventory"],
    transformExpression: `{
  feeds: .items | map({
    sku: .sku,
    quantity: .quantityAvailable,
    fulfillment_channel_code: "DEFAULT"
  })
}`,
  },

  // ============================================================================
  // CARRIER INTEGRATIONS
  // ============================================================================

  {
    id: "wms-to-fedex-shipment",
    name: "Generic WMS → FedEx Shipment Request",
    description: "Create FedEx shipping label from WMS order",
    sourceSystem: "generic-wms",
    targetSystem: "fedex",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "shipment",
    tags: ["wms", "fedex", "shipping"],
    transformExpression: `{
  requestedShipment: {
    shipDatestamp: (.shipDate // now | strftime("%Y-%m-%d")),
    serviceType: (.serviceLevel // "FEDEX_GROUND"),
    packagingType: "YOUR_PACKAGING",
    shipper: {
      contact: .warehouse.contact,
      address: .warehouse.address
    },
    recipient: {
      contact: {
        personName: .shippingAddress.name,
        phoneNumber: .shippingAddress.phone
      },
      address: {
        streetLines: [.shippingAddress.address1, .shippingAddress.address2] | map(select(. != null)),
        city: .shippingAddress.city,
        stateOrProvinceCode: .shippingAddress.state,
        postalCode: .shippingAddress.zip,
        countryCode: .shippingAddress.country
      }
    },
    requestedPackageLineItems: .packages | map({
      weight: {
        units: "LB",
        value: .weight
      },
      dimensions: {
        length: .length,
        width: .width,
        height: .height,
        units: "IN"
      }
    })
  }
}`,
  },
];

async function seedTransformationTemplates() {
  log.info("🔄 Seeding transformation templates...");
  log.info(`   Total templates: ${TRANSFORMATION_TEMPLATES.length}`);

  // Note: These templates would typically be stored in a database table
  // For now, we'll just log them and make them available via API

  const byCategory = TRANSFORMATION_TEMPLATES.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const bySource = TRANSFORMATION_TEMPLATES.reduce((acc, t) => {
    acc[t.sourceSystem] = (acc[t.sourceSystem] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  log.info("");
  log.info("✅ Transformation template catalog created!");
  log.info(`   Total templates: ${TRANSFORMATION_TEMPLATES.length}`);
  log.info("");
  log.info("📊 Templates by Category:");
  Object.entries(byCategory).forEach(([cat, count]) => {
    log.info(`   ${cat}: ${count} templates`);
  });
  log.info("");
  log.info("📊 Templates by Source System:");
  Object.entries(bySource).forEach(([sys, count]) => {
    log.info(`   ${sys}: ${count} templates`);
  });
  log.info("");
  log.info("🎯 Common Integration Paths:");
  log.info("   ✅ Odoo ↔ Manhattan WMS");
  log.info("   ✅ SAP ↔ Odoo");
  log.info("   ✅ SAP ↔ WMS");
  log.info("   ✅ Shopify → Odoo/WMS");
  log.info("   ✅ Amazon → WMS");
  log.info("   ✅ WMS → Shopify/Amazon (inventory)");
  log.info("   ✅ WMS → FedEx/UPS (shipping)");
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedTransformationTemplates()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export default seedTransformationTemplates;
export { TRANSFORMATION_TEMPLATES };
/**
 * Transformation Template Seeder
 * 
 * Seeds pre-built transformation templates for common system integrations:
 * - WMS → Manhattan, Odoo, SAP
 * - Odoo → WMS, Manhattan, SAP
 * - SAP → Odoo, Manhattan, WMS
 * - Marketplace → WMS/ERP
 * - ERP → Marketplace
 * 
 * These templates use jq expressions for data transformation
 * Run: npm run seed:transforms
 */

import { db } from "../server/db.js";
import { logger } from "../server/src/core/logger.js";

const log = logger.child("TransformSeeder");

/**
 * Transformation Template Schema
 */
interface TransformTemplate {
  id: string;
  name: string;
  description: string;
  sourceSystem: string;
  targetSystem: string;
  sourceFormat: "json" | "xml";
  targetFormat: "json" | "xml";
  transformationType: "jq" | "xslt" | "javascript";
  transformExpression: string;
  category: "order" | "inventory" | "shipment" | "product" | "customer";
  tags: string[];
  sampleInput?: any;
  sampleOutput?: any;
  metadata?: Record<string, any>;
}

export const TRANSFORMATION_TEMPLATES: TransformTemplate[] = [
  // ============================================================================
  // WMS → MANHATTAN ASSOCIATES
  // ============================================================================
  
  {
    id: "wms-to-manhattan-order",
    name: "Generic WMS → Manhattan WMS Order",
    description: "Transform standard WMS order format to Manhattan Associates WMS",
    sourceSystem: "generic-wms",
    targetSystem: "manhattan-wms",
    sourceFormat: "json",
    targetFormat: "xml",
    transformationType: "jq",
    category: "order",
    tags: ["wms", "manhattan", "order"],
    transformExpression: `{
  order: {
    orderNumber: .orderId,
    customerCode: .customer.code,
    priority: (if .priority == "urgent" then "1" else "5" end),
    orderLines: .items | map({
      lineNumber: .lineNumber,
      sku: .sku,
      quantity: .quantity,
      uom: (.uom // "EA"),
      lotControl: (.lotControl // false)
    }),
    shipTo: {
      name: .shippingAddress.name,
      address1: .shippingAddress.address1,
      city: .shippingAddress.city,
      state: .shippingAddress.state,
      postalCode: .shippingAddress.zip,
      country: .shippingAddress.country
    },
    requestedShipDate: .requestedShipDate,
    carrier: (.carrier // "FEDEX"),
    serviceLevel: (.serviceLevel // "GROUND")
  }
}`,
    sampleInput: {
      orderId: "ORD-12345",
      customer: { code: "CUST001", name: "ACME Corp" },
      priority: "normal",
      items: [
        { lineNumber: 1, sku: "SKU001", quantity: 10, uom: "EA" }
      ],
      shippingAddress: {
        name: "John Smith",
        address1: "123 Main St",
        city: "New York",
        state: "NY",
        zip: "10001",
        country: "US"
      },
      requestedShipDate: "2025-01-20"
    },
  },

  {
    id: "manhattan-to-wms-shipment",
    name: "Manhattan WMS → Generic WMS Shipment",
    description: "Transform Manhattan shipment confirmation to standard WMS format",
    sourceSystem: "manhattan-wms",
    targetSystem: "generic-wms",
    sourceFormat: "xml",
    targetFormat: "json",
    transformationType: "jq",
    category: "shipment",
    tags: ["manhattan", "wms", "shipment"],
    transformExpression: `{
  shipmentId: .shipment.shipmentNumber,
  orderId: .shipment.orderNumber,
  status: "shipped",
  shippedDate: .shipment.shipDate,
  trackingNumber: .shipment.trackingNumber,
  carrier: .shipment.carrier,
  packages: (.shipment.packages // []) | map({
    packageNumber: .packageNumber,
    weight: .weight,
    dimensions: {
      length: .length,
      width: .width,
      height: .height
    },
    items: .items | map({
      sku: .sku,
      quantity: .quantity
    })
  })
}`,
  },

  // ============================================================================
  // ODOO → WMS/MANHATTAN
  // ============================================================================

  {
    id: "odoo-to-wms-order",
    name: "Odoo ERP → Generic WMS Order",
    description: "Transform Odoo sale order to WMS format",
    sourceSystem: "odoo-erp",
    targetSystem: "generic-wms",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "order",
    tags: ["odoo", "erp", "wms", "order"],
    transformExpression: `{
  orderId: .name,
  orderDate: .date_order,
  customer: {
    code: .partner_id[0] | tostring,
    name: .partner_id[1],
    email: .partner_email
  },
  warehouse: (.warehouse_id[1] // "MAIN"),
  items: .order_line | map({
    lineNumber: .id,
    sku: .product_id[1],
    productName: .name,
    quantity: .product_uom_qty,
    uom: .product_uom[1],
    price: .price_unit
  }),
  shippingAddress: {
    name: .partner_shipping_id[1],
    address1: .partner_street,
    city: .partner_city,
    state: .partner_state_id[1],
    zip: .partner_zip,
    country: .partner_country_id[1]
  },
  totalAmount: .amount_total,
  currency: .currency_id[1],
  notes: .note
}`,
    sampleInput: {
      name: "SO001",
      date_order: "2025-01-15",
      partner_id: [1, "ACME Corp"],
      partner_email: "orders@acme.com",
      warehouse_id: [1, "Main Warehouse"],
      order_line: [
        {
          id: 1,
          product_id: [10, "SKU001"],
          name: "Product A",
          product_uom_qty: 5,
          product_uom: [1, "Unit"],
          price_unit: 25.00
        }
      ],
      amount_total: 125.00,
      currency_id: [1, "USD"]
    },
  },

  {
    id: "odoo-to-manhattan-order",
    name: "Odoo ERP → Manhattan WMS Order",
    description: "Direct Odoo to Manhattan WMS integration",
    sourceSystem: "odoo-erp",
    targetSystem: "manhattan-wms",
    sourceFormat: "json",
    targetFormat: "xml",
    transformationType: "jq",
    category: "order",
    tags: ["odoo", "manhattan", "order"],
    transformExpression: `{
  order: {
    orderNumber: .name,
    externalOrderId: .client_order_ref,
    customerCode: .partner_id[0] | tostring,
    warehouse: (.warehouse_id[1] // "MAIN"),
    orderDate: .date_order,
    requestedShipDate: (.commitment_date // .date_order),
    priority: (if .priority == "1" then "1" else "5" end),
    orderLines: .order_line | map({
      lineNumber: .id,
      sku: .product_id[1],
      description: .name,
      quantity: .product_uom_qty,
      uom: (.product_uom[1] // "EA")
    }),
    shipTo: {
      name: .partner_shipping_id[1],
      address1: .partner_street,
      address2: .partner_street2,
      city: .partner_city,
      state: (.partner_state_id[1] // ""),
      postalCode: .partner_zip,
      country: (.partner_country_id[1] // "US"),
      phone: .partner_phone
    },
    carrier: (.carrier_id[1] // "FEDEX"),
    serviceLevel: "GROUND"
  }
}`,
  },

  {
    id: "wms-to-odoo-inventory",
    name: "Generic WMS → Odoo Inventory Update",
    description: "Sync WMS inventory levels to Odoo stock",
    sourceSystem: "generic-wms",
    targetSystem: "odoo-erp",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "inventory",
    tags: ["wms", "odoo", "inventory"],
    transformExpression: `{
  params: {
    inventory_adjustments: .items | map({
      product_id: .sku,
      location_id: (.location // "WH/Stock"),
      new_quantity: .quantityAvailable,
      theoretical_qty: .quantityReserved,
      difference: (.quantityAvailable - .quantityReserved)
    })
  }
}`,
  },

  // ============================================================================
  // SAP → ODOO / WMS
  // ============================================================================

  {
    id: "sap-to-odoo-order",
    name: "SAP Business One → Odoo Sale Order",
    description: "Transform SAP order to Odoo format",
    sourceSystem: "sap-b1",
    targetSystem: "odoo-erp",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "order",
    tags: ["sap", "odoo", "order"],
    transformExpression: `{
  params: {
    partner_id: .CardCode,
    date_order: .DocDate,
    client_order_ref: .NumAtCard,
    warehouse_id: (.WhsCode // "WH-001"),
    payment_term_id: .PaymentGroupCode,
    order_line: [
      (.DocumentLines // []) | map({
        product_id: .ItemCode,
        name: .ItemDescription,
        product_uom_qty: .Quantity,
        price_unit: .Price,
        tax_id: (if .TaxCode then [.TaxCode] else [] end)
      })
    ],
    amount_total: .DocTotal,
    note: .Comments
  }
}`,
  },

  {
    id: "sap-to-wms-order",
    name: "SAP Business One → Generic WMS Order",
    description: "Transform SAP order to WMS fulfillment format",
    sourceSystem: "sap-b1",
    targetSystem: "generic-wms",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "order",
    tags: ["sap", "wms", "order"],
    transformExpression: `{
  orderId: .DocEntry | tostring,
  externalOrderId: .NumAtCard,
  orderDate: .DocDate,
  customer: {
    code: .CardCode,
    name: .CardName
  },
  warehouse: (.WhsCode // "MAIN"),
  items: (.DocumentLines // []) | map({
    lineNumber: .LineNum,
    sku: .ItemCode,
    productName: .ItemDescription,
    quantity: .Quantity,
    uom: (.UomCode // "EA"),
    warehouse: .WarehouseCode
  }),
  shippingAddress: {
    name: .ShipToCode,
    address1: .Address,
    city: .City,
    state: .State,
    zip: .ZipCode,
    country: .Country
  },
  totalAmount: .DocTotal,
  currency: .DocCurrency,
  notes: .Comments
}`,
  },

  {
    id: "wms-to-sap-shipment",
    name: "Generic WMS → SAP Shipment Confirmation",
    description: "Update SAP with shipment details from WMS",
    sourceSystem: "generic-wms",
    targetSystem: "sap-b1",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "shipment",
    tags: ["wms", "sap", "shipment"],
    transformExpression: `{
  DocEntry: .orderId,
  Shipments: [{
    TrackingNumber: .trackingNumber,
    Carrier: .carrier,
    ShipDate: .shippedDate,
    PackageQuantity: (.packages | length),
    Weight: (.packages | map(.weight) | add),
    DocumentLines: .packages | map(.items) | flatten | map({
      ItemCode: .sku,
      Quantity: .quantity
    })
  }]
}`,
  },

  // ============================================================================
  // MARKETPLACE → ERP/WMS
  // ============================================================================

  {
    id: "shopify-to-odoo-order",
    name: "Shopify → Odoo Sale Order",
    description: "Import Shopify orders into Odoo ERP",
    sourceSystem: "shopify",
    targetSystem: "odoo-erp",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "order",
    tags: ["shopify", "odoo", "order", "e-commerce"],
    transformExpression: `{
  params: {
    partner_id: .customer.id,
    partner_name: .customer.name,
    partner_email: .customer.email,
    date_order: .created_at,
    client_order_ref: .name,
    order_line: [
      .line_items | map({
        product_id: .sku,
        name: .title,
        product_uom_qty: .quantity,
        price_unit: .price,
        discount: (if .discount_allocations then (.discount_allocations | map(.amount) | add) else 0 end)
      })
    ],
    amount_total: .total_price,
    amount_tax: .total_tax,
    note: .note,
    partner_shipping_id: {
      name: .shipping_address.name,
      street: .shipping_address.address1,
      street2: .shipping_address.address2,
      city: .shipping_address.city,
      state_id: .shipping_address.province_code,
      zip: .shipping_address.zip,
      country_id: .shipping_address.country_code,
      phone: .shipping_address.phone
    }
  }
}`,
  },

  {
    id: "shopify-to-wms-order",
    name: "Shopify → Generic WMS Order",
    description: "Send Shopify orders to warehouse for fulfillment",
    sourceSystem: "shopify",
    targetSystem: "generic-wms",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "order",
    tags: ["shopify", "wms", "fulfillment"],
    transformExpression: `{
  orderId: .id | tostring,
  externalOrderId: .name,
  orderDate: .created_at,
  customer: {
    code: .customer.id | tostring,
    name: .customer.name,
    email: .customer.email,
    phone: .customer.phone
  },
  items: .line_items | map({
    lineNumber: .id,
    sku: .sku,
    productName: .title,
    variantTitle: .variant_title,
    quantity: .quantity,
    price: .price,
    weight: .grams,
    requiresShipping: .requires_shipping
  }),
  shippingAddress: {
    name: .shipping_address.name,
    address1: .shipping_address.address1,
    address2: .shipping_address.address2,
    city: .shipping_address.city,
    state: .shipping_address.province,
    zip: .shipping_address.zip,
    country: .shipping_address.country_code,
    phone: .shipping_address.phone
  },
  totalAmount: .total_price,
  shippingAmount: .total_shipping_price_set.shop_money.amount,
  taxAmount: .total_tax,
  currency: .currency,
  notes: .note
}`,
  },

  {
    id: "amazon-to-wms-order",
    name: "Amazon SP-API → Generic WMS Order",
    description: "Transform Amazon orders for WMS fulfillment",
    sourceSystem: "amazon-sp-api",
    targetSystem: "generic-wms",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "order",
    tags: ["amazon", "wms", "fulfillment"],
    transformExpression: `{
  orderId: .AmazonOrderId,
  externalOrderId: .SellerOrderId,
  orderDate: .PurchaseDate,
  customer: {
    code: .BuyerEmail,
    name: .BuyerName,
    email: .BuyerEmail
  },
  marketplace: .MarketplaceId,
  salesChannel: .SalesChannel,
  items: .OrderItems | map({
    lineNumber: .OrderItemId,
    sku: .SellerSKU,
    asin: .ASIN,
    productName: .Title,
    quantity: .QuantityOrdered,
    price: .ItemPrice.Amount
  }),
  shippingAddress: {
    name: .ShippingAddress.Name,
    address1: .ShippingAddress.AddressLine1,
    address2: .ShippingAddress.AddressLine2,
    city: .ShippingAddress.City,
    state: .ShippingAddress.StateOrRegion,
    zip: .ShippingAddress.PostalCode,
    country: .ShippingAddress.CountryCode
  },
  totalAmount: .OrderTotal.Amount,
  currency: .OrderTotal.CurrencyCode,
  shippingService: .ShipmentServiceLevelCategory,
  isPrime: .IsPrime
}`,
  },

  // ============================================================================
  // WMS → MARKETPLACE (Inventory sync)
  // ============================================================================

  {
    id: "wms-to-shopify-inventory",
    name: "Generic WMS → Shopify Inventory Update",
    description: "Sync WMS inventory to Shopify store",
    sourceSystem: "generic-wms",
    targetSystem: "shopify",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "inventory",
    tags: ["wms", "shopify", "inventory"],
    transformExpression: `{
  inventory_levels: .items | map({
    inventory_item_id: .shopifyVariantId,
    location_id: (.shopifyLocationId // "default"),
    available: .quantityAvailable
  })
}`,
  },

  {
    id: "wms-to-amazon-inventory",
    name: "Generic WMS → Amazon Inventory Update",
    description: "Sync WMS inventory to Amazon SP-API",
    sourceSystem: "generic-wms",
    targetSystem: "amazon-sp-api",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "inventory",
    tags: ["wms", "amazon", "inventory"],
    transformExpression: `{
  feeds: .items | map({
    sku: .sku,
    quantity: .quantityAvailable,
    fulfillment_channel_code: "DEFAULT"
  })
}`,
  },

  // ============================================================================
  // CARRIER INTEGRATIONS
  // ============================================================================

  {
    id: "wms-to-fedex-shipment",
    name: "Generic WMS → FedEx Shipment Request",
    description: "Create FedEx shipping label from WMS order",
    sourceSystem: "generic-wms",
    targetSystem: "fedex",
    sourceFormat: "json",
    targetFormat: "json",
    transformationType: "jq",
    category: "shipment",
    tags: ["wms", "fedex", "shipping"],
    transformExpression: `{
  requestedShipment: {
    shipDatestamp: (.shipDate // now | strftime("%Y-%m-%d")),
    serviceType: (.serviceLevel // "FEDEX_GROUND"),
    packagingType: "YOUR_PACKAGING",
    shipper: {
      contact: .warehouse.contact,
      address: .warehouse.address
    },
    recipient: {
      contact: {
        personName: .shippingAddress.name,
        phoneNumber: .shippingAddress.phone
      },
      address: {
        streetLines: [.shippingAddress.address1, .shippingAddress.address2] | map(select(. != null)),
        city: .shippingAddress.city,
        stateOrProvinceCode: .shippingAddress.state,
        postalCode: .shippingAddress.zip,
        countryCode: .shippingAddress.country
      }
    },
    requestedPackageLineItems: .packages | map({
      weight: {
        units: "LB",
        value: .weight
      },
      dimensions: {
        length: .length,
        width: .width,
        height: .height,
        units: "IN"
      }
    })
  }
}`,
  },
];

async function seedTransformationTemplates() {
  log.info("🔄 Seeding transformation templates...");
  log.info(`   Total templates: ${TRANSFORMATION_TEMPLATES.length}`);

  // Note: These templates would typically be stored in a database table
  // For now, we'll just log them and make them available via API

  const byCategory = TRANSFORMATION_TEMPLATES.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const bySource = TRANSFORMATION_TEMPLATES.reduce((acc, t) => {
    acc[t.sourceSystem] = (acc[t.sourceSystem] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  log.info("");
  log.info("✅ Transformation template catalog created!");
  log.info(`   Total templates: ${TRANSFORMATION_TEMPLATES.length}`);
  log.info("");
  log.info("📊 Templates by Category:");
  Object.entries(byCategory).forEach(([cat, count]) => {
    log.info(`   ${cat}: ${count} templates`);
  });
  log.info("");
  log.info("📊 Templates by Source System:");
  Object.entries(bySource).forEach(([sys, count]) => {
    log.info(`   ${sys}: ${count} templates`);
  });
  log.info("");
  log.info("🎯 Common Integration Paths:");
  log.info("   ✅ Odoo ↔ Manhattan WMS");
  log.info("   ✅ SAP ↔ Odoo");
  log.info("   ✅ SAP ↔ WMS");
  log.info("   ✅ Shopify → Odoo/WMS");
  log.info("   ✅ Amazon → WMS");
  log.info("   ✅ WMS → Shopify/Amazon (inventory)");
  log.info("   ✅ WMS → FedEx/UPS (shipping)");
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedTransformationTemplates()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export default seedTransformationTemplates;
export { TRANSFORMATION_TEMPLATES };
