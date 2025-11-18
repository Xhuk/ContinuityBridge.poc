/**
 * AI Billing Configuration
 * 
 * Centralized pricing model for AI token usage billing.
 * Update these values to change platform-wide pricing.
 */

export interface AIBillingConfig {
  tokensPerBillingUnit: number;  // Base token count
  pricePerUnit: number;           // Price in USD for the token unit
  currency: string;               // Currency code
  billingPeriod: "monthly" | "usage-based";
}

/**
 * CURRENT PRICING MODEL
 * 
 * Change these values to update billing rates:
 * - tokensPerBillingUnit: Number of tokens per pricing unit (was 2000, now 10000)
 * - pricePerUnit: Price in USD for that many tokens (was $250, now $400)
 */
export const AI_BILLING_CONFIG: AIBillingConfig = {
  tokensPerBillingUnit: 10000,  // 10,000 tokens per billing unit
  pricePerUnit: 400,             // $400 USD per 10,000 tokens
  currency: "USD",
  billingPeriod: "monthly",
};

/**
 * Calculate cost for given token count
 */
export function calculateTokenCost(tokens: number): number {
  if (tokens <= 0) return 0;
  return (tokens / AI_BILLING_CONFIG.tokensPerBillingUnit) * AI_BILLING_CONFIG.pricePerUnit;
}

/**
 * Get price per individual token
 */
export function getPricePerToken(): number {
  return AI_BILLING_CONFIG.pricePerUnit / AI_BILLING_CONFIG.tokensPerBillingUnit;
}

/**
 * Get human-readable pricing description
 */
export function getBillingRateDescription(): string {
  return `$${AI_BILLING_CONFIG.pricePerUnit} per ${AI_BILLING_CONFIG.tokensPerBillingUnit.toLocaleString()} tokens`;
}

/**
 * Get billing configuration for API responses
 */
export function getBillingConfig() {
  return {
    tokensPerUnit: AI_BILLING_CONFIG.tokensPerBillingUnit,
    pricePerUnit: AI_BILLING_CONFIG.pricePerUnit,
    pricePerToken: getPricePerToken(),
    currency: AI_BILLING_CONFIG.currency,
    description: getBillingRateDescription(),
  };
}
