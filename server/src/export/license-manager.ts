import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * License Manager - Offline license generation and validation
 * 
 * Uses RSA public/private key cryptography:
 * - Private key (kept secret by consultant) signs licenses
 * - Public key (embedded in runtime) validates licenses
 * - No internet required for validation
 */

export interface LicenseData {
  organizationId: string;
  organizationName: string;
  licenseType: "trial" | "annual" | "perpetual";
  expiryDate: string | null; // ISO 8601 or null for perpetual
  maxFlows: number;
  features: string[];
  issuedAt: string;
  signature?: string; // Added during signing
}

export class LicenseManager {
  private privateKeyPath: string;
  private publicKeyPath: string;

  constructor(
    privateKeyPath: string = "./keys/private_key.pem",
    publicKeyPath: string = "./keys/public_key.pem"
  ) {
    this.privateKeyPath = privateKeyPath;
    this.publicKeyPath = publicKeyPath;
  }

  /**
   * Generate RSA key pair (run once during setup)
   */
  async generateKeyPair(): Promise<void> {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });

    const dir = path.dirname(this.privateKeyPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(this.privateKeyPath, privateKey, "utf-8");
    await fs.writeFile(this.publicKeyPath, publicKey, "utf-8");

    console.log("✅ RSA key pair generated successfully!");
    console.log(`🔒 Private key: ${this.privateKeyPath} (KEEP SECRET!)`);
    console.log(`🔓 Public key: ${this.publicKeyPath} (embed in runtime)`);
  }

  /**
   * Generate a signed license file
   */
  async generateLicense(licenseData: Omit<LicenseData, "signature">): Promise<string> {
    // Read private key
    const privateKey = await fs.readFile(this.privateKeyPath, "utf-8");

    // Create payload
    const payload = JSON.stringify(licenseData, null, 2);

    // Sign the payload
    const sign = crypto.createSign("SHA256");
    sign.update(payload);
    sign.end();
    const signature = sign.sign(privateKey, "base64");

    // Create signed license
    const signedLicense: LicenseData = {
      ...licenseData,
      signature,
    };

    return JSON.stringify(signedLicense, null, 2);
  }

  /**
   * Save license to file
   */
  async saveLicenseFile(license: string, outputPath: string = "./config/license.key"): Promise<void> {
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outputPath, license, "utf-8");
    console.log(`✅ License saved to: ${outputPath}`);
  }

  /**
   * Validate a license (for runtime engine)
   */
  async validateLicense(licensePath: string = "./config/license.key"): Promise<{
    valid: boolean;
    error?: string;
    license?: LicenseData;
  }> {
    try {
      // Read license file
      const licenseContent = await fs.readFile(licensePath, "utf-8");
      const license: LicenseData = JSON.parse(licenseContent);

      // Extract signature
      const { signature, ...licenseData } = license;
      if (!signature) {
        return { valid: false, error: "License signature missing" };
      }

      // Read public key
      const publicKey = await fs.readFile(this.publicKeyPath, "utf-8");

      // Verify signature
      const verify = crypto.createVerify("SHA256");
      verify.update(JSON.stringify(licenseData, null, 2));
      verify.end();

      const isValid = verify.verify(publicKey, signature, "base64");
      if (!isValid) {
        return { valid: false, error: "License signature invalid (tampered or forged)" };
      }

      // Check expiry date
      if (license.expiryDate) {
        const expiry = new Date(license.expiryDate);
        const now = new Date();
        if (now > expiry) {
          return {
            valid: false,
            error: `License expired on ${expiry.toISOString()}`,
          };
        }
      }

      // Check license type constraints
      if (license.licenseType === "trial") {
        const issuedAt = new Date(license.issuedAt);
        const trialDays = 30;
        const trialExpiry = new Date(issuedAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
        if (new Date() > trialExpiry) {
          return {
            valid: false,
            error: `Trial period expired (${trialDays} days from issuance)`,
          };
        }
      }

      return { valid: true, license };
    } catch (error: any) {
      return { valid: false, error: `License validation failed: ${error.message}` };
    }
  }

  /**
   * Create a trial license (30 days, 5 flows max)
   */
  async createTrialLicense(organizationId: string, organizationName: string): Promise<string> {
    const now = new Date();
    const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const licenseData: Omit<LicenseData, "signature"> = {
      organizationId,
      organizationName,
      licenseType: "trial",
      expiryDate: expiry.toISOString(),
      maxFlows: 5,
      features: ["basic_flows", "http_connectors", "validation"],
      issuedAt: now.toISOString(),
    };

    return await this.generateLicense(licenseData);
  }

  /**
   * Create an annual license
   */
  async createAnnualLicense(
    organizationId: string,
    organizationName: string,
    maxFlows: number = 50
  ): Promise<string> {
    const now = new Date();
    const expiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year

    const licenseData: Omit<LicenseData, "signature"> = {
      organizationId,
      organizationName,
      licenseType: "annual",
      expiryDate: expiry.toISOString(),
      maxFlows,
      features: [
        "basic_flows",
        "http_connectors",
        "validation",
        "sftp_connectors",
        "azure_blob_connectors",
        "database_connectors",
        "scheduler",
        "advanced_mapping",
      ],
      issuedAt: now.toISOString(),
    };

    return await this.generateLicense(licenseData);
  }

  /**
   * Create a perpetual license (no expiry)
   */
  async createPerpetualLicense(
    organizationId: string,
    organizationName: string,
    maxFlows: number = 100
  ): Promise<string> {
    const licenseData: Omit<LicenseData, "signature"> = {
      organizationId,
      organizationName,
      licenseType: "perpetual",
      expiryDate: null,
      maxFlows,
      features: [
        "basic_flows",
        "http_connectors",
        "validation",
        "sftp_connectors",
        "azure_blob_connectors",
        "database_connectors",
        "scheduler",
        "advanced_mapping",
        "priority_support",
      ],
      issuedAt: new Date().toISOString(),
    };

    return await this.generateLicense(licenseData);
  }
}
