import objectMapper from "object-mapper";
import { NodeExecutor } from "./types";

/**
 * Object Mapper Executor
 * Maps fields from source object to target object using object-mapper
 */
export const executeObjectMapper: NodeExecutor = async (node, input, context) => {
  const mappings = node.data.mappings;
  if (!mappings) {
    throw new Error("Object Mapper requires mappings configuration");
  }

  const strict = node.data.config?.strict ?? false;
  const defaultValues = node.data.config?.defaultValues ?? {};

  try {
    // Apply object-mapper transformation
    const mapped = objectMapper(input, mappings);

    // Apply default values for missing fields
    const result = { ...defaultValues, ...mapped };

    // In strict mode, validate required fields
    if (strict) {
      // Check if any required mappings resulted in undefined
      for (const [targetField, sourceExpression] of Object.entries(mappings)) {
        const value = result[targetField as keyof typeof result];
        if (value === undefined || value === null) {
          throw new Error(`Required field missing: ${targetField}`);
        }
      }
    }

    return {
      output: result,
    };
  } catch (error) {
    throw new Error(`Object mapping failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};
