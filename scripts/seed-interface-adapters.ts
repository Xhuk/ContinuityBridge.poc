/**
 * Interface Adapter Seeder
 * 
 * Seeds production-ready interface adapters for:
 * - E-commerce Marketplaces (Shopify, Amazon, MercadoLibre, eBay, etc.)
 * - ERPs (SAP, Oracle, Odoo, NetSuite, etc.)
 * - WMS/3PL (Manhattan, JDA, ShipBob, ShipStation, etc.)
 * - TMS/Last Mile (FedEx, UPS, DHL, local carriers)
 * - Custom systems (conveyor belts, IoT devices, etc.)
 * 
 * Run: npm run seed:adapters
 */

import { db } from "../server/db.js";
import { logger } from "../server/src/core/logger.js";
import type { InsertInterfaceConfig } from "../shared/schema.js";

const log = logger.child("AdapterSeeder");

export const INTERFACE_ADAPTERS: InsertInterfaceConfig[] = [
  // ============================================================================
  // E-COMMERCE MARKETPLACES
  // ============================================================================
  
  {
    name: "Shopify Store API",
    description: "Connect to Shopify stores for order, inventory, and product management",
    type: "marketplace",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{shop_domain}}/admin/api/2024-01",
    authType: "api_key",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["marketplace", "e-commerce", "shopify"],
    metadata: {
      isDemo: false,
      endpoints: {
        getOrders: "/orders.json",
        createOrder: "/orders.json",
        updateInventory: "/inventory_levels/set.json",
        getProducts: "/products.json",
      },
    },
  },

  {
    name: "Amazon SP-API (Selling Partner)",
    description: "Amazon Seller Central API for orders, inventory, and fulfillment",
    type: "marketplace",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://sellingpartnerapi-na.amazon.com",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://api.amazon.com/auth/o2/token",
      grantType: "refresh_token",
      scope: "sellingpartnerapi::migration",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 2000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["marketplace", "amazon", "sp-api"],
    metadata: {
      regions: ["NA", "EU", "FE"],
      endpoints: {
        getOrders: "/orders/v0/orders",
        getOrderItems: "/orders/v0/orders/{orderId}/orderItems",
        updateInventory: "/fba/inventory/v1/summaries",
      },
    },
  },

  {
    name: "MercadoLibre API",
    description: "Latin America's largest e-commerce marketplace",
    type: "marketplace",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://api.mercadolibre.com",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://api.mercadolibre.com/oauth/token",
      grantType: "refresh_token",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["marketplace", "latin-america", "mercadolibre"],
    metadata: {
      countries: ["AR", "BR", "MX", "CO", "CL"],
      endpoints: {
        getOrders: "/orders/search",
        getOrder: "/orders/{id}",
        shipOrder: "/shipments/{id}",
      },
    },
  },

  {
    name: "eBay Trading API",
    description: "eBay marketplace integration for listings and orders",
    type: "marketplace",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://api.ebay.com/ws/api.dll",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://api.ebay.com/identity/v1/oauth2/token",
      grantType: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json", "xml"],
    defaultFormat: "json",
    enabled: true,
    tags: ["marketplace", "ebay"],
    metadata: {
      apiVersion: "1355",
    },
  },

  {
    name: "Walmart Marketplace API",
    description: "Walmart marketplace seller integration",
    type: "marketplace",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://marketplace.walmartapis.com/v3",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "WM_SVC.NAME": "Walmart Marketplace",
        "WM_QOS.CORRELATION_ID": "{{correlation_id}}",
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json", "xml"],
    defaultFormat: "json",
    enabled: true,
    tags: ["marketplace", "walmart"],
  },

  // ============================================================================
  // ERP SYSTEMS
  // ============================================================================

  {
    name: "SAP Business One Service Layer",
    description: "SAP B1 RESTful API for ERP integration",
    type: "erp",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{sap_host}}:50000/b1s/v1",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 60000,
      retryAttempts: 2,
      retryDelay: 2000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["erp", "sap", "b1"],
    metadata: {
      endpoints: {
        login: "/Login",
        orders: "/Orders",
        items: "/Items",
        businessPartners: "/BusinessPartners",
      },
    },
  },

  {
    name: "Oracle NetSuite REST API",
    description: "Oracle NetSuite ERP cloud integration",
    type: "erp",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{account_id}}.suitetalk.api.netsuite.com/services/rest",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://{{account_id}}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token",
      grantType: "client_credentials",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 60000,
      retryAttempts: 3,
      retryDelay: 2000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["erp", "oracle", "netsuite"],
  },

  {
    name: "Odoo ERP API",
    description: "Open-source Odoo ERP integration via XML-RPC",
    type: "erp",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{odoo_host}}/xmlrpc/2",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["xml"],
    defaultFormat: "xml",
    enabled: true,
    tags: ["erp", "odoo", "open-source"],
    metadata: {
      modules: ["sale", "purchase", "stock", "account"],
    },
  },

  {
    name: "Microsoft Dynamics 365 Web API",
    description: "Microsoft Dynamics 365 Business Central/Finance",
    type: "erp",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{tenant}}.api.businesscentral.dynamics.com/v2.0/{{environment}}/api/v2.0",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://login.microsoftonline.com/{{tenant_id}}/oauth2/v2.0/token",
      grantType: "client_credentials",
      scope: "https://api.businesscentral.dynamics.com/.default",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 60000,
      retryAttempts: 3,
      retryDelay: 2000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["erp", "microsoft", "dynamics365"],
  },

  // ============================================================================
  // WMS / 3PL SYSTEMS
  // ============================================================================

  {
    name: "Manhattan WMS API",
    description: "Manhattan Associates Warehouse Management System",
    type: "wms",
    direction: "bidirectional",
    protocol: "soap",
    endpoint: "https://{{wms_host}}/service/soap",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "SOAPAction": "{{action}}",
      },
      timeout: 60000,
      retryAttempts: 2,
      retryDelay: 3000,
    },
    formats: ["xml"],
    defaultFormat: "xml",
    enabled: true,
    tags: ["wms", "manhattan", "warehouse"],
  },

  {
    name: "Blue Yonder (JDA) WMS",
    description: "Blue Yonder Warehouse Management System (formerly JDA)",
    type: "wms",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{by_host}}/api/wms",
    authType: "bearer_token",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 60000,
      retryAttempts: 3,
      retryDelay: 2000,
    },
    formats: ["json", "xml"],
    defaultFormat: "json",
    enabled: true,
    tags: ["wms", "blue-yonder", "jda"],
  },

  {
    name: "ShipBob API",
    description: "ShipBob 3PL fulfillment platform",
    type: "3pl",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://api.shipbob.com/1.0",
    authType: "bearer_token",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["3pl", "fulfillment", "shipbob"],
    metadata: {
      endpoints: {
        getInventory: "/inventory",
        createOrder: "/order",
        getShipments: "/shipment",
      },
    },
  },

  {
    name: "ShipStation API",
    description: "ShipStation shipping and fulfillment platform",
    type: "3pl",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://ssapi.shipstation.com",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["3pl", "shipping", "shipstation"],
    metadata: {
      rateLimit: "40 requests per minute",
    },
  },

  {
    name: "Fulfillment by Amazon (FBA)",
    description: "Amazon FBA inventory and fulfillment",
    type: "3pl",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://sellingpartnerapi-na.amazon.com/fba",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://api.amazon.com/auth/o2/token",
      grantType: "refresh_token",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 2000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["3pl", "amazon", "fba"],
  },

  // ============================================================================
  // LAST MILE / CARRIERS
  // ============================================================================

  {
    name: "FedEx Web Services",
    description: "FedEx shipping and tracking API",
    type: "lastmile",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://apis.fedex.com",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://apis.fedex.com/oauth/token",
      grantType: "client_credentials",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["carrier", "shipping", "fedex"],
    metadata: {
      services: ["ground", "express", "freight"],
    },
  },

  {
    name: "UPS API",
    description: "UPS shipping, tracking, and rate calculation",
    type: "lastmile",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://onlinetools.ups.com/api",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://onlinetools.ups.com/security/v1/oauth/token",
      grantType: "client_credentials",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["carrier", "shipping", "ups"],
  },

  {
    name: "DHL Express API",
    description: "DHL international shipping and tracking",
    type: "lastmile",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://express.api.dhl.com/mydhlapi",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["carrier", "international", "dhl"],
  },

  {
    name: "USPS Web Tools",
    description: "United States Postal Service API",
    type: "lastmile",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://secure.shippingapis.com/ShippingAPI.dll",
    authType: "api_key",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["xml"],
    defaultFormat: "xml",
    enabled: true,
    tags: ["carrier", "usps", "usa"],
  },

  // ============================================================================
  // CUSTOMS / COMPLIANCE
  // ============================================================================

  {
    name: "Customs Border Protection ACE",
    description: "US Customs Automated Commercial Environment",
    type: "custom",
    direction: "bidirectional",
    protocol: "sftp",
    host: "{{ace_host}}",
    port: 22,
    path: "/incoming",
    authType: "ssh_key",
    formats: ["xml", "edi"],
    defaultFormat: "xml",
    enabled: true,
    tags: ["customs", "compliance", "usa"],
    metadata: {
      regulations: ["AMS", "ISF", "ACE"],
    },
  },

  {
    name: "Descartes CustomsInfo",
    description: "Global customs clearance and compliance",
    type: "custom",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://api.customsinfo.com/v1",
    authType: "api_key",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 60000,
      retryAttempts: 3,
      retryDelay: 2000,
    },
    formats: ["json", "xml"],
    defaultFormat: "json",
    enabled: true,
    tags: ["customs", "compliance", "global"],
  },

  // ============================================================================
  // AUTOMATION / IoT / CONVEYORS
  // ============================================================================

  {
    name: "Honeywell Intelligrated WCS",
    description: "Warehouse Control System for conveyors and automation",
    type: "custom",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{wcs_host}}/api",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["automation", "wcs", "conveyor"],
    metadata: {
      equipment: ["sorters", "conveyors", "asrs"],
    },
  },

  {
    name: "Zebra Printer ZPL",
    description: "Zebra label printer direct integration",
    type: "custom",
    direction: "outbound",
    protocol: "rest_api",
    endpoint: "http://{{printer_ip}}:9100",
    authType: "none",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      timeout: 10000,
      retryAttempts: 2,
      retryDelay: 500,
    },
    formats: ["xml"],
    defaultFormat: "xml",
    enabled: true,
    tags: ["printer", "labels", "zebra"],
    metadata: {
      language: "ZPL",
    },
  },

  {
    name: "Generic MQTT Broker",
    description: "IoT device integration via MQTT protocol",
    type: "custom",
    direction: "bidirectional",
    protocol: "message_queue",
    endpoint: "mqtt://{{broker_host}}:1883",
    authType: "basic_auth",
    messageQueueConfig: {
      topic: "warehouse/sensors",
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["iot", "mqtt", "sensors"],
  },

  {
    name: "OPC UA Server",
    description: "Industrial automation OPC UA integration",
    type: "custom",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "opc.tcp://{{opc_host}}:4840",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["industrial", "opc-ua", "automation"],
  },

  // ============================================================================
  // DATABASES (for legacy systems)
  // ============================================================================

  {
    name: "PostgreSQL Database",
    description: "Direct PostgreSQL database connection",
    type: "custom",
    direction: "bidirectional",
    protocol: "database",
    host: "{{db_host}}",
    port: 5432,
    path: "/{{database_name}}",
    authType: "basic_auth",
    databaseConfig: {
      databaseType: "postgresql",
      schema: "public",
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["database", "postgresql"],
  },

  {
    name: "MySQL Database",
    description: "Direct MySQL/MariaDB database connection",
    type: "custom",
    direction: "bidirectional",
    protocol: "database",
    host: "{{db_host}}",
    port: 3306,
    path: "/{{database_name}}",
    authType: "basic_auth",
    databaseConfig: {
      databaseType: "mysql",
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["database", "mysql"],
  },

  {
    name: "Microsoft SQL Server",
    description: "Direct MS SQL Server database connection",
    type: "custom",
    direction: "bidirectional",
    protocol: "database",
    host: "{{db_host}}",
    port: 1433,
    path: "/{{database_name}}",
    authType: "basic_auth",
    databaseConfig: {
      databaseType: "sqlserver",
      schema: "dbo",
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["database", "mssql"],
  },

  {
    name: "Oracle Database",
    description: "Direct Oracle database connection",
    type: "custom",
    direction: "bidirectional",
    protocol: "database",
    host: "{{db_host}}",
    port: 1521,
    path: "/{{sid}}",
    authType: "basic_auth",
    databaseConfig: {
      databaseType: "oracle",
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["database", "oracle"],
  },
];

async function seedInterfaceAdapters() {
  log.info("🔌 Seeding interface adapters...");
  log.info(`   Total adapters: ${INTERFACE_ADAPTERS.length}`);

  const { interfaceManager } = await import("../server/src/interfaces/manager.js");

  let created = 0;
  let skipped = 0;

  for (const adapter of INTERFACE_ADAPTERS) {
    try {
      // Check if already exists
      const existing = interfaceManager.getInterfaces().find((i) => i.name === adapter.name);

      if (existing) {
        log.info(`⏭️  Skipping: ${adapter.name} (already exists)`);
        skipped++;
        continue;
      }

      // Create adapter (without secrets - those are set per-instance)
      interfaceManager.addInterface(adapter as any);
      log.info(`✅ Created: ${adapter.name} [${adapter.type}/${adapter.protocol}]`);
      created++;
    } catch (error: any) {
      log.error(`❌ Failed to create ${adapter.name}:`, error.message);
    }
  }

  log.info("");
  log.info("✅ Interface adapter seeding complete!");
  log.info(`   Created: ${created}`);
  log.info(`   Skipped: ${skipped}`);
  log.info("");
  log.info("📊 Adapters by Category:");
  
  const byCategory = INTERFACE_ADAPTERS.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(byCategory).forEach(([category, count]) => {
    log.info(`   ${category}: ${count} adapters`);
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedInterfaceAdapters()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export default seedInterfaceAdapters;
/**
 * Interface Adapter Seeder
 * 
 * Seeds production-ready interface adapters for:
 * - E-commerce Marketplaces (Shopify, Amazon, MercadoLibre, eBay, etc.)
 * - ERPs (SAP, Oracle, Odoo, NetSuite, etc.)
 * - WMS/3PL (Manhattan, JDA, ShipBob, ShipStation, etc.)
 * - TMS/Last Mile (FedEx, UPS, DHL, local carriers)
 * - Custom systems (conveyor belts, IoT devices, etc.)
 * 
 * Run: npm run seed:adapters
 */

import { db } from "../server/db.js";
import { logger } from "../server/src/core/logger.js";
import type { InsertInterfaceConfig } from "../shared/schema.js";

const log = logger.child("AdapterSeeder");

export const INTERFACE_ADAPTERS: InsertInterfaceConfig[] = [
  // ============================================================================
  // E-COMMERCE MARKETPLACES
  // ============================================================================
  
  {
    name: "Shopify Store API",
    description: "Connect to Shopify stores for order, inventory, and product management",
    type: "marketplace",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{shop_domain}}/admin/api/2024-01",
    authType: "api_key",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["marketplace", "e-commerce", "shopify"],
    metadata: {
      isDemo: false,
      endpoints: {
        getOrders: "/orders.json",
        createOrder: "/orders.json",
        updateInventory: "/inventory_levels/set.json",
        getProducts: "/products.json",
      },
    },
  },

  {
    name: "Amazon SP-API (Selling Partner)",
    description: "Amazon Seller Central API for orders, inventory, and fulfillment",
    type: "marketplace",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://sellingpartnerapi-na.amazon.com",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://api.amazon.com/auth/o2/token",
      grantType: "refresh_token",
      scope: "sellingpartnerapi::migration",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 2000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["marketplace", "amazon", "sp-api"],
    metadata: {
      regions: ["NA", "EU", "FE"],
      endpoints: {
        getOrders: "/orders/v0/orders",
        getOrderItems: "/orders/v0/orders/{orderId}/orderItems",
        updateInventory: "/fba/inventory/v1/summaries",
      },
    },
  },

  {
    name: "MercadoLibre API",
    description: "Latin America's largest e-commerce marketplace",
    type: "marketplace",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://api.mercadolibre.com",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://api.mercadolibre.com/oauth/token",
      grantType: "refresh_token",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["marketplace", "latin-america", "mercadolibre"],
    metadata: {
      countries: ["AR", "BR", "MX", "CO", "CL"],
      endpoints: {
        getOrders: "/orders/search",
        getOrder: "/orders/{id}",
        shipOrder: "/shipments/{id}",
      },
    },
  },

  {
    name: "eBay Trading API",
    description: "eBay marketplace integration for listings and orders",
    type: "marketplace",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://api.ebay.com/ws/api.dll",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://api.ebay.com/identity/v1/oauth2/token",
      grantType: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json", "xml"],
    defaultFormat: "json",
    enabled: true,
    tags: ["marketplace", "ebay"],
    metadata: {
      apiVersion: "1355",
    },
  },

  {
    name: "Walmart Marketplace API",
    description: "Walmart marketplace seller integration",
    type: "marketplace",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://marketplace.walmartapis.com/v3",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "WM_SVC.NAME": "Walmart Marketplace",
        "WM_QOS.CORRELATION_ID": "{{correlation_id}}",
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json", "xml"],
    defaultFormat: "json",
    enabled: true,
    tags: ["marketplace", "walmart"],
  },

  // ============================================================================
  // ERP SYSTEMS
  // ============================================================================

  {
    name: "SAP Business One Service Layer",
    description: "SAP B1 RESTful API for ERP integration",
    type: "erp",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{sap_host}}:50000/b1s/v1",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 60000,
      retryAttempts: 2,
      retryDelay: 2000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["erp", "sap", "b1"],
    metadata: {
      endpoints: {
        login: "/Login",
        orders: "/Orders",
        items: "/Items",
        businessPartners: "/BusinessPartners",
      },
    },
  },

  {
    name: "Oracle NetSuite REST API",
    description: "Oracle NetSuite ERP cloud integration",
    type: "erp",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{account_id}}.suitetalk.api.netsuite.com/services/rest",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://{{account_id}}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token",
      grantType: "client_credentials",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 60000,
      retryAttempts: 3,
      retryDelay: 2000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["erp", "oracle", "netsuite"],
  },

  {
    name: "Odoo ERP API",
    description: "Open-source Odoo ERP integration via XML-RPC",
    type: "erp",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{odoo_host}}/xmlrpc/2",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["xml"],
    defaultFormat: "xml",
    enabled: true,
    tags: ["erp", "odoo", "open-source"],
    metadata: {
      modules: ["sale", "purchase", "stock", "account"],
    },
  },

  {
    name: "Microsoft Dynamics 365 Web API",
    description: "Microsoft Dynamics 365 Business Central/Finance",
    type: "erp",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{tenant}}.api.businesscentral.dynamics.com/v2.0/{{environment}}/api/v2.0",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://login.microsoftonline.com/{{tenant_id}}/oauth2/v2.0/token",
      grantType: "client_credentials",
      scope: "https://api.businesscentral.dynamics.com/.default",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 60000,
      retryAttempts: 3,
      retryDelay: 2000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["erp", "microsoft", "dynamics365"],
  },

  // ============================================================================
  // WMS / 3PL SYSTEMS
  // ============================================================================

  {
    name: "Manhattan WMS API",
    description: "Manhattan Associates Warehouse Management System",
    type: "wms",
    direction: "bidirectional",
    protocol: "soap",
    endpoint: "https://{{wms_host}}/service/soap",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "SOAPAction": "{{action}}",
      },
      timeout: 60000,
      retryAttempts: 2,
      retryDelay: 3000,
    },
    formats: ["xml"],
    defaultFormat: "xml",
    enabled: true,
    tags: ["wms", "manhattan", "warehouse"],
  },

  {
    name: "Blue Yonder (JDA) WMS",
    description: "Blue Yonder Warehouse Management System (formerly JDA)",
    type: "wms",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{by_host}}/api/wms",
    authType: "bearer_token",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 60000,
      retryAttempts: 3,
      retryDelay: 2000,
    },
    formats: ["json", "xml"],
    defaultFormat: "json",
    enabled: true,
    tags: ["wms", "blue-yonder", "jda"],
  },

  {
    name: "ShipBob API",
    description: "ShipBob 3PL fulfillment platform",
    type: "3pl",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://api.shipbob.com/1.0",
    authType: "bearer_token",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["3pl", "fulfillment", "shipbob"],
    metadata: {
      endpoints: {
        getInventory: "/inventory",
        createOrder: "/order",
        getShipments: "/shipment",
      },
    },
  },

  {
    name: "ShipStation API",
    description: "ShipStation shipping and fulfillment platform",
    type: "3pl",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://ssapi.shipstation.com",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["3pl", "shipping", "shipstation"],
    metadata: {
      rateLimit: "40 requests per minute",
    },
  },

  {
    name: "Fulfillment by Amazon (FBA)",
    description: "Amazon FBA inventory and fulfillment",
    type: "3pl",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://sellingpartnerapi-na.amazon.com/fba",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://api.amazon.com/auth/o2/token",
      grantType: "refresh_token",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 2000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["3pl", "amazon", "fba"],
  },

  // ============================================================================
  // LAST MILE / CARRIERS
  // ============================================================================

  {
    name: "FedEx Web Services",
    description: "FedEx shipping and tracking API",
    type: "lastmile",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://apis.fedex.com",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://apis.fedex.com/oauth/token",
      grantType: "client_credentials",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["carrier", "shipping", "fedex"],
    metadata: {
      services: ["ground", "express", "freight"],
    },
  },

  {
    name: "UPS API",
    description: "UPS shipping, tracking, and rate calculation",
    type: "lastmile",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://onlinetools.ups.com/api",
    authType: "oauth2",
    oauth2Config: {
      tokenUrl: "https://onlinetools.ups.com/security/v1/oauth/token",
      grantType: "client_credentials",
    },
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["carrier", "shipping", "ups"],
  },

  {
    name: "DHL Express API",
    description: "DHL international shipping and tracking",
    type: "lastmile",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://express.api.dhl.com/mydhlapi",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["carrier", "international", "dhl"],
  },

  {
    name: "USPS Web Tools",
    description: "United States Postal Service API",
    type: "lastmile",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://secure.shippingapis.com/ShippingAPI.dll",
    authType: "api_key",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["xml"],
    defaultFormat: "xml",
    enabled: true,
    tags: ["carrier", "usps", "usa"],
  },

  // ============================================================================
  // CUSTOMS / COMPLIANCE
  // ============================================================================

  {
    name: "Customs Border Protection ACE",
    description: "US Customs Automated Commercial Environment",
    type: "custom",
    direction: "bidirectional",
    protocol: "sftp",
    host: "{{ace_host}}",
    port: 22,
    path: "/incoming",
    authType: "ssh_key",
    formats: ["xml", "edi"],
    defaultFormat: "xml",
    enabled: true,
    tags: ["customs", "compliance", "usa"],
    metadata: {
      regulations: ["AMS", "ISF", "ACE"],
    },
  },

  {
    name: "Descartes CustomsInfo",
    description: "Global customs clearance and compliance",
    type: "custom",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://api.customsinfo.com/v1",
    authType: "api_key",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 60000,
      retryAttempts: 3,
      retryDelay: 2000,
    },
    formats: ["json", "xml"],
    defaultFormat: "json",
    enabled: true,
    tags: ["customs", "compliance", "global"],
  },

  // ============================================================================
  // AUTOMATION / IoT / CONVEYORS
  // ============================================================================

  {
    name: "Honeywell Intelligrated WCS",
    description: "Warehouse Control System for conveyors and automation",
    type: "custom",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "https://{{wcs_host}}/api",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["automation", "wcs", "conveyor"],
    metadata: {
      equipment: ["sorters", "conveyors", "asrs"],
    },
  },

  {
    name: "Zebra Printer ZPL",
    description: "Zebra label printer direct integration",
    type: "custom",
    direction: "outbound",
    protocol: "rest_api",
    endpoint: "http://{{printer_ip}}:9100",
    authType: "none",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      timeout: 10000,
      retryAttempts: 2,
      retryDelay: 500,
    },
    formats: ["xml"],
    defaultFormat: "xml",
    enabled: true,
    tags: ["printer", "labels", "zebra"],
    metadata: {
      language: "ZPL",
    },
  },

  {
    name: "Generic MQTT Broker",
    description: "IoT device integration via MQTT protocol",
    type: "custom",
    direction: "bidirectional",
    protocol: "message_queue",
    endpoint: "mqtt://{{broker_host}}:1883",
    authType: "basic_auth",
    messageQueueConfig: {
      topic: "warehouse/sensors",
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["iot", "mqtt", "sensors"],
  },

  {
    name: "OPC UA Server",
    description: "Industrial automation OPC UA integration",
    type: "custom",
    direction: "bidirectional",
    protocol: "rest_api",
    endpoint: "opc.tcp://{{opc_host}}:4840",
    authType: "basic_auth",
    httpConfig: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["industrial", "opc-ua", "automation"],
  },

  // ============================================================================
  // DATABASES (for legacy systems)
  // ============================================================================

  {
    name: "PostgreSQL Database",
    description: "Direct PostgreSQL database connection",
    type: "custom",
    direction: "bidirectional",
    protocol: "database",
    host: "{{db_host}}",
    port: 5432,
    path: "/{{database_name}}",
    authType: "basic_auth",
    databaseConfig: {
      databaseType: "postgresql",
      schema: "public",
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["database", "postgresql"],
  },

  {
    name: "MySQL Database",
    description: "Direct MySQL/MariaDB database connection",
    type: "custom",
    direction: "bidirectional",
    protocol: "database",
    host: "{{db_host}}",
    port: 3306,
    path: "/{{database_name}}",
    authType: "basic_auth",
    databaseConfig: {
      databaseType: "mysql",
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["database", "mysql"],
  },

  {
    name: "Microsoft SQL Server",
    description: "Direct MS SQL Server database connection",
    type: "custom",
    direction: "bidirectional",
    protocol: "database",
    host: "{{db_host}}",
    port: 1433,
    path: "/{{database_name}}",
    authType: "basic_auth",
    databaseConfig: {
      databaseType: "sqlserver",
      schema: "dbo",
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["database", "mssql"],
  },

  {
    name: "Oracle Database",
    description: "Direct Oracle database connection",
    type: "custom",
    direction: "bidirectional",
    protocol: "database",
    host: "{{db_host}}",
    port: 1521,
    path: "/{{sid}}",
    authType: "basic_auth",
    databaseConfig: {
      databaseType: "oracle",
    },
    formats: ["json"],
    defaultFormat: "json",
    enabled: true,
    tags: ["database", "oracle"],
  },
];

async function seedInterfaceAdapters() {
  log.info("🔌 Seeding interface adapters...");
  log.info(`   Total adapters: ${INTERFACE_ADAPTERS.length}`);

  const { interfaceManager } = await import("../server/src/interfaces/manager.js");

  let created = 0;
  let skipped = 0;

  for (const adapter of INTERFACE_ADAPTERS) {
    try {
      // Check if already exists
      const existing = interfaceManager.getInterfaces().find((i) => i.name === adapter.name);

      if (existing) {
        log.info(`⏭️  Skipping: ${adapter.name} (already exists)`);
        skipped++;
        continue;
      }

      // Create adapter (without secrets - those are set per-instance)
      interfaceManager.addInterface(adapter as any);
      log.info(`✅ Created: ${adapter.name} [${adapter.type}/${adapter.protocol}]`);
      created++;
    } catch (error: any) {
      log.error(`❌ Failed to create ${adapter.name}:`, error.message);
    }
  }

  log.info("");
  log.info("✅ Interface adapter seeding complete!");
  log.info(`   Created: ${created}`);
  log.info(`   Skipped: ${skipped}`);
  log.info("");
  log.info("📊 Adapters by Category:");
  
  const byCategory = INTERFACE_ADAPTERS.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(byCategory).forEach(([category, count]) => {
    log.info(`   ${category}: ${count} adapters`);
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedInterfaceAdapters()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export default seedInterfaceAdapters;
