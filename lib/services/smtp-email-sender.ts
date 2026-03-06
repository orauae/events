/**
 * @fileoverview SMTP Email Sender - Send emails using configured SMTP providers
 *
 * This service provides email sending capabilities using nodemailer with
 * SMTP configurations stored in the database. It supports:
 * - Multiple SMTP provider configurations
 * - Automatic provider selection (default or specified)
 * - Connection pooling for high-volume sending
 * - Rate limiting per provider
 * - Retry logic with exponential backoff
 *
 * @module lib/services/smtp-email-sender
 * @requires nodemailer - SMTP email sending
 * @requires ./smtp-service - SMTP configuration management
 *
 * @example
 * ```typescript
 * import { SMTPEmailSender } from '@/lib/services';
 *
 * // Send a single email using the default SMTP provider
 * const result = await SMTPEmailSender.send({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<p>Hello World</p>',
 * });
 *
 * // Send using a specific SMTP provider
 * const result = await SMTPEmailSender.send({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<p>Hello World</p>',
 * }, { smtpId: 'smtp-provider-id' });
 * ```
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { SMTPService } from './smtp-service';

/**
 * Full SMTP settings with decrypted password for internal use
 */
interface SMTPSettingsWithPassword {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: 'tls' | 'ssl' | 'none';
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  hourlyLimit: number | null;
  dailyLimit: number | null;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Email sending options
 */
export interface SMTPSendOptions {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** HTML content of the email */
  html: string;
  /** Plain text content (optional, auto-generated from HTML if not provided) */
  text?: string;
  /** Custom headers to include */
  headers?: Record<string, string>;
  /** Reply-to address (overrides SMTP config if provided) */
  replyTo?: string;
  /** CC recipients */
  cc?: string | string[];
  /** BCC recipients */
  bcc?: string | string[];
}

/**
 * Configuration for sending emails
 */
export interface SMTPSenderConfig {
  /** Specific SMTP provider ID to use (uses default if not specified) */
  smtpId?: string;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default: 30000) */
  maxDelayMs?: number;
}

/**
 * Result of sending an email
 */
export interface SMTPSendResult {
  success: boolean;
  messageId?: string;
  smtpId?: string;
  error?: string;
  retryAttempts?: number;
}

/**
 * Batch email item
 */
export interface BatchEmailItem {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  /** Unique identifier for tracking */
  trackingId?: string;
}

/**
 * Result of sending a batch of emails
 */
export interface BatchSendResult {
  total: number;
  sent: number;
  failed: number;
  results: Array<{
    trackingId?: string;
    to: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

/**
 * Rate limit status
 */
export interface RateLimitInfo {
  isLimited: boolean;
  hourlyRemaining: number | null;
  dailyRemaining: number | null;
  retryAfterMs?: number;
}

// ============================================================================
// TRANSPORTER POOL
// ============================================================================

/**
 * Cached transporters for connection reuse
 * Map<smtpId, { transporter, createdAt, settings }>
 */
const transporterPool = new Map<
  string,
  {
    transporter: Transporter;
    createdAt: Date;
    settings: SMTPSettingsWithPassword;
  }
>();

/**
 * Maximum age for cached transporters (5 minutes)
 */
const TRANSPORTER_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * In-memory rate limit counters
 * For production, replace with Redis
 */
const rateLimitCounters = new Map<
  string,
  {
    hourly: Map<string, number>;
    daily: Map<string, number>;
  }
>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
 * Initialize rate limit counters for an SMTP provider
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
 * Increment rate limit counters
 */
function incrementCounters(smtpId: string, count: number = 1): void {
  initializeCounters(smtpId);
  const counters = rateLimitCounters.get(smtpId)!;
  
  const hourKey = getHourKey();
  const dayKey = getDayKey();
  
  counters.hourly.set(hourKey, (counters.hourly.get(hourKey) || 0) + count);
  counters.daily.set(dayKey, (counters.daily.get(dayKey) || 0) + count);
}

/**
 * Get current send counts
 */
function getSendCounts(smtpId: string): { hourly: number; daily: number } {
  initializeCounters(smtpId);
  const counters = rateLimitCounters.get(smtpId)!;
  
  const hourKey = getHourKey();
  const dayKey = getDayKey();
  
  return {
    hourly: counters.hourly.get(hourKey) || 0,
    daily: counters.daily.get(dayKey) || 0,
  };
}

/**
 * Check if rate limited
 */
async function checkRateLimit(smtpId: string): Promise<RateLimitInfo> {
  const settings = await SMTPService.getById(smtpId);
  if (!settings) {
    return { isLimited: false, hourlyRemaining: null, dailyRemaining: null };
  }

  const counts = getSendCounts(smtpId);
  
  const hourlyRemaining = settings.hourlyLimit 
    ? settings.hourlyLimit - counts.hourly 
    : null;
  const dailyRemaining = settings.dailyLimit 
    ? settings.dailyLimit - counts.daily 
    : null;

  const isHourlyLimited = hourlyRemaining !== null && hourlyRemaining <= 0;
  const isDailyLimited = dailyRemaining !== null && dailyRemaining <= 0;

  return {
    isLimited: isHourlyLimited || isDailyLimited,
    hourlyRemaining,
    dailyRemaining,
    retryAfterMs: isHourlyLimited ? 60 * 60 * 1000 : undefined, // 1 hour
  };
}

/**
 * Create or get a cached transporter for an SMTP provider
 */
async function getTransporter(smtpId: string): Promise<{
  transporter: Transporter;
  settings: SMTPSettingsWithPassword;
}> {
  // Check if we have a valid cached transporter
  const cached = transporterPool.get(smtpId);
  if (cached) {
    const age = Date.now() - cached.createdAt.getTime();
    if (age < TRANSPORTER_MAX_AGE_MS) {
      // Get fresh settings with password for the return
      const fullSettings = await SMTPService.getFullSettings(smtpId);
      const settings: SMTPSettingsWithPassword = {
        id: fullSettings.id,
        name: fullSettings.name,
        host: fullSettings.host,
        port: fullSettings.port,
        username: fullSettings.username,
        password: fullSettings.password,
        encryption: fullSettings.encryption,
        fromEmail: fullSettings.fromEmail,
        fromName: fullSettings.fromName,
        replyToEmail: fullSettings.replyToEmail,
        hourlyLimit: fullSettings.hourlyLimit,
        dailyLimit: fullSettings.dailyLimit,
      };
      return { transporter: cached.transporter, settings };
    }
    // Expired, remove from pool
    transporterPool.delete(smtpId);
  }

  // Create new transporter
  const fullSettings = await SMTPService.getFullSettings(smtpId);
  const settings: SMTPSettingsWithPassword = {
    id: fullSettings.id,
    name: fullSettings.name,
    host: fullSettings.host,
    port: fullSettings.port,
    username: fullSettings.username,
    password: fullSettings.password,
    encryption: fullSettings.encryption,
    fromEmail: fullSettings.fromEmail,
    fromName: fullSettings.fromName,
    replyToEmail: fullSettings.replyToEmail,
    hourlyLimit: fullSettings.hourlyLimit,
    dailyLimit: fullSettings.dailyLimit,
  };

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.encryption === 'ssl',
    auth: {
      user: settings.username,
      pass: settings.password,
    },
    tls:
      settings.encryption === 'tls'
        ? {
            rejectUnauthorized: false, // Allow self-signed certs
          }
        : undefined,
    pool: true, // Enable connection pooling
    maxConnections: 5, // Max parallel connections
    maxMessages: 100, // Max messages per connection
    rateDelta: 1000, // Time between message sends (ms)
    rateLimit: 10, // Max messages per rateDelta
  });

  // Cache the transporter (without the settings to avoid storing password)
  transporterPool.set(smtpId, {
    transporter,
    createdAt: new Date(),
    settings: fullSettings,
  });

  return { transporter, settings: fullSettings };
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  const jitter = cappedDelay * 0.1 * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: Error | string): boolean {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const lowerError = errorMessage.toLowerCase();

  const retryablePatterns = [
    'rate limit',
    'too many requests',
    'timeout',
    'timed out',
    'connection',
    'network',
    'temporarily unavailable',
    'service unavailable',
    'econnreset',
    'econnrefused',
    'etimedout',
    'socket hang up',
    'greylist',
    'try again',
  ];

  return retryablePatterns.some((pattern) => lowerError.includes(pattern));
}

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// SMTP EMAIL SENDER SERVICE
// ============================================================================

/**
 * SMTPEmailSender - Send emails using configured SMTP providers
 *
 * This service provides a high-level interface for sending emails via SMTP
 * using the configurations stored in the database. It supports:
 * - Automatic provider selection (uses default if not specified)
 * - Connection pooling for efficient high-volume sending
 * - Rate limiting per provider
 * - Retry logic with exponential backoff
 * - Batch sending with progress tracking
 */
export const SMTPEmailSender = {
  /**
   * Send a single email using SMTP
   *
   * @param options - Email options (to, subject, html, etc.)
   * @param config - Sender configuration (smtpId, retry settings)
   * @returns Send result with success status and message ID
   *
   * @example
   * ```typescript
   * const result = await SMTPEmailSender.send({
   *   to: 'user@example.com',
   *   subject: 'Welcome!',
   *   html: '<h1>Hello</h1>',
   * });
   * ```
   */
  async send(
    options: SMTPSendOptions,
    config: SMTPSenderConfig = {}
  ): Promise<SMTPSendResult> {
    const {
      maxRetries = 3,
      baseDelayMs = 1000,
      maxDelayMs = 30000,
    } = config;

    // Get SMTP provider (specified or default)
    let smtpId = config.smtpId;
    if (!smtpId) {
      const defaultSettings = await SMTPService.getDefault();
      if (!defaultSettings) {
        return {
          success: false,
          error: 'No default SMTP provider configured',
        };
      }
      smtpId = defaultSettings.id;
    }

    // Check rate limits
    const rateLimitInfo = await checkRateLimit(smtpId);
    if (rateLimitInfo.isLimited) {
      return {
        success: false,
        smtpId,
        error: `Rate limit exceeded. Hourly remaining: ${rateLimitInfo.hourlyRemaining}, Daily remaining: ${rateLimitInfo.dailyRemaining}`,
      };
    }

    let lastError: string | undefined;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const { transporter, settings } = await getTransporter(smtpId);

        const mailOptions = {
          from: `"${settings.fromName}" <${settings.fromEmail}>`,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          replyTo: options.replyTo || settings.replyToEmail || undefined,
          cc: options.cc,
          bcc: options.bcc,
          headers: options.headers,
        };

        const result = await transporter.sendMail(mailOptions);

        // Increment rate limit counter
        incrementCounters(smtpId);

        if (attempt > 0) {
          console.log(
            `[SMTPEmailSender] Successfully sent to ${options.to} after ${attempt} retries`
          );
        }

        return {
          success: true,
          messageId: result.messageId,
          smtpId,
          retryAttempts: attempt,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        if (isRetryableError(lastError) && attempt < maxRetries) {
          attempt++;
          const delayMs = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs);
          console.log(
            `[SMTPEmailSender] Retry ${attempt}/${maxRetries} for ${options.to} after ${delayMs}ms. Error: ${lastError}`
          );
          await delay(delayMs);
          continue;
        }

        console.error(
          `[SMTPEmailSender] Failed to send to ${options.to} after ${attempt} attempts. Error: ${lastError}`
        );

        return {
          success: false,
          smtpId,
          error: lastError,
          retryAttempts: attempt,
        };
      }
    }

    return {
      success: false,
      smtpId,
      error: lastError || 'Max retries exceeded',
      retryAttempts: attempt,
    };
  },

  /**
   * Send a batch of emails with progress tracking
   *
   * @param items - Array of email items to send
   * @param config - Sender configuration
   * @param onProgress - Optional callback for progress updates
   * @returns Batch result with success/failure counts
   */
  async sendBatch(
    items: BatchEmailItem[],
    config: SMTPSenderConfig = {},
    onProgress?: (sent: number, failed: number, total: number) => void
  ): Promise<BatchSendResult> {
    const result: BatchSendResult = {
      total: items.length,
      sent: 0,
      failed: 0,
      results: [],
    };

    for (const item of items) {
      const sendResult = await this.send(
        {
          to: item.to,
          subject: item.subject,
          html: item.html,
          text: item.text,
          headers: item.headers,
        },
        config
      );

      result.results.push({
        trackingId: item.trackingId,
        to: item.to,
        success: sendResult.success,
        messageId: sendResult.messageId,
        error: sendResult.error,
      });

      if (sendResult.success) {
        result.sent++;
      } else {
        result.failed++;
      }

      if (onProgress) {
        onProgress(result.sent, result.failed, result.total);
      }
    }

    return result;
  },

  /**
   * Check if SMTP sending is available (has at least one active provider)
   */
  async isAvailable(): Promise<boolean> {
    const defaultProvider = await SMTPService.getDefault();
    return defaultProvider !== null;
  },

  /**
   * Get rate limit status for an SMTP provider
   */
  async getRateLimitStatus(smtpId?: string): Promise<RateLimitInfo> {
    let providerId = smtpId;
    if (!providerId) {
      const defaultSettings = await SMTPService.getDefault();
      if (!defaultSettings) {
        return { isLimited: false, hourlyRemaining: null, dailyRemaining: null };
      }
      providerId = defaultSettings.id;
    }
    return checkRateLimit(providerId);
  },

  /**
   * Verify SMTP connection for a provider
   */
  async verifyConnection(smtpId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      let providerId = smtpId;
      if (!providerId) {
        const defaultSettings = await SMTPService.getDefault();
        if (!defaultSettings) {
          return { success: false, error: 'No default SMTP provider configured' };
        }
        providerId = defaultSettings.id;
      }

      const { transporter } = await getTransporter(providerId);
      await transporter.verify();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /**
   * Clear the transporter pool (useful for testing or config changes)
   */
  clearPool(): void {
    for (const [, cached] of transporterPool) {
      cached.transporter.close();
    }
    transporterPool.clear();
  },

  /**
   * Get pool statistics (for monitoring)
   */
  getPoolStats(): { size: number; providers: string[] } {
    return {
      size: transporterPool.size,
      providers: Array.from(transporterPool.keys()),
    };
  },
};

export default SMTPEmailSender;
