/**
 * @fileoverview Bounce Service - Email bounce management and list hygiene
 * 
 * This service provides comprehensive bounce handling functionality:
 * - Soft bounce counting with 3-strike rule
 * - Hard bounce marking as undeliverable
 * - Prevention of sending to undeliverable addresses
 * - Bounce statistics for campaign reports
 * 
 * Key responsibilities:
 * - Track and count soft bounces per email address
 * - Mark addresses as undeliverable after threshold
 * - Filter recipient lists to exclude undeliverable addresses
 * - Provide bounce statistics for reporting
 * 
 * @module lib/services/bounce-service
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { BounceService } from '@/lib/services';
 * 
 * // Check if an email is deliverable
 * const isDeliverable = await BounceService.isDeliverable('user@example.com');
 * 
 * // Filter a list of emails to only deliverable ones
 * const deliverableEmails = await BounceService.filterDeliverableEmails(emails);
 * 
 * // Get bounce stats for a campaign
 * const stats = await BounceService.getCampaignBounceStats(campaignId);
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
  type BounceType,
} from '@/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Number of soft bounces before marking an email as undeliverable.
 * After this threshold is reached, the email will be added to the unsubscribes
 * table with reason 'soft_bounce_threshold'.
 * 
 * Requirements: 12.4
 */
export const SOFT_BOUNCE_THRESHOLD = 3;

/**
 * Reason codes for marking emails as undeliverable
 */
export const UNDELIVERABLE_REASONS = {
  HARD_BOUNCE: 'hard_bounce',
  SOFT_BOUNCE_THRESHOLD: 'soft_bounce_threshold',
  SPAM_COMPLAINT: 'spam_complaint',
  MANUAL: 'manual_undeliverable',
} as const;

export type UndeliverableReason = typeof UNDELIVERABLE_REASONS[keyof typeof UNDELIVERABLE_REASONS];

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Bounce statistics for a single email address
 */
export interface EmailBounceStats {
  email: string;
  totalBounces: number;
  hardBounces: number;
  softBounces: number;
  isUndeliverable: boolean;
  lastBounceAt: Date | null;
}

/**
 * Bounce statistics for a campaign
 */
export interface CampaignBounceStats {
  campaignId: string;
  totalBounces: number;
  hardBounces: number;
  softBounces: number;
  bounceRate: number;
  undeliverableCount: number;
}

/**
 * Result of recording a bounce
 */
export interface RecordBounceResult {
  success: boolean;
  bounceId: string;
  bounceType: BounceType;
  isNowUndeliverable: boolean;
  softBounceCount: number;
}

/**
 * Deliverability check result
 */
export interface DeliverabilityResult {
  email: string;
  isDeliverable: boolean;
  reason?: string;
  softBounceCount?: number;
}

/**
 * Bulk deliverability check result
 */
export interface BulkDeliverabilityResult {
  deliverable: string[];
  undeliverable: Array<{
    email: string;
    reason: string;
  }>;
  totalChecked: number;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * BounceService - Manages email bounces and list hygiene.
 * 
 * This service is responsible for:
 * - Recording and categorizing bounces
 * - Implementing the 3-strike rule for soft bounces
 * - Marking addresses as undeliverable
 * - Filtering recipient lists
 * - Providing bounce statistics
 * 
 * Requirements: 12
 */
export const BounceService = {
  /**
   * Records a bounce for an email address.
   * 
   * For hard bounces:
   * - Immediately marks the email as undeliverable
   * 
   * For soft bounces:
   * - Increments the soft bounce count
   * - If count reaches threshold (3), marks as undeliverable
   * 
   * @param email - The email address that bounced
   * @param bounceType - Type of bounce ('hard' or 'soft')
   * @param bounceReason - Optional reason/message for the bounce
   * @param campaignMessageId - Optional campaign message ID for tracking
   * @returns Result of recording the bounce
   * 
   * Requirements: 12.2, 12.3, 12.4
   */
  async recordBounce(
    email: string,
    bounceType: BounceType,
    bounceReason?: string,
    campaignMessageId?: string
  ): Promise<RecordBounceResult> {
    // Insert the bounce record
    const [bounce] = await db.insert(bounces).values({
      email: email.toLowerCase(),
      bounceType,
      bounceReason: bounceReason || null,
      campaignMessageId: campaignMessageId || null,
    }).returning();

    let isNowUndeliverable = false;
    let softBounceCount = 0;

    if (bounceType === 'hard') {
      // Hard bounce - mark as undeliverable immediately
      await this.markAsUndeliverable(email, UNDELIVERABLE_REASONS.HARD_BOUNCE);
      isNowUndeliverable = true;
    } else {
      // Soft bounce - check 3-strike rule
      softBounceCount = await this.getSoftBounceCount(email);
      
      if (softBounceCount >= SOFT_BOUNCE_THRESHOLD) {
        await this.markAsUndeliverable(email, UNDELIVERABLE_REASONS.SOFT_BOUNCE_THRESHOLD);
        isNowUndeliverable = true;
      }
    }

    return {
      success: true,
      bounceId: bounce.id,
      bounceType,
      isNowUndeliverable,
      softBounceCount,
    };
  },

  /**
   * Gets the soft bounce count for an email address.
   * 
   * @param email - The email address to check
   * @returns Number of soft bounces recorded
   * 
   * Requirements: 12.4
   */
  async getSoftBounceCount(email: string): Promise<number> {
    const softBounces = await db.query.bounces.findMany({
      where: and(
        eq(bounces.email, email.toLowerCase()),
        eq(bounces.bounceType, 'soft')
      ),
    });

    return softBounces.length;
  },

  /**
   * Gets the hard bounce count for an email address.
   * 
   * @param email - The email address to check
   * @returns Number of hard bounces recorded
   */
  async getHardBounceCount(email: string): Promise<number> {
    const hardBounces = await db.query.bounces.findMany({
      where: and(
        eq(bounces.email, email.toLowerCase()),
        eq(bounces.bounceType, 'hard')
      ),
    });

    return hardBounces.length;
  },

  /**
   * Marks an email address as undeliverable.
   * 
   * Adds the email to the unsubscribes table with the specified reason.
   * If already marked, does nothing (idempotent).
   * 
   * @param email - The email address to mark
   * @param reason - Reason for marking as undeliverable
   * @param campaignId - Optional campaign ID that triggered this
   * 
   * Requirements: 12.3, 12.4
   */
  async markAsUndeliverable(
    email: string,
    reason: UndeliverableReason,
    campaignId?: string
  ): Promise<void> {
    const normalizedEmail = email.toLowerCase();

    // Check if already marked
    const existing = await db.query.unsubscribes.findFirst({
      where: eq(unsubscribes.email, normalizedEmail),
    });

    if (!existing) {
      await db.insert(unsubscribes).values({
        email: normalizedEmail,
        reason,
        campaignId: campaignId || null,
      });
    }
  },

  /**
   * Checks if an email address is deliverable.
   * 
   * An email is undeliverable if:
   * - It's in the unsubscribes table
   * - It has a hard bounce
   * - It has reached the soft bounce threshold
   * 
   * @param email - The email address to check
   * @returns True if the email can receive messages
   * 
   * Requirements: 12.8
   */
  async isDeliverable(email: string): Promise<boolean> {
    const result = await this.checkDeliverability(email);
    return result.isDeliverable;
  },

  /**
   * Checks deliverability with detailed reason.
   * 
   * @param email - The email address to check
   * @returns Deliverability result with reason if undeliverable
   * 
   * Requirements: 12.8
   */
  async checkDeliverability(email: string): Promise<DeliverabilityResult> {
    const normalizedEmail = email.toLowerCase();

    // Check unsubscribes table first (includes hard bounces and threshold-reached soft bounces)
    const unsubscribed = await db.query.unsubscribes.findFirst({
      where: eq(unsubscribes.email, normalizedEmail),
    });

    if (unsubscribed) {
      return {
        email: normalizedEmail,
        isDeliverable: false,
        reason: unsubscribed.reason || 'unsubscribed',
      };
    }

    // Check soft bounce count (in case not yet marked as undeliverable)
    const softBounceCount = await this.getSoftBounceCount(normalizedEmail);
    if (softBounceCount >= SOFT_BOUNCE_THRESHOLD) {
      // Mark as undeliverable for future checks
      await this.markAsUndeliverable(normalizedEmail, UNDELIVERABLE_REASONS.SOFT_BOUNCE_THRESHOLD);
      return {
        email: normalizedEmail,
        isDeliverable: false,
        reason: UNDELIVERABLE_REASONS.SOFT_BOUNCE_THRESHOLD,
        softBounceCount,
      };
    }

    return {
      email: normalizedEmail,
      isDeliverable: true,
      softBounceCount,
    };
  },

  /**
   * Filters a list of emails to only include deliverable addresses.
   * 
   * This is the primary method for preventing sends to undeliverable addresses.
   * Use this before sending campaigns to clean the recipient list.
   * 
   * @param emails - Array of email addresses to filter
   * @returns Array of deliverable email addresses
   * 
   * Requirements: 12.8
   */
  async filterDeliverableEmails(emails: string[]): Promise<string[]> {
    if (emails.length === 0) return [];

    const normalizedEmails = emails.map(e => e.toLowerCase());

    // Get all unsubscribed emails from the list
    const unsubscribedRecords = await db.query.unsubscribes.findMany({
      where: inArray(unsubscribes.email, normalizedEmails),
    });

    const unsubscribedSet = new Set(unsubscribedRecords.map(u => u.email.toLowerCase()));

    // Filter out unsubscribed emails
    const potentiallyDeliverable = normalizedEmails.filter(
      email => !unsubscribedSet.has(email)
    );

    // Check soft bounce counts for remaining emails
    const deliverable: string[] = [];
    
    for (const email of potentiallyDeliverable) {
      const softBounceCount = await this.getSoftBounceCount(email);
      if (softBounceCount < SOFT_BOUNCE_THRESHOLD) {
        deliverable.push(email);
      } else {
        // Mark as undeliverable for future
        await this.markAsUndeliverable(email, UNDELIVERABLE_REASONS.SOFT_BOUNCE_THRESHOLD);
      }
    }

    return deliverable;
  },

  /**
   * Performs bulk deliverability check with detailed results.
   * 
   * @param emails - Array of email addresses to check
   * @returns Detailed results with deliverable and undeliverable lists
   * 
   * Requirements: 12.8
   */
  async checkBulkDeliverability(emails: string[]): Promise<BulkDeliverabilityResult> {
    if (emails.length === 0) {
      return {
        deliverable: [],
        undeliverable: [],
        totalChecked: 0,
      };
    }

    const normalizedEmails = emails.map(e => e.toLowerCase());
    const deliverable: string[] = [];
    const undeliverable: Array<{ email: string; reason: string }> = [];

    // Get all unsubscribed emails
    const unsubscribedRecords = await db.query.unsubscribes.findMany({
      where: inArray(unsubscribes.email, normalizedEmails),
    });

    const unsubscribedMap = new Map(
      unsubscribedRecords.map(u => [u.email.toLowerCase(), u.reason || 'unsubscribed'])
    );

    for (const email of normalizedEmails) {
      if (unsubscribedMap.has(email)) {
        undeliverable.push({
          email,
          reason: unsubscribedMap.get(email)!,
        });
      } else {
        const softBounceCount = await this.getSoftBounceCount(email);
        if (softBounceCount >= SOFT_BOUNCE_THRESHOLD) {
          undeliverable.push({
            email,
            reason: UNDELIVERABLE_REASONS.SOFT_BOUNCE_THRESHOLD,
          });
          // Mark for future
          await this.markAsUndeliverable(email, UNDELIVERABLE_REASONS.SOFT_BOUNCE_THRESHOLD);
        } else {
          deliverable.push(email);
        }
      }
    }

    return {
      deliverable,
      undeliverable,
      totalChecked: emails.length,
    };
  },

  /**
   * Gets bounce statistics for an email address.
   * 
   * @param email - The email address to get stats for
   * @returns Bounce statistics for the email
   */
  async getEmailBounceStats(email: string): Promise<EmailBounceStats> {
    const normalizedEmail = email.toLowerCase();

    const allBounces = await db.query.bounces.findMany({
      where: eq(bounces.email, normalizedEmail),
      orderBy: (bounces, { desc }) => [desc(bounces.bouncedAt)],
    });

    const hardBounces = allBounces.filter(b => b.bounceType === 'hard').length;
    const softBounces = allBounces.filter(b => b.bounceType === 'soft').length;

    // Check if undeliverable
    const unsubscribed = await db.query.unsubscribes.findFirst({
      where: eq(unsubscribes.email, normalizedEmail),
    });

    return {
      email: normalizedEmail,
      totalBounces: allBounces.length,
      hardBounces,
      softBounces,
      isUndeliverable: !!unsubscribed || hardBounces > 0 || softBounces >= SOFT_BOUNCE_THRESHOLD,
      lastBounceAt: allBounces.length > 0 ? allBounces[0].bouncedAt : null,
    };
  },

  /**
   * Gets bounce statistics for a campaign.
   * 
   * @param campaignId - The campaign ID
   * @returns Bounce statistics for the campaign
   * 
   * Requirements: 12.7
   */
  async getCampaignBounceStats(campaignId: string): Promise<CampaignBounceStats> {
    // Get all bounces for this campaign's messages
    const campaignBounces = await db
      .select({
        bounceType: bounces.bounceType,
        email: bounces.email,
      })
      .from(bounces)
      .innerJoin(campaignMessages, eq(bounces.campaignMessageId, campaignMessages.id))
      .where(eq(campaignMessages.campaignId, campaignId));

    const hardBounces = campaignBounces.filter(b => b.bounceType === 'hard').length;
    const softBounces = campaignBounces.filter(b => b.bounceType === 'soft').length;
    const totalBounces = hardBounces + softBounces;

    // Get unique bounced emails
    const bouncedEmails = [...new Set(campaignBounces.map(b => b.email))];

    // Count how many are now undeliverable
    let undeliverableCount = 0;
    for (const email of bouncedEmails) {
      const isUndeliverable = !(await this.isDeliverable(email));
      if (isUndeliverable) {
        undeliverableCount++;
      }
    }

    // Get total sent for rate calculation
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    const sentCount = campaign?.sentCount || 0;
    const bounceRate = sentCount > 0 ? (totalBounces / sentCount) * 100 : 0;

    return {
      campaignId,
      totalBounces,
      hardBounces,
      softBounces,
      bounceRate: Math.round(bounceRate * 100) / 100,
      undeliverableCount,
    };
  },

  /**
   * Gets all bounces for an email address.
   * 
   * @param email - The email address
   * @returns List of bounce records
   */
  async getBouncesForEmail(email: string): Promise<Array<{
    id: string;
    bounceType: BounceType;
    bounceReason: string | null;
    bouncedAt: Date;
    campaignMessageId: string | null;
  }>> {
    return db.query.bounces.findMany({
      where: eq(bounces.email, email.toLowerCase()),
      orderBy: (bounces, { desc }) => [desc(bounces.bouncedAt)],
    });
  },

  /**
   * Gets all bounces for a campaign.
   * 
   * @param campaignId - The campaign ID
   * @returns List of bounce records with email addresses
   */
  async getBouncesForCampaign(campaignId: string): Promise<Array<{
    id: string;
    email: string;
    bounceType: BounceType;
    bounceReason: string | null;
    bouncedAt: Date;
  }>> {
    const result = await db
      .select({
        id: bounces.id,
        email: bounces.email,
        bounceType: bounces.bounceType,
        bounceReason: bounces.bounceReason,
        bouncedAt: bounces.bouncedAt,
      })
      .from(bounces)
      .innerJoin(campaignMessages, eq(bounces.campaignMessageId, campaignMessages.id))
      .where(eq(campaignMessages.campaignId, campaignId));

    return result;
  },

  /**
   * Removes an email from the undeliverable list.
   * 
   * Use this to manually restore deliverability for an email address.
   * This does NOT remove bounce history.
   * 
   * @param email - The email address to restore
   * @returns True if the email was removed, false if it wasn't in the list
   */
  async restoreDeliverability(email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase();

    const result = await db.delete(unsubscribes)
      .where(eq(unsubscribes.email, normalizedEmail))
      .returning();

    return result.length > 0;
  },

  /**
   * Clears all bounce history for an email address.
   * 
   * Use with caution - this removes all bounce records and restores deliverability.
   * 
   * @param email - The email address to clear
   * @returns Number of bounce records deleted
   */
  async clearBounceHistory(email: string): Promise<number> {
    const normalizedEmail = email.toLowerCase();

    // Remove from unsubscribes
    await db.delete(unsubscribes)
      .where(eq(unsubscribes.email, normalizedEmail));

    // Remove bounce records
    const deleted = await db.delete(bounces)
      .where(eq(bounces.email, normalizedEmail))
      .returning();

    return deleted.length;
  },

  /**
   * Gets a summary of all undeliverable emails.
   * 
   * @param limit - Maximum number of records to return (default: 100)
   * @param offset - Number of records to skip (default: 0)
   * @returns List of undeliverable emails with reasons
   */
  async getUndeliverableEmails(
    limit: number = 100,
    offset: number = 0
  ): Promise<Array<{
    email: string;
    reason: string | null;
    unsubscribedAt: Date;
  }>> {
    const records = await db.query.unsubscribes.findMany({
      limit,
      offset,
      orderBy: (unsubscribes, { desc }) => [desc(unsubscribes.unsubscribedAt)],
    });

    return records.map(r => ({
      email: r.email,
      reason: r.reason,
      unsubscribedAt: r.unsubscribedAt,
    }));
  },

  /**
   * Gets the total count of undeliverable emails.
   * 
   * @returns Total count of undeliverable emails
   */
  async getUndeliverableCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(unsubscribes);

    return Number(result[0]?.count || 0);
  },
};

export default BounceService;
