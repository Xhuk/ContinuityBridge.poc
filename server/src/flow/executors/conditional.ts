import { NodeExecutor } from "./types";
import yaml from "js-yaml";
import { InterfaceTemplateCatalog } from "../../interfaces/template-catalog";
import { interfaceManager } from "../../interfaces/manager";

/**
 * Conditional Executor - Interface-Scoped Declarative Conditions
 * 
 * SECURITY: Uses YAML-based declarative syntax instead of JavaScript evaluation
 * - No code execution, only data comparison
 * - Server-side interface schema validation (prevents bypassing UI constraints)
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

async function validateConditionAgainstSchema(
  condition: Condition,
  interfaceId: string | undefined
): Promise<void> {
  // If no interface specified, allow any fields (for custom flows without schemas)
  if (!interfaceId) {
    return;
  }
  
  // Fetch interface from interfaceManager
  const iface = await interfaceManager.getInterface(interfaceId);
  if (!iface) {
    throw new Error(`Interface not found: ${interfaceId}`);
  }
  
  // Check if interface has a templateId (stored in metadata)
  const templateId = iface.metadata?.templateId as string | undefined;
  
  // If interface doesn't have a templateId, it's a custom interface without schema - allow any fields
  if (!templateId) {
    return;
  }
  
  // Fetch template to get conditionSchema
  const catalog = InterfaceTemplateCatalog.getInstance();
  const template = catalog.getTemplate(templateId);
  
  if (!template?.conditionSchema) {
    throw new Error(
      `Interface "${iface.name}" uses template "${templateId}" which has no conditionSchema. ` +
      `Switch to Advanced Mode to write custom conditions, or select an interface with a schema.`
    );
  }
  
  const schema = template.conditionSchema;
  
  // Validate field exists in schema
  const field = schema.fields.find((f) => f.name === condition.field);
  if (!field) {
    const allowedFields = schema.fields.map((f) => f.name).join(", ");
    throw new Error(
      `Field "${condition.field}" is not allowed for interface "${iface.name}". ` +
      `Allowed fields: ${allowedFields}`
    );
  }
  
  // Validate operator
  if (!SAFE_OPERATORS.includes(condition.operator)) {
    throw new Error(
      `Operator "${condition.operator}" is not allowed. ` +
      `Allowed: ${SAFE_OPERATORS.join(", ")}`
    );
  }
  
  // Validate value type matches field type
  if (field.type === "number" && typeof condition.value !== "number") {
    throw new Error(
      `Field "${condition.field}" expects a number, got: ${typeof condition.value}`
    );
  }
  
  // Validate enum values if defined
  if (field.values && field.values.length > 0) {
    if (!field.values.includes(String(condition.value))) {
      throw new Error(
        `Value "${condition.value}" is not valid for field "${condition.field}". ` +
        `Allowed values: ${field.values.join(", ")}`
      );
    }
  }
}

export const executeConditional: NodeExecutor = async (node, input, context) => {
  const config = node.data?.config || {};
  const interfaceId = config.interfaceId ? String(config.interfaceId) : undefined;
  
  // Simple mode: field/operator/value from UI
  if (config.field && config.operator && config.value !== undefined) {
    const condition: Condition = {
      field: String(config.field),
      operator: String(config.operator),
      value: config.value,
    };
    
    // SERVER-SIDE VALIDATION: Enforce interface schema
    await validateConditionAgainstSchema(condition, interfaceId);
    
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
      parsed = yaml.load(String(config.conditions));
    } catch (error: any) {
      throw new Error(`Invalid YAML: ${error.message}`);
    }
    
    let result: boolean;
    
    // Check if it's a multi-condition or single condition
    if (parsed.conditions && Array.isArray(parsed.conditions)) {
      // Validate each condition against schema
      for (const cond of parsed.conditions) {
        await validateConditionAgainstSchema(cond, interfaceId);
      }
      result = evaluateMultiCondition(input, parsed as MultiCondition);
    } else if (parsed.field && parsed.operator) {
      // Validate single condition against schema
      await validateConditionAgainstSchema(parsed, interfaceId);
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
