import { logger } from "../core/logger.js";

const log = logger.child("GeminiService");

export interface GeminiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GeminiGenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

/**
 * Gemini AI Service - Google's Generative AI
 * Free tier: 15 requests/min, 1500 requests/day
 * 
 * Used for:
 * 1. Smart mapping generation
 * 2. Error diagnosis and resolution suggestions
 * 3. Flow configuration assistance
 * 4. Test data generation
 * 5. Documentation generation
 */
export class GeminiService {
  private apiKey: string | undefined;
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  private model = "gemini-1.5-flash"; // Free tier model

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    
    if (!this.apiKey) {
      log.warn("GEMINI_API_KEY not set - AI features will be disabled");
    }
  }

  /**
   * Check if Gemini is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Generate text completion
   */
  async generate(
    messages: GeminiMessage[],
    options: GeminiGenerateOptions = {}
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error("Gemini API key not configured");
    }

    const model = options.model || this.model;
    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens || 2048;

    try {
      // Build prompt with system instructions
      const contents = [];
      
      if (options.systemPrompt) {
        contents.push({
          role: "user",
          parts: [{ text: options.systemPrompt }]
        });
      }

      // Add conversation messages
      for (const msg of messages) {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }]
        });
      }

      const response = await fetch(
        `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
              topP: 0.95,
              topK: 40,
            },
            safetySettings: [
              {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_ONLY_HIGH",
              },
              {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_ONLY_HIGH",
              },
              {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_ONLY_HIGH",
              },
              {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_ONLY_HIGH",
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      
      // Extract text from response
      const candidate = data.candidates?.[0];
      if (!candidate) {
        throw new Error("No response from Gemini");
      }

      const text = candidate.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("Empty response from Gemini");
      }

      log.info("Gemini generation successful", {
        model,
        inputLength: messages.reduce((acc, m) => acc + m.content.length, 0),
        outputLength: text.length,
      });

      return text;
    } catch (error: any) {
      log.error("Gemini generation failed", { error: error.message });
      throw error;
    }
  }

  /**
   * Generate object mapping suggestions
   */
  async suggestMappings(
    sourceSchema: any,
    targetSchema: any,
    context?: string
  ): Promise<Record<string, string>> {
    const systemPrompt = `You are an expert data integration consultant specializing in field mapping.
Analyze source and target schemas and suggest optimal field mappings.
Return ONLY a valid JSON object mapping target fields to source JSONPath expressions.
Example: {"orderId": "$.OrderDocument.OrderNumber", "customer.name": "$.Destination.CustomerName"}`;

    const userPrompt = `Map these schemas:

SOURCE SCHEMA:
${JSON.stringify(sourceSchema, null, 2)}

TARGET SCHEMA:
${JSON.stringify(targetSchema, null, 2)}

${context ? `\nCONTEXT: ${context}` : ""}

Return only the mapping JSON, no explanation.`;

    const response = await this.generate(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, temperature: 0.3 }
    );

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid mapping response from AI");
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Diagnose flow error and suggest fixes
   */
  async diagnoseError(params: {
    flowName: string;
    nodeName: string;
    nodeType: string;
    errorMessage: string;
    payloadSnapshot?: any;
    stackTrace?: string;
  }): Promise<{
    diagnosis: string;
    suggestedFixes: string[];
    rootCause: string;
  }> {
    const systemPrompt = `You are an expert integration troubleshooting assistant.
Analyze flow execution errors and provide actionable fixes for consultants.
Focus on practical, implementation-ready solutions.`;

    const userPrompt = `Diagnose this flow error:

FLOW: ${params.flowName}
NODE: ${params.nodeName} (${params.nodeType})
ERROR: ${params.errorMessage}

${params.payloadSnapshot ? `PAYLOAD:\n${JSON.stringify(params.payloadSnapshot, null, 2)}` : ""}
${params.stackTrace ? `\nSTACK TRACE:\n${params.stackTrace}` : ""}

Provide:
1. Root cause analysis
2. Step-by-step fixes (max 3)
3. Prevention tips

Format as JSON:
{
  "rootCause": "...",
  "diagnosis": "...",
  "suggestedFixes": ["fix 1", "fix 2", "fix 3"]
}`;

    const response = await this.generate(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, temperature: 0.4 }
    );

    // Extract JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid diagnosis response from AI");
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Generate test data based on schema
   */
  async generateTestData(
    schema: any,
    format: "json" | "xml" | "csv",
    context?: string
  ): Promise<string> {
    const systemPrompt = `You are an expert test data generator.
Generate realistic, valid test data that matches the given schema.
Return ONLY the raw data in the requested format, no explanation.`;

    const userPrompt = `Generate sample ${format.toUpperCase()} data for this schema:

SCHEMA:
${JSON.stringify(schema, null, 2)}

${context ? `\nCONTEXT: ${context}` : ""}

Generate 1-3 realistic examples. Return only the ${format.toUpperCase()} data.`;

    return await this.generate(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, temperature: 0.8 }
    );
  }

  /**
   * Help configure a flow based on natural language
   */
  async suggestFlowConfiguration(
    requirement: string,
    availableInterfaces?: string[]
  ): Promise<{
    flowName: string;
    description: string;
    suggestedNodes: Array<{
      type: string;
      label: string;
      config: Record<string, any>;
    }>;
  }> {
    const systemPrompt = `You are an integration flow architect.
Convert business requirements into technical flow configurations.
Suggest node types and configurations for ContinuityBridge flows.

Available node types:
- interface_source: Pull data from external system
- object_mapper: Transform field mappings
- conditional: Route based on conditions
- validation: Validate data quality
- interface_destination: Send to external system
- error_handler: Handle failures
- logger: Debug logging

Return JSON with flow structure.`;

    const userPrompt = `Design a flow for this requirement:

REQUIREMENT:
${requirement}

${availableInterfaces ? `\nAVAILABLE INTERFACES:\n${availableInterfaces.join("\n")}` : ""}

Return JSON:
{
  "flowName": "...",
  "description": "...",
  "suggestedNodes": [
    {
      "type": "interface_source",
      "label": "Pull Orders",
      "config": { "interfaceId": "..." }
    }
  ]
}`;

    const response = await this.generate(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, temperature: 0.5 }
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Invalid flow suggestion response from AI");
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Explain what a configuration does in plain language
   */
  async explainConfiguration(
    nodeType: string,
    config: Record<string, any>
  ): Promise<string> {
    const systemPrompt = `You are an integration consultant explaining technical configurations to business users.
Translate technical JSON configs into clear, simple explanations.`;

    const userPrompt = `Explain what this configuration does in simple terms:

NODE TYPE: ${nodeType}
CONFIGURATION:
${JSON.stringify(config, null, 2)}

Provide a 2-3 sentence explanation suitable for non-technical users.`;

    return await this.generate(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, temperature: 0.4 }
    );
  }
}

// Singleton instance
export const geminiService = new GeminiService();
