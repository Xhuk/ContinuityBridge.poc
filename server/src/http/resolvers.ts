import { randomUUID } from "crypto";
import { metricsCollector } from "../core/metrics.js";
import { Pipeline } from "../core/pipeline.js";
import { getWorkerInstance } from "../workers/worker.js";
import { getQueueProvider, getCurrentBackend } from "../serverQueue.js";
import { getEventStorage, getDecisionStorage, getPayloadStorage } from "./rest.js";

const pipeline = new Pipeline();

export const resolvers = {
  Query: {
    kpis: () => {
      return metricsCollector.getSnapshot();
    },

    recentEvents: (_: any, { limit }: { limit?: number }) => {
      const events = getEventStorage();
      const eventLimit = limit || 20;
      return events.slice(-eventLimit).reverse();
    },

    decisions: () => {
      const decisions = getDecisionStorage();
      return decisions.slice(-50).reverse();
    },
  },

  Mutation: {
    processItemIFD: async (_: any, { xml }: { xml: string }) => {
      const traceId = randomUUID();

      try {
        const validation = pipeline.validateXML(xml);
        if (!validation.valid) {
          return {
            ok: false,
            traceId,
            error: `XML validation failed: ${validation.error}`,
          };
        }

        const queueProvider = getQueueProvider();
        await queueProvider.enqueue(
          "items.inbound",
          JSON.stringify({ xml, traceId })
        );

        // Store payload for potential replay
        const payloads = getPayloadStorage();
        payloads.set(traceId, xml);

        // Return immediately - worker will process
        return {
          ok: true,
          traceId,
          canonical: null,
          error: null,
        };
      } catch (error: any) {
        return {
          ok: false,
          traceId,
          error: error.message,
        };
      }
    },

    replayEvent: async (_: any, { id }: { id: string }) => {
      const events = getEventStorage();
      const payloads = getPayloadStorage();
      
      const event = events.find((e) => e.id === id);
      if (!event) return false;

      // Get original XML payload
      const xml = payloads.get(event.traceId);
      if (!xml) return false;

      // Re-enqueue with original XML
      const queueProvider = getQueueProvider();
      const newTraceId = randomUUID();
      await queueProvider.enqueue(
        "items.inbound",
        JSON.stringify({ xml, traceId: newTraceId })
      );

      // Store payload for new trace
      payloads.set(newTraceId, xml);

      return true;
    },

    setWorker: async (
      _: any,
      { enabled, concurrency }: { enabled: boolean; concurrency?: number }
    ) => {
      const worker = getWorkerInstance();

      if (enabled) {
        if (concurrency) {
          worker.setConfig({ concurrency });
        }
        await worker.start();
      } else {
        await worker.stop();
      }

      return worker.getStatus();
    },

    setQueueBackend: async (_: any, { backend }: { backend: string }) => {
      // Note: This would require restarting the application
      // For now, just return current config
      const worker = getWorkerInstance();
      const status = worker.getStatus();

      return {
        backend: getCurrentBackend(),
        workerEnabled: status.enabled,
        concurrency: status.concurrency,
      };
    },
  },
};
