import { XMLParser } from "fast-xml-parser";
import { NodeExecutor } from "./types";

/**
 * XML Parser Executor
 * Parses XML string to JSON object
 */
export const executeXmlParser: NodeExecutor = async (node, input, context) => {
  if (typeof input !== "string") {
    throw new Error("XML Parser input must be a string");
  }

  const options = {
    ignoreAttributes: node.data.config?.ignoreAttributes ?? false,
    attributeNamePrefix: node.data.config?.attributeNamePrefix ?? "@_",
    textNodeName: node.data.config?.textNodeName ?? "#text",
    ignoreDeclaration: node.data.config?.ignoreDeclaration ?? true,
    removeNSPrefix: node.data.config?.removeNSPrefix ?? true,
  };

  const parser = new XMLParser(options);
  const result = parser.parse(input);

  return {
    output: result,
  };
};
