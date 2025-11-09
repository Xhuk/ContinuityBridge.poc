import { NodeExecutor } from "./types";
import yaml from "js-yaml";

/**
 * Conditional Executor - Interface-Scoped Declarative Conditions
 * 
 * SECURITY: Uses YAML-based declarative syntax instead of JavaScript evaluation
 * - No code execution, only data comparison
 * - Interface-scoped field validation
 * - Whitelisted operators only
 */

interface Condition {
  field: string;
  operator: string;
  value: any;
}

interface MultiCondition {
  conditions: Condition[];
  logic: "AND" | "OR";
}

const SAFE_OPERATORS = [
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "in",
  "contains",
  "starts_with",
  "ends_with",
];

function evaluateCondition(data: any, condition: Condition): boolean {
  const { field, operator, value } = condition;
  
  if (!SAFE_OPERATORS.includes(operator)) {
    throw new Error(`Unsafe operator: ${operator}`);
  }
  
  const fieldValue = getNestedValue(data, field);
  
  switch (operator) {
    case "equals":
      return fieldValue == value;
    case "not_equals":
      return fieldValue != value;
    case "greater_than":
      return Number(fieldValue) > Number(value);
    case "less_than":
      return Number(fieldValue) < Number(value);
    case "in":
      return Array.isArray(value) && value.includes(fieldValue);
    case "contains":
      return String(fieldValue).includes(String(value));
    case "starts_with":
      return String(fieldValue).startsWith(String(value));
    case "ends_with":
      return String(fieldValue).endsWith(String(value));
    default:
      return false;
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function evaluateMultiCondition(data: any, multiCondition: MultiCondition): boolean {
  const { conditions, logic } = multiCondition;
  
  if (logic === "AND") {
    return conditions.every((cond) => evaluateCondition(data, cond));
  } else {
    return conditions.some((cond) => evaluateCondition(data, cond));
  }
}

export const executeConditional: NodeExecutor = async (node, input, context) => {
  const config = node.data?.config || {};
  
  // Simple mode: field/operator/value from UI
  if (config.field && config.operator && config.value !== undefined) {
    const condition: Condition = {
      field: config.field,
      operator: config.operator,
      value: config.value,
    };
    
    const result = evaluateCondition(input, condition);
    
    return {
      success: true,
      output: input,
      metadata: {
        conditionMet: result,
        nextBranch: result ? "true" : "false",
      },
    };
  }
  
  // Advanced mode: YAML conditions
  if (config.conditions) {
    let parsed: any;
    
    try {
      parsed = yaml.load(config.conditions);
    } catch (error: any) {
      throw new Error(`Invalid YAML: ${error.message}`);
    }
    
    let result: boolean;
    
    // Check if it's a multi-condition or single condition
    if (parsed.conditions && Array.isArray(parsed.conditions)) {
      result = evaluateMultiCondition(input, parsed as MultiCondition);
    } else if (parsed.field && parsed.operator) {
      result = evaluateCondition(input, parsed as Condition);
    } else {
      throw new Error("Invalid condition format. Expected field/operator/value or conditions array.");
    }
    
    return {
      success: true,
      output: input,
      metadata: {
        conditionMet: result,
        nextBranch: result ? "true" : "false",
      },
    };
  }
  
  throw new Error("No condition configured. Set field/operator/value or provide YAML conditions.");
};
