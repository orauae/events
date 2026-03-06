/**
 * @fileoverview Campaign Send Service - Email delivery for campaigns
 * 
 * This service handles the actual sending of campaign emails using Resend.
 * It manages:
 * - Bulk email delivery to event guests
 * - Batch sending with configurable batch size
 * - Template variable substitution
 * - Delivery status tracking
 * - Webhook handling for delivery updates
 * 
 * @module lib/services/campaign-send-service
 * @requires resend - Email delivery API
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { CampaignSendService } from '@/lib/services';
 * 
 * // Send a campaign to all event guests with default batch size
 * const result = await CampaignSendService.send(campaignId, 'https://myapp.com');
 * console.log(`Sent: ${result.sent}, Failed: ${result.failed}`);
 * 
 * // Send with custom batch configuration
 * const result = await CampaignSendService.send(campaignId, 'https://myapp.com', {
 *   batchSize: 50,
 *   batchDelayMs: 2000
 * });
 * ```
 */

import { db } from '@/db';
import { campaigns, campaignMessages, eventGuests, type Campaign, type CampaignMessage, type MessageStatus, type InvitationStatus } from '@/db/schema';
import { EmailTemplateService } from './email-template-service';
import { OpenTrackingService } from './open-tracking-service';
import { LinkTrackingService } from './link-tracking-service';
import { BounceService } from './bounce-service';
import { eq } from 'drizzle-orm';
import { CampaignService } from './campaign-service';
import { InfobipEmailSender } from './infobip-email-sender';

/**
 * Email sender interface for dependency injection (testing)
 */
export interface EmailSender {
  send(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    headers?: Record<string, string>;
  }): Promise<{ data?: { id: string }; error?: { message: string } }>;
}

// Allow overriding the email sender for testing
let emailSender: EmailSender | null = null;

/**
 * Set a custom email sender (for testing)
 */
export const setEmailSender = (sender: EmailSender | null): void => {
  emailSender = sender;
};

/**
 * Get the Infobip email sender (or test override)
 */
const getEmailSender = async (): Promise<EmailSender> => {
  if (emailSender) {
    return emailSender;
  }

  if (!InfobipEmailSender.isAvailable()) {
    throw new Error('Infobip email not configured. Set INFOBIP_API_URL, INFOBIP_API_KEY, and INFOBIP_EMAIL_FROM in .env');
  }

  return {
    send: async (options) => {
      const result = await InfobipEmailSender.send({
        to: options.to,
        subject: options.subject,
        html: options.html,
        from: options.from,
        headers: options.headers,
      });
      return {
        data: result.success && result.messageId ? { id: result.messageId } : undefined,
        error: result.error ? { message: result.error } : undefined,
      };
    },
  };
};

/**
 * Result of sending a campaign to all recipients.
 */
export interface SendCampaignResult {
  success: boolean;
  campaignId: string;
  totalRecipients: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ eventGuestId: string; error: string }>;
  batchesProcessed: number;
  isPaused: boolean;
}

/**
 * Configuration for batch sending
 * 
 * @property batchSize - Number of emails to send per batch (default: 100)
 * @property batchDelayMs - Delay between batches in milliseconds (default: 1000)
 * 
 * Requirements: 11.1
 */
export interface BatchSendConfig {
  /** Number of emails to send per batch */
  batchSize: number;
  /** Delay between batches in milliseconds */
  batchDelayMs: number;
}

/**
 * Configuration for retry logic with exponential backoff
 * 
 * @property maxRetries - Maximum number of retry attempts (default: 3)
 * @property baseDelayMs - Base delay in milliseconds for exponential backoff (default: 1000)
 * @property maxDelayMs - Maximum delay cap in milliseconds (default: 30000)
 * 
 * Requirements: 11.6
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds */
  maxDelayMs: number;
}

/**
 * Default batch send configuration
 * Requirements: 11.1
 */
export const DEFAULT_BATCH_CONFIG: BatchSendConfig = {
  batchSize: 100,
  batchDelayMs: 1000,
};

/**
 * Default retry configuration
 * Requirements: 11.6
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

/**
 * Result of sending a single email
 */
export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  /** Number of retry attempts made */
  retryAttempts?: number;
}

/**
 * Webhook payload for email delivery status updates
 */
export interface ResendWebhookPayload {
  type: 'email.sent' | 'email.delivered' | 'email.bounced' | 'email.delivery_delayed';
  data: {
    email_id: string;
    to: string[];
    created_at: string;
  };
}


/**
 * CampaignSendService - Handles email delivery for campaigns.
 * 
 * This service is responsible for:
 * - Sending campaigns to all event guests
 * - Batch sending with configurable batch size
 * - Personalizing emails with template variables
 * - Tracking delivery status per recipient
 * - Processing webhook callbacks for delivery updates
 * - Scheduling campaigns for future delivery
 * 
 * @remarks
 * Uses Resend as the email delivery provider. The service supports
 * dependency injection for the email sender to enable testing.
 * Batch sending processes emails in configurable batches with delays
 * between batches to respect rate limits.
 * 
 * Requirements: 4.4, 4.5, 11.1
 */
export const CampaignSendService = {
  /**
   * Sends a campaign to all guests of the associated event using batch processing.
   * 
   * For each guest:
   * 1. Creates a template context with personalization data
   * 2. Renders the subject and content with variables
   * 3. Creates a CampaignMessage record for tracking
   * 4. Sends the email via Resend
   * 5. Updates delivery status
   * 
   * Batch processing:
   * - Emails are sent in batches of configurable size (default: 100)
   * - A configurable delay is added between batches (default: 1000ms)
   * - Campaign status is checked between batches to support pause/cancel
   * - Progress is updated after each batch
   * 
   * @param campaignId - The campaign to send
   * @param baseUrl - Base URL for generating RSVP and badge links
   * @param config - Optional batch configuration (batchSize, batchDelayMs)
   * @returns Send result with success/failure counts and batch info
   * @throws {Error} If campaign not found or already sent
   * 
   * @example
   * ```typescript
   * // Send with default batch size (100)
   * const result = await CampaignSendService.send(
   *   'campaign123',
   *   'https://events.example.com'
   * );
   * 
   * // Send with custom batch configuration
   * const result = await CampaignSendService.send(
   *   'campaign123',
   *   'https://events.example.com',
   *   { batchSize: 50, batchDelayMs: 2000 }
   * );
   * 
   * if (result.failed > 0) {
   *   console.log('Some emails failed:', result.errors);
   * }
   * ```
   * 
   * Requirements: 4.4, 11.1
   */
  async send(
    campaignId: string, 
    baseUrl: string,
    config: Partial<BatchSendConfig> = {}
  ): Promise<SendCampaignResult> {
    // Merge with default config
    const batchConfig: BatchSendConfig = {
      ...DEFAULT_BATCH_CONFIG,
      ...config,
    };

    // Get campaign with event
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
      with: {
        event: true,
      },
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    if (campaign.status === 'Sent') {
      throw new Error('Campaign has already been sent');
    }

    // Allow Queued status (set by API when triggering background task)
    if (campaign.status === 'Sending') {
      throw new Error('Campaign is currently being sent');
    }

    // Update campaign status to Sending
    await db.update(campaigns)
      .set({ status: 'Sending', updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));

    // Get all event guests for this campaign's event
    const allEventGuests = await db.query.eventGuests.findMany({
      where: eq(eventGuests.eventId, campaign.eventId),
      with: {
        guest: true,
      },
    });

    // Filter out undeliverable addresses (bounced, unsubscribed)
    // Requirements: 12.8 - Prevent sending to undeliverable or unsubscribed recipients
    const allEmails = allEventGuests.map(eg => eg.guest.email);
    const deliverableEmails = await BounceService.filterDeliverableEmails(allEmails);
    const deliverableEmailSet = new Set(deliverableEmails.map(e => e.toLowerCase()));
    
    const eventGuestsList = allEventGuests.filter(
      eg => deliverableEmailSet.has(eg.guest.email.toLowerCase())
    );

    const skippedCount = allEventGuests.length - eventGuestsList.length;
    if (skippedCount > 0) {
      console.log(`[CampaignSendService] Skipped ${skippedCount} undeliverable recipients for campaign ${campaignId}`);
    }

    // Update recipient count (only deliverable recipients)
    await db.update(campaigns)
      .set({ recipientCount: eventGuestsList.length, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));

    const result: SendCampaignResult = {
      success: true,
      campaignId,
      totalRecipients: allEventGuests.length,
      sent: 0,
      failed: 0,
      skipped: skippedCount,
      errors: [],
      batchesProcessed: 0,
      isPaused: false,
    };

    // Process in batches
    const totalBatches = Math.ceil(eventGuestsList.length / batchConfig.batchSize);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      // Check if campaign was paused or cancelled
      const currentCampaign = await db.query.campaigns.findFirst({
        where: eq(campaigns.id, campaignId),
      });

      if (currentCampaign?.status === 'Paused') {
        result.isPaused = true;
        result.success = false;
        break;
      }

      if (currentCampaign?.status === 'Cancelled') {
        result.success = false;
        break;
      }

      // Get the current batch of recipients
      const startIndex = batchIndex * batchConfig.batchSize;
      const endIndex = Math.min(startIndex + batchConfig.batchSize, eventGuestsList.length);
      const batch = eventGuestsList.slice(startIndex, endIndex);

      // Process each recipient in the batch
      const batchResults = await this.processBatch(
        batch,
        campaign,
        campaignId,
        baseUrl
      );

      // Update result counters
      result.sent += batchResults.sent;
      result.failed += batchResults.failed;
      result.errors.push(...batchResults.errors);
      result.batchesProcessed++;

      // Update campaign analytics after each batch
      await CampaignService.incrementCounter(campaignId, 'sentCount', batchResults.sent);

      // Add delay between batches (except for the last batch)
      if (batchIndex < totalBatches - 1 && batchConfig.batchDelayMs > 0) {
        await this.delay(batchConfig.batchDelayMs);
      }
    }

    // Update campaign status to Sent (if not paused/cancelled)
    if (!result.isPaused) {
      const finalCampaign = await db.query.campaigns.findFirst({
        where: eq(campaigns.id, campaignId),
      });

      if (finalCampaign?.status === 'Sending') {
        await db.update(campaigns)
          .set({
            status: 'Sent',
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(campaigns.id, campaignId));
      }
    }

    result.success = result.failed === 0 && !result.isPaused;

    return result;
  },

  /**
   * Processes a batch of recipients and sends emails to them.
   * 
   * @param batch - Array of event guests to process
   * @param campaign - The campaign being sent
   * @param campaignId - The campaign ID
   * @param baseUrl - Base URL for generating links
   * @returns Batch processing result
   * 
   * @internal
   * Requirements: 11.1
   */
  async processBatch(
    batch: Array<{
      id: string;
      guest: { 
        email: string; 
        firstName: string; 
        lastName: string;
        company: string | null;
        jobTitle: string | null;
      };
      qrToken: string;
    }>,
    campaign: { 
      subject: string; 
      content: string; 
      event: { 
        id: string; 
        name: string;
        startDate: Date;
        endDate: Date;
        location: string;
      }; 
    },
    campaignId: string,
    baseUrl: string
  ): Promise<{ sent: number; failed: number; errors: Array<{ eventGuestId: string; error: string }> }> {
    const batchResult = {
      sent: 0,
      failed: 0,
      errors: [] as Array<{ eventGuestId: string; error: string }>,
    };

    for (const eventGuest of batch) {
      // Create template context
      const context = EmailTemplateService.createContext(
        eventGuest.guest,
        campaign.event,
        eventGuest.qrToken,
        baseUrl
      );

      // Render subject and content
      const subjectResult = EmailTemplateService.render(campaign.subject, context);
      const contentResult = EmailTemplateService.render(campaign.content, context);

      // Create CampaignMessage record for tracking
      const [message] = await db.insert(campaignMessages).values({
        campaignId,
        eventGuestId: eventGuest.id,
        status: 'Pending',
      }).returning();

      // Wrap links with click tracking URLs
      const contentWithLinks = await LinkTrackingService.createTrackingLinks(
        campaignId,
        contentResult.content,
        baseUrl,
        { utmSource: 'email', utmMedium: 'campaign', utmCampaign: campaign.event.name }
      );

      // Personalize tracking links with recipient email and message ID for attribution
      const personalizedContent = LinkTrackingService.personalizeTrackingLinks(
        contentWithLinks,
        baseUrl,
        eventGuest.guest.email,
        message.id
      );

      // Insert tracking pixel for open tracking
      const contentWithTracking = OpenTrackingService.insertTrackingPixel(
        personalizedContent,
        baseUrl,
        message.id
      );

      // Send email
      const sendResult = await this.sendEmail({
        to: eventGuest.guest.email,
        subject: subjectResult.content,
        html: contentWithTracking,
        messageId: message.id,
      });

      if (sendResult.success) {
        // Update message status to Sent
        await db.update(campaignMessages)
          .set({
            status: 'Sent' as MessageStatus,
            sentAt: new Date(),
          })
          .where(eq(campaignMessages.id, message.id));

        // Update invitation status on EventGuest
        await db.update(eventGuests)
          .set({
            invitationStatus: 'Sent' as InvitationStatus,
            updatedAt: new Date(),
          })
          .where(eq(eventGuests.id, eventGuest.id));

        batchResult.sent++;
      } else {
        // Update message status to Failed
        await db.update(campaignMessages)
          .set({ status: 'Failed' as MessageStatus })
          .where(eq(campaignMessages.id, message.id));

        // Update invitation status on EventGuest
        await db.update(eventGuests)
          .set({
            invitationStatus: 'Failed' as InvitationStatus,
            updatedAt: new Date(),
          })
          .where(eq(eventGuests.id, eventGuest.id));

        batchResult.failed++;
        batchResult.errors.push({
          eventGuestId: eventGuest.id,
          error: sendResult.error || 'Unknown error',
        });
      }
    }

    return batchResult;
  },

  /**
   * Utility function to create a delay.
   * 
   * @param ms - Delay in milliseconds
   * @returns Promise that resolves after the delay
   * 
   * @internal
   */
  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Send a single email via Resend with retry logic and exponential backoff.
   * 
   * Implements retry logic for transient failures:
   * - Up to 3 retries (configurable)
   * - Exponential backoff: delay = baseDelay * 2^attempt
   * - Maximum delay cap to prevent excessive waits
   * - Logs all send attempts with detailed error information
   * 
   * @param options - Email options (to, subject, html, messageId)
   * @param retryConfig - Optional retry configuration
   * @returns Send result with success/failure and retry attempt count
   * 
   * Requirements: 11.6, 11.8
   */
  async sendEmail(
    options: {
      to: string;
      subject: string;
      html: string;
      messageId: string;
    },
    retryConfig: Partial<RetryConfig> = {}
  ): Promise<SendEmailResult> {
    const config: RetryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...retryConfig,
    };

    let lastError: string | undefined;
    let attempt = 0;

    while (attempt <= config.maxRetries) {
      try {
        const sender = await getEmailSender();
        const fromEmail = process.env.INFOBIP_EMAIL_FROM || 'noreply@example.com';
        
        const response = await sender.send({
          from: fromEmail,
          to: options.to,
          subject: options.subject,
          html: options.html,
          headers: {
            'X-Campaign-Message-Id': options.messageId,
          },
        });

        if (response.error) {
          lastError = response.error.message;
          
          // Check if error is retryable (transient errors)
          if (this.isRetryableError(response.error.message) && attempt < config.maxRetries) {
            attempt++;
            const delay = this.calculateBackoffDelay(attempt, config.baseDelayMs, config.maxDelayMs);
            console.log(`[CampaignSendService] Retry attempt ${attempt}/${config.maxRetries} for message ${options.messageId} after ${delay}ms. Error: ${lastError}`);
            await this.delay(delay);
            continue;
          }
          
          // Non-retryable error or max retries reached
          console.log(`[CampaignSendService] Failed to send message ${options.messageId} after ${attempt} attempts. Error: ${lastError}`);
          return {
            success: false,
            error: lastError,
            retryAttempts: attempt,
          };
        }

        // Success
        if (attempt > 0) {
          console.log(`[CampaignSendService] Successfully sent message ${options.messageId} after ${attempt} retry attempts`);
        }
        return {
          success: true,
          messageId: response.data?.id,
          retryAttempts: attempt,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error sending email';
        
        // Check if error is retryable
        if (this.isRetryableError(lastError) && attempt < config.maxRetries) {
          attempt++;
          const delay = this.calculateBackoffDelay(attempt, config.baseDelayMs, config.maxDelayMs);
          console.log(`[CampaignSendService] Retry attempt ${attempt}/${config.maxRetries} for message ${options.messageId} after ${delay}ms. Error: ${lastError}`);
          await this.delay(delay);
          continue;
        }
        
        // Non-retryable error or max retries reached
        console.log(`[CampaignSendService] Failed to send message ${options.messageId} after ${attempt} attempts. Error: ${lastError}`);
        return {
          success: false,
          error: lastError,
          retryAttempts: attempt,
        };
      }
    }

    // Should not reach here, but handle just in case
    return {
      success: false,
      error: lastError || 'Max retries exceeded',
      retryAttempts: attempt,
    };
  },

  /**
   * Determines if an error is retryable (transient) or permanent.
   * 
   * Retryable errors include:
   * - Rate limiting (429)
   * - Server errors (5xx)
   * - Network/timeout errors
   * - Temporary service unavailability
   * 
   * Non-retryable errors include:
   * - Invalid email address
   * - Authentication failures
   * - Permanent delivery failures
   * 
   * @param errorMessage - The error message to check
   * @returns True if the error is retryable
   * 
   * @internal
   * Requirements: 11.6
   */
  isRetryableError(errorMessage: string): boolean {
    const lowerError = errorMessage.toLowerCase();
    
    // Retryable error patterns
    const retryablePatterns = [
      'rate limit',
      'too many requests',
      '429',
      'timeout',
      'timed out',
      'connection',
      'network',
      'temporarily unavailable',
      'service unavailable',
      '500',
      '502',
      '503',
      '504',
      'internal server error',
      'bad gateway',
      'gateway timeout',
      'econnreset',
      'econnrefused',
      'etimedout',
      'socket hang up',
    ];
    
    return retryablePatterns.some(pattern => lowerError.includes(pattern));
  },

  /**
   * Calculates the delay for exponential backoff.
   * 
   * Formula: delay = min(baseDelay * 2^attempt, maxDelay)
   * 
   * Adds jitter (±10%) to prevent thundering herd problem.
   * 
   * @param attempt - Current retry attempt number (1-based)
   * @param baseDelayMs - Base delay in milliseconds
   * @param maxDelayMs - Maximum delay cap in milliseconds
   * @returns Delay in milliseconds
   * 
   * @internal
   * Requirements: 11.6
   */
  calculateBackoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
    // Calculate exponential delay: baseDelay * 2^(attempt-1)
    const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
    
    // Cap at maximum delay
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
    
    // Add jitter (±10%) to prevent thundering herd
    const jitter = cappedDelay * 0.1 * (Math.random() * 2 - 1);
    
    return Math.round(cappedDelay + jitter);
  },


  /**
   * Processes Resend webhook callbacks for delivery status updates.
   * 
   * Updates the CampaignMessage and EventGuest records based on
   * delivery events (sent, delivered, bounced).
   * 
   * @param payload - The webhook payload from Resend
   * @param messageId - The CampaignMessage ID from the X-Campaign-Message-Id header
   * 
   * @remarks
   * Webhook events handled:
   * - email.sent: Message accepted by Resend
   * - email.delivered: Message delivered to recipient
   * - email.bounced: Message bounced (invalid address, etc.)
   * 
   * @example
   * ```typescript
   * // In your webhook handler
   * await CampaignSendService.handleWebhook(payload, messageId);
   * ```
   * 
   * Requirements: 4.5
   */
  async handleWebhook(payload: ResendWebhookPayload, messageId: string): Promise<void> {
    // Find the campaign message
    const message = await db.query.campaignMessages.findFirst({
      where: eq(campaignMessages.id, messageId),
      with: {
        campaign: true,
      },
    });

    if (!message) {
      console.warn(`Campaign message not found for ID: ${messageId}`);
      return;
    }

    // Map webhook event type to message status
    let newStatus: MessageStatus;
    let updateData: { status: MessageStatus; deliveredAt?: Date };

    switch (payload.type) {
      case 'email.delivered':
        newStatus = 'Delivered';
        updateData = {
          status: newStatus,
          deliveredAt: new Date(payload.data.created_at),
        };
        break;
      case 'email.bounced':
        newStatus = 'Bounced';
        updateData = { status: newStatus };
        break;
      case 'email.sent':
        newStatus = 'Sent';
        updateData = { status: newStatus };
        break;
      default:
        return;
    }

    // Update message status
    await db.update(campaignMessages)
      .set(updateData)
      .where(eq(campaignMessages.id, messageId));

    // Update EventGuest invitation status based on delivery
    const eventGuest = await db.query.eventGuests.findFirst({
      where: eq(eventGuests.id, message.eventGuestId),
    });

    if (eventGuest) {
      let invitationStatus: InvitationStatus | undefined;
      
      if (newStatus === 'Delivered') {
        invitationStatus = 'Delivered';
      } else if (newStatus === 'Bounced') {
        invitationStatus = 'Failed';
      }

      if (invitationStatus) {
        await db.update(eventGuests)
          .set({
            invitationStatus,
            updatedAt: new Date(),
          })
          .where(eq(eventGuests.id, message.eventGuestId));
      }
    }
  },

  /**
   * Get campaign messages for a campaign
   */
  async getCampaignMessages(campaignId: string): Promise<CampaignMessage[]> {
    return db.query.campaignMessages.findMany({
      where: eq(campaignMessages.campaignId, campaignId),
      orderBy: (campaignMessages, { desc }) => [desc(campaignMessages.createdAt)],
    });
  },

  /**
   * Get delivery statistics for a campaign
   */
  async getDeliveryStats(campaignId: string): Promise<{
    total: number;
    pending: number;
    sent: number;
    delivered: number;
    failed: number;
    bounced: number;
  }> {
    const messages = await db.query.campaignMessages.findMany({
      where: eq(campaignMessages.campaignId, campaignId),
    });

    return {
      total: messages.length,
      pending: messages.filter((m) => m.status === 'Pending').length,
      sent: messages.filter((m) => m.status === 'Sent').length,
      delivered: messages.filter((m) => m.status === 'Delivered').length,
      failed: messages.filter((m) => m.status === 'Failed').length,
      bounced: messages.filter((m) => m.status === 'Bounced').length,
    };
  },

  /**
   * Schedule a campaign for future delivery
   */
  async schedule(campaignId: string, scheduledAt: Date): Promise<Campaign> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    if (campaign.status === 'Sent') {
      throw new Error('Cannot schedule a campaign that has already been sent');
    }

    if (scheduledAt <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    const [updated] = await db.update(campaigns)
      .set({
        status: 'Scheduled',
        scheduledAt,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId))
      .returning();

    return updated;
  },
};

export default CampaignSendService;
