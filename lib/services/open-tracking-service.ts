/**
 * @fileoverview Open Tracking Service - Track email opens in campaigns
 * 
 * This service handles open tracking for email campaigns:
 * - Inserting tracking pixels in email content
 * - Recording open events with metadata
 * - Providing open statistics for campaigns
 * - Deduplication of opens within a time window
 * 
 * @module lib/services/open-tracking-service
 * @requires drizzle-orm - Database ORM
 * @requires @paralleldrive/cuid2 - ID generation
 * 
 * @example
 * ```typescript
 * import { OpenTrackingService } from '@/lib/services';
 * 
 * // Insert tracking pixel in email content
 * const contentWithPixel = OpenTrackingService.insertTrackingPixel(
 *   htmlContent,
 *   'https://myapp.com',
 *   'message123'
 * );
 * 
 * // Record an open
 * await OpenTrackingService.recordOpen('message123', {
 *   userAgent: 'Mozilla/5.0...',
 *   ipAddress: '192.168.1.1',
 * });
 * ```
 * 
 * Requirements: 6, 7
 */

import { z } from 'zod';
import { db } from '@/db';
import { 
  emailOpens, 
  campaignMessages, 
  campaigns,
  type EmailOpen,
} from '@/db/schema';
import { eq, and, gte, sql, count } from 'drizzle-orm';

/**
 * Metadata for recording an open event
 */
export interface OpenMetadata {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Open statistics for a campaign
 */
export interface CampaignOpenStats {
  campaignId: string;
  totalOpens: number;
  uniqueOpens: number;
  openRate: number;
  recipientCount: number;
}

/**
 * Result of recording an open event
 */
export interface RecordOpenResult {
  recorded: boolean;
  isDuplicate: boolean;
  isFirstOpen: boolean;
  open?: EmailOpen;
}

/**
 * Zod schema for open metadata validation
 */
export const openMetadataSchema = z.object({
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
});

/**
 * Default deduplication window in minutes
 */
export const DEFAULT_OPEN_DEDUP_WINDOW_MINUTES = 5;

/**
 * OpenTrackingService - Manages open tracking for email campaigns.
 * 
 * Provides methods for:
 * - Inserting tracking pixels in email content
 * - Recording open events with metadata
 * - Retrieving open statistics for campaigns
 * - Deduplicating opens within a configurable time window
 * 
 * @remarks
 * Opens are tracked via a 1x1 transparent GIF pixel that is loaded
 * when the email is opened. The pixel URL includes the message ID
 * for attribution.
 * 
 * Requirements: 6, 7
 */
export const OpenTrackingService = {
  /**
   * Inserts a tracking pixel into HTML email content.
   * 
   * The tracking pixel is a 1x1 transparent GIF that is loaded when
   * the email is opened. It is inserted just before the closing body tag.
   * 
   * @param content - HTML email content
   * @param baseUrl - Base URL for the tracking endpoint
   * @param messageId - Campaign message ID for attribution
   * @returns HTML content with tracking pixel inserted
   * 
   * @example
   * ```typescript
   * const contentWithPixel = OpenTrackingService.insertTrackingPixel(
   *   '<html><body>Hello!</body></html>',
   *   'https://myapp.com',
   *   'msg123'
   * );
   * // Result: '<html><body>Hello!<img src="https://myapp.com/track/open/msg123" ... /></body></html>'
   * ```
   * 
   * Requirements: 6, 7
   */
  insertTrackingPixel(
    content: string,
    baseUrl: string,
    messageId: string
  ): string {
    const trackingPixelUrl = `${baseUrl}/track/open/${messageId}`;
    const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`;
    
    // Try to insert before closing body tag
    if (content.includes('</body>')) {
      return content.replace('</body>', `${trackingPixel}</body>`);
    }
    
    // If no body tag, try before closing html tag
    if (content.includes('</html>')) {
      return content.replace('</html>', `${trackingPixel}</html>`);
    }
    
    // If neither, append to the end
    return content + trackingPixel;
  },

  /**
   * Generates a tracking pixel URL for a specific message.
   * 
   * @param baseUrl - Base URL for the tracking endpoint
   * @param messageId - Campaign message ID
   * @returns The tracking pixel URL
   * 
   * @example
   * ```typescript
   * const pixelUrl = OpenTrackingService.generateTrackingPixelUrl(
   *   'https://myapp.com',
   *   'msg123'
   * );
   * // Returns: 'https://myapp.com/track/open/msg123'
   * ```
   */
  generateTrackingPixelUrl(baseUrl: string, messageId: string): string {
    return `${baseUrl}/track/open/${messageId}`;
  },

  /**
   * Records an open event for a campaign message.
   * 
   * Creates an EmailOpen record with the provided metadata.
   * Also updates the campaign's opened count and the
   * campaign message's opened_at timestamp if this is the first open.
   * 
   * Unique opens per recipient are tracked by:
   * 1. Recording all opens in the emailOpens table for analytics
   * 2. Only incrementing campaign.openedCount on the FIRST open per recipient
   * 3. Using campaignMessages.openedAt to track if a recipient has opened
   * 
   * @param campaignMessageId - The campaign message ID
   * @param metadata - Open event metadata
   * @param dedupWindowMinutes - Deduplication window in minutes (default: 5)
   * @returns Result indicating if the open was recorded
   * @throws {Error} If the campaign message doesn't exist
   * 
   * @example
   * ```typescript
   * const result = await OpenTrackingService.recordOpen('msg123', {
   *   userAgent: 'Mozilla/5.0...',
   *   ipAddress: '192.168.1.1',
   * });
   * 
   * if (result.isFirstOpen) {
   *   console.log('First time this email was opened!');
   * }
   * ```
   * 
   * Requirements: 6, 7
   */
  async recordOpen(
    campaignMessageId: string,
    metadata: OpenMetadata,
    dedupWindowMinutes: number = DEFAULT_OPEN_DEDUP_WINDOW_MINUTES
  ): Promise<RecordOpenResult> {
    // Validate metadata
    const validated = openMetadataSchema.parse(metadata);

    // Verify campaign message exists
    const message = await db.query.campaignMessages.findFirst({
      where: eq(campaignMessages.id, campaignMessageId),
    });

    if (!message) {
      throw new Error(`Campaign message with ID "${campaignMessageId}" not found`);
    }

    // Check if this is the first open for this recipient (unique open)
    // This is determined by whether openedAt is already set on the message
    const isFirstOpenForRecipient = !message.openedAt;

    // Check for duplicate opens within the deduplication window
    // This prevents counting rapid successive opens (e.g., email client prefetching)
    const isDuplicateWithinWindow = await this.isDuplicateOpen(campaignMessageId, dedupWindowMinutes);

    // Always record the open for analytics purposes (total opens tracking)
    const [open] = await db.insert(emailOpens).values({
      campaignMessageId,
      userAgent: validated.userAgent,
      ipAddress: validated.ipAddress,
    }).returning();

    // If this is a duplicate within the time window, don't update anything else
    if (isDuplicateWithinWindow) {
      return {
        recorded: true,
        isDuplicate: true,
        isFirstOpen: false,
        open,
      };
    }

    // Update campaign message openedAt if this is the first open for this recipient
    if (isFirstOpenForRecipient) {
      await db.update(campaignMessages)
        .set({ openedAt: new Date() })
        .where(eq(campaignMessages.id, campaignMessageId));

      // Only increment campaign opened count on FIRST open per recipient
      // This ensures openedCount represents unique opens, not total opens
      await db.update(campaigns)
        .set({
          openedCount: sql`${campaigns.openedCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, message.campaignId));
    }

    return {
      recorded: true,
      isDuplicate: false,
      isFirstOpen: isFirstOpenForRecipient,
      open,
    };
  },

  /**
   * Records an open event asynchronously without blocking.
   * 
   * This method catches and logs any errors to prevent them from
   * affecting the caller. Useful for non-blocking tracking in
   * request handlers.
   * 
   * @param campaignMessageId - The campaign message ID
   * @param metadata - Open event metadata
   * @returns Promise that resolves when recording is complete
   * 
   * @example
   * ```typescript
   * // Fire and forget - don't await
   * OpenTrackingService.recordOpenAsync('msg123', { userAgent: '...' })
   *   .catch(err => console.error('Failed to record open:', err));
   * ```
   */
  async recordOpenAsync(
    campaignMessageId: string,
    metadata: OpenMetadata
  ): Promise<void> {
    try {
      await this.recordOpen(campaignMessageId, metadata);
    } catch (error) {
      console.error('Error recording email open:', error);
    }
  },

  /**
   * Checks if an open is a duplicate within the specified time window.
   * 
   * Used to prevent counting multiple opens from the same recipient
   * on the same message within a short time period (e.g., email client
   * prefetching, multiple image loads).
   * 
   * @param campaignMessageId - The campaign message ID
   * @param windowMinutes - Time window in minutes (default: 5)
   * @returns True if this is a duplicate open
   * 
   * @example
   * ```typescript
   * const isDupe = await OpenTrackingService.isDuplicateOpen('msg123', 5);
   * 
   * if (!isDupe) {
   *   // This is a unique open, update counters
   * }
   * ```
   * 
   * Requirements: 6, 7
   */
  async isDuplicateOpen(
    campaignMessageId: string,
    windowMinutes: number = DEFAULT_OPEN_DEDUP_WINDOW_MINUTES
  ): Promise<boolean> {
    // Calculate the cutoff time
    const cutoffTime = new Date(Date.now() - windowMinutes * 60 * 1000);

    // Check for existing opens within the window
    const existingOpen = await db.query.emailOpens.findFirst({
      where: and(
        eq(emailOpens.campaignMessageId, campaignMessageId),
        gte(emailOpens.openedAt, cutoffTime)
      ),
    });

    return !!existingOpen;
  },

  /**
   * Gets open statistics for a campaign.
   * 
   * Returns aggregated open data including:
   * - Total opens (including duplicates)
   * - Unique opens (by message)
   * - Open rate as a percentage
   * 
   * @param campaignId - The campaign ID
   * @returns Campaign open statistics
   * @throws {Error} If the campaign doesn't exist
   * 
   * @example
   * ```typescript
   * const stats = await OpenTrackingService.getOpenStats('campaign123');
   * console.log(`Open rate: ${stats.openRate}%`);
   * ```
   * 
   * Requirements: 7
   */
  async getOpenStats(campaignId: string): Promise<CampaignOpenStats> {
    // Verify campaign exists and get recipient count
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    // Get all campaign messages for this campaign
    const messages = await db.query.campaignMessages.findMany({
      where: eq(campaignMessages.campaignId, campaignId),
    });

    // Count total opens across all messages
    let totalOpens = 0;
    let uniqueOpens = 0;

    for (const message of messages) {
      const opens = await db.query.emailOpens.findMany({
        where: eq(emailOpens.campaignMessageId, message.id),
      });

      totalOpens += opens.length;
      
      // Count as unique if there's at least one open
      if (opens.length > 0) {
        uniqueOpens++;
      }
    }

    // Calculate open rate
    const recipientCount = campaign.recipientCount || messages.length || 1;
    const openRate = (uniqueOpens / recipientCount) * 100;

    return {
      campaignId,
      totalOpens,
      uniqueOpens,
      openRate: Math.round(openRate * 100) / 100,
      recipientCount,
    };
  },

  /**
   * Gets all opens for a specific campaign message.
   * 
   * @param campaignMessageId - The campaign message ID
   * @returns Array of email opens
   */
  async getOpensForMessage(campaignMessageId: string): Promise<EmailOpen[]> {
    return db.query.emailOpens.findMany({
      where: eq(emailOpens.campaignMessageId, campaignMessageId),
    });
  },

  /**
   * Gets the count of opens for a specific campaign message.
   * 
   * @param campaignMessageId - The campaign message ID
   * @returns Number of opens
   */
  async getOpenCountForMessage(campaignMessageId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(emailOpens)
      .where(eq(emailOpens.campaignMessageId, campaignMessageId));

    return result[0]?.count ?? 0;
  },

  /**
   * Checks if a campaign message has been opened.
   * 
   * @param campaignMessageId - The campaign message ID
   * @returns True if the message has been opened at least once
   */
  async hasBeenOpened(campaignMessageId: string): Promise<boolean> {
    const message = await db.query.campaignMessages.findFirst({
      where: eq(campaignMessages.id, campaignMessageId),
    });

    return !!message?.openedAt;
  },

  /**
   * Gets the first open timestamp for a campaign message.
   * 
   * @param campaignMessageId - The campaign message ID
   * @returns The first open timestamp or null if never opened
   */
  async getFirstOpenTime(campaignMessageId: string): Promise<Date | null> {
    const message = await db.query.campaignMessages.findFirst({
      where: eq(campaignMessages.id, campaignMessageId),
    });

    return message?.openedAt ?? null;
  },

  /**
   * Gets the count of unique opens for a campaign.
   * 
   * Unique opens are counted by checking how many campaign messages
   * have a non-null openedAt timestamp. This represents the number
   * of distinct recipients who have opened the email at least once.
   * 
   * @param campaignId - The campaign ID
   * @returns Number of unique opens (distinct recipients who opened)
   * 
   * @example
   * ```typescript
   * const uniqueOpens = await OpenTrackingService.getUniqueOpensCount('campaign123');
   * console.log(`${uniqueOpens} recipients have opened this email`);
   * ```
   * 
   * Requirements: 6, 7
   */
  async getUniqueOpensCount(campaignId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(campaignMessages)
      .where(
        and(
          eq(campaignMessages.campaignId, campaignId),
          sql`${campaignMessages.openedAt} IS NOT NULL`
        )
      );

    return result[0]?.count ?? 0;
  },

  /**
   * Gets the total opens count for a campaign (including duplicates).
   * 
   * This counts all open events recorded in the emailOpens table,
   * including multiple opens from the same recipient.
   * 
   * @param campaignId - The campaign ID
   * @returns Total number of opens (including duplicates)
   * 
   * @example
   * ```typescript
   * const totalOpens = await OpenTrackingService.getTotalOpensCount('campaign123');
   * console.log(`Total opens: ${totalOpens}`);
   * ```
   * 
   * Requirements: 7
   */
  async getTotalOpensCount(campaignId: string): Promise<number> {
    // Get all campaign messages for this campaign
    const messages = await db.query.campaignMessages.findMany({
      where: eq(campaignMessages.campaignId, campaignId),
      columns: { id: true },
    });

    if (messages.length === 0) {
      return 0;
    }

    const messageIds = messages.map(m => m.id);
    
    // Count all opens for these messages
    let totalOpens = 0;
    for (const messageId of messageIds) {
      const result = await db
        .select({ count: count() })
        .from(emailOpens)
        .where(eq(emailOpens.campaignMessageId, messageId));
      
      totalOpens += result[0]?.count ?? 0;
    }

    return totalOpens;
  },

  /**
   * Checks if a recipient has opened a specific campaign email.
   * 
   * @param campaignMessageId - The campaign message ID
   * @returns True if the recipient has opened the email at least once
   * 
   * @example
   * ```typescript
   * const hasOpened = await OpenTrackingService.hasRecipientOpened('msg123');
   * if (hasOpened) {
   *   console.log('Recipient has engaged with this email');
   * }
   * ```
   * 
   * Requirements: 6, 7
   */
  async hasRecipientOpened(campaignMessageId: string): Promise<boolean> {
    const message = await db.query.campaignMessages.findFirst({
      where: eq(campaignMessages.id, campaignMessageId),
      columns: { openedAt: true },
    });

    return message?.openedAt !== null && message?.openedAt !== undefined;
  },

  /**
   * Gets detailed open history for a specific campaign message.
   * 
   * This method returns all opens for a message, including multiple opens
   * from the same recipient. Useful for understanding engagement patterns
   * and identifying email client behavior (e.g., prefetching).
   * 
   * @param campaignMessageId - The campaign message ID
   * @returns Object containing open history details
   * 
   * @example
   * ```typescript
   * const history = await OpenTrackingService.getOpenHistory('msg123');
   * console.log(`Total opens: ${history.totalOpens}`);
   * console.log(`First opened: ${history.firstOpenedAt}`);
   * console.log(`Last opened: ${history.lastOpenedAt}`);
   * ```
   * 
   * Requirements: 6, 7
   */
  async getOpenHistory(campaignMessageId: string): Promise<{
    campaignMessageId: string;
    totalOpens: number;
    firstOpenedAt: Date | null;
    lastOpenedAt: Date | null;
    opens: EmailOpen[];
  }> {
    const opens = await db.query.emailOpens.findMany({
      where: eq(emailOpens.campaignMessageId, campaignMessageId),
      orderBy: (emailOpens, { asc }) => [asc(emailOpens.openedAt)],
    });

    return {
      campaignMessageId,
      totalOpens: opens.length,
      firstOpenedAt: opens.length > 0 ? opens[0].openedAt : null,
      lastOpenedAt: opens.length > 0 ? opens[opens.length - 1].openedAt : null,
      opens,
    };
  },

  /**
   * Gets aggregated open statistics for multiple opens from the same recipient.
   * 
   * This method provides insights into how many times a recipient has opened
   * an email, which can indicate engagement level or email client behavior.
   * 
   * @param campaignMessageId - The campaign message ID
   * @returns Object containing aggregated open statistics
   * 
   * @example
   * ```typescript
   * const stats = await OpenTrackingService.getRecipientOpenStats('msg123');
   * if (stats.totalOpens > 5) {
   *   console.log('High engagement - recipient opened email multiple times');
   * }
   * ```
   * 
   * Requirements: 6, 7
   */
  async getRecipientOpenStats(campaignMessageId: string): Promise<{
    campaignMessageId: string;
    totalOpens: number;
    isFirstOpen: boolean;
    firstOpenedAt: Date | null;
    lastOpenedAt: Date | null;
    opensByUserAgent: Record<string, number>;
    opensByIpAddress: Record<string, number>;
  }> {
    const opens = await db.query.emailOpens.findMany({
      where: eq(emailOpens.campaignMessageId, campaignMessageId),
      orderBy: (emailOpens, { asc }) => [asc(emailOpens.openedAt)],
    });

    // Aggregate opens by user agent
    const opensByUserAgent: Record<string, number> = {};
    const opensByIpAddress: Record<string, number> = {};

    for (const open of opens) {
      const ua = open.userAgent || 'unknown';
      const ip = open.ipAddress || 'unknown';
      
      opensByUserAgent[ua] = (opensByUserAgent[ua] || 0) + 1;
      opensByIpAddress[ip] = (opensByIpAddress[ip] || 0) + 1;
    }

    return {
      campaignMessageId,
      totalOpens: opens.length,
      isFirstOpen: opens.length === 0,
      firstOpenedAt: opens.length > 0 ? opens[0].openedAt : null,
      lastOpenedAt: opens.length > 0 ? opens[opens.length - 1].openedAt : null,
      opensByUserAgent,
      opensByIpAddress,
    };
  },

  /**
   * Gets the time between first and last open for a campaign message.
   * 
   * This can help identify if a recipient is re-engaging with an email
   * over time, or if multiple opens are just from email client prefetching.
   * 
   * @param campaignMessageId - The campaign message ID
   * @returns Time span in milliseconds between first and last open, or null if no opens
   * 
   * @example
   * ```typescript
   * const span = await OpenTrackingService.getOpenTimeSpan('msg123');
   * if (span && span > 24 * 60 * 60 * 1000) {
   *   console.log('Recipient re-engaged with email after 24+ hours');
   * }
   * ```
   * 
   * Requirements: 6, 7
   */
  async getOpenTimeSpan(campaignMessageId: string): Promise<number | null> {
    const opens = await db.query.emailOpens.findMany({
      where: eq(emailOpens.campaignMessageId, campaignMessageId),
      orderBy: (emailOpens, { asc }) => [asc(emailOpens.openedAt)],
    });

    if (opens.length < 2) {
      return null;
    }

    const firstOpen = opens[0].openedAt;
    const lastOpen = opens[opens.length - 1].openedAt;

    return lastOpen.getTime() - firstOpen.getTime();
  },
};

export default OpenTrackingService;
