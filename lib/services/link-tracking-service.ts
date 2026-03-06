/**
 * @fileoverview Link Tracking Service - Track link clicks in email campaigns
 * 
 * This service handles link tracking for email campaigns:
 * - Wrapping links in email content with tracking URLs
 * - Recording click events with metadata
 * - Providing click statistics for campaigns
 * - Deduplication of clicks within a time window
 * 
 * @module lib/services/link-tracking-service
 * @requires drizzle-orm - Database ORM
 * @requires @paralleldrive/cuid2 - ID generation
 * 
 * @example
 * ```typescript
 * import { LinkTrackingService } from '@/lib/services';
 * 
 * // Wrap links in email content
 * const wrappedContent = await LinkTrackingService.createTrackingLinks(
 *   campaignId,
 *   htmlContent,
 *   'https://myapp.com'
 * );
 * 
 * // Record a click
 * await LinkTrackingService.recordClick(linkId, {
 *   recipientEmail: 'user@example.com',
 *   userAgent: 'Mozilla/5.0...',
 *   ipAddress: '192.168.1.1',
 * });
 * ```
 */

import { z } from 'zod';
import { db } from '@/db';
import { 
  campaignLinks, 
  linkClicks, 
  campaigns,
  campaignMessages,
  type CampaignLink, 
  type LinkClick,
} from '@/db/schema';
import { eq, and, gte, desc, sql, count } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

/**
 * Metadata for recording a click event
 */
export interface ClickMetadata {
  recipientEmail: string;
  campaignMessageId?: string;
  userAgent?: string;
  ipAddress?: string;
  referer?: string;
}

/**
 * Click statistics for a single link
 */
export interface LinkClickStats {
  linkId: string;
  originalUrl: string;
  label: string | null;
  totalClicks: number;
  uniqueClicks: number;
  clickThroughRate: number;
}

/**
 * Campaign click statistics summary
 */
export interface CampaignClickStats {
  campaignId: string;
  totalLinks: number;
  totalClicks: number;
  uniqueClicks: number;
  overallClickThroughRate: number;
  linkStats: LinkClickStats[];
}

/**
 * UTM parameters for link tracking
 */
export interface UTMParams {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
}

/**
 * Zod schema for click metadata validation
 */
export const clickMetadataSchema = z.object({
  recipientEmail: z.string().email('Invalid email address'),
  campaignMessageId: z.string().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  referer: z.string().optional(),
});

/**
 * Default deduplication window in minutes
 */
export const DEFAULT_DEDUP_WINDOW_MINUTES = 5;

/**
 * LinkTrackingService - Manages link tracking for email campaigns.
 * 
 * Provides methods for:
 * - Wrapping links in email content with tracking URLs
 * - Recording click events with metadata
 * - Retrieving click statistics for campaigns
 * - Deduplicating clicks within a configurable time window
 * 
 * @remarks
 * Links are wrapped with unique tracking IDs that redirect through
 * the tracking endpoint before reaching the original URL.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */
export const LinkTrackingService = {
  /**
   * Wraps all links in HTML content with tracking URLs.
   * 
   * Finds all anchor tags in the content and replaces their href
   * attributes with tracking URLs. Creates CampaignLink records
   * for each unique URL.
   * 
   * @param campaignId - The campaign ID to associate links with
   * @param content - HTML content containing links to wrap
   * @param baseUrl - Base URL for generating tracking URLs
   * @param utmParams - Optional UTM parameters to add to links
   * @returns HTML content with wrapped tracking links
   * 
   * @example
   * ```typescript
   * const wrapped = await LinkTrackingService.createTrackingLinks(
   *   'campaign123',
   *   '<a href="https://example.com">Click here</a>',
   *   'https://myapp.com',
   *   { utmSource: 'email', utmMedium: 'campaign' }
   * );
   * // Result: '<a href="https://myapp.com/track/abc123">Click here</a>'
   * ```
   * 
   * Requirements: 6.1, 6.5
   */
  async createTrackingLinks(
    campaignId: string,
    content: string,
    baseUrl: string,
    utmParams?: UTMParams
  ): Promise<string> {
    // Verify campaign exists
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    // Regex to find all anchor tags with href attributes
    // Matches: <a href="..." ...> or <a ... href="..." ...>
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["']([^>]*)>/gi;
    
    // Track URLs we've already processed to avoid duplicates
    const processedUrls = new Map<string, string>();
    
    // First pass: collect all unique URLs and their labels
    const urlsToProcess: Array<{ url: string; label: string | null }> = [];
    const seenUrls = new Set<string>();
    
    content.replace(linkRegex, (match, url) => {
      // Skip already tracked links, mailto links, tel links, and anchor links
      if (
        url.startsWith('/track/') ||
        url.startsWith('mailto:') ||
        url.startsWith('tel:') ||
        url.startsWith('#') ||
        url.startsWith('javascript:')
      ) {
        return match;
      }
      
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        // Extract label from the full match (includes closing tag)
        const fullMatch = match + content.substring(content.indexOf(match) + match.length).split('</a>')[0] + '</a>';
        const label = this.extractLinkLabel(fullMatch);
        urlsToProcess.push({ url, label });
      }
      return match;
    });
    
    // Create tracking links for all unique URLs
    for (const { url, label } of urlsToProcess) {
      const linkId = createId();
      const trackingUrl = `${baseUrl}/track/${linkId}`;
      
      await db.insert(campaignLinks).values({
        id: linkId,
        campaignId,
        originalUrl: url,
        trackingUrl,
        label,
        utmSource: utmParams?.utmSource,
        utmMedium: utmParams?.utmMedium,
        utmCampaign: utmParams?.utmCampaign,
        utmContent: utmParams?.utmContent,
      });
      
      processedUrls.set(url, trackingUrl);
    }
    
    // Second pass: replace all links with tracking URLs
    const wrappedContent = content.replace(linkRegex, (match, url, rest) => {
      // Skip already tracked links, mailto links, tel links, and anchor links
      if (
        url.startsWith('/track/') ||
        url.startsWith('mailto:') ||
        url.startsWith('tel:') ||
        url.startsWith('#') ||
        url.startsWith('javascript:')
      ) {
        return match;
      }
      
      const trackingUrl = processedUrls.get(url);
      if (trackingUrl) {
        return `<a href="${trackingUrl}"${rest}>`;
      }
      return match;
    });

    return wrappedContent;
  },

  /**
   * Records a click event for a tracked link.
   * 
   * Creates a LinkClick record with the provided metadata.
   * Also updates the campaign's clicked count and the
   * campaign message's clicked_at timestamp if applicable.
   * 
   * @param linkId - The tracking link ID
   * @param metadata - Click event metadata
   * @returns The created LinkClick record
   * @throws {Error} If the link doesn't exist
   * 
   * @example
   * ```typescript
   * const click = await LinkTrackingService.recordClick('link123', {
   *   recipientEmail: 'user@example.com',
   *   userAgent: 'Mozilla/5.0...',
   *   ipAddress: '192.168.1.1',
   * });
   * ```
   * 
   * Requirements: 6.2
   */
  async recordClick(linkId: string, metadata: ClickMetadata): Promise<LinkClick> {
    // Validate metadata
    const validated = clickMetadataSchema.parse(metadata);

    // Verify link exists and get campaign info
    const link = await db.query.campaignLinks.findFirst({
      where: eq(campaignLinks.id, linkId),
      with: {
        campaign: true,
      },
    });

    if (!link) {
      throw new Error(`Link with ID "${linkId}" not found`);
    }

    // Create the click record
    const [click] = await db.insert(linkClicks).values({
      linkId,
      campaignMessageId: validated.campaignMessageId,
      recipientEmail: validated.recipientEmail,
      userAgent: validated.userAgent,
      ipAddress: validated.ipAddress,
      referer: validated.referer,
    }).returning();

    // Update campaign clicked count (increment)
    await db.update(campaigns)
      .set({
        clickedCount: sql`${campaigns.clickedCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, link.campaignId));

    // Update campaign message clicked_at if we have a message ID
    if (validated.campaignMessageId) {
      const message = await db.query.campaignMessages.findFirst({
        where: eq(campaignMessages.id, validated.campaignMessageId),
      });

      // Only update if this is the first click for this message
      if (message && !message.clickedAt) {
        await db.update(campaignMessages)
          .set({ clickedAt: new Date() })
          .where(eq(campaignMessages.id, validated.campaignMessageId));
      }
    }

    return click;
  },

  /**
   * Gets click statistics for a campaign.
   * 
   * Returns aggregated click data including:
   * - Total clicks across all links
   * - Unique clicks (by email)
   * - Per-link statistics with CTR
   * 
   * @param campaignId - The campaign ID
   * @returns Campaign click statistics
   * @throws {Error} If the campaign doesn't exist
   * 
   * @example
   * ```typescript
   * const stats = await LinkTrackingService.getClickStats('campaign123');
   * console.log(`Total clicks: ${stats.totalClicks}`);
   * console.log(`CTR: ${stats.overallClickThroughRate}%`);
   * ```
   * 
   * Requirements: 6.4
   */
  async getClickStats(campaignId: string): Promise<CampaignClickStats> {
    // Verify campaign exists and get recipient count
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    // Get all links for this campaign
    const links = await db.query.campaignLinks.findMany({
      where: eq(campaignLinks.campaignId, campaignId),
    });

    // Get click data for each link
    const linkStats: LinkClickStats[] = [];
    let totalClicks = 0;
    const uniqueEmails = new Set<string>();

    for (const link of links) {
      // Get all clicks for this link
      const clicks = await db.query.linkClicks.findMany({
        where: eq(linkClicks.linkId, link.id),
      });

      const linkUniqueEmails = new Set(clicks.map(c => c.recipientEmail));
      
      // Add to overall unique emails
      clicks.forEach(c => uniqueEmails.add(c.recipientEmail));
      
      totalClicks += clicks.length;

      // Calculate CTR for this link
      const recipientCount = campaign.recipientCount || 1;
      const clickThroughRate = (linkUniqueEmails.size / recipientCount) * 100;

      linkStats.push({
        linkId: link.id,
        originalUrl: link.originalUrl,
        label: link.label,
        totalClicks: clicks.length,
        uniqueClicks: linkUniqueEmails.size,
        clickThroughRate: Math.round(clickThroughRate * 100) / 100,
      });
    }

    // Calculate overall CTR
    const recipientCount = campaign.recipientCount || 1;
    const overallClickThroughRate = (uniqueEmails.size / recipientCount) * 100;

    return {
      campaignId,
      totalLinks: links.length,
      totalClicks,
      uniqueClicks: uniqueEmails.size,
      overallClickThroughRate: Math.round(overallClickThroughRate * 100) / 100,
      linkStats: linkStats.sort((a, b) => b.totalClicks - a.totalClicks),
    };
  },

  /**
   * Checks if a click is a duplicate within the specified time window.
   * 
   * Used to prevent counting multiple clicks from the same recipient
   * on the same link within a short time period (e.g., double-clicks,
   * email client prefetching).
   * 
   * @param linkId - The tracking link ID
   * @param email - The recipient's email address
   * @param windowMinutes - Time window in minutes (default: 5)
   * @returns True if this is a duplicate click
   * 
   * @example
   * ```typescript
   * const isDupe = await LinkTrackingService.isDuplicateClick(
   *   'link123',
   *   'user@example.com',
   *   5 // 5 minute window
   * );
   * 
   * if (!isDupe) {
   *   await LinkTrackingService.recordClick(linkId, metadata);
   * }
   * ```
   * 
   * Requirements: 6.7
   */
  async isDuplicateClick(
    linkId: string,
    email: string,
    windowMinutes: number = DEFAULT_DEDUP_WINDOW_MINUTES
  ): Promise<boolean> {
    // Calculate the cutoff time
    const cutoffTime = new Date(Date.now() - windowMinutes * 60 * 1000);

    // Check for existing clicks within the window
    const existingClick = await db.query.linkClicks.findFirst({
      where: and(
        eq(linkClicks.linkId, linkId),
        eq(linkClicks.recipientEmail, email),
        gte(linkClicks.clickedAt, cutoffTime)
      ),
    });

    return !!existingClick;
  },

  /**
   * Gets a tracking link by ID.
   * 
   * @param linkId - The tracking link ID
   * @returns The campaign link or null if not found
   */
  async getLinkById(linkId: string): Promise<CampaignLink | null> {
    const link = await db.query.campaignLinks.findFirst({
      where: eq(campaignLinks.id, linkId),
    });

    return link || null;
  },

  /**
   * Generates a personalized tracking URL for a specific recipient.
   * 
   * This method creates a tracking URL that includes the recipient's email
   * and optionally the campaign message ID as query parameters. This allows
   * click tracking to be attributed to specific recipients.
   * 
   * @param linkId - The tracking link ID
   * @param baseUrl - Base URL for the tracking endpoint
   * @param recipientEmail - The recipient's email address
   * @param campaignMessageId - Optional campaign message ID for detailed tracking
   * @returns The personalized tracking URL
   * 
   * @example
   * ```typescript
   * const trackingUrl = LinkTrackingService.generateTrackingUrl(
   *   'link123',
   *   'https://myapp.com',
   *   'user@example.com',
   *   'msg456'
   * );
   * // Returns: 'https://myapp.com/track/link123?email=user%40example.com&mid=msg456'
   * ```
   * 
   * Requirements: 6.1, 6.2, 6.6
   */
  generateTrackingUrl(
    linkId: string,
    baseUrl: string,
    recipientEmail: string,
    campaignMessageId?: string
  ): string {
    // Build the base tracking URL
    const trackingUrl = new URL(`${baseUrl}/track/${linkId}`);
    
    // Add recipient email as query parameter
    trackingUrl.searchParams.set('email', recipientEmail);
    
    // Add campaign message ID if provided
    if (campaignMessageId) {
      trackingUrl.searchParams.set('mid', campaignMessageId);
    }
    
    return trackingUrl.toString();
  },

  /**
   * Personalizes tracking links in HTML content for a specific recipient.
   * 
   * This method takes HTML content that already has tracking links (created by
   * createTrackingLinks) and adds recipient-specific query parameters to each
   * tracking URL. This enables click attribution to individual recipients.
   * 
   * @param content - HTML content with tracking links
   * @param baseUrl - Base URL for the tracking endpoint
   * @param recipientEmail - The recipient's email address
   * @param campaignMessageId - Optional campaign message ID for detailed tracking
   * @returns HTML content with personalized tracking URLs
   * 
   * @example
   * ```typescript
   * const personalizedContent = LinkTrackingService.personalizeTrackingLinks(
   *   '<a href="https://myapp.com/track/abc123">Click here</a>',
   *   'https://myapp.com',
   *   'user@example.com',
   *   'msg456'
   * );
   * // Returns: '<a href="https://myapp.com/track/abc123?email=user%40example.com&mid=msg456">Click here</a>'
   * ```
   * 
   * Requirements: 6.1, 6.2, 6.6
   */
  personalizeTrackingLinks(
    content: string,
    baseUrl: string,
    recipientEmail: string,
    campaignMessageId?: string
  ): string {
    // Regex to find tracking links in the content
    // Matches: href="https://baseUrl/track/linkId" or href='https://baseUrl/track/linkId'
    const trackingLinkRegex = new RegExp(
      `href=["'](${this.escapeRegExp(baseUrl)}/track/[^"'?]+)["']`,
      'gi'
    );
    
    return content.replace(trackingLinkRegex, (match, trackingUrl) => {
      // Extract the link ID from the tracking URL
      const linkIdMatch = trackingUrl.match(/\/track\/([^?]+)$/);
      if (!linkIdMatch) {
        return match;
      }
      
      const linkId = linkIdMatch[1];
      const personalizedUrl = this.generateTrackingUrl(
        linkId,
        baseUrl,
        recipientEmail,
        campaignMessageId
      );
      
      // Preserve the quote style from the original
      const quoteChar = match.includes('"') ? '"' : "'";
      return `href=${quoteChar}${personalizedUrl}${quoteChar}`;
    });
  },

  /**
   * Escapes special regex characters in a string.
   * 
   * @param str - The string to escape
   * @returns The escaped string safe for use in a regex
   */
  escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  /**
   * Gets the redirect URL for a tracking link with UTM parameters injected.
   * 
   * This method retrieves the original URL from a tracking link and
   * appends any stored UTM parameters to create the final redirect URL.
   * Used by the tracking endpoint when redirecting users after recording clicks.
   * 
   * @param linkId - The tracking link ID
   * @returns The original URL with UTM parameters appended, or null if link not found
   * 
   * @example
   * ```typescript
   * const redirectUrl = await LinkTrackingService.getRedirectUrlWithUTM('link123');
   * // Returns: 'https://example.com/page?utm_source=email&utm_medium=campaign'
   * ```
   * 
   * Requirements: 6.5
   */
  async getRedirectUrlWithUTM(linkId: string): Promise<string | null> {
    const link = await this.getLinkById(linkId);
    
    if (!link) {
      return null;
    }

    // Check if any UTM parameters are set
    const hasAnyUTM = link.utmSource || link.utmMedium || link.utmCampaign || link.utmContent;
    
    // If no UTM parameters are set, return the original URL
    if (!hasAnyUTM) {
      return link.originalUrl;
    }

    // Build URL with UTM parameters
    return this.buildUrlWithUTM(link.originalUrl, {
      utmSource: link.utmSource ?? undefined,
      utmMedium: link.utmMedium ?? undefined,
      utmCampaign: link.utmCampaign ?? undefined,
      utmContent: link.utmContent ?? undefined,
    });
  },

  /**
   * Gets all tracking links for a campaign.
   * 
   * @param campaignId - The campaign ID
   * @returns Array of campaign links
   */
  async getLinksByCampaign(campaignId: string): Promise<CampaignLink[]> {
    return db.query.campaignLinks.findMany({
      where: eq(campaignLinks.campaignId, campaignId),
      orderBy: desc(campaignLinks.createdAt),
    });
  },

  /**
   * Gets recent clicks for a link.
   * 
   * @param linkId - The tracking link ID
   * @param limit - Maximum number of clicks to return (default: 100)
   * @returns Array of link clicks
   */
  async getRecentClicks(linkId: string, limit: number = 100): Promise<LinkClick[]> {
    return db.query.linkClicks.findMany({
      where: eq(linkClicks.linkId, linkId),
      orderBy: desc(linkClicks.clickedAt),
      limit,
    });
  },

  /**
   * Builds the final URL with UTM parameters.
   * 
   * @param originalUrl - The original URL
   * @param utmParams - UTM parameters to add
   * @returns URL with UTM parameters appended
   */
  buildUrlWithUTM(originalUrl: string, utmParams: UTMParams): string {
    try {
      const url = new URL(originalUrl);
      
      if (utmParams.utmSource) {
        url.searchParams.set('utm_source', utmParams.utmSource);
      }
      if (utmParams.utmMedium) {
        url.searchParams.set('utm_medium', utmParams.utmMedium);
      }
      if (utmParams.utmCampaign) {
        url.searchParams.set('utm_campaign', utmParams.utmCampaign);
      }
      if (utmParams.utmContent) {
        url.searchParams.set('utm_content', utmParams.utmContent);
      }
      
      return url.toString();
    } catch {
      // If URL parsing fails, return original
      return originalUrl;
    }
  },

  /**
   * Helper function to perform async string replacement.
   * 
   * @param str - The string to process
   * @param regex - The regex pattern to match
   * @param asyncFn - Async function to generate replacement
   * @returns The processed string
   */
  async replaceAsync(
    str: string,
    regex: RegExp,
    asyncFn: (match: string, ...args: string[]) => Promise<string>
  ): Promise<string> {
    const promises: Promise<string>[] = [];
    
    str.replace(regex, (match, ...args) => {
      promises.push(asyncFn(match, ...args));
      return match;
    });
    
    const replacements = await Promise.all(promises);
    let i = 0;
    
    return str.replace(regex, () => replacements[i++]);
  },

  /**
   * Extracts a label from a link's anchor tag.
   * 
   * Attempts to extract meaningful text from the link for reporting.
   * Falls back to null if no text can be extracted.
   * 
   * @param anchorTag - The full anchor tag HTML (including closing tag)
   * @returns Extracted label or null
   */
  extractLinkLabel(anchorTag: string): string | null {
    // Try to extract text content between > and </a>
    // Match the content after the opening tag's > and before </a>
    const textMatch = anchorTag.match(/>([^<]+)<\/a>/i);
    if (textMatch && textMatch[1]) {
      const text = textMatch[1].trim();
      if (text.length > 0) {
        // Limit label length
        return text.length > 100 ? text.substring(0, 100) + '...' : text;
      }
    }
    
    // Try to extract from title attribute
    const titleMatch = anchorTag.match(/title=["']([^"']+)["']/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }
    
    return null;
  },
};

export default LinkTrackingService;
