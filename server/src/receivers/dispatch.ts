import { sendToSAP } from "./sap.js";
import { sendTo3PL } from "./threepl.js";
import { sendToMeli } from "./meli.js";
import { sendToAmazon } from "./amazon.js";
import { logger } from "../core/logger.js";

const log = logger.child("Dispatcher");

interface DispatchResult {
  receiver: string;
  success: boolean;
  timestamp: string;
}

export async function dispatchToReceivers(payload: any): Promise<DispatchResult[]> {
  log.info("Starting fan-out dispatch", { traceId: payload.traceId });

  const results = await Promise.all([
    sendToSAP(payload)
      .then((res) => ({ receiver: "SAP", ...res }))
      .catch(() => ({ receiver: "SAP", success: false, timestamp: new Date().toISOString() })),

    sendTo3PL(payload)
      .then((res) => ({ receiver: "3PL", ...res }))
      .catch(() => ({ receiver: "3PL", success: false, timestamp: new Date().toISOString() })),

    sendToMeli(payload)
      .then((res) => ({ receiver: "Meli", ...res }))
      .catch(() => ({ receiver: "Meli", success: false, timestamp: new Date().toISOString() })),

    sendToAmazon(payload)
      .then((res) => ({ receiver: "Amazon", ...res }))
      .catch(() => ({
        receiver: "Amazon",
        success: false,
        timestamp: new Date().toISOString(),
      })),
  ]);

  const successCount = results.filter((r) => r.success).length;
  log.info(`Dispatch completed: ${successCount}/${results.length} successful`, {
    traceId: payload.traceId,
  });

  return results;
}
