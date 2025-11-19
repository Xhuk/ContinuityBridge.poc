/**
 * Distributor Executor (Caso 1: Split & Join)
 * Splits an order into multiple sub-tasks based on item availability
 * Example: Order with 3 items → 3 parallel flows (warehouse, store, dropship)
 */

import { NodeExecutor } from "./types.js";
import { logger } from "../../core/logger.js";

const log = logger.child("DistributorExecutor");

export const executeDistributor: NodeExecutor = async (node, input, context) => {
  const config = node.data.config || {};
  const splitStrategy = node.data.splitStrategy || "by_warehouse";
  const distributionRules = node.data.distributionRules || [];

  log.info("Executing distributor node", {
    nodeId: node.id,
    strategy: splitStrategy,
    inputType: typeof input,
  });

  try {
    // Extract order data from input
    const order = extractOrder(input);

    if (!order || !order.items || !Array.isArray(order.items)) {
      throw new Error("Invalid input: expected order with items array");
    }

    // Split order based on strategy
    let distributions: any[] = [];

    switch (splitStrategy) {
      case "by_warehouse":
        distributions = splitByWarehouse(order, distributionRules);
        break;
      
      case "by_carrier":
        distributions = splitByCarrier(order, distributionRules);
        break;
      
      case "by_item":
        distributions = splitByItem(order);
        break;
      
      case "custom":
        distributions = splitByCustomRules(order, distributionRules);
        break;
      
      default:
        throw new Error(`Unknown split strategy: ${splitStrategy}`);
    }

    log.info("Order split into distributions", {
      nodeId: node.id,
      originalItems: order.items.length,
      distributions: distributions.length,
    });

    // Return distributions for parallel execution
    return {
      success: true,
      output: {
        originalOrder: order,
        distributions,
        splitStrategy,
        timestamp: new Date().toISOString(),
      },
      metadata: {
        distributionCount: distributions.length,
        strategy: splitStrategy,
      },
    };
  } catch (error: any) {
    log.error("Distributor execution failed", {
      nodeId: node.id,
      error: error.message,
    });

    return {
      success: false,
      output: null,
      error: `Distributor failed: ${error.message}`,
    };
  }
};

/**
 * Extract order from various input formats
 */
function extractOrder(input: any): any {
  if (input?.order) return input.order;
  if (input?.data?.order) return input.data.order;
  if (input?.items) return input; // Already an order
  return input;
}

/**
 * Split by warehouse availability
 * Example: Item A in main warehouse, Item B in store, Item C dropship
 */
function splitByWarehouse(order: any, rules: any[]): any[] {
  const warehouseGroups = new Map<string, any[]>();

  for (const item of order.items) {
    // Determine warehouse for this item
    const warehouse = determineWarehouse(item, rules);
    
    if (!warehouseGroups.has(warehouse)) {
      warehouseGroups.set(warehouse, []);
    }
    
    warehouseGroups.get(warehouse)!.push(item);
  }

  // Create distribution for each warehouse
  return Array.from(warehouseGroups.entries()).map(([warehouse, items]) => ({
    id: `${order.id || order.orderId}-${warehouse}`,
    orderId: order.id || order.orderId,
    warehouse,
    items,
    customer: order.customer,
    shippingAddress: order.shippingAddress,
    type: "warehouse_fulfillment",
  }));
}

/**
 * Determine warehouse for an item based on rules
 */
function determineWarehouse(item: any, rules: any[]): string {
  // Check custom rules first
  for (const rule of rules) {
    if (rule.condition && evaluateCondition(rule.condition, item)) {
      return rule.warehouse || rule.target;
    }
  }

  // Default logic: check item metadata
  if (item.warehouse) return item.warehouse;
  if (item.location) return item.location;
  if (item.fulfillmentType === "dropship") return "dropship_vendor";
  if (item.storeStock > 0) return "retail_store";
  
  return "main_warehouse"; // Default
}

/**
 * Split by carrier (for multi-carrier shipments)
 */
function splitByCarrier(order: any, rules: any[]): any[] {
  const carrierGroups = new Map<string, any[]>();

  for (const item of order.items) {
    // Determine carrier based on weight, destination, etc.
    const carrier = determineCarrier(item, order.shippingAddress, rules);
    
    if (!carrierGroups.has(carrier)) {
      carrierGroups.set(carrier, []);
    }
    
    carrierGroups.get(carrier)!.push(item);
  }

  return Array.from(carrierGroups.entries()).map(([carrier, items]) => ({
    id: `${order.id || order.orderId}-${carrier}`,
    orderId: order.id || order.orderId,
    carrier,
    items,
    customer: order.customer,
    shippingAddress: order.shippingAddress,
    type: "carrier_shipment",
  }));
}

/**
 * Determine carrier for an item
 */
function determineCarrier(item: any, address: any, rules: any[]): string {
  // Check rules
  for (const rule of rules) {
    if (rule.condition && evaluateCondition(rule.condition, { item, address })) {
      return rule.carrier || rule.target;
    }
  }

  // Default logic
  const weight = item.weight || 0;
  const isLocal = address?.country === "US" && address?.state === "CA";

  if (weight > 20 && isLocal) return "own_fleet";
  if (weight > 20) return "freight_carrier";
  if (isLocal) return "local_courier";
  
  return "fedex"; // Default
}

/**
 * Split by individual item (one distribution per item)
 */
function splitByItem(order: any): any[] {
  return order.items.map((item: any, index: number) => ({
    id: `${order.id || order.orderId}-item-${index}`,
    orderId: order.id || order.orderId,
    items: [item],
    customer: order.customer,
    shippingAddress: order.shippingAddress,
    type: "item_fulfillment",
  }));
}

/**
 * Split by custom rules (JavaScript expressions)
 */
function splitByCustomRules(order: any, rules: any[]): any[] {
  const distributions: any[] = [];
  const unassignedItems: any[] = [];

  for (const item of order.items) {
    let assigned = false;

    for (const rule of rules) {
      if (rule.condition && evaluateCondition(rule.condition, item)) {
        // Find or create distribution for this rule
        let dist = distributions.find(d => d.ruleId === rule.id);
        if (!dist) {
          dist = {
            id: `${order.id || order.orderId}-${rule.id || rule.name}`,
            ruleId: rule.id,
            ruleName: rule.name,
            orderId: order.id || order.orderId,
            items: [],
            customer: order.customer,
            shippingAddress: order.shippingAddress,
            type: "custom_rule",
            target: rule.target,
          };
          distributions.push(dist);
        }
        dist.items.push(item);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      unassignedItems.push(item);
    }
  }

  // Add unassigned items as separate distribution
  if (unassignedItems.length > 0) {
    distributions.push({
      id: `${order.id || order.orderId}-unassigned`,
      orderId: order.id || order.orderId,
      items: unassignedItems,
      customer: order.customer,
      shippingAddress: order.shippingAddress,
      type: "unassigned",
    });
  }

  return distributions;
}

/**
 * Simple condition evaluator
 * Supports: field comparisons, weight checks, etc.
 */
function evaluateCondition(condition: string, context: any): boolean {
  try {
    // Create a safe evaluation context
    const safeContext = {
      item: context.item || context,
      address: context.address || {},
      order: context.order || {},
    };

    // Simple condition parsing (extend as needed)
    // Example: "item.weight > 20"
    // Example: "address.country === 'US'"
    
    // For now, use a simple regex-based evaluator
    // In production, use a proper expression evaluator library
    
    const match = condition.match(/(\w+(?:\.\w+)*)\s*(===|!==|>|<|>=|<=)\s*(.+)/);
    if (!match) return false;

    const [, path, operator, valueStr] = match;
    const actualValue = getNestedValue(safeContext, path);
    const expectedValue = parseValue(valueStr.trim());

    switch (operator) {
      case "===":
        return actualValue === expectedValue;
      case "!==":
        return actualValue !== expectedValue;
      case ">":
        return actualValue > expectedValue;
      case "<":
        return actualValue < expectedValue;
      case ">=":
        return actualValue >= expectedValue;
      case "<=":
        return actualValue <= expectedValue;
      default:
        return false;
    }
  } catch (error) {
    log.warn("Condition evaluation failed", { condition, error });
    return false;
  }
}

/**
 * Get nested value from object
 */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

/**
 * Parse value from string
 */
function parseValue(str: string): any {
  if (str === "true") return true;
  if (str === "false") return false;
  if (str === "null") return null;
  if (str.startsWith("'") || str.startsWith('"')) {
    return str.slice(1, -1); // Remove quotes
  }
  const num = Number(str);
  return isNaN(num) ? str : num;
}
