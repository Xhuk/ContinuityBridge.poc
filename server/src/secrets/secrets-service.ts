import argon2 from 'argon2';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { nanoid } from 'nanoid';
import type {
  SecretsVaultEntry,
  InsertSecretsVaultEntry,
  SecretsMasterKey,
  SecretPayload,
} from '../../schema.js';

/**
 * SecretsService - Unified secrets vault with Argon2id key derivation
 * 
 * Security architecture:
 * 1. User provides master seed (passphrase) - never stored
 * 2. Argon2id derives hash from seed for verification
 * 3. Argon2id derives 256-bit master key for AES-256-GCM encryption
 * 4. Each secret encrypted with unique IV and authenticated with GCM tag
 * 5. Session-based unlock: master key held in memory during session
 */
export class SecretsService {
  private masterKey: Buffer | null = null; // In-memory master key (session only)
  private isUnlocked: boolean = false;
  private readonly MASTER_KEY_ID = 'default'; // Support future key rotation

  // Argon2id parameters (production-grade)
  private readonly ARGON_MEMORY = 65536; // 64 MB
  private readonly ARGON_ITERATIONS = 3;
  private readonly ARGON_PARALLELISM = 4;

  /**
   * Check if secrets vault is initialized (has master key)
   */
  async isVaultInitialized(
    getMasterKey: () => Promise<SecretsMasterKey | undefined>
  ): Promise<boolean> {
    const masterKey = await getMasterKey();
    return masterKey !== undefined;
  }

  /**
   * Initialize new vault with master seed
   * WARNING: User must securely store their master seed - loss is irrecoverable
   */
  async initializeVault(
    masterSeed: string,
    saveMasterKey: (data: {
      id: string;
      passwordHash: string;
      salt: string;
      argonMemory: number;
      argonIterations: number;
      argonParallelism: number;
    }) => Promise<SecretsMasterKey>
  ): Promise<{ recoveryCode: string }> {
    if (masterSeed.length < 12) {
      throw new Error('Master seed must be at least 12 characters long');
    }

    // Generate unique salt for this vault
    const salt = randomBytes(32).toString('base64');

    // Hash the master seed with Argon2id for verification
    const passwordHash = await argon2.hash(masterSeed, {
      type: argon2.argon2id,
      memoryCost: this.ARGON_MEMORY,
      timeCost: this.ARGON_ITERATIONS,
      parallelism: this.ARGON_PARALLELISM,
      salt: Buffer.from(salt, 'base64'),
    });

    // Generate recovery code (user must save this)
    const recoveryCode = this.generateRecoveryCode();

    // Save master key metadata to database
    await saveMasterKey({
      id: this.MASTER_KEY_ID,
      passwordHash,
      salt,
      argonMemory: this.ARGON_MEMORY,
      argonIterations: this.ARGON_ITERATIONS,
      argonParallelism: this.ARGON_PARALLELISM,
    });

    // Unlock the vault with the new seed
    await this.unlockVault(masterSeed, async () => {
      return {
        id: this.MASTER_KEY_ID,
        passwordHash,
        salt,
        argonMemory: this.ARGON_MEMORY,
        argonIterations: this.ARGON_ITERATIONS,
        argonParallelism: this.ARGON_PARALLELISM,
        recoveryCodeHash: null,
        lastUnlocked: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    return { recoveryCode };
  }

  /**
   * Unlock vault with master seed (session-based)
   * Derives master encryption key and keeps it in memory
   */
  async unlockVault(
    masterSeed: string,
    getMasterKey: () => Promise<SecretsMasterKey | undefined>
  ): Promise<boolean> {
    const masterKeyData = await getMasterKey();
    
    if (!masterKeyData) {
      throw new Error('Vault not initialized - please set up master seed first');
    }

    try {
      // Verify the master seed against stored hash
      const isValid = await argon2.verify(masterKeyData.passwordHash, masterSeed);
      
      if (!isValid) {
        this.lockVault();
        return false;
      }

      // Derive master encryption key from seed (deterministic)
      this.masterKey = await this.deriveEncryptionKey(
        masterSeed,
        masterKeyData.salt
      );
      this.isUnlocked = true;

      return true;
    } catch (error) {
      this.lockVault();
      throw error;
    }
  }

  /**
   * Lock vault (clear master key from memory)
   */
  lockVault(): void {
    if (this.masterKey) {
      // Zero out the buffer before clearing
      this.masterKey.fill(0);
    }
    this.masterKey = null;
    this.isUnlocked = false;
  }

  /**
   * Check if vault is currently unlocked
   */
  isVaultUnlocked(): boolean {
    return this.isUnlocked && this.masterKey !== null;
  }

  /**
   * Store encrypted secret in vault
   */
  async storeSecret(
    integrationType: SecretsVaultEntry['integrationType'],
    label: string,
    payload: SecretPayload,
    metadata: SecretsVaultEntry['metadata'],
    saveToDb: (data: InsertSecretsVaultEntry) => Promise<SecretsVaultEntry>
  ): Promise<SecretsVaultEntry> {
    if (!this.isVaultUnlocked()) {
      throw new Error('Vault is locked - please unlock with master seed first');
    }

    // Encrypt the payload
    const payloadStr = JSON.stringify(payload);
    const encrypted = this.encryptPayload(payloadStr);

    // Store in database
    const vaultEntry = await saveToDb({
      id: nanoid(),
      masterKeyId: this.MASTER_KEY_ID,
      integrationType,
      label,
      encryptedPayload: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      metadata: metadata || {},
      enabled: true,
      lastRotatedAt: null,
      rotationDueAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return vaultEntry;
  }

  /**
   * Retrieve and decrypt secret from vault
   */
  async retrieveSecret(
    vaultEntry: SecretsVaultEntry
  ): Promise<SecretPayload> {
    if (!this.isVaultUnlocked()) {
      throw new Error('Vault is locked - please unlock with master seed first');
    }

    // Decrypt the payload
    const decrypted = this.decryptPayload(
      vaultEntry.encryptedPayload,
      vaultEntry.iv,
      vaultEntry.authTag
    );

    return JSON.parse(decrypted);
  }

  /**
   * Update existing secret (re-encrypt with new payload)
   */
  async updateSecret(
    id: string,
    payload: SecretPayload,
    metadata: SecretsVaultEntry['metadata'],
    updateInDb: (id: string, data: Partial<InsertSecretsVaultEntry>) => Promise<SecretsVaultEntry | undefined>
  ): Promise<SecretsVaultEntry | undefined> {
    if (!this.isVaultUnlocked()) {
      throw new Error('Vault is locked - please unlock with master seed first');
    }

    // Encrypt new payload
    const payloadStr = JSON.stringify(payload);
    const encrypted = this.encryptPayload(payloadStr);

    // Update in database
    return await updateInDb(id, {
      encryptedPayload: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      metadata: metadata || {},
      lastRotatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Delete secret from vault
   */
  async deleteSecret(
    id: string,
    deleteFromDb: (id: string) => Promise<boolean>
  ): Promise<boolean> {
    if (!this.isVaultUnlocked()) {
      throw new Error('Vault is locked - please unlock with master seed first');
    }

    return await deleteFromDb(id);
  }

  /**
   * Encrypt payload with AES-256-GCM
   */
  private encryptPayload(plaintext: string): {
    ciphertext: string;
    iv: string;
    authTag: string;
  } {
    if (!this.masterKey) {
      throw new Error('Master key not available');
    }

    // Generate unique IV for this encryption
    const iv = randomBytes(16);

    // Create cipher
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);

    // Encrypt
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  /**
   * Decrypt payload with AES-256-GCM
   */
  private decryptPayload(
    ciphertext: string,
    ivStr: string,
    authTagStr: string
  ): string {
    if (!this.masterKey) {
      throw new Error('Master key not available');
    }

    // Decode parameters
    const encrypted = Buffer.from(ciphertext, 'base64');
    const iv = Buffer.from(ivStr, 'base64');
    const authTag = Buffer.from(authTagStr, 'base64');

    // Create decipher
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);

    // Decrypt and verify
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Derive encryption key from master seed using Argon2id
   */
  private async deriveEncryptionKey(
    masterSeed: string,
    saltStr: string
  ): Promise<Buffer> {
    const salt = Buffer.from(saltStr, 'base64');

    // Use Argon2id to derive a raw 32-byte key (256 bits for AES-256)
    const derivedKey = await argon2.hash(masterSeed, {
      type: argon2.argon2id,
      memoryCost: this.ARGON_MEMORY,
      timeCost: this.ARGON_ITERATIONS,
      parallelism: this.ARGON_PARALLELISM,
      salt,
      raw: true, // Return raw bytes instead of encoded string
      hashLength: 32, // 256 bits for AES-256
    });

    return derivedKey as Buffer;
  }

  /**
   * Generate a recovery code for vault reset
   */
  private generateRecoveryCode(): string {
    const words = [
      'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot',
      'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima',
      'mike', 'november', 'oscar', 'papa', 'quebec', 'romeo',
      'sierra', 'tango', 'uniform', 'victor', 'whiskey', 'xray',
      'yankee', 'zulu',
    ];

    // Generate 6 random words
    const code = Array.from({ length: 6 }, () =>
      words[Math.floor(Math.random() * words.length)]
    );

    return code.join('-');
  }

  /**
   * Reset vault (destructive - all secrets lost)
   */
  async resetVault(
    clearAllSecrets: () => Promise<void>,
    clearMasterKey: () => Promise<void>
  ): Promise<void> {
    // Lock the vault first
    this.lockVault();

    // Clear all vault entries
    await clearAllSecrets();

    // Clear master key
    await clearMasterKey();
  }
}

// Singleton instance
export const secretsService = new SecretsService();
