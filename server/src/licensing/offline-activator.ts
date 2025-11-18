/**
 * Offline License Activation System
 * 
 * For air-gapped deployments (no internet access):
 * 1. Customer generates activation request
 * 2. Sends request file to founder (email/USB)
 * 3. Founder signs license offline
 * 4. Customer installs license file
 * 
 * No internet required!
 */

import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import { logger } from "../core/logger.js";

const log = logger.child("OfflineLicense");

export interface ActivationRequest {
  organizationId: string;
  organizationName: string;
  machineId: string;          // Unique hardware ID
  requestedAt: string;
  requestId: string;
  
  // Customer info
  contactEmail: string;
  contractNumber?: string;
  
  // Requested license
  licenseType: "trial" | "basic" | "professional" | "enterprise";
  maxInterfaces: number;
  maxSystems: number;
}

export interface OfflineLicense {
  // Identity
  organizationId: string;
  organizationName: string;
  licenseId: string;
  
  // Machine binding
  machineId: string;
  
  // License details
  licenseType: "trial" | "basic" | "professional" | "enterprise";
  
  // Limits
  limits: {
    maxFlows: number;
    maxDataSources: number;
    maxInterfaces: number;
    maxSystems: number;
    maxUsers: number;
    maxExecutionsPerMonth: number;
  };
  
  // Pricing (for billing reference)
  pricing: {
    basePlatform: number;
    perInterface: number;
    perSystem: number;
    currency: string;
  };
  
  // Features
  features: {
    flowEditor: boolean;
    dataSources: boolean;
    interfaces: boolean;
    mappingGenerator: boolean;
    advancedSettings: boolean;
    customNodes: boolean;
    apiAccess: boolean;
    webhooks: boolean;
    
    canEditFlows: boolean;
    canAddInterfaces: boolean;
    canAddSystems: boolean;
    canDeleteResources: boolean;
  };
  
  // Validity
  issuedAt: string;
  validFrom: string;
  validUntil: string | null;  // null = perpetual
  
  // Metadata
  contractNumber?: string;
  notes?: string;
  issuedBy: string;
  
  // Security
  signature: string;  // RSA signature from founder's private key
  checksum: string;   // SHA-256 of license data
}

export class OfflineLicenseActivator {
  private publicKeyPath: string;
  private dataDir: string;

  constructor(
    publicKeyPath: string = "./keys/public_key.pem",
    dataDir: string = "./data/licenses"
  ) {
    this.publicKeyPath = publicKeyPath;
    this.dataDir = dataDir;
  }

  /**
   * Generate machine ID (unique hardware identifier)
   * Based on: hostname + CPU + OS
   */
  async generateMachineId(): Promise<string> {
    const hostname = os.hostname();
    const cpus = os.cpus();
    const platform = os.platform();
    const arch = os.arch();
    
    const machineData = {
      hostname,
      cpuModel: cpus[0]?.model || "unknown",
      cpuCount: cpus.length,
      platform,
      arch,
    };
    
    const machineString = JSON.stringify(machineData);
    return crypto.createHash("sha256").update(machineString).digest("hex").substring(0, 32);
  }

  /**
   * Step 1: Customer generates activation request
   * Returns file path to send to founder
   */
  async generateActivationRequest(params: {
    organizationId: string;
    organizationName: string;
    contactEmail: string;
    licenseType: ActivationRequest["licenseType"];
    maxInterfaces: number;
    maxSystems: number;
    contractNumber?: string;
  }): Promise<string> {
    const machineId = await this.generateMachineId();
    const requestId = crypto.randomUUID();
    
    const request: ActivationRequest = {
      organizationId: params.organizationId,
      organizationName: params.organizationName,
      machineId,
      requestedAt: new Date().toISOString(),
      requestId,
      contactEmail: params.contactEmail,
      contractNumber: params.contractNumber,
      licenseType: params.licenseType,
      maxInterfaces: params.maxInterfaces,
      maxSystems: params.maxSystems,
    };
    
    // Save to file
    const filename = `activation-request-${params.organizationId}-${Date.now()}.json`;
    const filepath = `./data/activation-requests/${filename}`;
    
    await fs.mkdir("./data/activation-requests", { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(request, null, 2));
    
    log.info("Activation request generated", {
      organizationId: params.organizationId,
      requestId,
      machineId,
      filepath,
    });
    
    return filepath;
  }

  /**
   * Step 2: Founder signs license (offline on founder's machine)
   * This runs on founder's laptop with private key
   */
  async signLicense(
    request: ActivationRequest,
    privateKeyPath: string
  ): Promise<OfflineLicense> {
    // Load private key
    const privateKey = await fs.readFile(privateKeyPath, "utf-8");
    
    // Create license based on request
    const license: Omit<OfflineLicense, "signature" | "checksum"> = {
      organizationId: request.organizationId,
      organizationName: request.organizationName,
      licenseId: crypto.randomUUID(),
      machineId: request.machineId,
      licenseType: request.licenseType,
      
      limits: this.getLimitsForLicenseType(request.licenseType, {
        maxInterfaces: request.maxInterfaces,
        maxSystems: request.maxSystems,
      }),
      
      pricing: {
        basePlatform: request.licenseType === "trial" ? 0 : 500,
        perInterface: request.licenseType === "trial" ? 0 : 100,
        perSystem: request.licenseType === "trial" ? 0 : 200,
        currency: "USD",
      },
      
      features: this.getFeaturesForLicenseType(request.licenseType),
      
      issuedAt: new Date().toISOString(),
      validFrom: new Date().toISOString(),
      validUntil: request.licenseType === "trial" 
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()  // 30 days
        : null,  // Perpetual for paid licenses
      
      contractNumber: request.contractNumber,
      issuedBy: "founder",
    };
    
    // Generate checksum
    const licenseData = JSON.stringify(license);
    const checksum = crypto.createHash("sha256").update(licenseData).digest("hex");
    
    // Sign with private key
    const sign = crypto.createSign("SHA256");
    sign.update(licenseData);
    const signature = sign.sign(privateKey, "hex");
    
    const signedLicense: OfflineLicense = {
      ...license,
      checksum,
      signature,
    };
    
    // Save to file
    const filename = `license-${request.organizationId}-${Date.now()}.key`;
    const filepath = `./data/signed-licenses/${filename}`;
    
    await fs.mkdir("./data/signed-licenses", { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(signedLicense, null, 2));
    
    log.info("License signed", {
      organizationId: request.organizationId,
      licenseId: signedLicense.licenseId,
      licenseType: signedLicense.licenseType,
      filepath,
    });
    
    return signedLicense;
  }

  /**
   * Step 3: Customer installs license file
   */
  async installLicense(licensePath: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Read license file
      const licenseData = await fs.readFile(licensePath, "utf-8");
      const license: OfflineLicense = JSON.parse(licenseData);
      
      // Verify signature
      const isValid = await this.verifyLicense(license);
      if (!isValid) {
        return { valid: false, reason: "Invalid license signature" };
      }
      
      // Verify machine binding
      const currentMachineId = await this.generateMachineId();
      if (license.machineId !== currentMachineId) {
        return { 
          valid: false, 
          reason: `License is bound to different machine (expected: ${license.machineId}, got: ${currentMachineId})` 
        };
      }
      
      // Check expiration
      if (license.validUntil) {
        const expiryDate = new Date(license.validUntil);
        if (expiryDate < new Date()) {
          return { valid: false, reason: "License has expired" };
        }
      }
      
      // Install license
      await fs.mkdir(this.dataDir, { recursive: true });
      const installedPath = `${this.dataDir}/license.key`;
      await fs.writeFile(installedPath, licenseData);
      
      log.info("License installed successfully", {
        organizationId: license.organizationId,
        licenseId: license.licenseId,
        licenseType: license.licenseType,
        validUntil: license.validUntil,
      });
      
      return { valid: true };
    } catch (error: any) {
      log.error("Failed to install license", error);
      return { valid: false, reason: error.message };
    }
  }

  /**
   * Verify license signature using public key
   */
  private async verifyLicense(license: OfflineLicense): Promise<boolean> {
    try {
      // Load public key
      const publicKey = await fs.readFile(this.publicKeyPath, "utf-8");
      
      // Extract signature and checksum
      const { signature, checksum, ...licenseData } = license;
      
      // Verify checksum
      const calculatedChecksum = crypto
        .createHash("sha256")
        .update(JSON.stringify(licenseData))
        .digest("hex");
      
      if (calculatedChecksum !== checksum) {
        log.error("License checksum mismatch");
        return false;
      }
      
      // Verify signature
      const verify = crypto.createVerify("SHA256");
      verify.update(JSON.stringify(licenseData));
      
      return verify.verify(publicKey, signature, "hex");
    } catch (error: any) {
      log.error("License verification failed", error);
      return false;
    }
  }

  /**
   * Get currently installed license
   */
  async getInstalledLicense(): Promise<OfflineLicense | null> {
    try {
      const licensePath = `${this.dataDir}/license.key`;
      const licenseData = await fs.readFile(licensePath, "utf-8");
      return JSON.parse(licenseData);
    } catch (error) {
      return null;
    }
  }

  /**
   * Helper: Get limits for license type
   */
  private getLimitsForLicenseType(
    licenseType: string,
    custom?: { maxInterfaces: number; maxSystems: number }
  ) {
    const defaults: Record<string, any> = {
      trial: {
        maxFlows: 5,
        maxDataSources: 2,
        maxInterfaces: 2,
        maxSystems: 1,
        maxUsers: 5,
        maxExecutionsPerMonth: 10000,
      },
      basic: {
        maxFlows: 20,
        maxDataSources: 5,
        maxInterfaces: custom?.maxInterfaces || 5,
        maxSystems: custom?.maxSystems || 2,
        maxUsers: 10,
        maxExecutionsPerMonth: 100000,
      },
      professional: {
        maxFlows: 100,
        maxDataSources: 20,
        maxInterfaces: custom?.maxInterfaces || 20,
        maxSystems: custom?.maxSystems || 10,
        maxUsers: 50,
        maxExecutionsPerMonth: 1000000,
      },
      enterprise: {
        maxFlows: 999999,
        maxDataSources: 999999,
        maxInterfaces: custom?.maxInterfaces || 999999,
        maxSystems: custom?.maxSystems || 999999,
        maxUsers: 999999,
        maxExecutionsPerMonth: 999999999,
      },
    };
    
    return defaults[licenseType] || defaults.trial;
  }

  /**
   * Helper: Get features for license type
   */
  private getFeaturesForLicenseType(licenseType: string) {
    return {
      flowEditor: licenseType !== "trial",
      dataSources: licenseType !== "trial",
      interfaces: licenseType !== "trial",
      mappingGenerator: licenseType === "professional" || licenseType === "enterprise",
      advancedSettings: licenseType === "enterprise",
      customNodes: licenseType === "enterprise",
      apiAccess: true,
      webhooks: true,
      
      canEditFlows: licenseType === "professional" || licenseType === "enterprise",
      canAddInterfaces: licenseType === "professional" || licenseType === "enterprise",
      canAddSystems: licenseType === "professional" || licenseType === "enterprise",
      canDeleteResources: licenseType === "enterprise",
    };
  }
}

// Global instance
export const offlineLicenseActivator = new OfflineLicenseActivator();
