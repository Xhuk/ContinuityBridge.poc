import { 
  type FlowDefinition as SchemaFlowDefinition,
  type InsertFlowDefinition as SchemaInsertFlowDefinition,
  type FlowRun as SchemaFlowRun,
  type SmtpSettings as SchemaSmtpSettings,
  type InsertSmtpSettings as SchemaInsertSmtpSettings,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { db } from "./db";
import { 
  flowDefinitions, 
  flowRuns, 
  smtpSettings, 
  secretsMasterKeys,
  secretsVault,
  authAdapters,
  inboundAuthPolicies,
  systemInstanceTestFiles,
  systemInstanceAuth,
  type FlowDefinition, 
  type FlowRun, 
  type SmtpSettings,
  type SecretsMasterKey,
  type SecretsVaultEntry,
  type InsertSecretsMasterKey,
  type InsertSecretsVaultEntry,
  type AuthAdapter,
  type InsertAuthAdapter,
  type InboundAuthPolicy,
  type InsertInboundAuthPolicy,
  type SystemInstanceTestFile,
  type InsertSystemInstanceTestFile,
  type SystemInstanceAuth,
  type InsertSystemInstanceAuth,
} from "./db";
import { eq, desc, and } from "drizzle-orm";
import { IStorage } from "./storage";
import type { FlowVersion } from "./src/versioning/flow-version-manager.js";

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
      systemInstanceId: flow.systemInstanceId || null,
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

  async getFlows(systemInstanceId?: string, organizationId?: string): Promise<SchemaFlowDefinition[]> {
    let query = (db.select() as any).from(flowDefinitions);
    
    // Apply filters
    const conditions: any[] = [];
    
    if (systemInstanceId) {
      conditions.push(eq(flowDefinitions.systemInstanceId, systemInstanceId));
    }
    
    if (organizationId) {
      conditions.push(eq(flowDefinitions.organizationId, organizationId));
    }
    
    if (conditions.length > 0) {
      query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
    }
    
    const results = await query.orderBy(desc(flowDefinitions.createdAt));
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
        systemInstanceId: updatedFlow.systemInstanceId || null,
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
      systemInstanceId: row.systemInstanceId ?? undefined,
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

  private mapSystemAuthFromDb(row: any): SystemInstanceAuth {
    return {
      id: row.id,
      systemInstanceId: row.systemInstanceId,
      name: row.name,
      description: row.description || undefined,
      adapterType: row.adapterType,
      direction: row.direction,
      secretRef: row.secretRef || undefined,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      enabled: Boolean(row.enabled),
      lastTestedAt: row.lastTestedAt || undefined,
      lastUsedAt: row.lastUsedAt || undefined,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
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

  // ============================================================================
  // Secrets Vault Implementation
  // ============================================================================

  async getMasterKey(): Promise<SchemaSecretsMasterKey | undefined> {
    const result = await (db.select() as any).from(secretsMasterKeys).limit(1);
    
    if (result.length === 0) {
      return undefined;
    }

    return result[0] as SchemaSecretsMasterKey;
  }

  async saveMasterKey(data: SchemaInsertSecretsMasterKey): Promise<SchemaSecretsMasterKey> {
    const masterKey = {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await (db.insert(secretsMasterKeys) as any).values(masterKey);

    return masterKey as SchemaSecretsMasterKey;
  }

  async clearMasterKey(): Promise<void> {
    await (db.delete(secretsMasterKeys) as any);
  }

  async listSecrets(integrationType?: SchemaSecretsVaultEntry['integrationType']): Promise<SchemaSecretsVaultEntry[]> {
    let query = (db.select() as any).from(secretsVault);

    if (integrationType) {
      query = query.where(eq(secretsVault.integrationType, integrationType));
    }

    const results = await query;
    return results as SchemaSecretsVaultEntry[];
  }

  async getSecret(id: string): Promise<SchemaSecretsVaultEntry | undefined> {
    const result = await (db.select() as any)
      .from(secretsVault)
      .where(eq(secretsVault.id, id))
      .limit(1);

    if (result.length === 0) {
      return undefined;
    }

    return result[0] as SchemaSecretsVaultEntry;
  }

  async saveSecret(data: SchemaInsertSecretsVaultEntry): Promise<SchemaSecretsVaultEntry> {
    const secret = {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await (db.insert(secretsVault) as any).values(secret);

    return secret as SchemaSecretsVaultEntry;
  }

  async updateSecret(
    id: string,
    data: Partial<SchemaInsertSecretsVaultEntry>
  ): Promise<SchemaSecretsVaultEntry | undefined> {
    const existing = await this.getSecret(id);
    
    if (!existing) {
      return undefined;
    }

    const updated = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await (db.update(secretsVault) as any)
      .set(updated)
      .where(eq(secretsVault.id, id));

    return { ...existing, ...updated } as SchemaSecretsVaultEntry;
  }

  async deleteSecret(id: string): Promise<boolean> {
    const existing = await this.getSecret(id);
    
    if (!existing) {
      return false;
    }

    await (db.delete(secretsVault) as any).where(eq(secretsVault.id, id));
    return true;
  }

  async clearAllSecrets(): Promise<void> {
    await (db.delete(secretsVault) as any);
  }

  // Auth Adapters CRUD
  async getAuthAdapters(): Promise<AuthAdapter[]> {
    const result = await (db.select() as any).from(authAdapters);
    return result as AuthAdapter[];
  }

  async getAuthAdapter(id: string): Promise<AuthAdapter | undefined> {
    const result = await (db.select() as any)
      .from(authAdapters)
      .where(eq(authAdapters.id, id));
    
    if (result.length === 0) {
      return undefined;
    }

    return result[0] as AuthAdapter;
  }

  async createAuthAdapter(data: InsertAuthAdapter): Promise<AuthAdapter> {
    const adapter = {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await (db.insert(authAdapters) as any).values(adapter);

    return adapter as AuthAdapter;
  }

  async updateAuthAdapter(
    id: string,
    data: Partial<InsertAuthAdapter>
  ): Promise<AuthAdapter | undefined> {
    const existing = await this.getAuthAdapter(id);
    
    if (!existing) {
      return undefined;
    }

    const updated = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await (db.update(authAdapters) as any)
      .set(updated)
      .where(eq(authAdapters.id, id));

    return { ...existing, ...updated } as AuthAdapter;
  }

  async deleteAuthAdapter(id: string): Promise<void> {
    const existing = await this.getAuthAdapter(id);
    
    if (!existing) {
      return;
    }

    await (db.delete(authAdapters) as any).where(eq(authAdapters.id, id));
  }

  // Inbound Auth Policies CRUD
  async getInboundAuthPolicies(): Promise<InboundAuthPolicy[]> {
    const result = await (db.select() as any).from(inboundAuthPolicies);
    return result as InboundAuthPolicy[];
  }

  async getInboundAuthPolicy(id: string): Promise<InboundAuthPolicy | undefined> {
    const result = await (db.select() as any)
      .from(inboundAuthPolicies)
      .where(eq(inboundAuthPolicies.id, id));
    
    if (result.length === 0) {
      return undefined;
    }

    return result[0] as InboundAuthPolicy;
  }

  async createInboundAuthPolicy(data: InsertInboundAuthPolicy): Promise<InboundAuthPolicy> {
    const policy = {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await (db.insert(inboundAuthPolicies) as any).values(policy);

    return policy as InboundAuthPolicy;
  }

  async updateInboundAuthPolicy(
    id: string,
    data: Partial<InsertInboundAuthPolicy>
  ): Promise<InboundAuthPolicy | undefined> {
    const existing = await this.getInboundAuthPolicy(id);
    
    if (!existing) {
      return undefined;
    }

    const updated = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await (db.update(inboundAuthPolicies) as any)
      .set(updated)
      .where(eq(inboundAuthPolicies.id, id));

    return { ...existing, ...updated } as InboundAuthPolicy;
  }

  async deleteInboundAuthPolicy(id: string): Promise<void> {
    const existing = await this.getInboundAuthPolicy(id);
    
    if (!existing) {
      return;
    }

    await (db.delete(inboundAuthPolicies) as any).where(eq(inboundAuthPolicies.id, id));
  }

  // ============================================================================
  // System Instance Test Files (for E2E testing and emulation)
  // ============================================================================

  async getTestFiles(systemInstanceId: string): Promise<SystemInstanceTestFile[]> {
    const result = await (db.select() as any)
      .from(systemInstanceTestFiles)
      .where(eq(systemInstanceTestFiles.systemInstanceId, systemInstanceId))
      .orderBy(desc(systemInstanceTestFiles.uploadedAt));
    
    return result as SystemInstanceTestFile[];
  }

  async getTestFile(id: string): Promise<SystemInstanceTestFile | undefined> {
    const result = await (db.select() as any)
      .from(systemInstanceTestFiles)
      .where(eq(systemInstanceTestFiles.id, id))
      .limit(1);
    
    if (result.length === 0) {
      return undefined;
    }

    return result[0] as SystemInstanceTestFile;
  }

  async getTestFileQuota(systemInstanceId: string): Promise<{ count: number; totalSize: number }> {
    const files = await this.getTestFiles(systemInstanceId);
    
    return {
      count: files.length,
      totalSize: files.reduce((sum, file) => sum + file.fileSize, 0),
    };
  }

  async createTestFile(file: InsertSystemInstanceTestFile): Promise<SystemInstanceTestFile> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const testFile: SystemInstanceTestFile = {
      id,
      systemInstanceId: file.systemInstanceId,
      filename: file.filename,
      mediaType: file.mediaType,
      storageKey: file.storageKey,
      fileSize: file.fileSize,
      uploadedAt: now,
      notes: file.notes || null,
      mlApproved: file.mlApproved || false,
      mlApprovedBy: file.mlApprovedBy || null,
      mlApprovedAt: file.mlApprovedAt || null,
      metadata: file.metadata || null,
    };

    await (db.insert(systemInstanceTestFiles) as any).values({
      ...testFile,
      mlApproved: testFile.mlApproved ? 1 : 0,
    });

    return testFile;
  }

  async deleteTestFile(id: string): Promise<boolean> {
    const existing = await this.getTestFile(id);
    
    if (!existing) {
      return false;
    }

    // Delete file from filesystem
    await this.deleteTestFileFromDisk(existing.storageKey);

    // Delete record from database
    await (db.delete(systemInstanceTestFiles) as any).where(eq(systemInstanceTestFiles.id, id));

    return true;
  }

  async addTestFileNote(id: string, author: string, authorRole: "superadmin" | "consultant", content: string): Promise<boolean> {
    const existing = await this.getTestFile(id);
    
    if (!existing) {
      return false;
    }

    const currentNotes = existing.notes || [];
    const nextIteration = currentNotes.length + 1;
    
    const newNote = {
      iteration: nextIteration,
      author,
      authorRole,
      timestamp: new Date().toISOString(),
      content,
    };

    const updatedNotes = [...currentNotes, newNote];

    await (db.update(systemInstanceTestFiles) as any)
      .set({ notes: updatedNotes as any })
      .where(eq(systemInstanceTestFiles.id, id));

    return true;
  }

  async approveTestFileForML(id: string, approvedBy: string): Promise<boolean> {
    const existing = await this.getTestFile(id);
    
    if (!existing) {
      return false;
    }

    await (db.update(systemInstanceTestFiles) as any)
      .set({ 
        mlApproved: 1,
        mlApprovedBy: approvedBy,
        mlApprovedAt: new Date().toISOString(),
      })
      .where(eq(systemInstanceTestFiles.id, id));

    return true;
  }

  // ============================================================================
  // System Instance Management
  // ============================================================================

  async getSystemInstance(id: string): Promise<SystemInstance | undefined> {
    const result = await (db.select() as any)
      .from(systemInstances)
      .where(eq(systemInstances.id, id))
      .limit(1);
    
    if (result.length === 0) {
      return undefined;
    }

    return result[0] as SystemInstance;
  }

  // ============================================================================
  // File System Helpers for Test Files
  // ============================================================================

  private getTestFilesBaseDir(): string {
    return path.join(process.cwd(), "server", "data", "test-files");
  }

  private getTestFilePath(storageKey: string): string {
    return path.join(this.getTestFilesBaseDir(), storageKey);
  }

  async writeTestFileToDisk(
    systemInstanceId: string,
    buffer: Buffer,
    originalFilename: string,
    mediaType: SystemInstanceTestFile["mediaType"]
  ): Promise<{ storageKey: string; fileSize: number }> {
    const fileUuid = randomUUID();
    const ext = path.extname(originalFilename);
    const storageKey = `${systemInstanceId}/${fileUuid}${ext}`;
    const filePath = this.getTestFilePath(storageKey);

    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write file
    await fs.writeFile(filePath, buffer);

    return {
      storageKey,
      fileSize: buffer.length,
    };
  }

  async readTestFileFromDisk(storageKey: string): Promise<Buffer> {
    const filePath = this.getTestFilePath(storageKey);
    return await fs.readFile(filePath);
  }

  async deleteTestFileFromDisk(storageKey: string): Promise<void> {
    try {
      const filePath = this.getTestFilePath(storageKey);
      await fs.unlink(filePath);
    } catch (error: any) {
      // Ignore if file doesn't exist
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  // ============================================================================
  // System Instance Authentication (per-system auth configs)
  // ============================================================================

  async getSystemAuths(
    systemInstanceId: string,
    filters?: {
      direction?: "inbound" | "outbound" | "bidirectional";
      enabled?: boolean;
      adapterType?: "oauth2" | "jwt" | "cookie" | "apikey";
    }
  ): Promise<SystemInstanceAuth[]> {
    let query = (db.select() as any).from(systemInstanceAuth);

    const conditions = [eq(systemInstanceAuth.systemInstanceId, systemInstanceId)];

    if (filters?.direction) {
      conditions.push(eq(systemInstanceAuth.direction, filters.direction));
    }

    if (filters?.enabled !== undefined) {
      conditions.push(eq(systemInstanceAuth.enabled, filters.enabled ? 1 : 0));
    }

    if (filters?.adapterType) {
      conditions.push(eq(systemInstanceAuth.adapterType, filters.adapterType));
    }

    if (conditions.length > 1) {
      query = query.where(and(...conditions));
    } else {
      query = query.where(conditions[0]);
    }

    const result = await query.orderBy(desc(systemInstanceAuth.createdAt));

    return result.map((row: any) => this.mapSystemAuthFromDb(row));
  }

  async getSystemAuth(id: string): Promise<SystemInstanceAuth | undefined> {
    const result = await (db.select() as any)
      .from(systemInstanceAuth)
      .where(eq(systemInstanceAuth.id, id))
      .limit(1);

    if (result.length === 0) {
      return undefined;
    }

    return this.mapSystemAuthFromDb(result[0]);
  }

  async getSystemAuthByName(
    systemInstanceId: string,
    name: string
  ): Promise<SystemInstanceAuth | undefined> {
    const result = await (db.select() as any)
      .from(systemInstanceAuth)
      .where(
        and(
          eq(systemInstanceAuth.systemInstanceId, systemInstanceId),
          eq(systemInstanceAuth.name, name)
        )
      )
      .limit(1);

    if (result.length === 0) {
      return undefined;
    }

    return this.mapSystemAuthFromDb(result[0]);
  }

  async createSystemAuth(data: InsertSystemInstanceAuth): Promise<SystemInstanceAuth> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const auth: SystemInstanceAuth = {
      id,
      systemInstanceId: data.systemInstanceId,
      name: data.name,
      description: data.description || null,
      adapterType: data.adapterType,
      direction: data.direction,
      secretRef: data.secretRef || null,
      config: data.config,
      enabled: data.enabled ?? true,
      lastTestedAt: null,
      lastUsedAt: null,
      metadata: data.metadata || null,
      createdAt: now,
      updatedAt: now,
    };

    await (db.insert(systemInstanceAuth) as any).values({
      ...auth,
      enabled: auth.enabled ? 1 : 0,
    });

    return auth;
  }

  async updateSystemAuth(
    id: string,
    data: Partial<InsertSystemInstanceAuth>
  ): Promise<SystemInstanceAuth | undefined> {
    const existing = await this.getSystemAuth(id);

    if (!existing) {
      return undefined;
    }

    const updated: any = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    if (updated.enabled !== undefined) {
      updated.enabled = updated.enabled ? 1 : 0;
    }

    await (db.update(systemInstanceAuth) as any)
      .set(updated)
      .where(eq(systemInstanceAuth.id, id));

    return await this.getSystemAuth(id);
  }

  async deleteSystemAuth(id: string): Promise<boolean> {
    const existing = await this.getSystemAuth(id);

    if (!existing) {
      return false;
    }

    await (db.delete(systemInstanceAuth) as any).where(eq(systemInstanceAuth.id, id));

    return true;
  }
  
  // ============================================================================
  // Flow Versioning Management
  // ============================================================================
  
  // In-memory storage for now (TODO: create database table for flow_versions)
  private flowVersions: Map<string, FlowVersion> = new Map();
  
  async storeFlowVersion(version: FlowVersion): Promise<FlowVersion> {
    this.flowVersions.set(version.id, version);
    return version;
  }
  
  async getFlowVersion(versionId: string): Promise<FlowVersion | undefined> {
    return this.flowVersions.get(versionId);
  }
  
  async getFlowVersionHistory(
    flowId: string,
    organizationId: string,
    environment: "dev" | "staging" | "prod"
  ): Promise<FlowVersion[]> {
    const allVersions = Array.from(this.flowVersions.values());
    
    return allVersions
      .filter(v => 
        v.flowId === flowId && 
        v.organizationId === organizationId && 
        v.environment === environment
      )
      .sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }
  
  async updateFlowVersion(version: FlowVersion): Promise<FlowVersion> {
    this.flowVersions.set(version.id, version);
    return version;
  }
}
