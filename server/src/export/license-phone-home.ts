import * as crypto from "crypto";
import * as https from "https";

/**
 * License Phone-Home Validation
 * 
 * Optional internet check to prevent clock manipulation and license fraud.
 * 
 * How it works:
 * 1. License includes organizationId + expiry date
 * 2. On startup, runtime calls home to validation server
 * 3. Server checks: Is this license ID valid? Is it expired?
 * 4. Server returns: { valid: boolean, serverTime: ISO8601 }
 * 5. Runtime compares server time vs local time (detect clock manipulation)
 * 6. If no internet → falls back to offline validation
 */

export interface PhoneHomeResult {
  valid: boolean;
  serverTime?: string;
  serverExpiry?: string;
  clockSkewDetected?: boolean;
  error?: string;
}

export class LicensePhoneHome {
  private validationUrl: string;
  private timeout: number;

  constructor(
    validationUrl?: string,
    timeout: number = 5000  // 5 second timeout
  ) {
    // Use configured domain or fallback
    const domain = process.env.APP_DOMAIN || process.env.EXPORT_DOMAIN || "networkvoid.xyz";
    this.validationUrl = validationUrl ||
                         process.env.LICENSE_VALIDATION_URL ||
                         `https://${domain}/api/license/validate`;
    this.timeout = timeout;
  }

  /**
   * Call home to validate license (optional internet check)
   */
  async validateWithPhoneHome(
    organizationId: string,
    licenseExpiry: string | null,
    licenseSignature: string
  ): Promise<PhoneHomeResult> {
    try {
      // Create validation request payload
      const payload = {
        organizationId,
        licenseExpiry,
        signature: licenseSignature,
        clientTime: new Date().toISOString(),
      };

      // Call validation server
      const response = await this.callValidationServer(payload);

      if (!response.valid) {
        return {
          valid: false,
          error: response.error || "License validation failed",
        };
      }

      // Check for clock manipulation
      const serverTime = new Date(response.serverTime);
      const clientTime = new Date();
      const clockSkewMs = Math.abs(serverTime.getTime() - clientTime.getTime());
      const maxAllowedSkewMs = 5 * 60 * 1000; // 5 minutes

      if (clockSkewMs > maxAllowedSkewMs) {
        console.warn(
          `⚠️  Clock skew detected: ${clockSkewMs}ms (server vs client). ` +
          `Possible time manipulation!`
        );
        return {
          valid: false,
          serverTime: response.serverTime,
          clockSkewDetected: true,
          error: `Clock skew detected: ${Math.round(clockSkewMs / 1000 / 60)} minutes`,
        };
      }

      return {
        valid: true,
        serverTime: response.serverTime,
        serverExpiry: response.serverExpiry,
        clockSkewDetected: false,
      };
    } catch (error: any) {
      // No internet or server unavailable → fail gracefully
      console.warn(
        `Phone-home validation unavailable (${error.message}). ` +
        `Falling back to offline validation.`
      );
      return {
        valid: true,  // Allow offline mode
        error: `Offline mode: ${error.message}`,
      };
    }
  }

  /**
   * Call validation server via HTTPS
   */
  private async callValidationServer(payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload);

      const options = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
        timeout: this.timeout,
      };

      const req = https.request(this.validationUrl, options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error("Invalid response from validation server"));
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Validation server timeout"));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Simple validation server implementation (for you to deploy)
   * 
   * Deploy this on Render/Vercel as a serverless function
   */
  static createValidationServer() {
    return async (req: any, res: any) => {
      try {
        const { organizationId, licenseExpiry, signature, clientTime } = req.body;

        // TODO: Check organizationId against your database of issued licenses
        // For now, accept all valid signatures
        
        const serverTime = new Date().toISOString();
        
        // Check if license is expired (server time is source of truth)
        if (licenseExpiry) {
          const expiry = new Date(licenseExpiry);
          if (new Date() > expiry) {
            return res.status(403).json({
              valid: false,
              serverTime,
              error: "License expired (server time)",
            });
          }
        }

        // License is valid
        res.json({
          valid: true,
          serverTime,
          serverExpiry: licenseExpiry,
        });
      } catch (error: any) {
        res.status(500).json({
          valid: false,
          error: error.message,
        });
      }
    };
  }
}
