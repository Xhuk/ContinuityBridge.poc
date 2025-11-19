import { logger } from "../core/logger.js";

const log = logger.child("ClusterConfig");

// In-memory storage for cluster configuration (replace with database in production)
const clusterConfigs = new Map<string, any>();

/**
 * Get cluster configuration for an organization
 */
export function getClusterConfig(organizationId: string): any | null {
  const config = clusterConfigs.get(organizationId);
  
  if (!config) {
    // Return default configuration
    return {
      id: organizationId,
      organizationId,
      enabled: false,
      appServerHost: "10.0.1.10",
      appServerPort: 5000,
      appReplicas: 2,
      dbServerHost: "10.0.1.20",
      dbServerPort: 5432,
      redisServerPort: 6379,
      privateNetwork: true,
      sslEnabled: true,
      appServerCpuLimit: "2.0",
      appServerMemoryLimit: "4G",
      dbServerCpuLimit: "4.0",
      dbServerMemoryLimit: "8G",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  
  return config;
}

/**
 * Update or create cluster configuration
 */
export function upsertClusterConfig(
  organizationId: string,
  updates: Partial<any>
): any {
  const existing = clusterConfigs.get(organizationId) || {
    id: organizationId,
    organizationId,
    createdAt: new Date().toISOString(),
  };

  const updated = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  clusterConfigs.set(organizationId, updated);

  log.info("Cluster configuration updated", {
    organizationId,
    enabled: updated.enabled,
    appServerHost: updated.appServerHost,
    dbServerHost: updated.dbServerHost,
  });

  return updated;
}

/**
 * Delete cluster configuration
 */
export function deleteClusterConfig(organizationId: string): boolean {
  const existed = clusterConfigs.has(organizationId);
  clusterConfigs.delete(organizationId);
  
  if (existed) {
    log.info("Cluster configuration deleted", { organizationId });
  }
  
  return existed;
}

/**
 * Generate deployment files for cluster configuration
 */
export async function generateClusterFiles(config: any): Promise<{
  files: string[];
  downloadUrl: string;
}> {
  // This would generate actual files in a real implementation
  // For now, return mock data
  
  const files = [
    "docker-compose.cluster.yml",
    ".env.cluster",
    "deploy-cluster.sh",
    "CLUSTER_DEPLOYMENT.md",
  ];

  log.info("Generated cluster deployment files", {
    organizationId: config.organizationId,
    files,
  });

  return {
    files,
    downloadUrl: `/api/cluster/download/${config.organizationId}`,
  };
}

/**
 * Get all cluster configurations (admin only)
 */
export function getAllClusterConfigs(): any[] {
  return Array.from(clusterConfigs.values());
}
