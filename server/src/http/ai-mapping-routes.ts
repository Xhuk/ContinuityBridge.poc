/**
 * AI Mapping Generator Routes (Development Only)
 * 
 * OVERVIEW:
 * Generates YAML transformation mappings from schema analysis using AI or rule-based fallback.
 * This tool is designed for development environments to bootstrap mapping configurations.
 * 
 * ENDPOINTS:
 * - POST /api/dev/generate-mapping - Generate mapping from source/target schemas
 * - POST /api/dev/save-mapping - Save reviewed mapping to /mappings directory
 * - GET /api/dev/ai-status - Check if AI API is configured
 * 
 * SETUP:
 * 1. Set environment variable: OPENAI_API_KEY or ANTHROPIC_API_KEY
 * 2. Navigate to http://localhost:5173/mapping-generator
 * 3. Upload source and target schemas (JSON format)
 * 4. Review generated mappings visually
 * 5. Save to /mappings folder for version control
 * 
 * PRODUCTION:
 * - AI API calls are NOT used in production
 * - Generated YAML files are committed to git
 * - Production uses pre-generated, reviewed mappings
 * - This ensures determinism, speed, and offline capability
 * 
 * EXAMPLE SCHEMAS:
 * - See examples/schemas/wms-order-schema.json
 * - See examples/schemas/sap-order-schema.json
 */
import type { Express } from "express";
import { logger } from "../core/logger.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const log = logger.child("AIMappingRoutes");

/**
 * AI Mapping Generator Routes (Development Only)
 * Generates YAML transformation mappings from schema analysis
 */
export function registerAIMappingRoutes(app: Express): void {
  // POST /api/dev/generate-mapping - Generate mapping from schemas
  app.post("/api/dev/generate-mapping", async (req, res) => {
    try {
      const {
        sourceSchema,
        targetSchema,
        sourceSystem,
        targetSystem,
        sourceFormat = "json",
        targetFormat = "json",
        sampleData,
      } = req.body;

      if (!sourceSchema || !targetSchema) {
        return res.status(400).json({
          error: "sourceSchema and targetSchema are required",
        });
      }

      log.info("Generating AI mapping", {
        sourceSystem,
        targetSystem,
        sourceFormat,
        targetFormat,
      });

      // Call AI API to generate mapping
      const mappingResult = await generateMappingWithAI({
        sourceSchema,
        targetSchema,
        sourceSystem,
        targetSystem,
        sourceFormat,
        targetFormat,
        sampleData,
      });

      res.json(mappingResult);
    } catch (error: any) {
      log.error("Error generating mapping", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/save-mapping - Save reviewed mapping to filesystem
  app.post("/api/dev/save-mapping", async (req, res) => {
    try {
      const { mappingYAML, filename, directory } = req.body;

      if (!mappingYAML || !filename) {
        return res.status(400).json({
          error: "mappingYAML and filename are required",
        });
      }

      // Sanitize directory path
      const safeDir = directory?.replace(/[^a-zA-Z0-9-_/]/g, "") || "custom";
      const mappingDir = join(process.cwd(), "mappings", safeDir);

      // Create directory if it doesn't exist
      mkdirSync(mappingDir, { recursive: true });

      // Save mapping file
      const filePath = join(mappingDir, filename);
      writeFileSync(filePath, mappingYAML, "utf-8");

      log.info(`Mapping saved to ${filePath}`);

      res.json({
        success: true,
        path: `mappings/${safeDir}/${filename}`,
        message: "Mapping saved successfully",
      });
    } catch (error: any) {
      log.error("Error saving mapping", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/dev/ai-status - Check if AI API is configured
  app.get("/api/dev/ai-status", (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    res.json({
      configured: !!apiKey,
      provider: process.env.OPENAI_API_KEY ? "openai" : process.env.ANTHROPIC_API_KEY ? "anthropic" : "none",
    });
  });
}

/**
 * Generate mapping using AI API
 */
async function generateMappingWithAI(params: {
  sourceSchema: any;
  targetSchema: any;
  sourceSystem: string;
  targetSystem: string;
  sourceFormat: string;
  targetFormat: string;
  sampleData?: any;
}): Promise<{
  mappingYAML: string;
  fieldMappings: Array<{
    sourceField: string;
    targetField: string;
    confidence: number;
    transform?: string;
    needsReview: boolean;
  }>;
  confidence: number;
  suggestedReviews: string[];
}> {
  const {
    sourceSchema,
    targetSchema,
    sourceSystem,
    targetSystem,
    sourceFormat,
    targetFormat,
    sampleData,
  } = params;

  // Check for API key
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!openaiKey && !anthropicKey) {
    log.warn("No AI API key configured, using rule-based mapping");
    return generateRuleBasedMapping(params);
  }

  try {
    // Build AI prompt
    const prompt = buildMappingPrompt(
      sourceSchema,
      targetSchema,
      sourceSystem,
      targetSystem,
      sourceFormat,
      targetFormat,
      sampleData
    );

    let aiResponse: string;

    // Call AI API (OpenAI preferred, fallback to Anthropic)
    if (openaiKey) {
      aiResponse = await callOpenAI(prompt, openaiKey);
    } else {
      aiResponse = await callAnthropic(prompt, anthropicKey!);
    }

    // Parse AI response
    const parsed = parseAIResponse(aiResponse);

    log.info("AI mapping generated", {
      confidence: parsed.confidence,
      fieldCount: parsed.fieldMappings.length,
    });

    return parsed;
  } catch (error: any) {
    log.error("AI generation failed, falling back to rule-based", error);
    return generateRuleBasedMapping(params);
  }
}

/**
 * Build AI prompt for mapping generation
 */
function buildMappingPrompt(
  sourceSchema: any,
  targetSchema: any,
  sourceSystem: string,
  targetSystem: string,
  sourceFormat: string,
  targetFormat: string,
  sampleData?: any
): string {
  return `You are an expert data transformation engineer. Generate a YAML mapping that transforms data from ${sourceSystem} to ${targetSystem}.

SOURCE SCHEMA (${sourceFormat}):
${JSON.stringify(sourceSchema, null, 2)}

TARGET SCHEMA (${targetFormat}):
${JSON.stringify(targetSchema, null, 2)}

${sampleData ? `SAMPLE DATA:\n${JSON.stringify(sampleData, null, 2)}\n` : ""}

Generate a YAML mapping in this EXACT format:

\`\`\`yaml
sourceFormat: "${sourceFormat}"
targetFormat: "${targetFormat}"
sourceSystem: "${sourceSystem}"
targetSystem: "${targetSystem}"
version: "1.0"

mapping:
  targetField1:
    path: "$.sourceField1"
    optional: false
  targetField2:
    path: "$.nested.sourceField2"
    transform: "toUpperCase"
    optional: true
  targetField3:
    path: "$.sourceField3"
    default: "DEFAULT_VALUE"
    optional: true

# Include transforms if needed
transforms:
  toUpperCase:
    description: "Convert to uppercase"
  toISO8601:
    description: "Convert date to ISO 8601 format"
\`\`\`

ALSO provide field-by-field analysis in JSON:
\`\`\`json
{
  "fieldMappings": [
    {
      "sourceField": "sourceField1",
      "targetField": "targetField1",
      "confidence": 0.95,
      "needsReview": false
    }
  ],
  "confidence": 0.85,
  "suggestedReviews": ["Field X has multiple candidates", "UOM needs lookup table"]
}
\`\`\`

Rules:
1. Match fields by semantic meaning, not just name similarity
2. Use JSONPath syntax: $.field.nested
3. Flag low-confidence mappings (< 0.7) as needsReview: true
4. Suggest transforms for data type conversions
5. Mark optional fields appropriately
6. Include default values where sensible

Return BOTH the YAML and JSON analysis.`;
}

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert data transformation engineer specializing in enterprise integration mappings.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more deterministic output
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Call Anthropic Claude API
 */
async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-sonnet-20240229",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

/**
 * Parse AI response to extract YAML and metadata
 */
function parseAIResponse(aiResponse: string): {
  mappingYAML: string;
  fieldMappings: any[];
  confidence: number;
  suggestedReviews: string[];
} {
  // Extract YAML between ```yaml and ```
  const yamlMatch = aiResponse.match(/```yaml\n([\s\S]*?)\n```/);
  const mappingYAML = yamlMatch ? yamlMatch[1] : "";

  // Extract JSON between ```json and ```
  const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/);
  let analysis = {
    fieldMappings: [],
    confidence: 0.5,
    suggestedReviews: [],
  };

  if (jsonMatch) {
    try {
      analysis = JSON.parse(jsonMatch[1]);
    } catch (error) {
      log.warn("Failed to parse AI analysis JSON", error);
    }
  }

  return {
    mappingYAML,
    ...analysis,
  };
}

/**
 * Fallback: Rule-based mapping (when no AI API available)
 */
function generateRuleBasedMapping(params: {
  sourceSchema: any;
  targetSchema: any;
  sourceSystem: string;
  targetSystem: string;
  sourceFormat: string;
  targetFormat: string;
}): {
  mappingYAML: string;
  fieldMappings: any[];
  confidence: number;
  suggestedReviews: string[];
} {
  const { sourceSchema, targetSchema, sourceSystem, targetSystem, sourceFormat, targetFormat } = params;

  // Simple field name matching
  const fieldMappings: any[] = [];
  const sourceFields = extractFields(sourceSchema);
  const targetFields = extractFields(targetSchema);

  for (const targetField of targetFields) {
    const bestMatch = findBestMatch(targetField, sourceFields);
    fieldMappings.push({
      sourceField: bestMatch.field,
      targetField,
      confidence: bestMatch.confidence,
      needsReview: bestMatch.confidence < 0.7,
    });
  }

  // Generate basic YAML
  const mappingYAML = `sourceFormat: "${sourceFormat}"
targetFormat: "${targetFormat}"
sourceSystem: "${sourceSystem}"
targetSystem: "${targetSystem}"
version: "1.0"

mapping:
${fieldMappings
  .map(
    (m) => `  ${m.targetField}:
    path: "$.${m.sourceField}"
    optional: ${m.needsReview}`
  )
  .join("\n")}
`;

  return {
    mappingYAML,
    fieldMappings,
    confidence: 0.6,
    suggestedReviews: [
      "Rule-based mapping generated (no AI API configured)",
      "Review all field mappings manually",
    ],
  };
}

/**
 * Extract field names from schema
 */
function extractFields(schema: any, prefix = ""): string[] {
  if (!schema || typeof schema !== "object") return [];

  const fields: string[] = [];

  if (schema.properties) {
    // JSON Schema format
    for (const [key, value] of Object.entries(schema.properties)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      fields.push(fieldPath);
      if (typeof value === "object" && (value as any).properties) {
        fields.push(...extractFields(value, fieldPath));
      }
    }
  } else {
    // Plain object format
    for (const [key, value] of Object.entries(schema)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      fields.push(fieldPath);
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        fields.push(...extractFields(value, fieldPath));
      }
    }
  }

  return fields;
}

/**
 * Find best matching field by name similarity
 */
function findBestMatch(
  targetField: string,
  sourceFields: string[]
): { field: string; confidence: number } {
  const targetLower = targetField.toLowerCase().replace(/[_-]/g, "");

  let bestMatch = sourceFields[0] || targetField;
  let bestScore = 0;

  for (const sourceField of sourceFields) {
    const sourceLower = sourceField.toLowerCase().replace(/[_-]/g, "");

    // Exact match
    if (sourceLower === targetLower) {
      return { field: sourceField, confidence: 1.0 };
    }

    // Substring match
    if (sourceLower.includes(targetLower) || targetLower.includes(sourceLower)) {
      const score = 0.8;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = sourceField;
      }
    }

    // Levenshtein similarity
    const similarity = calculateSimilarity(targetLower, sourceLower);
    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = sourceField;
    }
  }

  return { field: bestMatch, confidence: bestScore };
}

/**
 * Calculate string similarity (simple Levenshtein-based)
 */
function calculateSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Levenshtein distance calculation
 */
function levenshteinDistance(s1: string, s2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[s2.length][s1.length];
}
