import { logger } from "../core/logger.js";

const log = logger.child("3PL-Receiver");

export async function sendTo3PL(payload: any): Promise<{ success: boolean; timestamp: string }> {
  log.info("Dispatching to 3PL", { traceId: payload.traceId });

  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));

  return {
    success: true,
    timestamp: new Date().toISOString(),
  };
}
