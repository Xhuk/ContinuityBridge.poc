import { logger } from "../core/logger.js";

const log = logger.child("Amazon-Receiver");

export async function sendToAmazon(payload: any): Promise<{ success: boolean; timestamp: string }> {
  log.info("Dispatching to Amazon", { traceId: payload.traceId });

  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));

  return {
    success: true,
    timestamp: new Date().toISOString(),
  };
}
