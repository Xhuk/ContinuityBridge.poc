import { z } from 'zod';
import type { SecretsVaultEntry } from '../../schema.js';

/**
 * Secret Payload Validation Module
 * 
 * Provides schema registry and validation for all secret integration types.
 * Used by REST/GraphQL endpoints before delegating to SecretsService encryption.
 */

// ============================================================================
// Schema Definitions
// ============================================================================

// SMTP Secret Schema
export const smtpSecretSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

// Azure Blob Secret Schema
export const azureBlobSecretSchema = z.object({
  accountName: z.string().min(1, "Account name is required"),
  accountKey: z.string().min(1, "Account key is required"),
  sasUrl: z.string().url().optional(),
});

// SFTP Secret Schema
export const sftpSecretSchema = z.object({
  password: z.string().optional(),
  privateKey: z.string().optional(),
  passphrase: z.string().optional(),
}).refine(
  (data) => data.password || data.privateKey,
  "Either password or privateKey must be provided"
);

// FTP Secret Schema
export const ftpSecretSchema = z.object({
  password: z.string().optional(),
  privateKey: z.string().optional(),
  passphrase: z.string().optional(),
}).refine(
  (data) => data.password || data.privateKey,
  "Either password or privateKey must be provided"
);

// Database Secret Schema
export const databaseSecretSchema = z.object({
  password: z.string().optional(),
  connectionString: z.string().optional(),
  sslCert: z.string().optional(),
}).refine(
  (data) => data.password || data.connectionString,
  "Either password or connectionString must be provided"
);

// API Key Secret Schema
export const apiKeySecretSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  apiSecret: z.string().optional(),
});

// RabbitMQ Secret Schema
export const rabbitmqSecretSchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
  connectionUrl: z.string().optional(), // amqp://user:pass@host:5672
  vhost: z.string().optional(),
}).refine(
  (data) => data.connectionUrl || (data.username && data.password),
  "Either connectionUrl or both username and password must be provided"
);

// Kafka Secret Schema  
export const kafkaSecretSchema = z.object({
  brokers: z.string().optional(), // Comma-separated broker URLs
  username: z.string().optional(),
  password: z.string().optional(),
  saslMechanism: z.enum(["PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512"]).optional(),
  sslCert: z.string().optional(),
  sslKey: z.string().optional(),
});

// OAuth2 Secret Schema
export const oauth2SecretSchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client secret is required"),
  tokenUrl: z.string().url("Token URL must be a valid URL"),
  authorizationUrl: z.string().url("Authorization URL must be a valid URL").optional(),
  scope: z.string().optional(),
  redirectUri: z.string().url("Redirect URI must be a valid URL").optional(),
  audience: z.string().optional(),
});

// JWT Secret Schema
export const jwtSecretSchema = z.object({
  algorithm: z.enum(["HS256", "HS512", "RS256", "RS512"], {
    errorMap: () => ({ message: "Algorithm must be HS256, HS512, RS256, or RS512" }),
  }),
  // For HS256/HS512 (symmetric)
  secret: z.string().optional(),
  // For RS256/RS512 (asymmetric)
  privateKey: z.string().optional(),
  publicKey: z.string().optional(),
  // Common JWT claims
  issuer: z.string().optional(),
  audience: z.string().optional(),
  keyId: z.string().optional(), // For RS256/RS512 key rotation
}).refine(
  (data) => {
    // HS algorithms require secret
    if (data.algorithm.startsWith('HS')) {
      return !!data.secret;
    }
    // RS algorithms require privateKey
    if (data.algorithm.startsWith('RS')) {
      return !!data.privateKey;
    }
    return false;
  },
  (data) => ({
    message: data.algorithm.startsWith('HS')
      ? "HS algorithms require 'secret' field"
      : "RS algorithms require 'privateKey' field",
  })
);

// Cookie Secret Schema
export const cookieSecretSchema = z.object({
  cookieName: z.string().min(1, "Cookie name is required"),
  cookieSecret: z.string().min(1, "Cookie secret is required"),
  sessionSecret: z.string().optional(),
  domain: z.string().optional(),
  path: z.string().default("/"),
  secure: z.boolean().default(true),
  httpOnly: z.boolean().default(true),
  sameSite: z.enum(["strict", "lax", "none"]).default("lax"),
});

// Custom Secret Schema (flexible)
export const customSecretSchema = z.record(z.string(), z.any());

// ============================================================================
// Schema Registry
// ============================================================================

export const SECRET_SCHEMA_REGISTRY: Record<
  SecretsVaultEntry['integrationType'],
  z.ZodSchema<any>
> = {
  smtp: smtpSecretSchema,
  azure_blob: azureBlobSecretSchema,
  sftp: sftpSecretSchema,
  ftp: ftpSecretSchema,
  database: databaseSecretSchema,
  api_key: apiKeySecretSchema,
  rabbitmq: rabbitmqSecretSchema,
  kafka: kafkaSecretSchema,
  oauth2: oauth2SecretSchema,
  jwt: jwtSecretSchema,
  cookie: cookieSecretSchema,
  custom: customSecretSchema,
};

// ============================================================================
// Validation Functions
// ============================================================================

export interface ValidationResult {
  success: boolean;
  data?: any;
  errors?: Record<string, string[]>;
}

/**
 * Validate secret payload against integration type schema
 * 
 * @param integrationType - Type of integration (smtp, oauth2, jwt, etc.)
 * @param payload - Secret payload to validate
 * @returns Validation result with success flag and errors
 */
export function validateSecretPayload(
  integrationType: SecretsVaultEntry['integrationType'],
  payload: unknown
): ValidationResult {
  const schema = SECRET_SCHEMA_REGISTRY[integrationType];

  if (!schema) {
    return {
      success: false,
      errors: {
        integrationType: [`Unsupported integration type: ${integrationType}`],
      },
    };
  }

  const result = schema.safeParse(payload);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  // Flatten Zod errors into field → messages map
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || 'payload';
    if (!errors[field]) {
      errors[field] = [];
    }
    errors[field].push(issue.message);
  }

  return {
    success: false,
    errors,
  };
}

/**
 * Validate secret payload and throw on error (convenience helper)
 * 
 * @param integrationType - Type of integration
 * @param payload - Secret payload to validate
 * @throws Error with validation details
 */
export function validateSecretPayloadOrThrow(
  integrationType: SecretsVaultEntry['integrationType'],
  payload: unknown
): void {
  const result = validateSecretPayload(integrationType, payload);

  if (!result.success) {
    const errorMessages = Object.entries(result.errors || {})
      .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
      .join('; ');

    throw new Error(`Secret validation failed: ${errorMessages}`);
  }
}

// ============================================================================
// Type Exports
// ============================================================================

export type SmtpSecret = z.infer<typeof smtpSecretSchema>;
export type AzureBlobSecret = z.infer<typeof azureBlobSecretSchema>;
export type SftpSecret = z.infer<typeof sftpSecretSchema>;
export type FtpSecret = z.infer<typeof ftpSecretSchema>;
export type DatabaseSecret = z.infer<typeof databaseSecretSchema>;
export type ApiKeySecret = z.infer<typeof apiKeySecretSchema>;
export type RabbitMQSecret = z.infer<typeof rabbitmqSecretSchema>;
export type KafkaSecret = z.infer<typeof kafkaSecretSchema>;
export type OAuth2Secret = z.infer<typeof oauth2SecretSchema>;
export type JWTSecret = z.infer<typeof jwtSecretSchema>;
export type CookieSecret = z.infer<typeof cookieSecretSchema>;
export type CustomSecret = z.infer<typeof customSecretSchema>;

export type SecretPayloadType =
  | SmtpSecret
  | AzureBlobSecret
  | SftpSecret
  | FtpSecret
  | DatabaseSecret
  | ApiKeySecret
  | RabbitMQSecret
  | KafkaSecret
  | OAuth2Secret
  | JWTSecret
  | CookieSecret
  | CustomSecret;
