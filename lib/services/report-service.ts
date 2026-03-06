/**
 * @fileoverview Report Service - Campaign analytics and reporting
 * 
 * This service provides comprehensive campaign reporting functionality:
 * - Full campaign reports with all metrics
 * - Delivery metrics (sent, delivered, bounced, delivery rate)
 * - Engagement metrics (opens, clicks, open rate, CTR)
 * - Link performance statistics
 * - Recipient status with individual delivery and engagement data
 * - Export functionality (CSV/PDF)
 * 
 * @module lib/services/report-service
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { ReportService } from '@/lib/services';
 * 
 * // Get full campaign report
 * const report = await ReportService.getCampaignReport(campaignId);
 * 
 * // Export as CSV
 * const csv = await ReportService.exportReport(campaignId, 'csv');
 * ```
 * 
 * Requirements: 7
 */

import { db } from '@/db';
import {
  campaigns,
  campaignMessages,
  campaignLinks,
  linkClicks,
  emailOpens,
  unsubscribes,
  eventGuests,
} from '@/db/schema';
import { eq } from 'drizzle-orm';


// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Delivery metrics for a campaign
 */
export interface DeliveryMetrics {
  totalSent: number;
  delivered: number;
  bounced: number;
  hardBounces: number;
  softBounces: number;
  failed: number;
  pending: number;
  deliveryRate: number;
}

/**
 * Engagement metrics for a campaign
 */
export interface EngagementMetrics {
  totalOpens: number;
  uniqueOpens: number;
  openRate: number;
  totalClicks: number;
  uniqueClicks: number;
  clickThroughRate: number;
  clickToOpenRate: number;
  unsubscribes: number;
  unsubscribeRate: number;
}

/**
 * Link performance statistics
 */
export interface LinkPerformance {
  linkId: string;
  originalUrl: string;
  label: string | null;
  totalClicks: number;
  uniqueClicks: number;
  clickThroughRate: number;
}

/**
 * Recipient status with delivery and engagement data
 */
export interface RecipientStatus {
  eventGuestId: string;
  guestId: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string | null;
  messageStatus: 'Pending' | 'Sent' | 'Delivered' | 'Failed' | 'Bounced';
  sentAt: Date | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  bounceType: 'hard' | 'soft' | null;
  hasOpened: boolean;
  hasClicked: boolean;
}


/**
 * Filters for recipient status queries
 */
export interface RecipientFilters {
  status?: 'Pending' | 'Sent' | 'Delivered' | 'Failed' | 'Bounced';
  hasOpened?: boolean;
  hasClicked?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Paginated result for recipient status
 */
export interface PaginatedRecipientStatus {
  data: RecipientStatus[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Timeline data point for opens/clicks over time
 */
export interface TimelineDataPoint {
  timestamp: Date;
  opens: number;
  clicks: number;
}

/**
 * Full campaign report data
 */
export interface CampaignReport {
  campaignId: string;
  campaignName: string;
  campaignType: string;
  campaignStatus: string;
  eventId: string;
  eventName: string;
  sentAt: Date | null;
  recipientCount: number;
  delivery: DeliveryMetrics;
  engagement: EngagementMetrics;
  linkPerformance: LinkPerformance[];
  timeline: TimelineDataPoint[];
}

/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'pdf';


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Escapes a value for safe CSV formatting.
 */
function escapeCSVValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * Convert an array of objects to CSV string
 */
function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const headerLine = headers.map(escapeCSVValue).join(',');
  const dataLines = rows.map(row => row.map(escapeCSVValue).join(','));
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Format date for CSV export
 */
function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toISOString();
}

/**
 * Calculate percentage with rounding
 */
function calculatePercentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}


// ============================================================================
// REPORT SERVICE
// ============================================================================

/**
 * ReportService - Provides comprehensive campaign reporting and analytics.
 * 
 * Features:
 * - Full campaign reports with all metrics
 * - Delivery metrics (sent, delivered, bounced)
 * - Engagement metrics (opens, clicks, CTR)
 * - Link performance statistics
 * - Recipient-level status tracking
 * - CSV/PDF export functionality
 * 
 * Requirements: 7
 */
export const ReportService = {
  /**
   * Gets a full campaign report with all metrics.
   * 
   * @param campaignId - The campaign ID
   * @returns Complete campaign report data
   * @throws {Error} If campaign not found
   * 
   * Requirements: 7.1, 7.2
   */
  async getCampaignReport(campaignId: string): Promise<CampaignReport> {
    // Verify campaign exists and get details
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
      with: {
        event: {
          columns: { id: true, name: true },
        },
      },
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    // Get all metrics in parallel
    const [delivery, engagement, linkPerformance, timeline] = await Promise.all([
      this.getDeliveryMetrics(campaignId),
      this.getEngagementMetrics(campaignId),
      this.getLinkPerformance(campaignId),
      this.getTimeline(campaignId),
    ]);

    return {
      campaignId,
      campaignName: campaign.name,
      campaignType: campaign.type,
      campaignStatus: campaign.status,
      eventId: campaign.event.id,
      eventName: campaign.event.name,
      sentAt: campaign.sentAt,
      recipientCount: campaign.recipientCount,
      delivery,
      engagement,
      linkPerformance,
      timeline,
    };
  },


  /**
   * Gets delivery metrics for a campaign.
   * 
   * @param campaignId - The campaign ID
   * @returns Delivery metrics including sent, delivered, bounced, and rates
   * @throws {Error} If campaign not found
   * 
   * Requirements: 7.2
   */
  async getDeliveryMetrics(campaignId: string): Promise<DeliveryMetrics> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    // Get all messages for this campaign
    const messages = await db.query.campaignMessages.findMany({
      where: eq(campaignMessages.campaignId, campaignId),
    });

    // Count by status
    const pending = messages.filter(m => m.status === 'Pending').length;
    const sent = messages.filter(m => m.status === 'Sent').length;
    const delivered = messages.filter(m => m.status === 'Delivered').length;
    const failed = messages.filter(m => m.status === 'Failed').length;
    const bounced = messages.filter(m => m.status === 'Bounced').length;

    // Count bounce types
    const hardBounces = messages.filter(m => m.bounceType === 'hard').length;
    const softBounces = messages.filter(m => m.bounceType === 'soft').length;

    // Total sent = all non-pending messages
    const totalSent = sent + delivered + failed + bounced;

    // Delivery rate = delivered / totalSent
    const deliveryRate = calculatePercentage(delivered, totalSent);

    return {
      totalSent,
      delivered,
      bounced,
      hardBounces,
      softBounces,
      failed,
      pending,
      deliveryRate,
    };
  },


  /**
   * Gets engagement metrics for a campaign.
   * 
   * @param campaignId - The campaign ID
   * @returns Engagement metrics including opens, clicks, and rates
   * @throws {Error} If campaign not found
   * 
   * Requirements: 7.2
   */
  async getEngagementMetrics(campaignId: string): Promise<EngagementMetrics> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    // Get all messages for this campaign
    const messages = await db.query.campaignMessages.findMany({
      where: eq(campaignMessages.campaignId, campaignId),
    });

    const messageIds = messages.map(m => m.id);

    // Count total opens (all opens including duplicates)
    let totalOpens = 0;
    if (messageIds.length > 0) {
      for (const messageId of messageIds) {
        const opens = await db.query.emailOpens.findMany({
          where: eq(emailOpens.campaignMessageId, messageId),
        });
        totalOpens += opens.length;
      }
    }

    // Count unique opens (messages with openedAt set)
    const uniqueOpens = messages.filter(m => m.openedAt !== null).length;

    // Get all links for this campaign
    const links = await db.query.campaignLinks.findMany({
      where: eq(campaignLinks.campaignId, campaignId),
    });

    // Count total clicks and unique clicks
    let totalClicks = 0;
    const uniqueClickEmails = new Set<string>();

    for (const link of links) {
      const clicks = await db.query.linkClicks.findMany({
        where: eq(linkClicks.linkId, link.id),
      });
      totalClicks += clicks.length;
      clicks.forEach(c => uniqueClickEmails.add(c.recipientEmail));
    }

    const uniqueClicks = uniqueClickEmails.size;

    // Get unsubscribes for this campaign
    const campaignUnsubscribes = await db.query.unsubscribes.findMany({
      where: eq(unsubscribes.campaignId, campaignId),
    });

    const unsubscribeCount = campaignUnsubscribes.length;

    // Calculate rates
    const recipientCount = campaign.recipientCount || messages.length || 1;
    const openRate = calculatePercentage(uniqueOpens, recipientCount);
    const clickThroughRate = calculatePercentage(uniqueClicks, recipientCount);
    const clickToOpenRate = calculatePercentage(uniqueClicks, uniqueOpens);
    const unsubscribeRate = calculatePercentage(unsubscribeCount, recipientCount);

    return {
      totalOpens,
      uniqueOpens,
      openRate,
      totalClicks,
      uniqueClicks,
      clickThroughRate,
      clickToOpenRate,
      unsubscribes: unsubscribeCount,
      unsubscribeRate,
    };
  },


  /**
   * Gets link performance statistics for a campaign.
   * 
   * @param campaignId - The campaign ID
   * @returns Array of link performance data sorted by clicks
   * @throws {Error} If campaign not found
   * 
   * Requirements: 7.4
   */
  async getLinkPerformance(campaignId: string): Promise<LinkPerformance[]> {
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

    const recipientCount = campaign.recipientCount || 1;
    const linkStats: LinkPerformance[] = [];

    for (const link of links) {
      // Get all clicks for this link
      const clicks = await db.query.linkClicks.findMany({
        where: eq(linkClicks.linkId, link.id),
      });

      // Count unique clicks by email
      const uniqueEmails = new Set(clicks.map(c => c.recipientEmail));

      linkStats.push({
        linkId: link.id,
        originalUrl: link.originalUrl,
        label: link.label,
        totalClicks: clicks.length,
        uniqueClicks: uniqueEmails.size,
        clickThroughRate: calculatePercentage(uniqueEmails.size, recipientCount),
      });
    }

    // Sort by total clicks descending
    return linkStats.sort((a, b) => b.totalClicks - a.totalClicks);
  },


  /**
   * Gets recipient status with individual delivery and engagement data.
   * 
   * @param campaignId - The campaign ID
   * @param filters - Optional filters for status, engagement, and pagination
   * @returns Paginated recipient status data
   * @throws {Error} If campaign not found
   * 
   * Requirements: 7.5
   */
  async getRecipientStatus(
    campaignId: string,
    filters: RecipientFilters = {}
  ): Promise<PaginatedRecipientStatus> {
    const { page = 1, pageSize = 50, status, hasOpened, hasClicked, search } = filters;

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    // Get all messages for this campaign with event guest and guest info
    const messages = await db.query.campaignMessages.findMany({
      where: eq(campaignMessages.campaignId, campaignId),
    });

    // Get event guests for this campaign's event
    const eventGuestsList = await db.query.eventGuests.findMany({
      where: eq(eventGuests.eventId, campaign.eventId),
      with: {
        guest: true,
      },
    });

    // Create a map of eventGuestId to guest info
    const eventGuestMap = new Map(
      eventGuestsList.map(eg => [eg.id, eg])
    );

    // Build recipient status list
    let recipients: RecipientStatus[] = messages.map(msg => {
      const eventGuest = eventGuestMap.get(msg.eventGuestId);
      const guest = eventGuest?.guest;

      return {
        eventGuestId: msg.eventGuestId,
        guestId: guest?.id || '',
        email: guest?.email || '',
        firstName: guest?.firstName || '',
        lastName: guest?.lastName || '',
        company: guest?.company || null,
        messageStatus: msg.status,
        sentAt: msg.sentAt,
        deliveredAt: msg.deliveredAt,
        openedAt: msg.openedAt,
        clickedAt: msg.clickedAt,
        bounceType: msg.bounceType,
        hasOpened: msg.openedAt !== null,
        hasClicked: msg.clickedAt !== null,
      };
    });

    // Apply filters
    if (status) {
      recipients = recipients.filter(r => r.messageStatus === status);
    }

    if (hasOpened !== undefined) {
      recipients = recipients.filter(r => r.hasOpened === hasOpened);
    }

    if (hasClicked !== undefined) {
      recipients = recipients.filter(r => r.hasClicked === hasClicked);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      recipients = recipients.filter(r =>
        r.email.toLowerCase().includes(searchLower) ||
        r.firstName.toLowerCase().includes(searchLower) ||
        r.lastName.toLowerCase().includes(searchLower) ||
        (r.company && r.company.toLowerCase().includes(searchLower))
      );
    }

    // Paginate
    const total = recipients.length;
    const offset = (page - 1) * pageSize;
    const data = recipients.slice(offset, offset + pageSize);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },


  /**
   * Gets timeline data for opens and clicks over time.
   * 
   * @param campaignId - The campaign ID
   * @returns Array of timeline data points
   * @throws {Error} If campaign not found
   * 
   * Requirements: 7.3
   */
  async getTimeline(campaignId: string): Promise<TimelineDataPoint[]> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    // Get all messages for this campaign
    const messages = await db.query.campaignMessages.findMany({
      where: eq(campaignMessages.campaignId, campaignId),
    });

    const messageIds = messages.map(m => m.id);

    // Get all opens
    const allOpens: Date[] = [];
    for (const messageId of messageIds) {
      const opens = await db.query.emailOpens.findMany({
        where: eq(emailOpens.campaignMessageId, messageId),
      });
      opens.forEach(o => allOpens.push(o.openedAt));
    }

    // Get all links and clicks
    const links = await db.query.campaignLinks.findMany({
      where: eq(campaignLinks.campaignId, campaignId),
    });

    const allClicks: Date[] = [];
    for (const link of links) {
      const clicks = await db.query.linkClicks.findMany({
        where: eq(linkClicks.linkId, link.id),
      });
      clicks.forEach(c => allClicks.push(c.clickedAt));
    }

    // Group by hour
    const hourlyData = new Map<string, { opens: number; clicks: number }>();

    allOpens.forEach(date => {
      const hourKey = new Date(date).toISOString().slice(0, 13) + ':00:00.000Z';
      const existing = hourlyData.get(hourKey) || { opens: 0, clicks: 0 };
      existing.opens++;
      hourlyData.set(hourKey, existing);
    });

    allClicks.forEach(date => {
      const hourKey = new Date(date).toISOString().slice(0, 13) + ':00:00.000Z';
      const existing = hourlyData.get(hourKey) || { opens: 0, clicks: 0 };
      existing.clicks++;
      hourlyData.set(hourKey, existing);
    });

    // Convert to array and sort by timestamp
    const timeline: TimelineDataPoint[] = Array.from(hourlyData.entries())
      .map(([timestamp, data]) => ({
        timestamp: new Date(timestamp),
        opens: data.opens,
        clicks: data.clicks,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return timeline;
  },


  /**
   * Exports a campaign report in the specified format.
   * 
   * @param campaignId - The campaign ID
   * @param format - Export format ('csv' or 'pdf')
   * @returns Export data as string (CSV) or base64 (PDF)
   * @throws {Error} If campaign not found or unsupported format
   * 
   * Requirements: 7.6
   */
  async exportReport(campaignId: string, format: ExportFormat): Promise<string> {
    if (format === 'csv') {
      return this.exportReportAsCSV(campaignId);
    } else if (format === 'pdf') {
      return this.exportReportAsPDF(campaignId);
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }
  },

  /**
   * Exports campaign report as CSV.
   * 
   * @param campaignId - The campaign ID
   * @returns CSV string with report data
   */
  async exportReportAsCSV(campaignId: string): Promise<string> {
    const report = await this.getCampaignReport(campaignId);
    const recipients = await this.getRecipientStatus(campaignId, { pageSize: 100000 });

    // Build CSV sections
    const sections: string[] = [];

    // Campaign Summary Section
    sections.push('CAMPAIGN SUMMARY');
    sections.push(toCSV(
      ['Metric', 'Value'],
      [
        ['Campaign Name', report.campaignName],
        ['Campaign Type', report.campaignType],
        ['Status', report.campaignStatus],
        ['Event', report.eventName],
        ['Sent At', formatDate(report.sentAt)],
        ['Total Recipients', report.recipientCount],
      ]
    ));

    sections.push('');

    // Delivery Metrics Section
    sections.push('DELIVERY METRICS');
    sections.push(toCSV(
      ['Metric', 'Value'],
      [
        ['Total Sent', report.delivery.totalSent],
        ['Delivered', report.delivery.delivered],
        ['Bounced', report.delivery.bounced],
        ['Hard Bounces', report.delivery.hardBounces],
        ['Soft Bounces', report.delivery.softBounces],
        ['Failed', report.delivery.failed],
        ['Pending', report.delivery.pending],
        ['Delivery Rate (%)', report.delivery.deliveryRate],
      ]
    ));

    sections.push('');

    // Engagement Metrics Section
    sections.push('ENGAGEMENT METRICS');
    sections.push(toCSV(
      ['Metric', 'Value'],
      [
        ['Total Opens', report.engagement.totalOpens],
        ['Unique Opens', report.engagement.uniqueOpens],
        ['Open Rate (%)', report.engagement.openRate],
        ['Total Clicks', report.engagement.totalClicks],
        ['Unique Clicks', report.engagement.uniqueClicks],
        ['Click-Through Rate (%)', report.engagement.clickThroughRate],
        ['Click-to-Open Rate (%)', report.engagement.clickToOpenRate],
        ['Unsubscribes', report.engagement.unsubscribes],
        ['Unsubscribe Rate (%)', report.engagement.unsubscribeRate],
      ]
    ));

    sections.push('');

    // Link Performance Section
    if (report.linkPerformance.length > 0) {
      sections.push('LINK PERFORMANCE');
      sections.push(toCSV(
        ['URL', 'Label', 'Total Clicks', 'Unique Clicks', 'CTR (%)'],
        report.linkPerformance.map(link => [
          link.originalUrl,
          link.label,
          link.totalClicks,
          link.uniqueClicks,
          link.clickThroughRate,
        ])
      ));
      sections.push('');
    }

    // Recipient Details Section
    sections.push('RECIPIENT DETAILS');
    sections.push(toCSV(
      ['Email', 'First Name', 'Last Name', 'Company', 'Status', 'Sent At', 'Delivered At', 'Opened At', 'Clicked At', 'Bounce Type'],
      recipients.data.map(r => [
        r.email,
        r.firstName,
        r.lastName,
        r.company,
        r.messageStatus,
        formatDate(r.sentAt),
        formatDate(r.deliveredAt),
        formatDate(r.openedAt),
        formatDate(r.clickedAt),
        r.bounceType,
      ])
    ));

    return sections.join('\n');
  },


  /**
   * Exports campaign report as PDF.
   * 
   * Note: This returns a placeholder implementation. For full PDF generation,
   * integrate with a PDF library like react-pdf, pdfkit, or puppeteer.
   * 
   * @param campaignId - The campaign ID
   * @returns PDF data as base64 string (placeholder)
   */
  async exportReportAsPDF(campaignId: string): Promise<string> {
    // Get report data
    const report = await this.getCampaignReport(campaignId);

    // For now, return a simple text representation
    // In production, use a PDF library like react-pdf, pdfkit, or puppeteer
    const pdfContent = `
Campaign Report: ${report.campaignName}
========================================

Campaign Details
----------------
Type: ${report.campaignType}
Status: ${report.campaignStatus}
Event: ${report.eventName}
Sent At: ${report.sentAt ? report.sentAt.toISOString() : 'Not sent'}
Recipients: ${report.recipientCount}

Delivery Metrics
----------------
Total Sent: ${report.delivery.totalSent}
Delivered: ${report.delivery.delivered}
Bounced: ${report.delivery.bounced}
Delivery Rate: ${report.delivery.deliveryRate}%

Engagement Metrics
------------------
Unique Opens: ${report.engagement.uniqueOpens}
Open Rate: ${report.engagement.openRate}%
Unique Clicks: ${report.engagement.uniqueClicks}
Click-Through Rate: ${report.engagement.clickThroughRate}%
Click-to-Open Rate: ${report.engagement.clickToOpenRate}%
Unsubscribes: ${report.engagement.unsubscribes}

Link Performance
----------------
${report.linkPerformance.map(link => 
  `${link.label || link.originalUrl}: ${link.totalClicks} clicks (${link.clickThroughRate}% CTR)`
).join('\n')}
    `.trim();

    // Return as base64 encoded text (placeholder for actual PDF)
    return Buffer.from(pdfContent).toString('base64');
  },

  /**
   * Gets a summary of campaign performance for comparison.
   * 
   * @param campaignId - The campaign ID
   * @returns Summary metrics for quick comparison
   */
  async getCampaignSummary(campaignId: string): Promise<{
    campaignId: string;
    name: string;
    status: string;
    recipientCount: number;
    deliveryRate: number;
    openRate: number;
    clickThroughRate: number;
  }> {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found`);
    }

    const [delivery, engagement] = await Promise.all([
      this.getDeliveryMetrics(campaignId),
      this.getEngagementMetrics(campaignId),
    ]);

    return {
      campaignId,
      name: campaign.name,
      status: campaign.status,
      recipientCount: campaign.recipientCount,
      deliveryRate: delivery.deliveryRate,
      openRate: engagement.openRate,
      clickThroughRate: engagement.clickThroughRate,
    };
  },
};

export default ReportService;
