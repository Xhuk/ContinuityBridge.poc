/**
 * Multi-AI Consensus System
 * Critical decisions require validation from multiple AI providers
 * 🔒 FOUNDER ONLY - Highest level of AI validation
 */

import { logger } from "../core/logger";

export type AIProvider = "gemini" | "openai" | "anthropic";

export interface ConsensusRequest {
  question: string;
  domain: string;
  context: Record<string, any>;
  systemPrompt: string;
  requireConsensus: boolean; // If true, requires 2+ AIs to agree
}

export interface AIResponse {
  provider: AIProvider;
  advice: string;
  confidence: number;
  responseTime: number;
  error?: string;
}

export interface ConsensusResult {
  finalAdvice: string;
  consensusLevel: "unanimous" | "majority" | "split" | "single";
  providersUsed: AIProvider[];
  responses: AIResponse[];
  agreements: string[];
  disagreements: string[];
  confidence: number;
  recommendation: string;
}

/**
 * Get consensus advice from multiple AI providers
 */
export async function getConsensusAdvice(
  request: ConsensusRequest
): Promise<ConsensusResult> {
  const startTime = Date.now();
  
  logger.info("Starting multi-AI consensus", {
    scope: "superadmin",
    domain: request.domain,
    requireConsensus: request.requireConsensus,
  });

  // Call all AI providers in parallel
  const [geminiResponse, openaiResponse, anthropicResponse] = await Promise.allSettled([
    callGemini(request),
    callOpenAI(request),
    callAnthropic(request),
  ]);

  // Collect successful responses
  const responses: AIResponse[] = [];
  
  if (geminiResponse.status === "fulfilled") responses.push(geminiResponse.value);
  if (openaiResponse.status === "fulfilled") responses.push(openaiResponse.value);
  if (anthropicResponse.status === "fulfilled") responses.push(anthropicResponse.value);

  // Analyze consensus
  const consensus = analyzeConsensus(responses, request.question);

  logger.info("Multi-AI consensus completed", {
    scope: "superadmin",
    duration: Date.now() - startTime,
    consensusLevel: consensus.consensusLevel,
    providersUsed: responses.map(r => r.provider),
    confidence: consensus.confidence,
  });

  return consensus;
}

/**
 * Call Google Gemini API
 */
async function callGemini(request: ConsensusRequest): Promise<AIResponse> {
  const startTime = Date.now();
  
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // Build prompt
    const fullPrompt = buildPrompt(request);

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: fullPrompt }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 800,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const advice = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return {
      provider: "gemini",
      advice,
      confidence: 0.85,
      responseTime: Date.now() - startTime,
    };

  } catch (error: any) {
    logger.error("Gemini API call failed", error, { scope: "superadmin" });
    return {
      provider: "gemini",
      advice: "",
      confidence: 0,
      responseTime: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Call OpenAI ChatGPT API
 */
async function callOpenAI(request: ConsensusRequest): Promise<AIResponse> {
  const startTime = Date.now();
  
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const fullPrompt = buildPrompt(request);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: `${fullPrompt}\n\nQuestion: ${request.question}` },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const advice = data.choices?.[0]?.message?.content || "";

    return {
      provider: "openai",
      advice,
      confidence: 0.90,
      responseTime: Date.now() - startTime,
    };

  } catch (error: any) {
    logger.error("OpenAI API call failed", error, { scope: "superadmin" });
    return {
      provider: "openai",
      advice: "",
      confidence: 0,
      responseTime: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Call Anthropic Claude API
 */
async function callAnthropic(request: ConsensusRequest): Promise<AIResponse> {
  const startTime = Date.now();
  
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    const fullPrompt = buildPrompt(request);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-sonnet-20240229",
        max_tokens: 800,
        temperature: 0.3,
        system: request.systemPrompt,
        messages: [
          { role: "user", content: `${fullPrompt}\n\nQuestion: ${request.question}` },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    const data = await response.json();
    const advice = data.content?.[0]?.text || "";

    return {
      provider: "anthropic",
      advice,
      confidence: 0.88,
      responseTime: Date.now() - startTime,
    };

  } catch (error: any) {
    logger.error("Anthropic API call failed", error, { scope: "superadmin" });
    return {
      provider: "anthropic",
      advice: "",
      confidence: 0,
      responseTime: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Build standardized prompt for all providers
 */
function buildPrompt(request: ConsensusRequest): string {
  const contextStr = Object.entries(request.context)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");

  return `CONTEXT:\n${contextStr}\n\nDOMAIN: ${request.domain}`;
}

/**
 * Analyze responses and determine consensus
 */
function analyzeConsensus(
  responses: AIResponse[],
  question: string
): ConsensusResult {
  const validResponses = responses.filter(r => !r.error && r.advice);

  if (validResponses.length === 0) {
    return {
      finalAdvice: "ERROR: All AI providers failed to respond. Please try again or contact support.",
      consensusLevel: "single",
      providersUsed: responses.map(r => r.provider),
      responses,
      agreements: [],
      disagreements: ["All providers failed"],
      confidence: 0,
      recommendation: "Manual review required - AI consensus unavailable",
    };
  }

  // Extract key points from each response
  const keyPoints = validResponses.map(r => extractKeyPoints(r.advice));

  // Find common themes
  const agreements = findCommonThemes(keyPoints);
  const disagreements = findDisagreements(keyPoints);

  // Determine consensus level
  let consensusLevel: "unanimous" | "majority" | "split" | "single";
  if (validResponses.length === 3 && agreements.length >= 3) {
    consensusLevel = "unanimous";
  } else if (validResponses.length >= 2 && agreements.length >= 2) {
    consensusLevel = "majority";
  } else if (validResponses.length >= 2) {
    consensusLevel = "split";
  } else {
    consensusLevel = "single";
  }

  // Build final advice
  const finalAdvice = buildFinalAdvice(validResponses, agreements, disagreements, consensusLevel);

  // Calculate overall confidence
  const avgConfidence = validResponses.reduce((acc, r) => acc + r.confidence, 0) / validResponses.length;
  const consensusBonus = consensusLevel === "unanimous" ? 0.1 : consensusLevel === "majority" ? 0.05 : 0;
  const finalConfidence = Math.min(avgConfidence + consensusBonus, 0.98);

  // Build recommendation
  const recommendation = buildRecommendation(consensusLevel, validResponses.length, agreements.length);

  return {
    finalAdvice,
    consensusLevel,
    providersUsed: validResponses.map(r => r.provider),
    responses,
    agreements,
    disagreements,
    confidence: finalConfidence,
    recommendation,
  };
}

/**
 * Extract key points from AI advice (simple keyword extraction)
 */
function extractKeyPoints(advice: string): string[] {
  const points: string[] = [];
  
  // Look for numbered recommendations
  const numberedMatches = advice.match(/\d+\.\s*([^\n]+)/g);
  if (numberedMatches) {
    points.push(...numberedMatches.map(m => m.replace(/^\d+\.\s*/, "").trim()));
  }

  // Look for bullet points
  const bulletMatches = advice.match(/[•\-\*]\s*([^\n]+)/g);
  if (bulletMatches) {
    points.push(...bulletMatches.map(m => m.replace(/^[•\-\*]\s*/, "").trim()));
  }

  return points;
}

/**
 * Find common themes across responses
 */
function findCommonThemes(allKeyPoints: string[][]): string[] {
  const agreements: string[] = [];
  
  // Simple keyword matching for common themes
  const keywords = ["pricing", "migration", "customer", "revenue", "cost", "security", "performance"];
  
  for (const keyword of keywords) {
    const mentionCount = allKeyPoints.filter(points => 
      points.some(point => point.toLowerCase().includes(keyword))
    ).length;
    
    if (mentionCount >= 2) {
      agreements.push(`Multiple AIs recommend addressing ${keyword}`);
    }
  }

  return agreements;
}

/**
 * Find disagreements between responses
 */
function findDisagreements(allKeyPoints: string[][]): string[] {
  const disagreements: string[] = [];
  
  // Check if one AI recommends action while others recommend caution
  const actionKeywords = ["immediately", "urgent", "quickly"];
  const cautionKeywords = ["gradually", "carefully", "monitor"];
  
  const hasAction = allKeyPoints.some(points =>
    points.some(point => actionKeywords.some(kw => point.toLowerCase().includes(kw)))
  );
  
  const hasCaution = allKeyPoints.some(points =>
    points.some(point => cautionKeywords.some(kw => point.toLowerCase().includes(kw)))
  );
  
  if (hasAction && hasCaution) {
    disagreements.push("Timeline: Some AIs recommend immediate action, others suggest gradual approach");
  }

  return disagreements;
}

/**
 * Build final consolidated advice
 */
function buildFinalAdvice(
  responses: AIResponse[],
  agreements: string[],
  disagreements: string[],
  consensusLevel: string
): string {
  let advice = `🤖 **MULTI-AI CONSENSUS ANALYSIS**\n`;
  advice += `Consensus Level: ${consensusLevel.toUpperCase()}\n`;
  advice += `Providers: ${responses.map(r => r.provider).join(", ")}\n\n`;

  advice += `**AGREEMENTS (Common Recommendations):**\n`;
  if (agreements.length > 0) {
    agreements.forEach((agreement, idx) => {
      advice += `${idx + 1}. ${agreement}\n`;
    });
  } else {
    advice += `- No strong consensus found\n`;
  }

  if (disagreements.length > 0) {
    advice += `\n**DISAGREEMENTS (Consider Both Perspectives):**\n`;
    disagreements.forEach((disagreement, idx) => {
      advice += `${idx + 1}. ${disagreement}\n`;
    });
  }

  advice += `\n**DETAILED ANALYSIS BY PROVIDER:**\n\n`;
  
  responses.forEach(response => {
    if (!response.error) {
      advice += `--- ${response.provider.toUpperCase()} ---\n`;
      advice += `${response.advice.substring(0, 500)}${response.advice.length > 500 ? "..." : ""}\n\n`;
    }
  });

  return advice;
}

/**
 * Build recommendation based on consensus
 */
function buildRecommendation(
  consensusLevel: string,
  providerCount: number,
  agreementCount: number
): string {
  if (consensusLevel === "unanimous" && providerCount === 3) {
    return "✅ STRONG CONSENSUS: All 3 AI providers agree. High confidence in recommendations.";
  }
  
  if (consensusLevel === "majority" && agreementCount >= 2) {
    return "⚠️ MAJORITY CONSENSUS: 2+ providers agree. Proceed with validation of edge cases.";
  }
  
  if (consensusLevel === "split") {
    return "⚠️ SPLIT OPINIONS: Providers disagree. Manual review strongly recommended.";
  }
  
  return "⚠️ LIMITED DATA: Only 1 provider responded. Seek additional validation.";
}
