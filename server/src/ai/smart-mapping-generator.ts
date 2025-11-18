/**
 * Smart Mapping Generator
 * 
 * AI-assisted mapping generation for forger consultants:
 * 1. Reads system configurations (Oracle, SAP, WMS, etc.)
 * 2. Analyzes sample payloads with comments/metadata
 * 3. Generates intelligent field mappings
 * 4. Provides transformation suggestions (enums, validations, functions)
 * 5. Allows consultant review and refinement
 * 6. Saves approved mappings for reuse
 * 
 * Example workflow:
 *   Oracle ERP → Generic WMS
 *   - Read Oracle sample payload (order export)
 *   - Read WMS sample payload (order import)
 *   - AI analyzes both and generates mapping
 *   - Consultant reviews, approves, or refines
 *   - Save as reusable template
 */

import { geminiService } from "./gemini-service.js";
import { logger } from "../core/logger.js";

const log = logger.child("SmartMappingGenerator");

export interface SystemPayloadSample {
  systemName: string;
  systemType: "erp" | "wms" | "marketplace" | "tms" | "3pl" | "lastmile" | "custom";
  direction: "inbound" | "outbound";
  dataType: "order" | "inventory" | "shipment" | "product" | "customer" | "invoice";
  format: "json" | "xml" | "csv" | "edi";
  samplePayload: any;
  comments?: string; // Human-readable explanation
  metadata?: {
    version?: string;
    endpoint?: string;
    documentation?: string;
    fields?: Record<string, {
      description: string;
      required?: boolean;
      format?: string;
      enum?: string[];
      defaultValue?: any;
    }>;
  };
}

export interface MappingRule {
  targetField: string;
  sourceExpression: string; // JSONPath or jq expression
  transformation?: {
    type: "enum" | "function" | "lookup" | "format" | "default";
    config: any;
  };
  confidence: number; // 0.0 - 1.0
  needsReview: boolean;
  reasoning?: string;
}

export interface GeneratedMapping {
  id: string;
  name: string;
  sourceSystem: string;
  targetSystem: string;
  dataType: string;
  rules: MappingRule[];
  transformations: Array<{
    name: string;
    type: string;
    expression: string;
    description: string;
  }>;
  validations: Array<{
    field: string;
    rule: string;
    errorMessage: string;
  }>;
  enumMappings: Record<string, Record<string, string>>;
  confidence: number;
  needsReview: boolean;
  suggestedImprovements: string[];
  generatedAt: string;
  generatedBy: "ai" | "consultant";
}

export class SmartMappingGenerator {
  /**
   * Generate intelligent mapping between two systems
   */
  async generateMapping(
    sourceSample: SystemPayloadSample,
    targetSample: SystemPayloadSample,
    context?: {
      existingMappings?: MappingRule[];
      businessRules?: string;
      consultantNotes?: string;
    }
  ): Promise<GeneratedMapping> {
    log.info("Generating smart mapping", {
      source: sourceSample.systemName,
      target: targetSample.systemName,
      dataType: sourceSample.dataType,
    });

    try {
      // Build comprehensive prompt for AI
      const prompt = this.buildMappingPrompt(sourceSample, targetSample, context);
      
      // Call AI
      const response = await geminiService.generate(
        [{ role: "user", content: prompt }],
        {
          systemPrompt: this.getSystemPrompt(),
          temperature: 0.3, // Low temperature for consistent mappings
          maxTokens: 4096,
        }
      );

      // Parse AI response
      const mapping = this.parseAIResponse(response, sourceSample, targetSample);
      
      log.info("Mapping generated successfully", {
        source: sourceSample.systemName,
        target: targetSample.systemName,
        rulesCount: mapping.rules.length,
        confidence: mapping.confidence,
      });

      return mapping;
    } catch (error: any) {
      log.error("Failed to generate mapping", { error: error.message });
      throw error;
    }
  }

  /**
   * System prompt for AI mapping assistant
   */
  private getSystemPrompt(): string {
    return `You are an expert enterprise integration consultant specializing in data transformation.

Your role:
- Analyze source and target system payloads
- Generate accurate field-to-field mappings
- Suggest transformations (enum conversions, date formats, UOM conversions, etc.)
- Identify data validation rules
- Flag mappings that need consultant review

Output rules:
1. Use JSONPath syntax for source expressions (e.g., $.order.items[*].sku)
2. Mark low-confidence mappings (< 0.7) as needsReview: true
3. Suggest enum mappings for status codes, priorities, etc.
4. Suggest validation rules for required fields
5. Provide reasoning for complex mappings
6. Return ONLY valid JSON, no markdown or explanation

Focus on:
- Semantic field matching (not just name similarity)
- Data type compatibility
- Business logic preservation
- Error prevention`;
  }

  /**
   * Build detailed prompt for AI
   */
  private buildMappingPrompt(
    source: SystemPayloadSample,
    target: SystemPayloadSample,
    context?: any
  ): string {
    return `Generate a complete field mapping from ${source.systemName} to ${target.systemName}.

SOURCE SYSTEM: ${source.systemName} (${source.systemType})
Direction: ${source.direction}
Data Type: ${source.dataType}
Format: ${source.format}

${source.comments ? `SYSTEM NOTES:\n${source.comments}\n` : ""}

SOURCE PAYLOAD SAMPLE:
\`\`\`json
${JSON.stringify(source.samplePayload, null, 2)}
\`\`\`

${source.metadata?.fields ? `SOURCE FIELD DESCRIPTIONS:
${Object.entries(source.metadata.fields).map(([field, meta]) => 
  `- ${field}: ${meta.description}${meta.required ? " (required)" : ""}${meta.enum ? ` [${meta.enum.join(", ")}]` : ""}`
).join("\n")}
` : ""}

---

TARGET SYSTEM: ${target.systemName} (${target.systemType})
Direction: ${target.direction}
Data Type: ${target.dataType}
Format: ${target.format}

${target.comments ? `SYSTEM NOTES:\n${target.comments}\n` : ""}

TARGET PAYLOAD SAMPLE:
\`\`\`json
${JSON.stringify(target.samplePayload, null, 2)}
\`\`\`

${target.metadata?.fields ? `TARGET FIELD DESCRIPTIONS:
${Object.entries(target.metadata.fields).map(([field, meta]) => 
  `- ${field}: ${meta.description}${meta.required ? " (required)" : ""}${meta.enum ? ` [${meta.enum.join(", ")}]` : ""}`
).join("\n")}
` : ""}

${context?.existingMappings ? `\nEXISTING MAPPINGS (for reference):
${JSON.stringify(context.existingMappings, null, 2)}
` : ""}

${context?.businessRules ? `\nBUSINESS RULES:
${context.businessRules}
` : ""}

${context?.consultantNotes ? `\nCONSULTANT NOTES:
${context.consultantNotes}
` : ""}

Return a JSON object with this structure:
{
  "rules": [
    {
      "targetField": "order.orderId",
      "sourceExpression": "$.OrderNumber",
      "transformation": {
        "type": "function",
        "config": {
          "function": "toUpperCase"
        }
      },
      "confidence": 0.95,
      "needsReview": false,
      "reasoning": "Direct field match with format normalization"
    }
  ],
  "transformations": [
    {
      "name": "priorityMapping",
      "type": "enum",
      "expression": "{ '1': 'URGENT', '2': 'HIGH', '3': 'NORMAL', '4': 'LOW' }",
      "description": "Map Oracle priority codes to WMS priority levels"
    }
  ],
  "validations": [
    {
      "field": "order.items",
      "rule": "length >= 1",
      "errorMessage": "Order must have at least one item"
    }
  ],
  "enumMappings": {
    "priority": {
      "1": "URGENT",
      "2": "HIGH",
      "3": "NORMAL"
    }
  },
  "suggestedImprovements": [
    "Consider adding UOM conversion lookup table",
    "Validate customer code format before sending"
  ]
}

IMPORTANT: Return ONLY the JSON object, no markdown, no explanation.`;
  }

  /**
   * Parse AI response and build mapping object
   */
  private parseAIResponse(
    response: string,
    source: SystemPayloadSample,
    target: SystemPayloadSample
  ): GeneratedMapping {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid AI response: No JSON found");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Calculate overall confidence
    const avgConfidence = parsed.rules.length > 0
      ? parsed.rules.reduce((sum: number, r: MappingRule) => sum + r.confidence, 0) / parsed.rules.length
      : 0;

    // Determine if needs review
    const needsReview = parsed.rules.some((r: MappingRule) => r.needsReview) || avgConfidence < 0.75;

    return {
      id: `mapping-${source.systemName}-${target.systemName}-${Date.now()}`,
      name: `${source.systemName} → ${target.systemName} (${source.dataType})`,
      sourceSystem: source.systemName,
      targetSystem: target.systemName,
      dataType: source.dataType,
      rules: parsed.rules || [],
      transformations: parsed.transformations || [],
      validations: parsed.validations || [],
      enumMappings: parsed.enumMappings || {},
      confidence: avgConfidence,
      needsReview,
      suggestedImprovements: parsed.suggestedImprovements || [],
      generatedAt: new Date().toISOString(),
      generatedBy: "ai",
    };
  }

  /**
   * Convert mapping to jq transformation expression
   */
  convertToJQ(mapping: GeneratedMapping): string {
    const jqExpressions: string[] = [];

    // Build field mappings
    for (const rule of mapping.rules) {
      const targetPath = rule.targetField;
      let sourceExpr = rule.sourceExpression;

      // Apply transformation if present
      if (rule.transformation) {
        switch (rule.transformation.type) {
          case "enum":
            const enumMap = rule.transformation.config.mapping;
            sourceExpr = `(${sourceExpr} | ${JSON.stringify(enumMap)}[.])`;
            break;
          case "function":
            const func = rule.transformation.config.function;
            sourceExpr = `(${sourceExpr} | ${func})`;
            break;
          case "default":
            const defaultVal = rule.transformation.config.value;
            sourceExpr = `(${sourceExpr} // ${JSON.stringify(defaultVal)})`;
            break;
        }
      }

      jqExpressions.push(`${targetPath}: ${sourceExpr}`);
    }

    return `{\n  ${jqExpressions.join(",\n  ")}\n}`;
  }

  /**
   * Refine mapping based on consultant feedback
   */
  async refineMapping(
    mapping: GeneratedMapping,
    consultantFeedback: {
      approvedRules?: string[]; // Rule IDs
      rejectedRules?: string[];
      modifiedRules?: Array<{
        targetField: string;
        newSourceExpression: string;
        newTransformation?: any;
      }>;
      additionalRequirements?: string;
    }
  ): Promise<GeneratedMapping> {
    log.info("Refining mapping with consultant feedback", {
      mappingId: mapping.id,
      approved: consultantFeedback.approvedRules?.length || 0,
      rejected: consultantFeedback.rejectedRules?.length || 0,
      modified: consultantFeedback.modifiedRules?.length || 0,
    });

    // Apply consultant modifications
    const refinedRules = mapping.rules.map(rule => {
      const modified = consultantFeedback.modifiedRules?.find(m => m.targetField === rule.targetField);
      if (modified) {
        return {
          ...rule,
          sourceExpression: modified.newSourceExpression,
          transformation: modified.newTransformation,
          confidence: 1.0, // Consultant-approved = 100% confidence
          needsReview: false,
        };
      }
      return rule;
    }).filter(rule => 
      !consultantFeedback.rejectedRules?.includes(rule.targetField)
    );

    return {
      ...mapping,
      rules: refinedRules,
      confidence: refinedRules.length > 0
        ? refinedRules.reduce((sum, r) => sum + r.confidence, 0) / refinedRules.length
        : 0,
      needsReview: false,
      generatedBy: "consultant",
    };
  }
}

export const smartMappingGenerator = new SmartMappingGenerator();
