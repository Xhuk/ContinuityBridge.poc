import { randomUUID } from "crypto";
import { XMLToCanonicalTransformer } from "../transform/xml-to-canonical.js";
import { OriginDecider } from "../decision/origin-decider.js";
import { dispatchToReceivers } from "../receivers/dispatch.js";
import { metricsCollector } from "./metrics.js";
import { logger } from "./logger.js";
import type { PipelineInput, PipelineResult } from "./types.js";
import type { CanonicalItem } from "@shared/schema";

const log = logger.child("Pipeline");

export class Pipeline {
  private transformer: XMLToCanonicalTransformer;
  private decider: OriginDecider;

  constructor() {
    this.transformer = new XMLToCanonicalTransformer();
    this.decider = new OriginDecider();
    log.info("Pipeline initialized");
  }

  async runItemPipeline(input: PipelineInput): Promise<PipelineResult> {
    const startTime = Date.now();
    const traceId = input.traceId || randomUUID();

    log.info(`Starting pipeline for trace ${traceId}`);

    try {
      // Step 1: Transform XML to canonical (if XML provided)
      let canonical: CanonicalItem;

      if (input.xml) {
        canonical = this.transformer.transform(input.xml);
        log.debug(`XML transformed for trace ${traceId}`, { itemId: canonical.itemId });
      } else if (input.canonical) {
        canonical = input.canonical;
      } else {
        throw new Error("Either XML or canonical data must be provided");
      }

      // Step 2: Decide origin warehouse
      const decision = this.decider.decide(canonical);
      log.debug(`Warehouse selected for trace ${traceId}`, {
        warehouse: decision.selectedWarehouse.id,
      });

      // Step 3: Dispatch to receivers
      const dispatchPayload = {
        traceId,
        canonical,
        decision,
      };

      const dispatchResults = await dispatchToReceivers(dispatchPayload);

      // Step 4: Record metrics
      const latencyMs = Date.now() - startTime;
      metricsCollector.recordLatency(latencyMs);
      metricsCollector.recordRequest();

      log.info(`Pipeline completed for trace ${traceId}`, {
        latencyMs,
        warehouse: decision.selectedWarehouse.id,
      });

      return {
        success: true,
        traceId,
        canonical,
        decision: {
          warehouseId: decision.selectedWarehouse.id,
          warehouseName: decision.selectedWarehouse.name,
          reason: decision.reason,
        },
        dispatchResults,
        latencyMs,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      metricsCollector.recordError();

      log.error(`Pipeline failed for trace ${traceId}`, error);

      return {
        success: false,
        traceId,
        error: error.message,
        latencyMs,
      };
    }
  }

  validateXML(xml: string): { valid: boolean; error?: string } {
    return this.transformer.validate(xml);
  }
}
