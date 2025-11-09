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

  const config = node.data.config as any || {};
  const options = {
    ignoreAttributes: config.ignoreAttributes ?? false,
    attributeNamePrefix: config.attributeNamePrefix ?? "@_",
    textNodeName: config.textNodeName ?? "#text",
    ignoreDeclaration: config.ignoreDeclaration ?? true,
    removeNSPrefix: config.removeNSPrefix ?? true,
  };

  const parser = new XMLParser(options);
  const result = parser.parse(input);

  return {
    output: result,
  };
};
