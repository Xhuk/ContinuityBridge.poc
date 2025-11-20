/**
 * Secure Storage Utility
 * 
 * Provides AES-GCM encrypted storage for sensitive data in localStorage
 * Uses Web Crypto API (browser-native, FIPS 140-2 compliant)
 * 
 * Security features:
 * 1. AES-GCM 256-bit encryption (military-grade)
 * 2. Unique IV (Initialization Vector) per encryption
 * 3. Session-specific master key derived from crypto.getRandomValues
 * 4. Automatic token expiration
 * 5. Tamper detection via GCM authentication tag
 * 6. Key derivation using PBKDF2
 */

class SecureStorage {
  private masterKey: CryptoKey | null = null;
  private readonly ALGORITHM = 'AES-GCM';
  private readonly KEY_LENGTH = 256;
  private readonly IV_LENGTH = 12; // 96 bits recommended for GCM
  private readonly ITERATIONS = 100000; // PBKDF2 iterations

  constructor() {
    this.initializeMasterKey();
  }

  /**
   * Initialize or retrieve the master encryption key
   * Uses PBKDF2 to derive key from random salt
   */
  private async initializeMasterKey(): Promise<void> {
    try {
      // Check if we have a salt in sessionStorage
      let saltHex = sessionStorage.getItem('_ks');
      
      if (!saltHex) {
        // Generate new random salt (256 bits)
        const saltArray = new Uint8Array(32);
        crypto.getRandomValues(saltArray);
        saltHex = Array.from(saltArray, b => b.toString(16).padStart(2, '0')).join('');
        sessionStorage.setItem('_ks', saltHex);
      }

      // Convert hex salt back to Uint8Array
      const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));

      // Generate password material from browser entropy
      const password = this.generatePasswordMaterial();
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      // Derive AES-GCM key using PBKDF2
      this.masterKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: this.ITERATIONS,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: this.ALGORITHM, length: this.KEY_LENGTH },
        false, // Not extractable - key can't be exported
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      console.error('Failed to initialize master key:', error);
    }
  }

  /**
   * Generate password material from browser-specific entropy
   */
  private generatePasswordMaterial(): string {
    // Combine multiple entropy sources
    const sources = [
      navigator.userAgent,
      navigator.language,
      new Date().getTimezoneOffset().toString(),
      screen.width + 'x' + screen.height,
      navigator.hardwareConcurrency?.toString() || '0',
    ];
    return sources.join('|');
  }

  /**
   * Encrypt data using AES-GCM
   */
  private async encrypt(data: string): Promise<string> {
    if (!this.masterKey) {
      await this.initializeMasterKey();
    }

    if (!this.masterKey) {
      throw new Error('Encryption key not available');
    }

    try {
      // Generate random IV for this encryption
      const iv = new Uint8Array(this.IV_LENGTH);
      crypto.getRandomValues(iv);

      // Encrypt the data
      const enc = new TextEncoder();
      const encrypted = await crypto.subtle.encrypt(
        {
          name: this.ALGORITHM,
          iv: iv,
        },
        this.masterKey,
        enc.encode(data)
      );

      // Combine IV + encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);

      // Convert to base64
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption failed:', error);
      throw error;
    }
  }

  /**
   * Decrypt data using AES-GCM
   */
  private async decrypt(encrypted: string): Promise<string> {
    if (!this.masterKey) {
      await this.initializeMasterKey();
    }

    if (!this.masterKey) {
      throw new Error('Decryption key not available');
    }

    try {
      // Decode base64
      const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));

      // Extract IV and ciphertext
      const iv = combined.slice(0, this.IV_LENGTH);
      const ciphertext = combined.slice(this.IV_LENGTH);

      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        {
          name: this.ALGORITHM,
          iv: iv,
        },
        this.masterKey,
        ciphertext
      );

      // Convert back to string
      const dec = new TextDecoder();
      return dec.decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      return '';
    }
  }

  /**
   * Store encrypted token with metadata
   */
  async setToken(token: string): Promise<void> {
    const payload = {
      token,
      timestamp: Date.now(),
      expiresIn: 7 * 24 * 60 * 60 * 1000, // 7 days
      fingerprint: await this.generateFingerprint(),
    };
    
    try {
      const encrypted = await this.encrypt(JSON.stringify(payload));
      localStorage.setItem('_at', encrypted);
    } catch (error) {
      console.error('Failed to store token:', error);
    }
  }

  /**
   * Retrieve and validate token
   */
  async getToken(): Promise<string | null> {
    console.log("[SecureStorage] Getting token from localStorage...");
    const encrypted = localStorage.getItem('_at');
    
    if (!encrypted) {
      console.log("[SecureStorage] No encrypted token found in localStorage");
      return null;
    }

    console.log("[SecureStorage] Encrypted token found, decrypting...", {
      encryptedLength: encrypted.length,
      encryptedPreview: encrypted.substring(0, 30) + '...',
    });

    try {
      const decrypted = await this.decrypt(encrypted);
      
      console.log("[SecureStorage] Decryption result:", {
        success: !!decrypted,
        decryptedLength: decrypted?.length,
      });
      
      if (!decrypted) {
        console.log("[SecureStorage] Decryption failed - clearing token");
        this.clearToken();
        return null;
      }

      const payload = JSON.parse(decrypted);
      
      console.log("[SecureStorage] Payload parsed:", {
        hasToken: !!payload.token,
        timestamp: payload.timestamp,
        age: Date.now() - payload.timestamp,
        expiresIn: payload.expiresIn,
        expired: Date.now() - payload.timestamp > payload.expiresIn,
      });

      // Check expiration
      if (Date.now() - payload.timestamp > payload.expiresIn) {
        console.log("[SecureStorage] Token expired - clearing");
        this.clearToken();
        return null;
      }

      // Validate fingerprint (basic device binding)
      const currentFingerprint = await this.generateFingerprint();
      
      console.log("[SecureStorage] Fingerprint validation:", {
        stored: payload.fingerprint?.substring(0, 16) + '...',
        current: currentFingerprint?.substring(0, 16) + '...',
        match: payload.fingerprint === currentFingerprint,
      });
      
      if (payload.fingerprint !== currentFingerprint) {
        console.warn('[SecureStorage] Token fingerprint mismatch - possible token theft');
        this.clearToken();
        return null;
      }

      console.log("[SecureStorage] ✅ Token retrieved successfully!");
      return payload.token;
    } catch (error) {
      console.error('Failed to retrieve token:', error);
      this.clearToken();
      return null;
    }
  }

  /**
   * Generate device fingerprint for token binding
   * Makes stolen tokens useless on different devices
   */
  private async generateFingerprint(): Promise<string> {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 0,
      navigator.platform,
    ];

    const data = components.join('|');
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Clear token from storage
   */
  clearToken(): void {
    localStorage.removeItem('_at');
    // Clear encryption salt (forces key regeneration)
    sessionStorage.removeItem('_ks');
    this.masterKey = null;
  }

  /**
   * Check if token exists and is valid
   */
  async hasValidToken(): Promise<boolean> {
    const token = await this.getToken();
    return token !== null;
  }
}

// Export singleton instance
export const secureStorage = new SecureStorage();
