/**
 * @fileoverview SMTP Service - SMTP configuration management
 * 
 * This service handles SMTP server configurations for email delivery.
 * Features include:
 * - CRUD operations for SMTP configurations
 * - Password encryption/decryption using AES-256-GCM
 * - Connection testing functionality
 * - Default provider management
 * 
 * @module lib/services/smtp-service
 * @requires zod - Schema validation
 * @requires drizzle-orm - Database ORM
 * @requires crypto - Node.js crypto for encryption
 * 
 * @example
 * ```typescript
 * import { SMTPService } from '@/lib/services';
 * 
 * // Create an SMTP configuration
 * const config = await SMTPService.create({
 *   name: 'Primary SMTP',
 *   host: 'smtp.example.com',
 *   port: 587,
 *   username: 'user@example.com',
 *   password: 'secret',
 *   encryption: 'tls',
 *   fromEmail: 'noreply@example.com',
 *   fromName: 'EventOS'
 * });
 * ```
 */

import { z } from 'zod';
import { db } from '@/db';
import { smtpSettings, type SMTPSettings, type SMTPEncryption } from '@/db/schema';
import { eq, and, ne, gte, sql } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import * as nodemailer from 'nodemailer';

// ============================================================================
// RATE LIMITING STORAGE
// ============================================================================

/**
 * In-memory storage for rate limiting counters.
 * In production, this should be replaced with Redis or a similar distributed cache.
 * 
 * Structure: Map<smtpId, { hourly: Map<hourKey, count>, daily: Map<dayKey, count> }>
 */
const rateLimitCounters = new Map<string, {
  hourly: Map<string, number>;
  daily: Map<string, number>;
}>();

/**
 * Gets the current hour key for rate limiting (YYYY-MM-DD-HH format)
 */
function getHourKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCHours()).padStart(2, '0')}`;
}

/**
 * Gets the current day key for rate limiting (YYYY-MM-DD format)
 */
function getDayKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Initializes rate limit counters for an SMTP provider if not exists
 */
function initializeCounters(smtpId: string): void {
  if (!rateLimitCounters.has(smtpId)) {
    rateLimitCounters.set(smtpId, {
      hourly: new Map(),
      daily: new Map(),
    });
  }
}

/**
 * Cleans up old rate limit entries to prevent memory leaks
 * Removes entries older than 25 hours for hourly and 2 days for daily
 */
function cleanupOldEntries(smtpId: string): void {
  const counters = rateLimitCounters.get(smtpId);
  if (!counters) return;

  const now = new Date();
  const currentHourKey = getHourKey(now);
  const currentDayKey = getDayKey(now);

  // Keep only current and previous hour
  const previousHour = new Date(now.getTime() - 60 * 60 * 1000);
  const previousHourKey = getHourKey(previousHour);
  
  for (const key of counters.hourly.keys()) {
    if (key !== currentHourKey && key !== previousHourKey) {
      counters.hourly.delete(key);
    }
  }

  // Keep only current and previous day
  const previousDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const previousDayKey = getDayKey(previousDay);
  
  for (const key of counters.daily.keys()) {
    if (key !== currentDayKey && key !== previousDayKey) {
      counters.daily.delete(key);
    }
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Encryption algorithm for SMTP passwords
 */
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/**
 * Key length for AES-256
 */
const KEY_LENGTH = 32;

/**
 * IV length for AES-GCM
 */
const IV_LENGTH = 16;

/**
 * Auth tag length for AES-GCM
 */
const AUTH_TAG_LENGTH = 16;

/**
 * Available SMTP encryption types
 */
export const SMTP_ENCRYPTION_TYPES = ['tls', 'ssl', 'none'] as const;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Zod validation schema for SMTP configuration creation
 * Requirements: 2.1, 2.2
 */
export const createSMTPSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  host: z.string().trim().min(1, 'Host is required'),
  port: z.number().int().min(1).max(65535, 'Port must be between 1 and 65535'),
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  encryption: z.enum(SMTP_ENCRYPTION_TYPES).default('tls'),
  fromEmail: z.string().email('Invalid from email address'),
  fromName: z.string().trim().min(1, 'From name is required'),
  replyToEmail: z.string().email('Invalid reply-to email address').optional().nullable(),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  dailyLimit: z.number().int().positive().optional().nullable(),
  hourlyLimit: z.number().int().positive().optional().nullable(),
});

/**
 * Zod validation schema for SMTP configuration update
 */
export const updateSMTPSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').optional(),
  host: z.string().trim().min(1, 'Host is required').optional(),
  port: z.number().int().min(1).max(65535, 'Port must be between 1 and 65535').optional(),
  username: z.string().trim().min(1, 'Username is required').optional(),
  password: z.string().min(1, 'Password is required').optional(),
  encryption: z.enum(SMTP_ENCRYPTION_TYPES).optional(),
  fromEmail: z.string().email('Invalid from email address').optional(),
  fromName: z.string().trim().min(1, 'From name is required').optional(),
  replyToEmail: z.string().email('Invalid reply-to email address').optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  dailyLimit: z.number().int().positive().optional().nullable(),
  hourlyLimit: z.number().int().positive().optional().nullable(),
});

export type CreateSMTPSettingsInput = z.input<typeof createSMTPSettingsSchema>;
export type UpdateSMTPSettingsInput = z.input<typeof updateSMTPSettingsSchema>;

/**
 * SMTP settings without encrypted password (for API responses)
 */
export type SMTPSettingsPublic = Omit<SMTPSettings, 'passwordEncrypted'> & {
  hasPassword: boolean;
};

/**
 * Test connection result
 */
export interface TestConnectionResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Rate limit configuration for an SMTP provider
 * Requirements: 11.2
 */
export interface RateLimitConfig {
  /** Maximum emails per hour (null = unlimited) */
  hourlyLimit: number | null;
  /** Maximum emails per day (null = unlimited) */
  dailyLimit: number | null;
  /** Number of emails to send per batch */
  batchSize: number;
  /** Delay between batches in milliseconds */
  batchDelayMs: number;
}

/**
 * Rate limit status for an SMTP provider
 */
export interface RateLimitStatus {
  /** Current hourly send count */
  hourlySent: number;
  /** Current daily send count */
  dailySent: number;
  /** Hourly limit (null = unlimited) */
  hourlyLimit: number | null;
  /** Daily limit (null = unlimited) */
  dailyLimit: number | null;
  /** Whether rate limit is exceeded */
  isLimited: boolean;
  /** Remaining emails allowed this hour */
  hourlyRemaining: number | null;
  /** Remaining emails allowed today */
  dailyRemaining: number | null;
}

/**
 * Default rate limit configuration
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  hourlyLimit: null,
  dailyLimit: null,
  batchSize: 100,
  batchDelayMs: 1000,
};

// ============================================================================
// ENCRYPTION UTILITIES
// ============================================================================

/**
 * Gets the encryption key from environment variable.
 * Derives a 32-byte key using scrypt if the provided key is not the right length.
 * 
 * @returns The encryption key as a Buffer
 * @throws {Error} If SMTP_ENCRYPTION_KEY is not set
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.SMTP_ENCRYPTION_KEY;
  
  if (!envKey) {
    throw new Error('SMTP_ENCRYPTION_KEY environment variable is not set');
  }
  
  // If the key is already 32 bytes (64 hex chars), use it directly
  if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }
  
  // Otherwise, derive a key using scrypt
  return scryptSync(envKey, 'smtp-salt', KEY_LENGTH);
}

/**
 * Encrypts a password using AES-256-GCM.
 * 
 * @param password - The plaintext password to encrypt
 * @returns The encrypted password as a hex string (iv:authTag:ciphertext)
 * 
 * Requirements: 2.8
 */
export function encryptPassword(password: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a password encrypted with AES-256-GCM.
 * 
 * @param encryptedData - The encrypted password string (iv:authTag:ciphertext)
 * @returns The decrypted plaintext password
 * @throws {Error} If decryption fails
 * 
 * Requirements: 2.8
 */
export function decryptPassword(encryptedData: string): string {
  const key = getEncryptionKey();
  
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const [ivHex, authTagHex, ciphertext] = parts;
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length');
  }
  
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid auth tag length');
  }
  
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * SMTPService - Manages SMTP configurations for email delivery.
 * 
 * Provides methods for creating, updating, and managing SMTP server configurations.
 * Features include:
 * - Secure password storage with AES-256-GCM encryption
 * - Connection testing before saving
 * - Default provider management
 * - Rate limiting configuration
 * 
 * Requirements: 2
 */
export const SMTPService = {
  /**
   * Creates a new SMTP configuration.
   * 
   * @param input - SMTP configuration data
   * @returns The newly created SMTP settings (without password)
   * @throws {ZodError} If input validation fails
   * 
   * Requirements: 2.1, 2.2, 2.7, 2.8
   */
  async create(input: CreateSMTPSettingsInput): Promise<SMTPSettingsPublic> {
    // Validate input
    const validated = createSMTPSettingsSchema.parse(input);
    
    // Encrypt the password
    const passwordEncrypted = encryptPassword(validated.password);
    
    // If this is set as default, unset any existing default
    if (validated.isDefault) {
      await db.update(smtpSettings)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(smtpSettings.isDefault, true));
    }
    
    const [settings] = await db.insert(smtpSettings).values({
      name: validated.name,
      host: validated.host,
      port: validated.port,
      username: validated.username,
      passwordEncrypted,
      encryption: validated.encryption as SMTPEncryption,
      fromEmail: validated.fromEmail,
      fromName: validated.fromName,
      replyToEmail: validated.replyToEmail,
      isDefault: validated.isDefault,
      isActive: validated.isActive,
      dailyLimit: validated.dailyLimit,
      hourlyLimit: validated.hourlyLimit,
    }).returning();
    
    return toPublicSettings(settings);
  },

  /**
   * Gets an SMTP configuration by ID.
   * 
   * @param id - The SMTP settings ID
   * @returns The SMTP settings (without password) or null if not found
   */
  async getById(id: string): Promise<SMTPSettingsPublic | null> {
    const settings = await db.query.smtpSettings.findFirst({
      where: eq(smtpSettings.id, id),
    });
    
    if (!settings) return null;
    
    return toPublicSettings(settings);
  },

  /**
   * Gets all SMTP configurations.
   * 
   * @returns Array of SMTP settings (without passwords)
   */
  async getAll(): Promise<SMTPSettingsPublic[]> {
    const allSettings = await db.query.smtpSettings.findMany({
      orderBy: (smtpSettings, { desc }) => [desc(smtpSettings.createdAt)],
    });
    
    return allSettings.map(toPublicSettings);
  },

  /**
   * Gets the default SMTP configuration.
   * 
   * @returns The default SMTP settings (without password) or null if none set
   * 
   * Requirements: 2.7
   */
  async getDefault(): Promise<SMTPSettingsPublic | null> {
    const settings = await db.query.smtpSettings.findFirst({
      where: and(
        eq(smtpSettings.isDefault, true),
        eq(smtpSettings.isActive, true)
      ),
    });
    
    if (!settings) return null;
    
    return toPublicSettings(settings);
  },

  /**
   * Updates an SMTP configuration.
   * 
   * @param id - The SMTP settings ID
   * @param input - Updated configuration data
   * @returns The updated SMTP settings (without password)
   * @throws {Error} If the configuration doesn't exist
   * @throws {ZodError} If input validation fails
   */
  async update(id: string, input: UpdateSMTPSettingsInput): Promise<SMTPSettingsPublic> {
    // Validate input
    const validated = updateSMTPSettingsSchema.parse(input);
    
    // Check if settings exist
    const existing = await db.query.smtpSettings.findFirst({
      where: eq(smtpSettings.id, id),
    });
    
    if (!existing) {
      throw new Error(`SMTP settings with ID "${id}" not found`);
    }
    
    // If setting as default, unset any existing default
    if (validated.isDefault) {
      await db.update(smtpSettings)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(
          eq(smtpSettings.isDefault, true),
          ne(smtpSettings.id, id)
        ));
    }
    
    // Build update data
    const updateData: Partial<typeof smtpSettings.$inferInsert> = {
      updatedAt: new Date(),
    };
    
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.host !== undefined) updateData.host = validated.host;
    if (validated.port !== undefined) updateData.port = validated.port;
    if (validated.username !== undefined) updateData.username = validated.username;
    if (validated.password !== undefined) {
      updateData.passwordEncrypted = encryptPassword(validated.password);
    }
    if (validated.encryption !== undefined) {
      updateData.encryption = validated.encryption as SMTPEncryption;
    }
    if (validated.fromEmail !== undefined) updateData.fromEmail = validated.fromEmail;
    if (validated.fromName !== undefined) updateData.fromName = validated.fromName;
    if (validated.replyToEmail !== undefined) updateData.replyToEmail = validated.replyToEmail;
    if (validated.isDefault !== undefined) updateData.isDefault = validated.isDefault;
    if (validated.isActive !== undefined) updateData.isActive = validated.isActive;
    if (validated.dailyLimit !== undefined) updateData.dailyLimit = validated.dailyLimit;
    if (validated.hourlyLimit !== undefined) updateData.hourlyLimit = validated.hourlyLimit;
    
    const [updated] = await db.update(smtpSettings)
      .set(updateData)
      .where(eq(smtpSettings.id, id))
      .returning();
    
    return toPublicSettings(updated);
  },

  /**
   * Deletes an SMTP configuration.
   * 
   * @param id - The SMTP settings ID
   * @throws {Error} If the configuration doesn't exist
   */
  async delete(id: string): Promise<void> {
    // Check if settings exist
    const existing = await db.query.smtpSettings.findFirst({
      where: eq(smtpSettings.id, id),
    });
    
    if (!existing) {
      throw new Error(`SMTP settings with ID "${id}" not found`);
    }
    
    await db.delete(smtpSettings).where(eq(smtpSettings.id, id));
  },

  /**
   * Sets an SMTP configuration as the default.
   * 
   * @param id - The SMTP settings ID to set as default
   * @returns The updated SMTP settings (without password)
   * @throws {Error} If the configuration doesn't exist
   * 
   * Requirements: 2.7
   */
  async setDefault(id: string): Promise<SMTPSettingsPublic> {
    // Check if settings exist
    const existing = await db.query.smtpSettings.findFirst({
      where: eq(smtpSettings.id, id),
    });
    
    if (!existing) {
      throw new Error(`SMTP settings with ID "${id}" not found`);
    }
    
    // Unset any existing default
    await db.update(smtpSettings)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(smtpSettings.isDefault, true));
    
    // Set the new default
    const [updated] = await db.update(smtpSettings)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(smtpSettings.id, id))
      .returning();
    
    return toPublicSettings(updated);
  },

  /**
   * Tests an SMTP connection by sending a test email.
   * 
   * @param id - The SMTP settings ID to test
   * @param testEmail - The email address to send the test to
   * @returns Test result with success status and message
   * 
   * Requirements: 2.4, 2.5, 2.6
   */
  async testConnection(id: string, testEmail: string): Promise<TestConnectionResult> {
    // Validate test email
    const emailSchema = z.string().email('Invalid test email address');
    try {
      emailSchema.parse(testEmail);
    } catch {
      return {
        success: false,
        message: 'Invalid test email address',
        error: 'The provided email address is not valid',
      };
    }
    
    // Get the SMTP settings
    const settings = await db.query.smtpSettings.findFirst({
      where: eq(smtpSettings.id, id),
    });
    
    if (!settings) {
      return {
        success: false,
        message: 'SMTP configuration not found',
        error: `SMTP settings with ID "${id}" not found`,
      };
    }
    
    try {
      // Decrypt the password
      const password = decryptPassword(settings.passwordEncrypted);
      
      // Create nodemailer transporter
      const transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.encryption === 'ssl',
        auth: {
          user: settings.username,
          pass: password,
        },
        tls: settings.encryption === 'tls' ? {
          rejectUnauthorized: false, // Allow self-signed certs for testing
        } : undefined,
      });
      
      // Verify connection
      await transporter.verify();
      
      // Send test email
      await transporter.sendMail({
        from: `"${settings.fromName}" <${settings.fromEmail}>`,
        to: testEmail,
        replyTo: settings.replyToEmail || undefined,
        subject: 'EventOS SMTP Test',
        text: 'This is a test email from EventOS to verify your SMTP configuration.',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #B8956B;">EventOS SMTP Test</h2>
            <p>This is a test email from EventOS to verify your SMTP configuration.</p>
            <p>If you received this email, your SMTP settings are configured correctly.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #666; font-size: 12px;">
              Configuration: ${settings.name}<br />
              Host: ${settings.host}:${settings.port}<br />
              Encryption: ${settings.encryption.toUpperCase()}
            </p>
          </div>
        `,
      });
      
      return {
        success: true,
        message: `Test email sent successfully to ${testEmail}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        message: 'Failed to send test email',
        error: errorMessage,
      };
    }
  },

  /**
   * Tests an SMTP connection with provided credentials (before saving).
   * Useful for validating settings before creating a configuration.
   * 
   * @param config - SMTP configuration to test
   * @param testEmail - The email address to send the test to
   * @returns Test result with success status and message
   * 
   * Requirements: 2.3, 2.4, 2.5, 2.6
   */
  async testConnectionWithConfig(
    config: CreateSMTPSettingsInput,
    testEmail: string
  ): Promise<TestConnectionResult> {
    // Validate test email
    const emailSchema = z.string().email('Invalid test email address');
    try {
      emailSchema.parse(testEmail);
    } catch {
      return {
        success: false,
        message: 'Invalid test email address',
        error: 'The provided email address is not valid',
      };
    }
    
    // Validate config
    try {
      createSMTPSettingsSchema.parse(config);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid configuration';
      return {
        success: false,
        message: 'Invalid SMTP configuration',
        error: errorMessage,
      };
    }
    
    try {
      // Create nodemailer transporter
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.encryption === 'ssl',
        auth: {
          user: config.username,
          pass: config.password,
        },
        tls: config.encryption === 'tls' ? {
          rejectUnauthorized: false,
        } : undefined,
      });
      
      // Verify connection
      await transporter.verify();
      
      // Send test email
      await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: testEmail,
        replyTo: config.replyToEmail || undefined,
        subject: 'EventOS SMTP Test',
        text: 'This is a test email from EventOS to verify your SMTP configuration.',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #B8956B;">EventOS SMTP Test</h2>
            <p>This is a test email from EventOS to verify your SMTP configuration.</p>
            <p>If you received this email, your SMTP settings are configured correctly.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #666; font-size: 12px;">
              Configuration: ${config.name}<br />
              Host: ${config.host}:${config.port}<br />
              Encryption: ${config.encryption?.toUpperCase() || 'TLS'}
            </p>
          </div>
        `,
      });
      
      return {
        success: true,
        message: `Test email sent successfully to ${testEmail}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        message: 'Failed to send test email',
        error: errorMessage,
      };
    }
  },

  /**
   * Gets the decrypted password for an SMTP configuration.
   * This should only be used internally for sending emails.
   * 
   * @param id - The SMTP settings ID
   * @returns The decrypted password
   * @throws {Error} If the configuration doesn't exist
   * 
   * @internal
   */
  async getDecryptedPassword(id: string): Promise<string> {
    const settings = await db.query.smtpSettings.findFirst({
      where: eq(smtpSettings.id, id),
    });
    
    if (!settings) {
      throw new Error(`SMTP settings with ID "${id}" not found`);
    }
    
    return decryptPassword(settings.passwordEncrypted);
  },

  /**
   * Gets the full SMTP settings including decrypted password.
   * This should only be used internally for sending emails.
   * 
   * @param id - The SMTP settings ID
   * @returns The full SMTP settings with decrypted password
   * @throws {Error} If the configuration doesn't exist
   * 
   * @internal
   */
  async getFullSettings(id: string): Promise<SMTPSettings & { password: string }> {
    const settings = await db.query.smtpSettings.findFirst({
      where: eq(smtpSettings.id, id),
    });
    
    if (!settings) {
      throw new Error(`SMTP settings with ID "${id}" not found`);
    }
    
    const password = decryptPassword(settings.passwordEncrypted);
    
    return {
      ...settings,
      password,
    };
  },

  // ==========================================================================
  // RATE LIMITING METHODS
  // ==========================================================================

  /**
   * Gets the rate limit configuration for an SMTP provider.
   * 
   * @param id - The SMTP settings ID
   * @returns Rate limit configuration
   * @throws {Error} If the configuration doesn't exist
   * 
   * Requirements: 11.2
   */
  async getRateLimitConfig(id: string): Promise<RateLimitConfig> {
    const settings = await db.query.smtpSettings.findFirst({
      where: eq(smtpSettings.id, id),
    });
    
    if (!settings) {
      throw new Error(`SMTP settings with ID "${id}" not found`);
    }
    
    return {
      hourlyLimit: settings.hourlyLimit,
      dailyLimit: settings.dailyLimit,
      batchSize: DEFAULT_RATE_LIMIT_CONFIG.batchSize,
      batchDelayMs: DEFAULT_RATE_LIMIT_CONFIG.batchDelayMs,
    };
  },

  /**
   * Gets the current rate limit status for an SMTP provider.
   * 
   * @param id - The SMTP settings ID
   * @returns Current rate limit status including counts and remaining capacity
   * @throws {Error} If the configuration doesn't exist
   * 
   * Requirements: 11.2
   */
  async getRateLimitStatus(id: string): Promise<RateLimitStatus> {
    const settings = await db.query.smtpSettings.findFirst({
      where: eq(smtpSettings.id, id),
    });
    
    if (!settings) {
      throw new Error(`SMTP settings with ID "${id}" not found`);
    }
    
    initializeCounters(id);
    cleanupOldEntries(id);
    
    const counters = rateLimitCounters.get(id)!;
    const hourKey = getHourKey();
    const dayKey = getDayKey();
    
    const hourlySent = counters.hourly.get(hourKey) || 0;
    const dailySent = counters.daily.get(dayKey) || 0;
    
    const hourlyLimit = settings.hourlyLimit;
    const dailyLimit = settings.dailyLimit;
    
    const hourlyRemaining = hourlyLimit !== null ? Math.max(0, hourlyLimit - hourlySent) : null;
    const dailyRemaining = dailyLimit !== null ? Math.max(0, dailyLimit - dailySent) : null;
    
    const isLimited = 
      (hourlyLimit !== null && hourlySent >= hourlyLimit) ||
      (dailyLimit !== null && dailySent >= dailyLimit);
    
    return {
      hourlySent,
      dailySent,
      hourlyLimit,
      dailyLimit,
      isLimited,
      hourlyRemaining,
      dailyRemaining,
    };
  },

  /**
   * Checks if sending is allowed based on rate limits.
   * 
   * @param id - The SMTP settings ID
   * @param count - Number of emails to send (default: 1)
   * @returns True if sending is allowed, false if rate limited
   * @throws {Error} If the configuration doesn't exist
   * 
   * Requirements: 11.2
   */
  async checkRateLimit(id: string, count: number = 1): Promise<boolean> {
    const status = await this.getRateLimitStatus(id);
    
    // If no limits are set, always allow
    if (status.hourlyLimit === null && status.dailyLimit === null) {
      return true;
    }
    
    // Check if adding 'count' emails would exceed limits
    if (status.hourlyLimit !== null && status.hourlySent + count > status.hourlyLimit) {
      return false;
    }
    
    if (status.dailyLimit !== null && status.dailySent + count > status.dailyLimit) {
      return false;
    }
    
    return true;
  },

  /**
   * Increments the send count for rate limiting.
   * Should be called after successfully sending emails.
   * 
   * @param id - The SMTP settings ID
   * @param count - Number of emails sent (default: 1)
   * 
   * Requirements: 11.2
   */
  async incrementSendCount(id: string, count: number = 1): Promise<void> {
    initializeCounters(id);
    cleanupOldEntries(id);
    
    const counters = rateLimitCounters.get(id)!;
    const hourKey = getHourKey();
    const dayKey = getDayKey();
    
    const currentHourly = counters.hourly.get(hourKey) || 0;
    const currentDaily = counters.daily.get(dayKey) || 0;
    
    counters.hourly.set(hourKey, currentHourly + count);
    counters.daily.set(dayKey, currentDaily + count);
  },

  /**
   * Resets rate limit counters for an SMTP provider.
   * Useful for testing or manual reset.
   * 
   * @param id - The SMTP settings ID
   */
  resetRateLimitCounters(id: string): void {
    rateLimitCounters.delete(id);
  },

  /**
   * Resets all rate limit counters.
   * Useful for testing.
   */
  resetAllRateLimitCounters(): void {
    rateLimitCounters.clear();
  },

  /**
   * Calculates how many emails can be sent given current rate limits.
   * 
   * @param id - The SMTP settings ID
   * @returns Maximum number of emails that can be sent, or null if unlimited
   * @throws {Error} If the configuration doesn't exist
   * 
   * Requirements: 11.2
   */
  async getAvailableCapacity(id: string): Promise<number | null> {
    const status = await this.getRateLimitStatus(id);
    
    // If no limits, return null (unlimited)
    if (status.hourlyLimit === null && status.dailyLimit === null) {
      return null;
    }
    
    // Return the minimum of hourly and daily remaining
    const capacities: number[] = [];
    
    if (status.hourlyRemaining !== null) {
      capacities.push(status.hourlyRemaining);
    }
    
    if (status.dailyRemaining !== null) {
      capacities.push(status.dailyRemaining);
    }
    
    return capacities.length > 0 ? Math.min(...capacities) : null;
  },

  /**
   * Updates rate limit configuration for an SMTP provider.
   * 
   * @param id - The SMTP settings ID
   * @param config - Partial rate limit configuration to update
   * @returns Updated SMTP settings
   * @throws {Error} If the configuration doesn't exist
   * 
   * Requirements: 11.2
   */
  async updateRateLimits(
    id: string, 
    config: { hourlyLimit?: number | null; dailyLimit?: number | null }
  ): Promise<SMTPSettingsPublic> {
    return this.update(id, config);
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Converts SMTP settings to public format (without encrypted password).
 * 
 * @param settings - The full SMTP settings
 * @returns SMTP settings without the encrypted password
 */
function toPublicSettings(settings: SMTPSettings): SMTPSettingsPublic {
  const { passwordEncrypted, ...rest } = settings;
  return {
    ...rest,
    hasPassword: !!passwordEncrypted,
  };
}

export default SMTPService;
