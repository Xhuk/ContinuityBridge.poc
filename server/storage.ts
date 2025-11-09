import { 
  type FlowDefinition,
  type InsertFlowDefinition,
  type FlowRun,
  type SmtpSettings,
  type InsertSmtpSettings,
} from "@shared/schema";
import type {
  QueueBackendConfig,
  InsertQueueBackendConfig,
  SecretsVaultEntry,
  InsertSecretsVaultEntry,
  SecretsMasterKey,
  InsertSecretsMasterKey,
} from "./schema";
import { randomUUID } from "crypto";

// Storage interface for ContinuityBridge
// Designed to be portable and support offline operation
// Future: Can be swapped with file-based, SQLite, or database storage for Docker deployments

export interface IStorage {
  // Flow Definition Management
  createFlow(flow: InsertFlowDefinition): Promise<FlowDefinition>;
  getFlow(id: string): Promise<FlowDefinition | undefined>;
  getFlows(): Promise<FlowDefinition[]>;
  updateFlow(id: string, flow: Partial<InsertFlowDefinition>): Promise<FlowDefinition | undefined>;
  deleteFlow(id: string): Promise<boolean>;

  // Flow Run Management
  createFlowRun(run: Omit<FlowRun, "id">): Promise<FlowRun>;
  getFlowRun(id: string): Promise<FlowRun | undefined>;
  getFlowRuns(): Promise<FlowRun[]>;
  getFlowRunsByFlowId(flowId: string): Promise<FlowRun[]>;
  updateFlowRun(id: string, updates: Partial<FlowRun>): Promise<FlowRun | undefined>;

  // SMTP Settings Management (single instance)
  getSmtpSettings(): Promise<SmtpSettings | undefined>;
  getSmtpSettingsForService?(): Promise<SmtpSettings | undefined>; // Optional: includes encrypted password
  upsertSmtpSettings(settings: InsertSmtpSettings): Promise<SmtpSettings>;
  deleteSmtpSettings(): Promise<boolean>;

  // Secrets Vault Management (Master Seed-based encryption)
  getMasterKey?(): Promise<SecretsMasterKey | undefined>;
  saveMasterKey?(data: InsertSecretsMasterKey): Promise<SecretsMasterKey>;
  clearMasterKey?(): Promise<void>;
  
  listSecrets?(integrationType?: SecretsVaultEntry['integrationType']): Promise<SecretsVaultEntry[]>;
  getSecret?(id: string): Promise<SecretsVaultEntry | undefined>;
  saveSecret?(data: InsertSecretsVaultEntry): Promise<SecretsVaultEntry>;
  updateSecret?(id: string, data: Partial<InsertSecretsVaultEntry>): Promise<SecretsVaultEntry | undefined>;
  deleteSecret?(id: string): Promise<boolean>;
  clearAllSecrets?(): Promise<void>;

  // Queue Backend Configuration (singleton config for backend switching)
  getQueueBackendConfig?(): Promise<QueueBackendConfig | undefined>;
  saveQueueBackendConfig?(config: InsertQueueBackendConfig): Promise<QueueBackendConfig>;
}

export class MemStorage implements IStorage {
  private flows: Map<string, FlowDefinition>;
  private flowRuns: Map<string, FlowRun>;
  private smtp: SmtpSettings | undefined;
  private queueBackendConfig: QueueBackendConfig | undefined;

  constructor() {
    this.flows = new Map();
    this.flowRuns = new Map();
    this.smtp = undefined;
    this.queueBackendConfig = undefined;
  }

  // ============================================================================
  // Flow Definition Management
  // ============================================================================

  async createFlow(insertFlow: InsertFlowDefinition): Promise<FlowDefinition> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const flow: FlowDefinition = {
      ...insertFlow,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.flows.set(id, flow);
    return flow;
  }

  async getFlow(id: string): Promise<FlowDefinition | undefined> {
    return this.flows.get(id);
  }

  async getFlows(): Promise<FlowDefinition[]> {
    return Array.from(this.flows.values());
  }

  async updateFlow(
    id: string,
    updates: Partial<InsertFlowDefinition>
  ): Promise<FlowDefinition | undefined> {
    const existing = this.flows.get(id);
    if (!existing) {
      return undefined;
    }

    // Merge updates over existing flow, preserving defaults for omitted fields
    const updated: FlowDefinition = {
      ...existing,          // Start with existing values (preserves defaults)
      ...updates,           // Apply updates
      id,                   // Preserve immutable ID
      createdAt: existing.createdAt,  // Preserve immutable creation timestamp
      updatedAt: new Date().toISOString(),  // Update modification timestamp
    };

    this.flows.set(id, updated);
    return updated;
  }

  async deleteFlow(id: string): Promise<boolean> {
    return this.flows.delete(id);
  }

  // ============================================================================
  // Flow Run Management
  // ============================================================================

  async createFlowRun(runData: Omit<FlowRun, "id">): Promise<FlowRun> {
    const id = randomUUID();
    const run: FlowRun = {
      ...runData,
      id,
    };
    this.flowRuns.set(id, run);
    return run;
  }

  async getFlowRun(id: string): Promise<FlowRun | undefined> {
    return this.flowRuns.get(id);
  }

  async getFlowRuns(): Promise<FlowRun[]> {
    return Array.from(this.flowRuns.values()).sort((a, b) => {
      // Sort by startedAt descending (newest first)
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    });
  }

  async getFlowRunsByFlowId(flowId: string): Promise<FlowRun[]> {
    return Array.from(this.flowRuns.values())
      .filter((run) => run.flowId === flowId)
      .sort((a, b) => {
        // Sort by startedAt descending (newest first)
        return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
      });
  }

  async updateFlowRun(
    id: string,
    updates: Partial<FlowRun>
  ): Promise<FlowRun | undefined> {
    const existing = this.flowRuns.get(id);
    if (!existing) {
      return undefined;
    }

    const updated: FlowRun = {
      ...existing,
      ...updates,
      id, // Preserve original ID
    };

    this.flowRuns.set(id, updated);
    return updated;
  }

  // ============================================================================
  // SMTP Settings Management
  // ============================================================================

  async getSmtpSettings(): Promise<SmtpSettings | undefined> {
    return this.smtp;
  }

  async upsertSmtpSettings(settings: InsertSmtpSettings): Promise<SmtpSettings> {
    const id = this.smtp?.id || 'smtp-settings';
    const now = new Date().toISOString();
    
    this.smtp = {
      ...settings,
      id,
      createdAt: this.smtp?.createdAt || now,
      updatedAt: now,
    };
    
    return this.smtp;
  }

  async deleteSmtpSettings(): Promise<boolean> {
    if (!this.smtp) {
      return false;
    }
    this.smtp = undefined;
    return true;
  }

  // ============================================================================
  // Queue Backend Configuration
  // ============================================================================

  async getQueueBackendConfig(): Promise<QueueBackendConfig | undefined> {
    return this.queueBackendConfig;
  }

  async saveQueueBackendConfig(config: InsertQueueBackendConfig): Promise<QueueBackendConfig> {
    const now = new Date().toISOString();
    
    this.queueBackendConfig = {
      ...config,
      id: 'singleton', // Always singleton
      updatedAt: now,
    };

    return this.queueBackendConfig;
  }
}

export const storage = new MemStorage();
