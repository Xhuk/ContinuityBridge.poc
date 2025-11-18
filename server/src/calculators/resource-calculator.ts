/**
 * Resource Calculator
 * 
 * Calculates infrastructure requirements based on:
 * - Orders per day
 * - Number of interfaces
 * - Number of systems
 * - Data transformation complexity
 * 
 * Recommends: CPU, RAM, Storage, Deployment type
 */

import { logger } from "../core/logger.js";

const log = logger.child("ResourceCalculator");

export interface WorkloadProfile {
  // Business metrics
  ordersPerDay: number;
  interfacesCount: number;
  systemsCount: number;
  
  // Technical metrics
  avgOrderSizeKB: number;          // Average order payload size
  transformationComplexity: "low" | "medium" | "high";
  retentionDays: number;           // Log retention period
  peakMultiplier: number;          // Peak vs average (e.g., 3x)
}

export interface ResourceRecommendation {
  // Deployment type
  deploymentType: "docker-compose" | "kubernetes";
  reason: string;
  
  // Hardware specs
  cpu: {
    cores: number;
    description: string;
  };
  
  memory: {
    gb: number;
    description: string;
  };
  
  storage: {
    gb: number;
    description: string;
  };
  
  // Network
  bandwidth: {
    mbps: number;
    description: string;
  };
  
  // Database
  database: {
    type: "postgres";
    connections: number;
    storage: number;
  };
  
  // Cache (Valkey)
  cache: {
    enabled: boolean;
    memory: number;
  };
  
  // Scaling
  replicas: number;
  autoScaling: {
    enabled: boolean;
    min: number;
    max: number;
  };
  
  // Cost estimates
  costEstimate: {
    monthly: {
      min: number;
      max: number;
      currency: "USD";
    };
    breakdown: {
      compute: number;
      storage: number;
      network: number;
    };
  };
  
  // Recommendations
  recommendations: string[];
  warnings: string[];
}

export class ResourceCalculator {
  /**
   * Calculate resource requirements
   */
  calculate(profile: WorkloadProfile): ResourceRecommendation {
    log.info("Calculating resource requirements", profile);

    // Calculate orders per second (at peak)
    const ordersPerSecond = (profile.ordersPerDay * profile.peakMultiplier) / (24 * 3600);
    
    // Calculate data volume
    const dailyDataGB = (profile.ordersPerDay * profile.avgOrderSizeKB) / (1024 * 1024);
    const totalDataGB = dailyDataGB * profile.retentionDays;
    
    // Complexity multipliers
    const complexityMultipliers = {
      low: 1.0,      // Simple mapping, minimal logic
      medium: 1.5,   // Moderate transformations
      high: 2.5,     // Complex validations, enrichment
    };
    const complexityFactor = complexityMultipliers[profile.transformationComplexity];
    
    // Calculate CPU requirements
    // Base: 0.1 cores per order/sec
    // + 0.5 cores per interface
    // + 0.3 cores per system
    // × complexity factor
    const baseCPU = 2; // Minimum for OS + overhead
    const orderCPU = ordersPerSecond * 0.1 * complexityFactor;
    const interfaceCPU = profile.interfacesCount * 0.5;
    const systemCPU = profile.systemsCount * 0.3;
    const totalCPU = Math.max(baseCPU, orderCPU + interfaceCPU + systemCPU);
    const cpuCores = Math.ceil(totalCPU);
    
    // Calculate memory requirements
    // Base: 2GB for app
    // + 1GB per 1000 orders/day
    // + 0.5GB per interface
    // + 0.3GB per system
    // + buffer (20%)
    const baseMemory = 2;
    const orderMemory = (profile.ordersPerDay / 1000) * 1;
    const interfaceMemory = profile.interfacesCount * 0.5;
    const systemMemory = profile.systemsCount * 0.3;
    const totalMemory = (baseMemory + orderMemory + interfaceMemory + systemMemory) * 1.2;
    const memoryGB = Math.ceil(totalMemory);
    
    // Calculate storage requirements
    // App: 10GB
    // PostgreSQL: totalDataGB + 50% buffer
    // Valkey: 1GB per 10k orders/day
    // Logs: 5GB
    const appStorage = 10;
    const dbStorage = Math.ceil(totalDataGB * 1.5);
    const cacheStorage = Math.ceil((profile.ordersPerDay / 10000) * 1);
    const logStorage = 5;
    const totalStorage = appStorage + dbStorage + cacheStorage + logStorage;
    
    // Calculate bandwidth
    // Orders/sec × avg size × 2 (in + out) × 10 (safety)
    const bandwidthMbps = Math.ceil(ordersPerSecond * profile.avgOrderSizeKB * 2 * 10 / 125); // KB to Mbps
    
    // Determine deployment type
    const deploymentType = this.recommendDeploymentType(
      profile.ordersPerDay,
      cpuCores,
      memoryGB
    );
    
    // Determine replicas
    const replicas = this.calculateReplicas(deploymentType, ordersPerSecond);
    
    // Auto-scaling
    const autoScaling = deploymentType === "kubernetes" ? {
      enabled: true,
      min: replicas,
      max: Math.max(replicas * 3, 5),
    } : {
      enabled: false,
      min: 1,
      max: 1,
    };
    
    // Database connections
    const dbConnections = Math.max(20, replicas * 10);
    
    // Valkey cache
    const cacheEnabled = profile.ordersPerDay > 1000;
    const cacheMemory = cacheEnabled ? Math.max(1, cacheStorage) : 0;
    
    // Cost estimate
    const costEstimate = this.estimateCost(
      deploymentType,
      cpuCores,
      memoryGB,
      totalStorage,
      replicas
    );
    
    // Recommendations
    const recommendations = this.generateRecommendations(
      profile,
      deploymentType,
      ordersPerSecond,
      cpuCores,
      memoryGB
    );
    
    // Warnings
    const warnings = this.generateWarnings(
      profile,
      ordersPerSecond,
      cpuCores,
      memoryGB,
      totalStorage
    );
    
    return {
      deploymentType,
      reason: deploymentType === "kubernetes" 
        ? "High volume or HA requirements - Kubernetes recommended"
        : "Standard volume - Docker Compose is sufficient",
      
      cpu: {
        cores: cpuCores,
        description: `${cpuCores} vCPUs (${ordersPerSecond.toFixed(2)} orders/sec × ${complexityFactor}x complexity)`,
      },
      
      memory: {
        gb: memoryGB,
        description: `${memoryGB}GB RAM (app + ${profile.interfacesCount} interfaces + ${profile.systemsCount} systems)`,
      },
      
      storage: {
        gb: totalStorage,
        description: `${totalStorage}GB (${dbStorage}GB DB + ${appStorage}GB app + ${cacheStorage}GB cache + ${logStorage}GB logs)`,
      },
      
      bandwidth: {
        mbps: bandwidthMbps,
        description: `${bandwidthMbps} Mbps (peak traffic handling)`,
      },
      
      database: {
        type: "postgres",
        connections: dbConnections,
        storage: dbStorage,
      },
      
      cache: {
        enabled: cacheEnabled,
        memory: cacheMemory,
      },
      
      replicas,
      autoScaling,
      
      costEstimate,
      recommendations,
      warnings,
    };
  }

  /**
   * Recommend deployment type
   */
  private recommendDeploymentType(
    ordersPerDay: number,
    cpuCores: number,
    memoryGB: number
  ): "docker-compose" | "kubernetes" {
    // K8s if:
    // - > 10k orders/day
    // - > 8 CPU cores
    // - > 16GB RAM
    // - Need HA
    
    if (ordersPerDay > 10000 || cpuCores > 8 || memoryGB > 16) {
      return "kubernetes";
    }
    
    return "docker-compose";
  }

  /**
   * Calculate replicas
   */
  private calculateReplicas(
    deploymentType: "docker-compose" | "kubernetes",
    ordersPerSecond: number
  ): number {
    if (deploymentType === "docker-compose") {
      return 1;
    }
    
    // K8s: 1 replica per 5 orders/sec
    // Min: 2 (HA)
    // Max: 10
    const replicas = Math.ceil(ordersPerSecond / 5);
    return Math.min(Math.max(replicas, 2), 10);
  }

  /**
   * Estimate monthly cost
   */
  private estimateCost(
    deploymentType: "docker-compose" | "kubernetes",
    cpuCores: number,
    memoryGB: number,
    storageGB: number,
    replicas: number
  ) {
    // Docker Compose (single server)
    if (deploymentType === "docker-compose") {
      // AWS EC2 t3.xlarge equivalent
      // 4 vCPU, 16GB RAM = ~$150/month
      const baseCompute = 150;
      
      // Storage: $0.10/GB/month
      const dockerStorageCost = storageGB * 0.10;
      
      // Network: ~$20/month
      const networkCost = 20;
      
      return {
        monthly: {
          min: Math.ceil(baseCompute + dockerStorageCost + networkCost),
          max: Math.ceil((baseCompute + dockerStorageCost + networkCost) * 1.2),
          currency: "USD" as const,
        },
        breakdown: {
          compute: baseCompute,
          storage: Math.ceil(dockerStorageCost),
          network: networkCost,
        },
      };
    }
    
    // Kubernetes (cluster)
    // AWS EKS: $75/month (control plane)
    // + nodes
    const controlPlaneCost = 75;
    
    // Node cost: $0.05/vCPU/hour + $0.01/GB RAM/hour
    const cpuCostPerHour = cpuCores * 0.05 * replicas;
    const ramCostPerHour = memoryGB * 0.01 * replicas;
    const nodeCostPerMonth = (cpuCostPerHour + ramCostPerHour) * 730; // hours/month
    
    // Storage: $0.10/GB/month
    const storageCost = storageGB * 0.10;
    
    // Network: $50/month
    const networkCost = 50;
    
    const total = controlPlaneCost + nodeCostPerMonth + storageCost + networkCost;
    
    return {
      monthly: {
        min: Math.ceil(total),
        max: Math.ceil(total * 1.3), // Buffer for scaling
        currency: "USD" as const,
      },
      breakdown: {
        compute: Math.ceil(controlPlaneCost + nodeCostPerMonth),
        storage: Math.ceil(storageCost),
        network: networkCost,
      },
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    profile: WorkloadProfile,
    deploymentType: "docker-compose" | "kubernetes",
    ordersPerSecond: number,
    cpuCores: number,
    memoryGB: number
  ): string[] {
    const recs: string[] = [];
    
    // Deployment type
    if (deploymentType === "docker-compose") {
      recs.push("✅ Docker Compose is sufficient for this workload");
      recs.push("💡 Consider Kubernetes if you expect 3x growth");
    } else {
      recs.push("✅ Kubernetes recommended for high availability");
      recs.push("💡 Enable auto-scaling to handle traffic spikes");
    }
    
    // Valkey
    if (profile.ordersPerDay > 1000) {
      recs.push("✅ Valkey cache enabled for rate limiting and performance");
    }
    
    // Database
    if (profile.retentionDays > 90) {
      recs.push("💡 Consider archiving old data to reduce storage costs");
    }
    
    // Complexity
    if (profile.transformationComplexity === "high") {
      recs.push("⚠️ High complexity detected - allocate extra CPU for transformations");
    }
    
    // Scaling
    if (ordersPerSecond > 10) {
      recs.push("📈 High throughput - enable monitoring and alerting");
    }
    
    return recs;
  }

  /**
   * Generate warnings
   */
  private generateWarnings(
    profile: WorkloadProfile,
    ordersPerSecond: number,
    cpuCores: number,
    memoryGB: number,
    storageGB: number
  ): string[] {
    const warnings: string[] = [];
    
    // High load
    if (ordersPerSecond > 50) {
      warnings.push("⚠️ Very high load - test thoroughly before production");
    }
    
    // Resource constraints
    if (cpuCores < 2) {
      warnings.push("⚠️ Low CPU allocation - may cause performance issues");
    }
    
    if (memoryGB < 4) {
      warnings.push("⚠️ Low memory allocation - monitor for OOM errors");
    }
    
    // Storage
    if (storageGB > 500) {
      warnings.push("⚠️ Large storage requirement - consider cost optimization");
    }
    
    // Interfaces
    if (profile.interfacesCount > 50) {
      warnings.push("⚠️ Many interfaces - ensure proper rate limiting");
    }
    
    // Peak multiplier
    if (profile.peakMultiplier > 5) {
      warnings.push("⚠️ High peak multiplier - ensure auto-scaling is configured");
    }
    
    return warnings;
  }
}

export const resourceCalculator = new ResourceCalculator();
