import { logger } from "../core/logger.js";

const log = logger.child("SAP-Receiver");

export async function sendToSAP(payload: any): Promise<{ success: boolean; timestamp: string }> {
  log.info("Dispatching to SAP", { traceId: payload.traceId });

  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));

  return {
    success: true,
    timestamp: new Date().toISOString(),
  };
}
