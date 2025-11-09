import { randomUUID } from "crypto";
import { XMLToCanonicalTransformer } from "../transform/xml-to-canonical.js";
import { OriginDecider } from "../decision/origin-decider.js";
import { dispatchToReceivers } from "../receivers/dispatch.js";
import { metricsCollector } from "./metrics.js";
import { logger } from "./logger.js";
import { FlowOrchestrator } from "../flow/orchestrator.js";
import type { PipelineInput, PipelineResult } from "./types.js";
import type { CanonicalItem } from "@shared/schema";
import type { IStorage } from "../../storage.js";

const log = logger.child("Pipeline");

export interface PipelineOptions {
  storage?: IStorage;
  orchestrator?: FlowOrchestrator;
}

export class Pipeline {
  private transformer: XMLToCanonicalTransformer;
  private decider: OriginDecider;
  private orchestrator: FlowOrchestrator | null;

  constructor(options?: PipelineOptions) {
    this.transformer = new XMLToCanonicalTransformer();
    this.decider = new OriginDecider();
    this.orchestrator = options?.orchestrator || null;
    
    const supportsFlows = !!this.orchestrator;
    log.info(`Pipeline initialized`, { supportsFlows });
  }

  async runItemPipeline(input: PipelineInput): Promise<PipelineResult> {
    const startTime = Date.now();
    const traceId = input.traceId || randomUUID();

    log.info(`Starting pipeline for trace ${traceId}`, { mode: input.mode });

    try {
      // Step 1: Transform to canonical format based on input mode
      let canonical: CanonicalItem;

      switch (input.mode) {
        case 'flow': {
          if (!this.orchestrator) {
            throw new Error("Flow orchestrator not initialized. Pipeline was created without storage.");
          }
          
          log.debug(`Executing flow ${input.flowId} for trace ${traceId}`);
          const flowResult = await this.orchestrator.executeFlow(input.flowId, input.flowInput);
          
          if (flowResult.status === "failed") {
            throw new Error(flowResult.error || "Flow execution failed");
          }
          
          // Get the final output from the last executed node
          const lastExecution = flowResult.nodeExecutions[flowResult.nodeExecutions.length - 1];
          if (!lastExecution?.output) {
            throw new Error("Flow completed but produced no output");
          }
          
          canonical = lastExecution.output as CanonicalItem;
          log.debug(`Flow transformed for trace ${traceId}`, { 
            flowId: input.flowId,
            runId: flowResult.id,
            itemId: canonical.itemId 
          });
          break;
        }
        
        case 'xml': {
          canonical = this.transformer.transform(input.xml);
          log.debug(`XML transformed for trace ${traceId}`, { itemId: canonical.itemId });
          break;
        }
        
        case 'canonical': {
          canonical = input.canonical;
          log.debug(`Using provided canonical for trace ${traceId}`, { itemId: canonical.itemId });
          break;
        }
        
        default: {
          const exhaustiveCheck: never = input;
          throw new Error(`Unknown pipeline mode: ${JSON.stringify(exhaustiveCheck)}`);
        }
      }

      // Step 2: Decide origin warehouse (optional - only for CanonicalItem format)
      let decision: ReturnType<typeof this.decider.decide> | undefined;
      let dispatchResults: any[] = [];

      const isCanonicalItem = 
        canonical && 
        typeof canonical === 'object' && 
        'itemId' in canonical &&
        'destination' in canonical;

      if (isCanonicalItem) {
        decision = this.decider.decide(canonical);
        log.debug(`Warehouse selected for trace ${traceId}`, {
          warehouse: decision.selectedWarehouse.id,
        });

        // Step 3: Dispatch to receivers (only for CanonicalItem)
        const dispatchPayload = {
          traceId,
          canonical,
          decision,
        };

        dispatchResults = await dispatchToReceivers(dispatchPayload);
      } else {
        log.debug(`Skipping warehouse decision and dispatch for non-CanonicalItem output`);
      }

      // Step 4: Record metrics
      const latencyMs = Date.now() - startTime;
      metricsCollector.recordLatency(latencyMs);
      metricsCollector.recordRequest();

      log.info(`Pipeline completed for trace ${traceId}`, {
        latencyMs,
        warehouse: decision?.selectedWarehouse.id || 'N/A',
      });

      return {
        success: true,
        traceId,
        canonical,
        decision: decision ? {
          warehouseId: decision.selectedWarehouse.id,
          warehouseName: decision.selectedWarehouse.name,
          reason: decision.reason,
        } : undefined,
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
