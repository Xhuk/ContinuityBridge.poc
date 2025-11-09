import { XMLParser } from "fast-xml-parser";
import * as yaml from "js-yaml";
import { readFileSync } from "fs";
import { join } from "path";
import { logger } from "../core/logger.js";
import type { CanonicalItem } from "@shared/schema";

const log = logger.child("XMLTransformer");

interface MappingConfig {
  mappings: Record<string, any>;
}

export class XMLToCanonicalTransformer {
  private parser: XMLParser;
  private mapping: MappingConfig;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });

    // Load mapping configuration
    const mappingPath = join(process.cwd(), "mapping.yml");
    const mappingContent = readFileSync(mappingPath, "utf-8");
    this.mapping = yaml.load(mappingContent) as MappingConfig;

    log.info("XML Transformer initialized with mapping.yml");
  }

  transform(xml: string): CanonicalItem {
    try {
      // Parse XML
      const parsed = this.parser.parse(xml);

      // Apply mappings
      const canonical: any = {};

      for (const [key, config] of Object.entries(this.mapping.mappings)) {
        const value = this.extractValue(parsed, config);
        if (value !== undefined || !config.optional) {
          canonical[key] = value;
        }
      }

      log.debug("XML transformed to canonical", { itemId: canonical.itemId });
      return canonical as CanonicalItem;
    } catch (error: any) {
      log.error("XML transformation failed", error);
      throw new Error(`XML transformation failed: ${error.message}`);
    }
  }

  private extractValue(data: any, config: any): any {
    if (config.type === "object" && config.fields) {
      const obj: any = {};
      for (const [fieldKey, fieldConfig] of Object.entries(config.fields)) {
        const value = this.extractValue(data, fieldConfig);
        if (value !== undefined || !(fieldConfig as any).optional) {
          obj[fieldKey] = value;
        }
      }
      return obj;
    }

    if (config.xpath) {
      const value = this.evaluateXPath(data, config.xpath);
      return this.convertType(value, config.type);
    }

    return undefined;
  }

  private evaluateXPath(data: any, xpath: string): any {
    // Simplified XPath evaluation (handles basic paths)
    const parts = xpath.replace(/^\/\//, "").split("/");

    let current = data;
    for (const part of parts) {
      if (!current) return undefined;

      // Navigate through the object
      if (typeof current === "object") {
        current = current[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private convertType(value: any, type: string): any {
    if (value === undefined || value === null) return undefined;

    switch (type) {
      case "string":
        return String(value);
      case "number":
        return Number(value);
      case "boolean":
        return Boolean(value);
      default:
        return value;
    }
  }

  validate(xml: string): { valid: boolean; error?: string } {
    try {
      this.parser.parse(xml);
      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }
}
