import { randomUUID } from "crypto";
import { FlowDefinition } from "@shared/schema";
import { logger } from "../core/logger.js";
import type { IStorage } from "../../storage";

const log = logger.child("FlowVersionManager");

/**
 * Flow Version Record
 * Tracks all versions of a flow per organization and environment
 */
export interface FlowVersion {
  id: string;
  flowId: string;
  organizationId: string;
  environment: "dev" | "staging" | "prod";
  version: string; // Semantic version: MAJOR.MINOR.PATCH
  
  // Version metadata
  definition: FlowDefinition;
  changeDescription: string;
  changeType: "major" | "minor" | "patch";
  
  // Deployment tracking
  status: "draft" | "pending_approval" | "approved" | "deployed" | "deprecated";
  deployedAt?: string;
  isImmutable: boolean; // true if deployed to PROD
  
  // Approval workflow
  createdBy: string;
  createdByEmail: string;
  approvedBy?: string;
  approvedByEmail?: string;
  approvedAt?: string;
  
  // Rollback support
  previousVersionId?: string;
  rollbackAvailable: boolean;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

/**
 * Flow Version Manager
 * Handles semantic versioning, approval workflows, and environment promotion
 * 
 * Rules:
 * - DEV: Instant deployment, mutable
 * - STAGING: Requires approval, immutable after deployment
 * - PROD: Requires approval, immutable, rollback capability
 */
export class FlowVersionManager {
  private storage: IStorage;
  
  constructor(storage: IStorage) {
    this.storage = storage;
  }
  
  /**
   * Create a new version of a flow
   * Auto-increments version based on changeType
   */
  async createVersion(params: {
    flowId: string;
    organizationId: string;
    environment: "dev" | "staging" | "prod";
    definition: FlowDefinition;
    changeType: "major" | "minor" | "patch";
    changeDescription: string;
    createdBy: string;
    createdByEmail: string;
  }): Promise<FlowVersion> {
    const { flowId, organizationId, environment, definition, changeType, changeDescription, createdBy, createdByEmail } = params;
    
    // Get current version
    const currentVersion = await this.getCurrentVersion(flowId, organizationId, environment);
    
    // Calculate new version
    const newVersion = this.incrementVersion(
      currentVersion?.version || "0.0.0",
      changeType
    );
    
    // Check environment rules
    const requiresApproval = environment !== "dev";
    const status = requiresApproval ? "pending_approval" : "approved";
    
    const flowVersion: FlowVersion = {
      id: randomUUID(),
      flowId,
      organizationId,
      environment,
      version: newVersion,
      definition,
      changeDescription,
      changeType,
      status,
      isImmutable: false,
      createdBy,
      createdByEmail,
      previousVersionId: currentVersion?.id,
      rollbackAvailable: !!currentVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Store version
    await this.storeVersion(flowVersion);
    
    log.info(`Created flow version`, {
      flowId,
      organizationId,
      environment,
      version: newVersion,
      changeType,
      status,
    });
    
    return flowVersion;
  }
  
  /**
   * Approve a pending version (Superadmin only)
   */
  async approveVersion(params: {
    versionId: string;
    approvedBy: string;
    approvedByEmail: string;
  }): Promise<FlowVersion> {
    const version = await this.getVersion(params.versionId);
    
    if (!version) {
      throw new Error(`Version not found: ${params.versionId}`);
    }
    
    if (version.status !== "pending_approval") {
      throw new Error(`Version is not pending approval: ${version.status}`);
    }
    
    // Update version
    const updatedVersion: FlowVersion = {
      ...version,
      status: "approved",
      approvedBy: params.approvedBy,
      approvedByEmail: params.approvedByEmail,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await this.updateVersion(updatedVersion);
    
    log.info(`Version approved`, {
      versionId: params.versionId,
      version: version.version,
      approvedBy: params.approvedByEmail,
    });
    
    return updatedVersion;
  }
  
  /**
   * Deploy a version to an environment
   * PROD deployments become immutable
   */
  async deployVersion(versionId: string): Promise<FlowVersion> {
    const version = await this.getVersion(versionId);
    
    if (!version) {
      throw new Error(`Version not found: ${versionId}`);
    }
    
    if (version.status !== "approved") {
      throw new Error(`Version must be approved before deployment: ${version.status}`);
    }
    
    if (version.isImmutable) {
      throw new Error(`Version is immutable and cannot be redeployed`);
    }
    
    // Deploy to environment
    const isProduction = version.environment === "prod";
    
    const deployedVersion: FlowVersion = {
      ...version,
      status: "deployed",
      deployedAt: new Date().toISOString(),
      isImmutable: isProduction, // PROD becomes immutable
      updatedAt: new Date().toISOString(),
    };
    
    await this.updateVersion(deployedVersion);
    
    // Update active flow definition
    await this.activateVersion(version.flowId, version.organizationId, version.environment, deployedVersion);
    
    log.info(`Version deployed`, {
      versionId,
      environment: version.environment,
      version: version.version,
      isImmutable: isProduction,
    });
    
    return deployedVersion;
  }
  
  /**
   * Rollback to a previous version (PROD only)
   */
  async rollbackVersion(params: {
    flowId: string;
    organizationId: string;
    targetVersionId: string;
    rolledBackBy: string;
    rolledBackByEmail: string;
  }): Promise<FlowVersion> {
    const { flowId, organizationId, targetVersionId, rolledBackBy, rolledBackByEmail } = params;
    
    const targetVersion = await this.getVersion(targetVersionId);
    
    if (!targetVersion) {
      throw new Error(`Target version not found: ${targetVersionId}`);
    }
    
    if (targetVersion.environment !== "prod") {
      throw new Error(`Rollback only available for PROD environment`);
    }
    
    if (targetVersion.status !== "deployed") {
      throw new Error(`Can only rollback to deployed versions`);
    }
    
    // Create rollback version (new version based on old definition)
    const rollbackVersion = await this.createVersion({
      flowId,
      organizationId,
      environment: "prod",
      definition: targetVersion.definition,
      changeType: "patch",
      changeDescription: `Rollback to version ${targetVersion.version}`,
      createdBy: rolledBackBy,
      createdByEmail: rolledBackByEmail,
    });
    
    // Auto-approve and deploy rollback
    const approved = await this.approveVersion({
      versionId: rollbackVersion.id,
      approvedBy: rolledBackBy,
      approvedByEmail: rolledBackByEmail,
    });
    
    const deployed = await this.deployVersion(approved.id);
    
    log.info(`Rollback completed`, {
      flowId,
      organizationId,
      fromVersion: rollbackVersion.version,
      toVersion: targetVersion.version,
    });
    
    return deployed;
  }
  
  /**
   * Get all versions for a flow in an environment
   */
  async getVersionHistory(
    flowId: string,
    organizationId: string,
    environment: "dev" | "staging" | "prod"
  ): Promise<FlowVersion[]> {
    // TODO: Implement storage query
    // For now, return empty array
    return [];
  }
  
  /**
   * Get current deployed version
   */
  async getCurrentVersion(
    flowId: string,
    organizationId: string,
    environment: "dev" | "staging" | "prod"
  ): Promise<FlowVersion | null> {
    const history = await this.getVersionHistory(flowId, organizationId, environment);
    
    const deployed = history.filter(v => v.status === "deployed");
    
    if (deployed.length === 0) {
      return null;
    }
    
    // Return most recent
    return deployed.sort((a, b) => 
      new Date(b.deployedAt!).getTime() - new Date(a.deployedAt!).getTime()
    )[0];
  }
  
  /**
   * Increment semantic version
   */
  private incrementVersion(currentVersion: string, changeType: "major" | "minor" | "patch"): string {
    const [major, minor, patch] = currentVersion.split(".").map(Number);
    
    switch (changeType) {
      case "major":
        return `${major + 1}.0.0`;
      case "minor":
        return `${major}.${minor + 1}.0`;
      case "patch":
        return `${major}.${minor}.${patch + 1}`;
    }
  }
  
  /**
   * Store version (implement with actual storage)
   */
  private async storeVersion(version: FlowVersion): Promise<void> {
    // TODO: Store in database
    log.debug(`Storing version`, { versionId: version.id, version: version.version });
  }
  
  /**
   * Get version by ID
   */
  private async getVersion(versionId: string): Promise<FlowVersion | null> {
    // TODO: Implement storage retrieval
    return null;
  }
  
  /**
   * Update version
   */
  private async updateVersion(version: FlowVersion): Promise<void> {
    // TODO: Implement storage update
    log.debug(`Updating version`, { versionId: version.id });
  }
  
  /**
   * Activate a version (make it the active flow)
   */
  private async activateVersion(
    flowId: string,
    organizationId: string,
    environment: string,
    version: FlowVersion
  ): Promise<void> {
    // Update flow definition in storage with version metadata
    await this.storage.updateFlow(flowId, {
      ...version.definition,
      metadata: {
        ...version.definition.metadata,
        deployedVersion: version.version,
        deployedAt: version.deployedAt,
        environment,
        organizationId,
      },
    } as any);
  }
}
import { randomUUID } from "crypto";
import { FlowDefinition } from "@shared/schema";
import { logger } from "../core/logger.js";
import type { IStorage } from "../../storage";

const log = logger.child("FlowVersionManager");

/**
 * Flow Version Record
 * Tracks all versions of a flow per organization and environment
 */
export interface FlowVersion {
  id: string;
  flowId: string;
  organizationId: string;
  environment: "dev" | "staging" | "prod";
  version: string; // Semantic version: MAJOR.MINOR.PATCH
  
  // Version metadata
  definition: FlowDefinition;
  changeDescription: string;
  changeType: "major" | "minor" | "patch";
  
  // Deployment tracking
  status: "draft" | "pending_approval" | "approved" | "deployed" | "deprecated";
  deployedAt?: string;
  isImmutable: boolean; // true if deployed to PROD
  
  // Approval workflow
  createdBy: string;
  createdByEmail: string;
  approvedBy?: string;
  approvedByEmail?: string;
  approvedAt?: string;
  
  // Rollback support
  previousVersionId?: string;
  rollbackAvailable: boolean;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

/**
 * Flow Version Manager
 * Handles semantic versioning, approval workflows, and environment promotion
 * 
 * Rules:
 * - DEV: Instant deployment, mutable
 * - STAGING: Requires approval, immutable after deployment
 * - PROD: Requires approval, immutable, rollback capability
 */
export class FlowVersionManager {
  private storage: IStorage;
  
  constructor(storage: IStorage) {
    this.storage = storage;
  }
  
  /**
   * Create a new version of a flow
   * Auto-increments version based on changeType
   */
  async createVersion(params: {
    flowId: string;
    organizationId: string;
    environment: "dev" | "staging" | "prod";
    definition: FlowDefinition;
    changeType: "major" | "minor" | "patch";
    changeDescription: string;
    createdBy: string;
    createdByEmail: string;
  }): Promise<FlowVersion> {
    const { flowId, organizationId, environment, definition, changeType, changeDescription, createdBy, createdByEmail } = params;
    
    // Get current version
    const currentVersion = await this.getCurrentVersion(flowId, organizationId, environment);
    
    // Calculate new version
    const newVersion = this.incrementVersion(
      currentVersion?.version || "0.0.0",
      changeType
    );
    
    // Check environment rules
    const requiresApproval = environment !== "dev";
    const status = requiresApproval ? "pending_approval" : "approved";
    
    const flowVersion: FlowVersion = {
      id: randomUUID(),
      flowId,
      organizationId,
      environment,
      version: newVersion,
      definition,
      changeDescription,
      changeType,
      status,
      isImmutable: false,
      createdBy,
      createdByEmail,
      previousVersionId: currentVersion?.id,
      rollbackAvailable: !!currentVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Store version
    await this.storeVersion(flowVersion);
    
    log.info(`Created flow version`, {
      flowId,
      organizationId,
      environment,
      version: newVersion,
      changeType,
      status,
    });
    
    return flowVersion;
  }
  
  /**
   * Approve a pending version (Superadmin only)
   */
  async approveVersion(params: {
    versionId: string;
    approvedBy: string;
    approvedByEmail: string;
  }): Promise<FlowVersion> {
    const version = await this.getVersion(params.versionId);
    
    if (!version) {
      throw new Error(`Version not found: ${params.versionId}`);
    }
    
    if (version.status !== "pending_approval") {
      throw new Error(`Version is not pending approval: ${version.status}`);
    }
    
    // Update version
    const updatedVersion: FlowVersion = {
      ...version,
      status: "approved",
      approvedBy: params.approvedBy,
      approvedByEmail: params.approvedByEmail,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await this.updateVersion(updatedVersion);
    
    log.info(`Version approved`, {
      versionId: params.versionId,
      version: version.version,
      approvedBy: params.approvedByEmail,
    });
    
    return updatedVersion;
  }
  
  /**
   * Deploy a version to an environment
   * PROD deployments become immutable
   */
  async deployVersion(versionId: string): Promise<FlowVersion> {
    const version = await this.getVersion(versionId);
    
    if (!version) {
      throw new Error(`Version not found: ${versionId}`);
    }
    
    if (version.status !== "approved") {
      throw new Error(`Version must be approved before deployment: ${version.status}`);
    }
    
    if (version.isImmutable) {
      throw new Error(`Version is immutable and cannot be redeployed`);
    }
    
    // Deploy to environment
    const isProduction = version.environment === "prod";
    
    const deployedVersion: FlowVersion = {
      ...version,
      status: "deployed",
      deployedAt: new Date().toISOString(),
      isImmutable: isProduction, // PROD becomes immutable
      updatedAt: new Date().toISOString(),
    };
    
    await this.updateVersion(deployedVersion);
    
    // Update active flow definition
    await this.activateVersion(version.flowId, version.organizationId, version.environment, deployedVersion);
    
    log.info(`Version deployed`, {
      versionId,
      environment: version.environment,
      version: version.version,
      isImmutable: isProduction,
    });
    
    return deployedVersion;
  }
  
  /**
   * Rollback to a previous version (PROD only)
   */
  async rollbackVersion(params: {
    flowId: string;
    organizationId: string;
    targetVersionId: string;
    rolledBackBy: string;
    rolledBackByEmail: string;
  }): Promise<FlowVersion> {
    const { flowId, organizationId, targetVersionId, rolledBackBy, rolledBackByEmail } = params;
    
    const targetVersion = await this.getVersion(targetVersionId);
    
    if (!targetVersion) {
      throw new Error(`Target version not found: ${targetVersionId}`);
    }
    
    if (targetVersion.environment !== "prod") {
      throw new Error(`Rollback only available for PROD environment`);
    }
    
    if (targetVersion.status !== "deployed") {
      throw new Error(`Can only rollback to deployed versions`);
    }
    
    // Create rollback version (new version based on old definition)
    const rollbackVersion = await this.createVersion({
      flowId,
      organizationId,
      environment: "prod",
      definition: targetVersion.definition,
      changeType: "patch",
      changeDescription: `Rollback to version ${targetVersion.version}`,
      createdBy: rolledBackBy,
      createdByEmail: rolledBackByEmail,
    });
    
    // Auto-approve and deploy rollback
    const approved = await this.approveVersion({
      versionId: rollbackVersion.id,
      approvedBy: rolledBackBy,
      approvedByEmail: rolledBackByEmail,
    });
    
    const deployed = await this.deployVersion(approved.id);
    
    log.info(`Rollback completed`, {
      flowId,
      organizationId,
      fromVersion: rollbackVersion.version,
      toVersion: targetVersion.version,
    });
    
    return deployed;
  }
  
  /**
   * Get all versions for a flow in an environment
   */
  async getVersionHistory(
    flowId: string,
    organizationId: string,
    environment: "dev" | "staging" | "prod"
  ): Promise<FlowVersion[]> {
    // TODO: Implement storage query
    // For now, return empty array
    return [];
  }
  
  /**
   * Get current deployed version
   */
  async getCurrentVersion(
    flowId: string,
    organizationId: string,
    environment: "dev" | "staging" | "prod"
  ): Promise<FlowVersion | null> {
    const history = await this.getVersionHistory(flowId, organizationId, environment);
    
    const deployed = history.filter(v => v.status === "deployed");
    
    if (deployed.length === 0) {
      return null;
    }
    
    // Return most recent
    return deployed.sort((a, b) => 
      new Date(b.deployedAt!).getTime() - new Date(a.deployedAt!).getTime()
    )[0];
  }
  
  /**
   * Increment semantic version
   */
  private incrementVersion(currentVersion: string, changeType: "major" | "minor" | "patch"): string {
    const [major, minor, patch] = currentVersion.split(".").map(Number);
    
    switch (changeType) {
      case "major":
        return `${major + 1}.0.0`;
      case "minor":
        return `${major}.${minor + 1}.0`;
      case "patch":
        return `${major}.${minor}.${patch + 1}`;
    }
  }
  
  /**
   * Store version (implement with actual storage)
   */
  private async storeVersion(version: FlowVersion): Promise<void> {
    // TODO: Store in database
    log.debug(`Storing version`, { versionId: version.id, version: version.version });
  }
  
  /**
   * Get version by ID
   */
  private async getVersion(versionId: string): Promise<FlowVersion | null> {
    // TODO: Implement storage retrieval
    return null;
  }
  
  /**
   * Update version
   */
  private async updateVersion(version: FlowVersion): Promise<void> {
    // TODO: Implement storage update
    log.debug(`Updating version`, { versionId: version.id });
  }
  
  /**
   * Activate a version (make it the active flow)
   */
  private async activateVersion(
    flowId: string,
    organizationId: string,
    environment: string,
    version: FlowVersion
  ): Promise<void> {
    // Update flow definition in storage with version metadata
    await this.storage.updateFlow(flowId, {
      ...version.definition,
      metadata: {
        ...version.definition.metadata,
        deployedVersion: version.version,
        deployedAt: version.deployedAt,
        environment,
        organizationId,
      },
    } as any);
  }
}
