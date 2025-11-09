import * as yaml from "js-yaml";
import { NodeExecutor } from "./types";

/**
 * Validation Executor
 * Validates data against rules and outputs to valid/invalid streams
 */
export const executeValidation: NodeExecutor = async (node, input, context) => {
  const config = node.data.config as any || {};
  
  if (!config.rules) {
    throw new Error("Validation node requires rules configuration");
  }

  const rulesYaml = config.rules as string;
  const strictMode = (config.strictMode as boolean) || false;
  const continueOnError = (config.continueOnError as boolean) || false;

  let rules: Record<string, any>;
  try {
    rules = yaml.load(rulesYaml) as Record<string, any>;
  } catch (error) {
    throw new Error(`Invalid YAML in validation rules: ${error instanceof Error ? error.message : String(error)}`);
  }

  const validItems: any[] = [];
  const invalidItems: any[] = [];

  const items = Array.isArray(input) ? input : [input];

  for (const item of items) {
    const validation = validateItem(item, rules, strictMode);
    
    if (validation.valid) {
      validItems.push(item);
    } else {
      if (!continueOnError) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }
      invalidItems.push({
        data: item,
        errors: validation.errors,
      });
    }
  }

  return {
    output: validItems,
    outputs: [validItems, invalidItems],
  };
};

/**
 * Validate a single item against rules
 */
function validateItem(
  item: any,
  rules: Record<string, any>,
  strictMode: boolean
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof item !== "object" || item === null) {
    return { valid: false, errors: ["Input must be an object"] };
  }

  for (const [field, rule] of Object.entries(rules)) {
    const value = item[field];

    if (rule.required && (value === undefined || value === null || value === "")) {
      errors.push(`Field '${field}' is required`);
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    if (rule.type) {
      const actualType = Array.isArray(value) ? "array" : typeof value;
      if (actualType !== rule.type) {
        errors.push(`Field '${field}' must be of type ${rule.type}, got ${actualType}`);
        continue;
      }
    }

    if (rule.type === "number") {
      if (typeof value === "number") {
        if (rule.min !== undefined && value < rule.min) {
          errors.push(`Field '${field}' must be at least ${rule.min}`);
        }
        if (rule.max !== undefined && value > rule.max) {
          errors.push(`Field '${field}' must be at most ${rule.max}`);
        }
      }
    }

    if (rule.type === "string") {
      if (typeof value === "string") {
        if (rule.minLength !== undefined && value.length < rule.minLength) {
          errors.push(`Field '${field}' must be at least ${rule.minLength} characters`);
        }
        if (rule.maxLength !== undefined && value.length > rule.maxLength) {
          errors.push(`Field '${field}' must be at most ${rule.maxLength} characters`);
        }
        if (rule.pattern) {
          const regex = new RegExp(rule.pattern);
          if (!regex.test(value)) {
            errors.push(`Field '${field}' does not match required pattern`);
          }
        }
      }
    }

    if (rule.enum && Array.isArray(rule.enum)) {
      if (!rule.enum.includes(value)) {
        errors.push(`Field '${field}' must be one of: ${rule.enum.join(", ")}`);
      }
    }
  }

  if (strictMode) {
    const allowedFields = Object.keys(rules);
    const extraFields = Object.keys(item).filter(f => !allowedFields.includes(f));
    if (extraFields.length > 0) {
      errors.push(`Unexpected fields in strict mode: ${extraFields.join(", ")}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
