import { NodeExecutor } from "./types";

/**
 * JSON Builder Executor
 * Formats and validates JSON output
 */
export const executeJsonBuilder: NodeExecutor = async (node, input, context) => {
  const outputFormat = node.data.config?.outputFormat ?? "object";
  const indent = node.data.config?.indent ?? 2;
  const sortKeys = node.data.config?.sortKeys ?? false;
  const removeNull = node.data.config?.removeNull ?? false;
  const removeEmpty = node.data.config?.removeEmpty ?? false;

  let data = input;

  // Remove null values if requested
  if (removeNull && typeof data === "object" && data !== null) {
    data = JSON.parse(JSON.stringify(data, (key, value) => value === null ? undefined : value));
  }

  // Remove empty objects/arrays if requested
  if (removeEmpty && typeof data === "object" && data !== null) {
    data = JSON.parse(JSON.stringify(data, (key, value) => {
      if (value && typeof value === "object") {
        if (Array.isArray(value) && value.length === 0) return undefined;
        if (Object.keys(value).length === 0) return undefined;
      }
      return value;
    }));
  }

  // Sort keys if requested
  if (sortKeys && typeof data === "object" && data !== null) {
    const sortObject = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(sortObject);
      }
      if (obj && typeof obj === "object") {
        return Object.keys(obj)
          .sort()
          .reduce((result: any, key) => {
            result[key] = sortObject(obj[key]);
            return result;
          }, {});
      }
      return obj;
    };
    data = sortObject(data);
  }

  // Format output
  if (outputFormat === "string") {
    return { output: JSON.stringify(data) };
  } else if (outputFormat === "pretty") {
    return { output: JSON.stringify(data, null, indent) };
  } else {
    // object
    return { output: data };
  }
};
