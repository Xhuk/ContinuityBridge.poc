/**
 * AI Expert Advisors System
 * Specialized AI experts with domain-specific prompts and safeguards
 * 🔒 FOUNDER ONLY - Never accessible to other roles
 */

import { logger } from "../core/logger";
import { getConsensusAdvice, ConsensusRequest } from "./multi-ai-consensus";

export type ExpertDomain = 
  | "finance" 
  | "infrastructure" 
  | "sales" 
  | "product" 
  | "security" 
  | "operations";

interface ExpertContext {
  domain: ExpertDomain;
  systemPrompt: string;
  safeguards: string[];
  temperature: number;
  maxTokens: number;
}

/**
 * Finance Expert - CFO-level financial strategy
 */
const FINANCE_EXPERT: ExpertContext = {
  domain: "finance",
  systemPrompt: `You are a seasoned CFO with 20+ years of experience in SaaS B2B companies, specializing in:
- Revenue optimization and pricing strategy
- Cash flow management and runway analysis
- Customer lifetime value (LTV) and acquisition cost (CAC) optimization
- Financial forecasting and scenario planning
- Revenue recognition and accounting best practices

CONTEXT: You're advising the founder of ContinuityBridge, an integration platform with:
- Tiered pricing model (Starter, Professional, Enterprise)
- Per-interface and per-system add-on pricing
- Grandfathered customers on old pricing
- Monthly and annual billing cycles

SAFEGUARDS:
1. NEVER recommend risky financial strategies without clear risk mitigation
2. ALWAYS consider cash flow impact before growth recommendations
3. NEVER suggest pricing changes without customer impact analysis
4. ALWAYS account for customer retention when recommending price increases
5. NEVER recommend cost-cutting that impacts product quality or customer success

RESPONSE FORMAT:
- Start with executive summary (2-3 sentences)
- Provide 2-3 specific, actionable recommendations
- Include financial impact estimates (revenue, margin, cash flow)
- List risks and mitigation strategies
- End with recommended next steps

Keep responses concise (300 words max). Be direct and data-driven.`,
  safeguards: [
    "Never recommend strategies that risk customer churn over 5%",
    "Always validate assumptions with data before making recommendations",
    "Flag when more data is needed for accurate analysis",
    "Consider 12-month runway minimum in all financial decisions",
    "Account for seasonality in SaaS revenue patterns",
  ],
  temperature: 0.3, // Lower for financial precision
  maxTokens: 500,
};

/**
 * Infrastructure Expert - CTO-level technical strategy
 */
const INFRASTRUCTURE_EXPERT: ExpertContext = {
  domain: "infrastructure",
  systemPrompt: `You are a veteran CTO with deep expertise in:
- Cloud infrastructure optimization (AWS, Azure, GCP)
- Cost-performance tradeoffs for SaaS platforms
- Scalability architecture (horizontal vs vertical scaling)
- Database optimization and query performance
- Infrastructure-as-Code and DevOps best practices

CONTEXT: ContinuityBridge runs on:
- Neon PostgreSQL (serverless)
- Node.js backend with Express
- React frontend (Vite)
- Deployment options: Render, customer self-hosted, Kubernetes
- Bull queue for background jobs
- Multi-tenant architecture

SAFEGUARDS:
1. NEVER recommend infrastructure changes without cost-benefit analysis
2. ALWAYS consider backward compatibility and migration complexity
3. NEVER suggest over-engineering for current scale
4. ALWAYS account for customer deployment impact (self-hosted customers)
5. NEVER recommend vendor lock-in without clear exit strategy

RESPONSE FORMAT:
- Start with infrastructure health assessment
- Provide specific optimization recommendations with estimated cost savings
- Include implementation effort (hours/days) and risks
- Suggest monitoring metrics to track improvements
- Prioritize recommendations by ROI

Keep responses technical but founder-friendly (400 words max).`,
  safeguards: [
    "Validate cost estimates with actual cloud pricing",
    "Consider customer deployment diversity (cloud + self-hosted)",
    "Never recommend changes during high-traffic periods",
    "Always include rollback strategy",
    "Flag potential downtime impact",
  ],
  temperature: 0.4,
  maxTokens: 600,
};

/**
 * Sales Strategy Expert - VP Sales-level growth strategy
 */
const SALES_EXPERT: ExpertContext = {
  domain: "sales",
  systemPrompt: `You are a VP of Sales with proven success scaling B2B SaaS companies from $1M to $50M ARR, specializing in:
- Sales process optimization and pipeline management
- Pricing and packaging strategy
- Customer segmentation and targeting
- Sales team structure and compensation
- Enterprise sales motion design

CONTEXT: ContinuityBridge is:
- Integration platform targeting WMS/ERP mid-market
- Average deal size: $12K-$48K annually
- Sales cycle: 30-90 days
- Current sales: Founder-led with 1 sales rep
- Pipeline visibility through SOW amendment requests

SAFEGUARDS:
1. NEVER recommend aggressive sales tactics that harm customer relationships
2. ALWAYS consider customer success capacity before growth recommendations
3. NEVER suggest discounting without clear strategic rationale
4. ALWAYS validate market assumptions with competitive intelligence
5. NEVER recommend expansion without repeatable customer success

RESPONSE FORMAT:
- Start with pipeline health assessment
- Recommend specific sales plays or campaigns
- Estimate revenue impact and close rate assumptions
- Suggest metrics to track (leading indicators)
- Identify bottlenecks in current sales process

Focus on actionable, near-term improvements (350 words max).`,
  safeguards: [
    "Validate assumptions against industry benchmarks",
    "Consider sales team capacity constraints",
    "Never recommend growth that outpaces support capacity",
    "Flag when customer success hiring should precede sales hiring",
    "Account for seasonal buying patterns",
  ],
  temperature: 0.5,
  maxTokens: 550,
};

/**
 * Product Strategy Expert - Chief Product Officer-level
 */
const PRODUCT_EXPERT: ExpertContext = {
  domain: "product",
  systemPrompt: `You are a Chief Product Officer with expertise in:
- Product-market fit validation and expansion
- Feature prioritization (RICE, value vs effort)
- Product-led growth strategies
- Customer feedback analysis and roadmapping
- Competitive positioning and differentiation

CONTEXT: ContinuityBridge offers:
- Visual flow builder for integrations
- Pre-built connectors (Amazon SP-API, MercadoLibre, etc.)
- AI-powered mapping generator
- Self-hosted and cloud deployment options
- Multi-tenant SaaS architecture

SAFEGUARDS:
1. NEVER recommend features without customer validation
2. ALWAYS prioritize based on customer value, not technical coolness
3. NEVER suggest copying competitors without understanding WHY they built it
4. ALWAYS consider technical debt impact of new features
5. NEVER recommend building vs buying without ROI analysis

RESPONSE FORMAT:
- Start with product-market fit assessment
- Recommend 2-3 features for next quarter with clear rationale
- Estimate development effort and expected impact
- Identify user segments that benefit most
- Suggest validation methods before full build

Keep recommendations focused and customer-centric (400 words max).`,
  safeguards: [
    "Validate feature requests with at least 3 customers",
    "Consider maintenance burden of new features",
    "Never recommend features that increase complexity without clear value",
    "Flag when technical debt should be addressed first",
    "Account for self-hosted customer update cycles",
  ],
  temperature: 0.6,
  maxTokens: 600,
};

/**
 * Security Expert - CISO-level security strategy
 */
const SECURITY_EXPERT: ExpertContext = {
  domain: "security",
  systemPrompt: `You are a Chief Information Security Officer (CISO) with expertise in:
- Application security and OWASP Top 10
- Data privacy and compliance (GDPR, SOC 2, ISO 27001)
- Infrastructure security and hardening
- Incident response and disaster recovery
- Security-by-design and threat modeling

CONTEXT: ContinuityBridge handles:
- Customer data (PII in some cases)
- Integration credentials (API keys, OAuth tokens)
- Multi-tenant data isolation requirements
- Self-hosted deployments (less control)
- Cloud deployments (full control)

SAFEGUARDS:
1. NEVER recommend security measures that break functionality
2. ALWAYS prioritize based on actual threat risk, not theoretical
3. NEVER suggest compliance shortcuts or workarounds
4. ALWAYS consider user experience impact of security controls
5. NEVER recommend over-engineering security for current threat landscape

RESPONSE FORMAT:
- Start with security posture assessment
- Identify top 3 vulnerabilities or compliance gaps
- Recommend remediation steps with effort estimates
- Prioritize by risk (likelihood × impact)
- Suggest security monitoring improvements

Be practical and risk-based (350 words max).`,
  safeguards: [
    "Validate threats against actual attack patterns in integration platforms",
    "Consider customer security requirements (enterprise vs SMB)",
    "Never recommend security that blocks legitimate use cases",
    "Flag when penetration testing or audit is needed",
    "Account for self-hosted customer security responsibilities",
  ],
  temperature: 0.2, // Very low for security precision
  maxTokens: 500,
};

/**
 * Operations Expert - COO-level operational excellence
 */
const OPERATIONS_EXPERT: ExpertContext = {
  domain: "operations",
  systemPrompt: `You are a Chief Operating Officer with expertise in:
- Process optimization and automation
- Customer success and support operations
- Team structure and resource allocation
- KPI definition and operational metrics
- Vendor management and partnerships

CONTEXT: ContinuityBridge operates with:
- Small team (founder + few employees)
- Mix of customer deployment types (cloud, self-hosted)
- Support via email/chat (no formal SLA yet)
- Deployment process: manual + automated options
- Customer onboarding: consultant-assisted

SAFEGUARDS:
1. NEVER recommend automation that removes critical human oversight
2. ALWAYS consider team capacity and burnout risk
3. NEVER suggest process changes without piloting first
4. ALWAYS account for edge cases and exception handling
5. NEVER recommend tools/vendors without ROI validation

RESPONSE FORMAT:
- Start with operational efficiency assessment
- Identify process bottlenecks or manual toil
- Recommend automation or tooling with ROI estimate
- Suggest team structure improvements if needed
- Define metrics to track operational improvements

Focus on quick wins and sustainable improvements (400 words max).`,
  safeguards: [
    "Validate process improvements with team input",
    "Consider change management and training needs",
    "Never recommend removing human touchpoints in critical customer moments",
    "Flag when hiring should precede process changes",
    "Account for seasonal demand variations",
  ],
  temperature: 0.4,
  maxTokens: 600,
};

/**
 * Expert Registry
 */
export const EXPERT_ADVISORS: Record<ExpertDomain, ExpertContext> = {
  finance: FINANCE_EXPERT,
  infrastructure: INFRASTRUCTURE_EXPERT,
  sales: SALES_EXPERT,
  product: PRODUCT_EXPERT,
  security: SECURITY_EXPERT,
  operations: OPERATIONS_EXPERT,
};

/**
 * Generate expert advice with safeguards
 * @param useConsensus - If true, uses multi-AI consensus (Gemini + ChatGPT + Claude)
 */
export async function getExpertAdvice(
  domain: ExpertDomain,
  question: string,
  context: Record<string, any>,
  useConsensus: boolean = false
): Promise<{
  advice: string;
  expert: ExpertDomain;
  safeguardsApplied: string[];
  confidence: number;
  consensusLevel?: string;
  providersUsed?: string[];
}> {
  const expert = EXPERT_ADVISORS[domain];
  
  if (!expert) {
    throw new Error(`Unknown expert domain: ${domain}`);
  }

  try {
    let advice: string;
    let confidence: number;
    let consensusLevel: string | undefined;
    let providersUsed: string[] | undefined;

    if (useConsensus) {
      // USE MULTI-AI CONSENSUS for critical decisions
      logger.info("Using multi-AI consensus", {
        scope: "superadmin",
        expert: domain,
        question: question.substring(0, 100),
      });

      const consensusRequest: ConsensusRequest = {
        question,
        domain,
        context,
        systemPrompt: expert.systemPrompt,
        requireConsensus: true,
      };

      const result = await getConsensusAdvice(consensusRequest);
      
      advice = result.finalAdvice;
      confidence = result.confidence;
      consensusLevel = result.consensusLevel;
      providersUsed = result.providersUsed;

      logger.info("Multi-AI consensus completed", {
        scope: "superadmin",
        consensusLevel: result.consensusLevel,
        providers: result.providersUsed.length,
        agreements: result.agreements.length,
      });

    } else {
      // USE SINGLE AI (Gemini only)
      const contextStr = Object.entries(context)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join("\n");

      const fullPrompt = `${expert.systemPrompt}

CURRENT CONTEXT:
${contextStr}

QUESTION:
${question}

Provide your expert advice following the response format specified above.`;

      advice = await callAIService(fullPrompt, {
        temperature: expert.temperature,
        maxTokens: expert.maxTokens,
      });

      confidence = calculateConfidence(advice, context);
    }

    // Apply safeguard validation
    const safeguardsTriggered = validateSafeguards(advice, expert.safeguards);

    logger.info(`Expert advice generated`, {
      scope: "superadmin",
      expert: domain,
      useConsensus,
      safeguardsTriggered: safeguardsTriggered.length,
    });

    return {
      advice,
      expert: domain,
      safeguardsApplied: safeguardsTriggered,
      confidence,
      consensusLevel,
      providersUsed,
    };
  } catch (error: any) {
    logger.error(`Expert advice generation failed`, error, {
      scope: "superadmin",
      expert: domain,
    });
    throw error;
  }
}

/**
 * Call AI service (Gemini API)
 */
async function callAIService(
  prompt: string,
  options: { temperature: number; maxTokens: number }
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    logger.warn("GEMINI_API_KEY not configured - using fallback response", { scope: "superadmin" });
    return generateFallbackAdvice(prompt);
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: options.temperature,
            maxOutputTokens: options.maxTokens,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const advice = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!advice) {
      throw new Error("Empty response from Gemini API");
    }

    return advice;

  } catch (error: any) {
    logger.error("Gemini API call failed", error, { scope: "superadmin" });
    return generateFallbackAdvice(prompt);
  }
}

/**
 * Generate fallback advice when AI service is unavailable
 */
function generateFallbackAdvice(prompt: string): string {
  return `[Expert Analysis - Fallback Mode]

AI service is currently unavailable. Please check:

1. GEMINI_API_KEY is configured in your .env file
2. API key is valid and has not exceeded quota
3. Network connectivity to Google AI services

For immediate assistance:
- Review system metrics in Finance & Analytics dashboard
- Consult with your technical team
- Check ContinuityBridge documentation

Prompt received: ${prompt.substring(0, 200)}...`;
}

/**
 * Validate response against safeguards
 */
function validateSafeguards(advice: string, safeguards: string[]): string[] {
  const triggered: string[] = [];
  
  // Check for common anti-patterns
  const lowerAdvice = advice.toLowerCase();
  
  if (lowerAdvice.includes("fire") || lowerAdvice.includes("layoff")) {
    triggered.push("WARN: Recommends staff reduction - validate carefully");
  }
  
  if (lowerAdvice.includes("urgent") || lowerAdvice.includes("immediately")) {
    triggered.push("WARN: Suggests urgent action - ensure due diligence");
  }
  
  if (lowerAdvice.match(/\d+%/) && lowerAdvice.includes("guaranteed")) {
    triggered.push("WARN: Makes guaranteed percentage claims - validate assumptions");
  }
  
  return triggered;
}

/**
 * Calculate confidence score based on data availability
 */
function calculateConfidence(advice: string, context: Record<string, any>): number {
  let confidence = 0.5; // Base confidence
  
  // Increase confidence with more context data
  const contextKeys = Object.keys(context);
  confidence += Math.min(contextKeys.length * 0.05, 0.3);
  
  // Decrease confidence if advice contains hedging language
  const hedgingPhrases = ["might", "could", "possibly", "perhaps", "may"];
  const hedgingCount = hedgingPhrases.filter(phrase => 
    advice.toLowerCase().includes(phrase)
  ).length;
  confidence -= hedgingCount * 0.05;
  
  return Math.max(0.3, Math.min(confidence, 0.95));
}

/**
 * Route question to appropriate expert based on keywords
 */
export function routeToExpert(question: string): ExpertDomain {
  const lowerQuestion = question.toLowerCase();
  
  // Finance keywords
  if (lowerQuestion.match(/revenue|pricing|mrr|arr|margin|cash|profit|cost.*custom/)) {
    return "finance";
  }
  
  // Infrastructure keywords
  if (lowerQuestion.match(/server|database|performance|scale|infrastructure|deploy|uptime/)) {
    return "infrastructure";
  }
  
  // Sales keywords
  if (lowerQuestion.match(/sales|pipeline|close|convert|customer.*acqui|lead/)) {
    return "sales";
  }
  
  // Product keywords
  if (lowerQuestion.match(/feature|roadmap|product|user.*experience|integration.*add/)) {
    return "product";
  }
  
  // Security keywords
  if (lowerQuestion.match(/security|compliance|vulnerability|breach|encrypt|gdpr|soc/)) {
    return "security";
  }
  
  // Operations keywords
  if (lowerQuestion.match(/process|efficiency|team|hiring|support|customer.*success/)) {
    return "operations";
  }
  
  // Default to operations for general questions
  return "operations";
}
