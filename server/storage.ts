import { 
  type FlowDefinition,
  type InsertFlowDefinition,
  type FlowRun,
} from "@shared/schema";
import type {
  SmtpSettings,
  InsertSmtpSettings,
  QueueBackendConfig,
  InsertQueueBackendConfig,
  SecretsVaultEntry,
  InsertSecretsVaultEntry,
  SecretsMasterKey,
  InsertSecretsMasterKey,
  AuthAdapter,
  InsertAuthAdapter,
  TokenCache,
  InsertTokenCache,
  InboundAuthPolicy,
  InsertInboundAuthPolicy,
  SystemInstance,
  SystemInstanceTestFile,
  InsertSystemInstanceTestFile,
  SystemInstanceAuth,
  InsertSystemInstanceAuth,
} from "./schema";
import type { FlowVersion } from "./src/versioning/flow-version-manager.js";
import { randomUUID } from "crypto";

// Storage interface for ContinuityBridge
// Designed to be portable and support offline operation
// Future: Can be swapped with file-based, SQLite, or database storage for Docker deployments

export interface IStorage {
  // Flow Definition Management
  createFlow(flow: InsertFlowDefinition): Promise<FlowDefinition>;
  getFlow(id: string): Promise<FlowDefinition | undefined>;
  getFlows(
    systemInstanceId?: string,
    organizationId?: string,
    environment?: "dev" | "test" | "staging" | "prod"
  ): Promise<FlowDefinition[]>;
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

  // Auth Adapter Management (for inbound/outbound authentication)
  listAuthAdapters?(userId?: string): Promise<AuthAdapter[]>;
  getAuthAdapter?(id: string): Promise<AuthAdapter | undefined>;
  saveAuthAdapter?(data: InsertAuthAdapter): Promise<AuthAdapter>;
  updateAuthAdapter?(id: string, data: Partial<InsertAuthAdapter>): Promise<AuthAdapter | undefined>;
  deleteAuthAdapter?(id: string): Promise<boolean>;
  getActiveAuthAdapters?(direction?: 'inbound' | 'outbound'): Promise<AuthAdapter[]>;

  // Token Cache Management (for automatic token refresh and lifecycle)
  getTokenCache?(adapterId: string, tokenType?: TokenCache['tokenType'], scope?: string): Promise<TokenCache | undefined>;
  saveTokenCache?(data: InsertTokenCache): Promise<TokenCache>;
  updateTokenCache?(id: string, data: Partial<InsertTokenCache>): Promise<TokenCache | undefined>;
  updateTokenCacheOptimistic?(id: string, currentVersion: number, data: Partial<InsertTokenCache>): Promise<TokenCache | undefined>; // Compare-and-swap
  deleteTokenCache?(id: string): Promise<boolean>;
  deleteTokenCacheByAdapter?(adapterId: string): Promise<void>;
  getExpiringSoonTokens?(minutesBeforeExpiry: number): Promise<TokenCache[]>; // For background refresh job

  // Audit Logs
  getAuditLogs?(filters?: { since?: string; limit?: number; resourceType?: string }): Promise<any[]>;
  addAuditLog?(log: any): Promise<void>;

  // Inbound Auth Policies
  getInboundAuthPolicies?(): Promise<InboundAuthPolicy[]>;
  getInboundAuthPolicy?(routePattern: string, httpMethod?: string): Promise<InboundAuthPolicy | undefined>;
  createInboundAuthPolicy?(policy: InsertInboundAuthPolicy): Promise<InboundAuthPolicy>;
  updateInboundAuthPolicy?(id: string, policy: Partial<InsertInboundAuthPolicy>): Promise<InboundAuthPolicy | undefined>;
  deleteInboundAuthPolicy?(id: string): Promise<void>;

  // System Instance Management
  getSystemInstance?(id: string): Promise<SystemInstance | undefined>;

  // System Instance Test Files (for E2E testing and emulation)
  getTestFiles?(systemInstanceId: string): Promise<SystemInstanceTestFile[]>;
  getTestFile?(id: string): Promise<SystemInstanceTestFile | undefined>;
  getTestFileQuota?(systemInstanceId: string): Promise<{ count: number; totalSize: number }>;
  createTestFile?(file: InsertSystemInstanceTestFile): Promise<SystemInstanceTestFile>;
  deleteTestFile?(id: string): Promise<boolean>;
  addTestFileNote?(id: string, author: string, authorRole: "superadmin" | "consultant", content: string): Promise<boolean>;
  approveTestFileForML?(id: string, approvedBy: string): Promise<boolean>;
  
  // Filesystem helpers for test files (used by API layer)
  writeTestFileToDisk?(
    systemInstanceId: string,
    buffer: Buffer,
    originalFilename: string,
    mediaType: SystemInstanceTestFile["mediaType"]
  ): Promise<{ storageKey: string; fileSize: number }>;
  readTestFileFromDisk?(storageKey: string): Promise<Buffer>;
  deleteTestFileFromDisk?(storageKey: string): Promise<void>;

  // System Instance Authentication (per-system auth configs)
  getSystemAuths?(
    systemInstanceId: string,
    filters?: {
      direction?: "inbound" | "outbound" | "bidirectional";
      enabled?: boolean;
      adapterType?: "oauth2" | "jwt" | "cookie" | "apikey";
    }
  ): Promise<SystemInstanceAuth[]>;
  getSystemAuth?(id: string): Promise<SystemInstanceAuth | undefined>;
  getSystemAuthByName?(systemInstanceId: string, name: string): Promise<SystemInstanceAuth | undefined>;
  createSystemAuth?(auth: InsertSystemInstanceAuth): Promise<SystemInstanceAuth>;
  updateSystemAuth?(id: string, auth: Partial<InsertSystemInstanceAuth>): Promise<SystemInstanceAuth | undefined>;
  deleteSystemAuth?(id: string): Promise<boolean>;
  
  // Flow Versioning Management
  storeFlowVersion(version: FlowVersion): Promise<FlowVersion>;
  getFlowVersion(versionId: string): Promise<FlowVersion | undefined>;
  getFlowVersionHistory(
    flowId: string,
    organizationId: string,
    environment: "dev" | "staging" | "prod"
  ): Promise<FlowVersion[]>;
  updateFlowVersion(version: FlowVersion): Promise<FlowVersion>;
}

export class MemStorage implements IStorage {
  private flows: Map<string, FlowDefinition>;
  private flowRuns: Map<string, FlowRun>;
  private smtp: SmtpSettings | undefined;
  private queueBackendConfig: QueueBackendConfig | undefined;
  private authAdapters: Map<string, AuthAdapter>;
  private auditLogs: any[];
  private inboundAuthPolicies: Map<string, InboundAuthPolicy>;
  private flowVersions: Map<string, FlowVersion>; // versionId -> FlowVersion

  constructor() {
    this.flows = new Map();
    this.flowRuns = new Map();
    this.smtp = undefined;
    this.queueBackendConfig = undefined;
    this.authAdapters = new Map();
    this.auditLogs = [];
    this.inboundAuthPolicies = new Map();
    this.flowVersions = new Map();
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

  async getFlows(
    systemInstanceId?: string, 
    organizationId?: string,
    environment?: "dev" | "test" | "staging" | "prod"
  ): Promise<FlowDefinition[]> {
    const allFlows = Array.from(this.flows.values());
    
    // Apply filters
    let filtered = allFlows;
    
    if (systemInstanceId) {
      filtered = filtered.filter(f => f.systemInstanceId === systemInstanceId);
    }
    
    if (organizationId) {
      filtered = filtered.filter(f => (f as any).organizationId === organizationId);
    }
    
    // Environment filtering via metadata
    if (environment) {
      filtered = filtered.filter(f => {
        const metadata = (f as any).metadata;
        if (!metadata || typeof metadata !== 'object') return false;
        return metadata.targetEnvironment === environment;
      });
    }
    
    return filtered;
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
      port: settings.port !== undefined ? settings.port : 587,
      secure: settings.secure !== undefined ? settings.secure : false,
      enabled: settings.enabled !== undefined ? settings.enabled : true,
      fromName: settings.fromName || null,
      notifyOnFlowError: settings.notifyOnFlowError !== undefined ? settings.notifyOnFlowError : true,
      notifyOnValidationError: settings.notifyOnValidationError !== undefined ? settings.notifyOnValidationError : false,
      notifyOnAckFailure: settings.notifyOnAckFailure !== undefined ? settings.notifyOnAckFailure : true,
      lastTestedAt: settings.lastTestedAt || null,
      createdAt: this.smtp?.createdAt || now,
      updatedAt: now,
    };
    
    return this.smtp!;
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
      id: 'singleton',
      currentBackend: config.currentBackend || 'inmemory',
      currentSecretId: config.currentSecretId || null,
      previousBackend: config.previousBackend || null,
      previousSecretId: config.previousSecretId || null,
      lastChangeAt: config.lastChangeAt || null,
      changePending: config.changePending !== undefined ? config.changePending : false,
      lastError: config.lastError || null,
      updatedAt: now,
    };

    return this.queueBackendConfig!;
  }

  // ============================================================================
  // Auth Adapter Management
  // ============================================================================

  async listAuthAdapters(userId?: string): Promise<AuthAdapter[]> {
    const adapters = Array.from(this.authAdapters.values());
    if (userId) {
      return adapters.filter(a => a.userId === userId);
    }
    return adapters;
  }

  async getAuthAdapter(id: string): Promise<AuthAdapter | undefined> {
    return this.authAdapters.get(id);
  }

  async saveAuthAdapter(data: InsertAuthAdapter): Promise<AuthAdapter> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    const adapter: AuthAdapter = {
      ...data,
      id,
      description: data.description || null,
      userId: data.userId || null,
      secretId: data.secretId || null,
      tags: data.tags || null,
      metadata: data.metadata || null,
      activated: data.activated !== undefined ? data.activated : false,
      lastTestedAt: null,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    
    this.authAdapters.set(id, adapter);
    return adapter;
  }

  async updateAuthAdapter(id: string, data: Partial<InsertAuthAdapter>): Promise<AuthAdapter | undefined> {
    const existing = this.authAdapters.get(id);
    if (!existing) {
      return undefined;
    }

    const updated: AuthAdapter = {
      ...existing,
      ...data,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    this.authAdapters.set(id, updated);
    return updated;
  }

  async deleteAuthAdapter(id: string): Promise<boolean> {
    return this.authAdapters.delete(id);
  }

  async getActiveAuthAdapters(direction?: 'inbound' | 'outbound'): Promise<AuthAdapter[]> {
    const adapters = Array.from(this.authAdapters.values())
      .filter(a => a.activated);
    
    if (direction) {
      return adapters.filter(a => 
        a.direction === direction || a.direction === 'bidirectional'
      );
    }
    
    return adapters;
  }

  // ============================================================================
  // Audit Logs
  // ============================================================================

  async getAuditLogs(filters?: { since?: string; limit?: number; resourceType?: string }): Promise<any[]> {
    let logs = [...this.auditLogs];
    
    if (filters?.since) {
      const sinceDate = new Date(filters.since);
      logs = logs.filter(log => new Date(log.timestamp) >= sinceDate);
    }
    
    if (filters?.resourceType) {
      logs = logs.filter(log => log.resource_type === filters.resourceType);
    }
    
    // Sort by timestamp descending
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (filters?.limit) {
      logs = logs.slice(0, filters.limit);
    }
    
    return logs;
  }

  async addAuditLog(log: any): Promise<void> {
    this.auditLogs.push({
      ...log,
      id: randomUUID(),
      created_at: new Date().toISOString(),
    });
  }

  // ============================================================================
  // Inbound Auth Policies
  // ============================================================================

  async getInboundAuthPolicies(): Promise<InboundAuthPolicy[]> {
    return [...this.inboundAuthPolicies.values()];
  }

  async getInboundAuthPolicy(routePattern: string, httpMethod?: string): Promise<InboundAuthPolicy | undefined> {
    // Find policy matching route pattern and HTTP method
    const policies = [...this.inboundAuthPolicies.values()];
    for (const policy of policies) {
      if (policy.routePattern === routePattern) {
        // If policy specifies ALL or matches the requested method
        if (policy.httpMethod === "ALL" || !httpMethod || policy.httpMethod === httpMethod) {
          return policy;
        }
      }
    }
    return undefined;
  }

  async createInboundAuthPolicy(insertPolicy: InsertInboundAuthPolicy): Promise<InboundAuthPolicy> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const policy: InboundAuthPolicy = {
      id,
      routePattern: insertPolicy.routePattern,
      httpMethod: insertPolicy.httpMethod || "ALL",
      description: insertPolicy.description || null,
      metadata: insertPolicy.metadata || null,
      createdAt: now,
      updatedAt: now,
      adapterId: insertPolicy.adapterId || null,
      enforcementMode: insertPolicy.enforcementMode || "required",
      multiTenant: insertPolicy.multiTenant || false,
    };
    this.inboundAuthPolicies.set(id, policy);
    return policy;
  }

  async updateInboundAuthPolicy(id: string, updates: Partial<InsertInboundAuthPolicy>): Promise<InboundAuthPolicy | undefined> {
    const policy = this.inboundAuthPolicies.get(id);
    if (!policy) {
      return undefined;
    }

    const updatedPolicy: InboundAuthPolicy = {
      ...policy,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.inboundAuthPolicies.set(id, updatedPolicy);
    return updatedPolicy;
  }

  async deleteInboundAuthPolicy(id: string): Promise<void> {
    this.inboundAuthPolicies.delete(id);
  }
  
  // ============================================================================
  // Flow Versioning Management
  // ============================================================================
  
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

export const storage = new MemStorage();
