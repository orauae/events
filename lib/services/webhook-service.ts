/**
 * @fileoverview Webhook Service - Processes email delivery webhooks
 * 
 * This service handles webhook callbacks from email providers (Resend, SendGrid, etc.)
 * for delivery status updates, bounce handling, and complaint processing.
 * 
 * Key responsibilities:
 * - Process Resend webhook events (delivered, bounced, complained, etc.)
 * - Categorize bounces as hard (permanent) or soft (temporary)
 * - Handle complaints/spam reports with auto-unsubscribe
 * - Update campaign message delivery status
 * - Track bounce counts for soft bounce escalation (3 strikes rule)
 * 
 * @module lib/services/webhook-service
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { WebhookService } from '@/lib/services';
 * 
 * // Process a Resend webhook event
 * const result = await WebhookService.processResendWebhook(payload);
 * if (result.success) {
 *   console.log(`Processed ${result.eventType} event`);
 * }
 * ```
 * 
 * Requirements: 12
 */

import { db } from '@/db';
import { 
  bounces, 
  unsubscribes, 
  campaignMessages, 
  campaigns,
  eventGuests,
  guests,
  type BounceType,
  type MessageStatus,
} from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CampaignService } from './campaign-service';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

/**
 * Resend webhook event types
 * @see https://resend.com/docs/dashboard/webhooks/event-types
 */
export type ResendEventType = 
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.complained'
  | 'email.opened'
  | 'email.clicked';

/**
 * Resend webhook payload schema
 */
export const resendWebhookPayloadSchema = z.object({
  type: z.enum([
    'email.sent',
    'email.delivered',
    'email.delivery_delayed',
    'email.bounced',
    'email.complained',
    'email.opened',
    'email.clicked',
  ]),
  created_at: z.string(),
  data: z.object({
    email_id: z.string(),
    from: z.string().optional(),
    to: z.array(z.string()),
    subject: z.string().optional(),
    created_at: z.string(),
    // Bounce-specific fields
    bounce: z.object({
      message: z.string().optional(),
      type: z.string().optional(), // 'hard' or 'soft'
    }).optional(),
    // Headers for tracking
    headers: z.array(z.object({
      name: z.string(),
      value: z.string(),
    })).optional(),
  }),
});

export type ResendWebhookPayload = z.infer<typeof resendWebhookPayloadSchema>;

/**
 * Result of processing a webhook event
 */
export interface WebhookProcessResult {
  success: boolean;
  eventType: ResendEventType;
  messageId?: string;
  email?: string;
  action?: string;
  error?: string;
}

/**
 * Bounce categorization result
 */
export interface BounceCategorizationResult {
  type: BounceType;
  reason: string;
  isUndeliverable: boolean;
}

/**
 * Soft bounce count for an email address
 */
export interface SoftBounceCount {
  email: string;
  count: number;
  isUndeliverable: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Number of soft bounces before marking as undeliverable
 * Requirements: 12.4
 */
export const SOFT_BOUNCE_THRESHOLD = 3;

/**
 * Hard bounce error patterns - these indicate permanent delivery failures
 */
const HARD_BOUNCE_PATTERNS = [
  'invalid',
  'does not exist',
  'user unknown',
  'no such user',
  'mailbox not found',
  'address rejected',
  'recipient rejected',
  'bad destination',
  'undeliverable',
  'permanently rejected',
  '550',
  '551',
  '552',
  '553',
  '554',
];

/**
 * Soft bounce error patterns - these indicate temporary delivery failures
 */
const SOFT_BOUNCE_PATTERNS = [
  'mailbox full',
  'over quota',
  'temporarily',
  'try again',
  'rate limit',
  'too many',
  'connection timeout',
  'service unavailable',
  '421',
  '450',
  '451',
  '452',
];

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * WebhookService - Handles email delivery webhooks from providers.
 * 
 * This service processes webhook callbacks from email providers like Resend
 * to track delivery status, handle bounces, and manage complaints.
 * 
 * Requirements: 12
 */
export const WebhookService = {
  /**
   * Processes a Resend webhook event.
   * 
   * Handles the following event types:
   * - email.delivered: Updates message status to Delivered
   * - email.bounced: Records bounce and updates status
   * - email.complained: Auto-unsubscribes the recipient
   * - email.sent: Updates message status to Sent
   * 
   * @param payload - The webhook payload from Resend
   * @returns Processing result with action taken
   * 
   * Requirements: 12.1
   */
  async processResendWebhook(payload: ResendWebhookPayload): Promise<WebhookProcessResult> {
    const { type, data } = payload;
    const email = data.to[0]; // Primary recipient
    
    // Extract campaign message ID from headers if available
    const messageIdHeader = data.headers?.find(h => h.name === 'X-Campaign-Message-Id');
    const campaignMessageId = messageIdHeader?.value;

    try {
      switch (type) {
        case 'email.delivered':
          return await this.handleDelivered(campaignMessageId, email);
        
        case 'email.bounced':
          return await this.handleBounce(campaignMessageId, email, data.bounce);
        
        case 'email.complained':
          return await this.handleComplaint(campaignMessageId, email);
        
        case 'email.sent':
          return await this.handleSent(campaignMessageId, email);
        
        case 'email.delivery_delayed':
          return {
            success: true,
            eventType: type,
            messageId: campaignMessageId,
            email,
            action: 'logged_delay',
          };
        
        default:
          return {
            success: true,
            eventType: type,
            messageId: campaignMessageId,
            email,
            action: 'ignored',
          };
      }
    } catch (error) {
      console.error(`[WebhookService] Error processing ${type} event:`, error);
      return {
        success: false,
        eventType: type,
        messageId: campaignMessageId,
        email,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  /**
   * Handles email.delivered event.
   * Updates campaign message status to Delivered.
   * 
   * @param messageId - Campaign message ID
   * @param email - Recipient email
   * @returns Processing result
   * 
   * Requirements: 12.1
   */
  async handleDelivered(messageId: string | undefined, email: string): Promise<WebhookProcessResult> {
    if (messageId) {
      // Update campaign message status
      const [updated] = await db.update(campaignMessages)
        .set({
          status: 'Delivered' as MessageStatus,
          deliveredAt: new Date(),
        })
        .where(eq(campaignMessages.id, messageId))
        .returning();

      if (updated) {
        // Increment campaign delivered count
        await CampaignService.incrementCounter(updated.campaignId, 'deliveredCount', 1);
      }
    }

    return {
      success: true,
      eventType: 'email.delivered',
      messageId,
      email,
      action: 'status_updated',
    };
  },

  /**
   * Handles email.sent event.
   * Updates campaign message status to Sent.
   * 
   * @param messageId - Campaign message ID
   * @param email - Recipient email
   * @returns Processing result
   */
  async handleSent(messageId: string | undefined, email: string): Promise<WebhookProcessResult> {
    if (messageId) {
      await db.update(campaignMessages)
        .set({
          status: 'Sent' as MessageStatus,
          sentAt: new Date(),
        })
        .where(eq(campaignMessages.id, messageId));
    }

    return {
      success: true,
      eventType: 'email.sent',
      messageId,
      email,
      action: 'status_updated',
    };
  },

  /**
   * Handles email.bounced event.
   * 
   * - Categorizes bounce as hard or soft
   * - Records bounce in database
   * - Updates campaign message status
   * - For hard bounces: marks recipient as undeliverable
   * - For soft bounces: checks 3-strike rule
   * 
   * @param messageId - Campaign message ID
   * @param email - Recipient email
   * @param bounceData - Bounce details from webhook
   * @returns Processing result
   * 
   * Requirements: 12.2, 12.3, 12.4
   */
  async handleBounce(
    messageId: string | undefined, 
    email: string, 
    bounceData?: { message?: string; type?: string }
  ): Promise<WebhookProcessResult> {
    // Categorize the bounce
    const categorization = this.categorizeBounce(
      bounceData?.message || '',
      bounceData?.type
    );

    // Get campaign ID from message if available
    let campaignId: string | undefined;
    if (messageId) {
      const message = await db.query.campaignMessages.findFirst({
        where: eq(campaignMessages.id, messageId),
      });
      campaignId = message?.campaignId;
    }

    // Record the bounce
    await db.insert(bounces).values({
      campaignMessageId: messageId || null,
      email,
      bounceType: categorization.type,
      bounceReason: categorization.reason,
    });

    // Update campaign message status
    if (messageId) {
      await db.update(campaignMessages)
        .set({
          status: 'Bounced' as MessageStatus,
          bounceType: categorization.type,
        })
        .where(eq(campaignMessages.id, messageId));
    }

    // Increment campaign bounced count
    if (campaignId) {
      await CampaignService.incrementCounter(campaignId, 'bouncedCount', 1);
    }

    // Handle based on bounce type
    let action: string;
    if (categorization.type === 'hard') {
      // Hard bounce - mark as undeliverable immediately
      await this.markAsUndeliverable(email);
      action = 'hard_bounce_undeliverable';
    } else {
      // Soft bounce - check 3-strike rule
      const softBounceCount = await this.getSoftBounceCount(email);
      if (softBounceCount.count >= SOFT_BOUNCE_THRESHOLD) {
        await this.markAsUndeliverable(email);
        action = 'soft_bounce_threshold_reached';
      } else {
        action = `soft_bounce_${softBounceCount.count}_of_${SOFT_BOUNCE_THRESHOLD}`;
      }
    }

    return {
      success: true,
      eventType: 'email.bounced',
      messageId,
      email,
      action,
    };
  },

  /**
   * Handles email.complained event (spam report).
   * 
   * - Records the complaint
   * - Auto-unsubscribes the recipient
   * - Updates campaign message status
   * 
   * @param messageId - Campaign message ID
   * @param email - Recipient email
   * @returns Processing result
   * 
   * Requirements: 12.5, 12.6
   */
  async handleComplaint(messageId: string | undefined, email: string): Promise<WebhookProcessResult> {
    // Get campaign ID from message if available
    let campaignId: string | undefined;
    if (messageId) {
      const message = await db.query.campaignMessages.findFirst({
        where: eq(campaignMessages.id, messageId),
      });
      campaignId = message?.campaignId;
    }

    // Auto-unsubscribe the recipient
    await this.unsubscribeEmail(email, campaignId, 'spam_complaint');

    // Update campaign unsubscribed count
    if (campaignId) {
      await CampaignService.incrementCounter(campaignId, 'unsubscribedCount', 1);
    }

    return {
      success: true,
      eventType: 'email.complained',
      messageId,
      email,
      action: 'auto_unsubscribed',
    };
  },

  /**
   * Categorizes a bounce as hard or soft based on the error message.
   * 
   * Hard bounces indicate permanent delivery failures:
   * - Invalid email address
   * - Mailbox doesn't exist
   * - Domain doesn't exist
   * 
   * Soft bounces indicate temporary failures:
   * - Mailbox full
   * - Server temporarily unavailable
   * - Rate limiting
   * 
   * @param message - Bounce error message
   * @param explicitType - Explicit type from provider (if available)
   * @returns Categorization result
   * 
   * Requirements: 12.2
   */
  categorizeBounce(message: string, explicitType?: string): BounceCategorizationResult {
    const lowerMessage = message.toLowerCase();

    // If provider explicitly specifies type, use it
    if (explicitType === 'hard') {
      return {
        type: 'hard',
        reason: message || 'Hard bounce (provider specified)',
        isUndeliverable: true,
      };
    }

    if (explicitType === 'soft') {
      return {
        type: 'soft',
        reason: message || 'Soft bounce (provider specified)',
        isUndeliverable: false,
      };
    }

    // Check for hard bounce patterns
    for (const pattern of HARD_BOUNCE_PATTERNS) {
      if (lowerMessage.includes(pattern)) {
        return {
          type: 'hard',
          reason: message || `Hard bounce: ${pattern}`,
          isUndeliverable: true,
        };
      }
    }

    // Check for soft bounce patterns
    for (const pattern of SOFT_BOUNCE_PATTERNS) {
      if (lowerMessage.includes(pattern)) {
        return {
          type: 'soft',
          reason: message || `Soft bounce: ${pattern}`,
          isUndeliverable: false,
        };
      }
    }

    // Default to soft bounce if uncertain
    return {
      type: 'soft',
      reason: message || 'Unknown bounce reason',
      isUndeliverable: false,
    };
  },

  /**
   * Gets the soft bounce count for an email address.
   * 
   * @param email - Email address to check
   * @returns Soft bounce count and undeliverable status
   * 
   * Requirements: 12.4
   */
  async getSoftBounceCount(email: string): Promise<SoftBounceCount> {
    const softBounces = await db.query.bounces.findMany({
      where: and(
        eq(bounces.email, email),
        eq(bounces.bounceType, 'soft')
      ),
    });

    const count = softBounces.length;
    return {
      email,
      count,
      isUndeliverable: count >= SOFT_BOUNCE_THRESHOLD,
    };
  },

  /**
   * Marks an email address as undeliverable by adding to unsubscribes.
   * 
   * @param email - Email address to mark
   * @param reason - Reason for marking as undeliverable
   * 
   * Requirements: 12.3, 12.4
   */
  async markAsUndeliverable(email: string, reason: string = 'bounce'): Promise<void> {
    // Check if already unsubscribed
    const existing = await db.query.unsubscribes.findFirst({
      where: eq(unsubscribes.email, email),
    });

    if (!existing) {
      await db.insert(unsubscribes).values({
        email,
        reason: `undeliverable_${reason}`,
      });
    }
  },

  /**
   * Unsubscribes an email address.
   * 
   * @param email - Email address to unsubscribe
   * @param campaignId - Optional campaign ID that triggered unsubscribe
   * @param reason - Reason for unsubscribe
   * 
   * Requirements: 12.6
   */
  async unsubscribeEmail(
    email: string, 
    campaignId?: string, 
    reason: string = 'user_request'
  ): Promise<void> {
    // Check if already unsubscribed
    const existing = await db.query.unsubscribes.findFirst({
      where: eq(unsubscribes.email, email),
    });

    if (!existing) {
      await db.insert(unsubscribes).values({
        email,
        campaignId: campaignId || null,
        reason,
      });
    }
  },

  /**
   * Checks if an email address is undeliverable or unsubscribed.
   * 
   * @param email - Email address to check
   * @returns True if email should not receive messages
   * 
   * Requirements: 12.8
   */
  async isUndeliverable(email: string): Promise<boolean> {
    const unsubscribed = await db.query.unsubscribes.findFirst({
      where: eq(unsubscribes.email, email),
    });

    return !!unsubscribed;
  },

  /**
   * Gets bounce statistics for a campaign.
   * 
   * @param campaignId - Campaign ID
   * @returns Bounce statistics
   * 
   * Requirements: 12.7
   */
  async getCampaignBounceStats(campaignId: string): Promise<{
    total: number;
    hard: number;
    soft: number;
    rate: number;
  }> {
    // Get all bounces for this campaign's messages
    const campaignBounces = await db
      .select({
        bounceType: bounces.bounceType,
      })
      .from(bounces)
      .innerJoin(campaignMessages, eq(bounces.campaignMessageId, campaignMessages.id))
      .where(eq(campaignMessages.campaignId, campaignId));

    const hard = campaignBounces.filter(b => b.bounceType === 'hard').length;
    const soft = campaignBounces.filter(b => b.bounceType === 'soft').length;
    const total = hard + soft;

    // Get total sent for rate calculation
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    const sentCount = campaign?.sentCount || 0;
    const rate = sentCount > 0 ? (total / sentCount) * 100 : 0;

    return {
      total,
      hard,
      soft,
      rate: Math.round(rate * 100) / 100,
    };
  },

  /**
   * Gets complaint statistics for a campaign.
   * 
   * @param campaignId - Campaign ID
   * @returns Complaint statistics
   * 
   * Requirements: 12.7
   */
  async getCampaignComplaintStats(campaignId: string): Promise<{
    total: number;
    rate: number;
  }> {
    // Get unsubscribes with spam_complaint reason for this campaign
    const complaints = await db.query.unsubscribes.findMany({
      where: and(
        eq(unsubscribes.campaignId, campaignId),
        eq(unsubscribes.reason, 'spam_complaint')
      ),
    });

    const total = complaints.length;

    // Get total sent for rate calculation
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    const sentCount = campaign?.sentCount || 0;
    const rate = sentCount > 0 ? (total / sentCount) * 100 : 0;

    return {
      total,
      rate: Math.round(rate * 100) / 100,
    };
  },

  /**
   * Filters a list of emails to remove undeliverable addresses.
   * 
   * @param emails - List of email addresses
   * @returns Filtered list of deliverable emails
   * 
   * Requirements: 12.8
   */
  async filterDeliverableEmails(emails: string[]): Promise<string[]> {
    if (emails.length === 0) return [];

    // Get all unsubscribed emails from the list
    const unsubscribedEmails = await db.query.unsubscribes.findMany({
      where: sql`${unsubscribes.email} IN (${sql.join(emails.map(e => sql`${e}`), sql`, `)})`,
    });

    const unsubscribedSet = new Set(unsubscribedEmails.map(u => u.email.toLowerCase()));

    return emails.filter(email => !unsubscribedSet.has(email.toLowerCase()));
  },

  /**
   * Gets all bounces for an email address.
   * 
   * @param email - Email address
   * @returns List of bounces
   */
  async getBouncesForEmail(email: string): Promise<Array<{
    id: string;
    bounceType: BounceType;
    bounceReason: string | null;
    bouncedAt: Date;
  }>> {
    return db.query.bounces.findMany({
      where: eq(bounces.email, email),
      orderBy: (bounces, { desc }) => [desc(bounces.bouncedAt)],
    });
  },

  /**
   * Validates a Resend webhook payload.
   * 
   * @param payload - Raw webhook payload
   * @returns Validated payload or null if invalid
   */
  validatePayload(payload: unknown): ResendWebhookPayload | null {
    const result = resendWebhookPayloadSchema.safeParse(payload);
    if (result.success) {
      return result.data;
    }
    console.error('[WebhookService] Invalid webhook payload:', result.error);
    return null;
  },
};

export default WebhookService;
