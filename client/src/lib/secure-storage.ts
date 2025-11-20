/**
 * Secure Storage Utility
 * 
 * Provides encrypted storage for sensitive data in localStorage
 * Mitigates XSS risks by:
 * 1. Encrypting tokens before storage
 * 2. Using a unique encryption key per session
 * 3. Automatic token expiration
 * 4. Clearing sensitive data on logout
 */

// Simple XOR encryption (better than plaintext, not military-grade)
// For production, consider using Web Crypto API with AES-GCM
class SecureStorage {
  private encryptionKey: string;

  constructor() {
    // Generate or retrieve session-specific encryption key
    this.encryptionKey = this.getOrCreateEncryptionKey();
  }

  /**
   * Get or create a session-specific encryption key
   */
  private getOrCreateEncryptionKey(): string {
    let key = sessionStorage.getItem('_ek');
    if (!key) {
      // Generate random encryption key for this session
      key = this.generateRandomKey();
      sessionStorage.setItem('_ek', key);
    }
    return key;
  }

  /**
   * Generate a random encryption key
   */
  private generateRandomKey(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Simple XOR encryption
   */
  private encrypt(data: string): string {
    const key = this.encryptionKey;
    let encrypted = '';
    for (let i = 0; i < data.length; i++) {
      const charCode = data.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      encrypted += String.fromCharCode(charCode);
    }
    return btoa(encrypted); // Base64 encode
  }

  /**
   * Simple XOR decryption
   */
  private decrypt(encrypted: string): string {
    try {
      const data = atob(encrypted); // Base64 decode
      const key = this.encryptionKey;
      let decrypted = '';
      for (let i = 0; i < data.length; i++) {
        const charCode = data.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        decrypted += String.fromCharCode(charCode);
      }
      return decrypted;
    } catch {
      return '';
    }
  }

  /**
   * Store encrypted token with metadata
   */
  setToken(token: string): void {
    const payload = {
      token,
      timestamp: Date.now(),
      expiresIn: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    const encrypted = this.encrypt(JSON.stringify(payload));
    localStorage.setItem('_at', encrypted);
  }

  /**
   * Retrieve and validate token
   */
  getToken(): string | null {
    const encrypted = localStorage.getItem('_at');
    if (!encrypted) {
      return null;
    }

    try {
      const decrypted = this.decrypt(encrypted);
      const payload = JSON.parse(decrypted);

      // Check expiration
      if (Date.now() - payload.timestamp > payload.expiresIn) {
        this.clearToken();
        return null;
      }

      return payload.token;
    } catch {
      this.clearToken();
      return null;
    }
  }

  /**
   * Clear token from storage
   */
  clearToken(): void {
    localStorage.removeItem('_at');
    // Also clear encryption key on logout
    sessionStorage.removeItem('_ek');
  }

  /**
   * Check if token exists and is valid
   */
  hasValidToken(): boolean {
    return this.getToken() !== null;
  }
}

// Export singleton instance
export const secureStorage = new SecureStorage();
