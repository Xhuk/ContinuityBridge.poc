import { 
  type FlowDefinition as SchemaFlowDefinition,
  type InsertFlowDefinition as SchemaInsertFlowDefinition,
  type FlowRun as SchemaFlowRun,
  type SmtpSettings as SchemaSmtpSettings,
  type InsertSmtpSettings as SchemaInsertSmtpSettings,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { flowDefinitions, flowRuns, smtpSettings, type FlowDefinition, type FlowRun, type SmtpSettings } from "./schema";
import { eq, desc } from "drizzle-orm";
import { IStorage } from "./storage";

/**
 * Database-backed storage implementation using SQLite or PostgreSQL
 * Provides persistent storage for flows and flow runs
 */
export class DatabaseStorage implements IStorage {
  constructor() {
    // Tables should already be created by ensureTables()
  }

  // ============================================================================
  // Flow Definition Management
  // ============================================================================

  async createFlow(insertFlow: SchemaInsertFlowDefinition): Promise<SchemaFlowDefinition> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    const flow: SchemaFlowDefinition = {
      ...insertFlow,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await (db.insert(flowDefinitions) as any).values({
      id: flow.id,
      name: flow.name,
      description: flow.description || null,
      nodes: flow.nodes as any,
      edges: flow.edges as any,
      version: flow.version,
      enabled: flow.enabled ? 1 : 0,
      tags: flow.tags as any,
      metadata: flow.metadata as any,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
    });

    return flow;
  }

  async getFlow(id: string): Promise<SchemaFlowDefinition | undefined> {
    const result = await (db.select() as any).from(flowDefinitions).where(eq(flowDefinitions.id, id)).limit(1);
    
    if (result.length === 0) {
      return undefined;
    }

    const row: any = result[0];
    return this.mapFlowFromDb(row);
  }

  async getFlows(): Promise<SchemaFlowDefinition[]> {
    const results = await (db.select() as any).from(flowDefinitions).orderBy(desc(flowDefinitions.createdAt));
    return results.map((row: any) => this.mapFlowFromDb(row));
  }

  async updateFlow(
    id: string,
    updates: Partial<SchemaInsertFlowDefinition>
  ): Promise<SchemaFlowDefinition | undefined> {
    const existing = await this.getFlow(id);
    if (!existing) {
      return undefined;
    }

    const updatedFlow: SchemaFlowDefinition = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    await (db.update(flowDefinitions) as any)
      .set({
        name: updatedFlow.name,
        description: updatedFlow.description || null,
        nodes: updatedFlow.nodes as any,
        edges: updatedFlow.edges as any,
        version: updatedFlow.version,
        enabled: updatedFlow.enabled ? 1 : 0,
        tags: updatedFlow.tags as any,
        metadata: updatedFlow.metadata as any,
        updatedAt: updatedFlow.updatedAt,
      })
      .where(eq(flowDefinitions.id, id));

    return updatedFlow;
  }

  async deleteFlow(id: string): Promise<boolean> {
    await (db.delete(flowDefinitions) as any).where(eq(flowDefinitions.id, id));
    return true;
  }

  // ============================================================================
  // Flow Run Management
  // ============================================================================

  async createFlowRun(runData: Omit<SchemaFlowRun, "id">): Promise<SchemaFlowRun> {
    const id = randomUUID();
    const run: SchemaFlowRun = {
      ...runData,
      id,
    };

    await (db.insert(flowRuns) as any).values({
      id: run.id,
      flowId: run.flowId,
      flowName: run.flowName,
      flowVersion: run.flowVersion,
      traceId: run.traceId,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt || null,
      durationMs: run.durationMs || null,
      inputData: run.inputData ? JSON.stringify(run.inputData) : null,
      outputData: run.outputData ? JSON.stringify(run.outputData) : null,
      triggeredBy: run.triggeredBy,
      executedNodes: run.executedNodes ? JSON.stringify(run.executedNodes) : null,
      nodeExecutions: run.nodeExecutions ? JSON.stringify(run.nodeExecutions) : null,
      error: run.error || null,
      errorNode: run.errorNode || null,
    });

    return run;
  }

  async getFlowRun(id: string): Promise<SchemaFlowRun | undefined> {
    const result = await (db.select() as any).from(flowRuns).where(eq(flowRuns.id, id)).limit(1);
    
    if (result.length === 0) {
      return undefined;
    }

    return this.mapFlowRunFromDb(result[0]);
  }

  async getFlowRuns(): Promise<SchemaFlowRun[]> {
    const results = await (db.select() as any).from(flowRuns).orderBy(desc(flowRuns.startedAt));
    return results.map(row => this.mapFlowRunFromDb(row));
  }

  async getFlowRunsByFlowId(flowId: string): Promise<SchemaFlowRun[]> {
    const results = await db.select()
      .from(flowRuns)
      .where(eq(flowRuns.flowId, flowId))
      .orderBy(desc(flowRuns.startedAt));
    
    return results.map(row => this.mapFlowRunFromDb(row));
  }

  async updateFlowRun(
    id: string,
    updates: Partial<SchemaFlowRun>
  ): Promise<SchemaFlowRun | undefined> {
    const existing = await this.getFlowRun(id);
    if (!existing) {
      return undefined;
    }

    const updated: SchemaFlowRun = {
      ...existing,
      ...updates,
      id,
    };

    await (db.update(flowRuns) as any)
      .set({
        status: updated.status,
        completedAt: updated.completedAt || null,
        durationMs: updated.durationMs || null,
        outputData: updated.outputData ? JSON.stringify(updated.outputData) : null,
        executedNodes: updated.executedNodes ? JSON.stringify(updated.executedNodes) : null,
        nodeExecutions: updated.nodeExecutions ? JSON.stringify(updated.nodeExecutions) : null,
        error: updated.error || null,
        errorNode: updated.errorNode || null,
      })
      .where(eq(flowRuns.id, id));

    return updated;
  }

  // ============================================================================
  // Helper methods for mapping database rows to domain objects
  // ============================================================================

  private mapFlowFromDb(row: any): SchemaFlowDefinition {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      nodes: typeof row.nodes === 'string' ? JSON.parse(row.nodes) : row.nodes,
      edges: typeof row.edges === 'string' ? JSON.parse(row.edges) : row.edges,
      version: row.version,
      enabled: Boolean(row.enabled),
      tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : undefined,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapFlowRunFromDb(row: any): SchemaFlowRun {
    return {
      id: row.id,
      flowId: row.flowId,
      flowName: row.flowName,
      flowVersion: row.flowVersion,
      traceId: row.traceId,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt || undefined,
      durationMs: row.durationMs || undefined,
      inputData: row.inputData ? (typeof row.inputData === 'string' ? JSON.parse(row.inputData) : row.inputData) : undefined,
      outputData: row.outputData ? (typeof row.outputData === 'string' ? JSON.parse(row.outputData) : row.outputData) : undefined,
      triggeredBy: row.triggeredBy,
      executedNodes: row.executedNodes ? (typeof row.executedNodes === 'string' ? JSON.parse(row.executedNodes) : row.executedNodes) : undefined,
      nodeExecutions: row.nodeExecutions ? (typeof row.nodeExecutions === 'string' ? JSON.parse(row.nodeExecutions) : row.nodeExecutions) : undefined,
      error: row.error || undefined,
      errorNode: row.errorNode || undefined,
    };
  }

  // ============================================================================
  // SMTP Settings Management
  // ============================================================================

  async getSmtpSettings(): Promise<SchemaSmtpSettings | undefined> {
    const result = await (db.select() as any).from(smtpSettings).limit(1);
    
    if (result.length === 0) {
      return undefined;
    }

    const row: any = result[0];
    return this.mapSmtpFromDb(row);
  }

  async upsertSmtpSettings(settings: SchemaInsertSmtpSettings): Promise<SchemaSmtpSettings> {
    const existing = await this.getSmtpSettings();
    const id = existing?.id || 'smtp-settings';
    const now = new Date().toISOString();

    const smtpData = {
      id,
      host: settings.host,
      port: settings.port,
      secure: settings.secure ? 1 : 0,
      username: settings.username,
      password: settings.password,
      fromAddress: settings.fromAddress,
      fromName: settings.fromName || null,
      notifyOnFlowError: settings.notifyOnFlowError ? 1 : 0,
      notifyOnValidationError: settings.notifyOnValidationError ? 1 : 0,
      notifyOnAckFailure: settings.notifyOnAckFailure ? 1 : 0,
      alertRecipients: settings.alertRecipients,
      enabled: settings.enabled ? 1 : 0,
      lastTestedAt: settings.lastTestedAt || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (existing) {
      await (db.update(smtpSettings) as any)
        .set(smtpData)
        .where(eq(smtpSettings.id, id));
    } else {
      await (db.insert(smtpSettings) as any).values(smtpData);
    }

    const result: SchemaSmtpSettings = {
      ...settings,
      id,
      createdAt: smtpData.createdAt,
      updatedAt: smtpData.updatedAt,
    };

    return result;
  }

  async deleteSmtpSettings(): Promise<boolean> {
    const existing = await this.getSmtpSettings();
    if (!existing) {
      return false;
    }

    await (db.delete(smtpSettings) as any).where(eq(smtpSettings.id, existing.id));
    return true;
  }

  private mapSmtpFromDb(row: any, includePassword: boolean = false): SchemaSmtpSettings {
    const settings: any = {
      id: row.id,
      host: row.host,
      port: row.port,
      secure: Boolean(row.secure),
      username: row.username,
      fromAddress: row.fromAddress,
      fromName: row.fromName || undefined,
      notifyOnFlowError: Boolean(row.notifyOnFlowError),
      notifyOnValidationError: Boolean(row.notifyOnValidationError),
      notifyOnAckFailure: Boolean(row.notifyOnAckFailure),
      alertRecipients: row.alertRecipients,
      enabled: Boolean(row.enabled),
      lastTestedAt: row.lastTestedAt || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    
    if (includePassword) {
      settings.password = row.password;
    } else {
      settings.password = ''; // Required by type but never exposed
    }
    
    return settings;
  }

  async getSmtpSettingsForService(): Promise<SchemaSmtpSettings | undefined> {
    const result = await (db.select() as any).from(smtpSettings).limit(1);
    
    if (result.length === 0) {
      return undefined;
    }

    const row: any = result[0];
    return this.mapSmtpFromDb(row, true); // Include password for service configuration
  }
}
