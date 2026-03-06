/**
 * @fileoverview Analytics Service - Event and campaign metrics
 * 
 * This service calculates analytics and metrics for events and campaigns.
 * It provides real-time statistics for dashboards and reporting.
 * 
 * @module lib/services/analytics-service
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { AnalyticsService } from '@/lib/services';
 * 
 * // Get event analytics
 * const analytics = await AnalyticsService.getEventAnalytics(eventId);
 * console.log(`RSVP rate: ${analytics.rsvpBreakdown.attending}/${analytics.totalInvited}`);
 * ```
 */

import { db } from '@/db';
import { events, eventGuests, campaigns, campaignMessages, automations, automationExecutions } from '@/db/schema';
import { eq, inArray, and } from 'drizzle-orm';

/**
 * Comprehensive analytics data for an event.
 * 
 * @property totalInvited - Count of guests added to the event
 * @property emailsSent - Count of campaign emails sent (not pending)
 * @property emailsDelivered - Count of emails confirmed delivered
 * @property rsvpBreakdown - Counts by RSVP status
 * @property checkInCount - Number of guests who checked in
 * @property checkInRate - Percentage of confirmed attendees who checked in
 * @property automationMetrics - Automation execution statistics
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.6
 */
export interface EventAnalytics {
  totalInvited: number;
  emailsSent: number;
  emailsDelivered: number;
  rsvpBreakdown: {
    attending: number;
    notAttending: number;
    pending: number;
  };
  checkInCount: number;
  checkInRate: number;
  automationMetrics: {
    totalAutomations: number;
    activeAutomations: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    successRate: number;
  };
}

/**
 * Campaign analytics data structure
 * Requirements: 8.2
 */
export interface CampaignAnalytics {
  campaignId: string;
  campaignName: string;
  channel: string;
  totalSent: number;
  delivered: number;
  deliveryRate: number;
  opened: number;
  openRate: number;
  clicked: number;
  clickThroughRate: number;
  bounced: number;
  bounceRate: number;
  unsubscribed: number;
  unsubscribeRate: number;
}

/**
 * AnalyticsService - Calculates metrics for events and campaigns.
 * 
 * Provides real-time analytics including:
 * - Guest invitation and RSVP statistics
 * - Email delivery metrics
 * - Check-in rates
 * - Automation execution success rates
 * 
 * @remarks
 * Analytics are calculated on-demand from the database. For high-traffic
 * events, consider caching these results.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.6
 */
export const AnalyticsService = {
  /**
   * Calculates comprehensive analytics for an event.
   * 
   * @param eventId - The event to analyze
   * @returns Complete analytics including RSVP, email, and automation metrics
   * @throws {Error} If event ID is missing or event not found
   * 
   * @example
   * ```typescript
   * const analytics = await AnalyticsService.getEventAnalytics('event123');
   * 
   * console.log(`Total invited: ${analytics.totalInvited}`);
   * console.log(`Attending: ${analytics.rsvpBreakdown.attending}`);
   * console.log(`Check-in rate: ${analytics.checkInRate.toFixed(1)}%`);
   * ```
   * 
   * Requirements: 8.1, 8.3, 8.6
   */
  async getEventAnalytics(eventId: string): Promise<EventAnalytics> {
    if (!eventId) {
      throw new Error('Event ID is required');
    }

    // Verify event exists
    const event = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });

    if (!event) {
      throw new Error('Event not found');
    }

    // Get all event guests for this event
    const eventGuestsList = await db.query.eventGuests.findMany({
      where: eq(eventGuests.eventId, eventId),
    });

    // Calculate totalInvited (count of EventGuest records)
    const totalInvited = eventGuestsList.length;

    // Calculate RSVP breakdown
    const rsvpBreakdown = {
      attending: eventGuestsList.filter(eg => eg.rsvpStatus === 'Attending').length,
      notAttending: eventGuestsList.filter(eg => eg.rsvpStatus === 'NotAttending').length,
      pending: eventGuestsList.filter(eg => eg.rsvpStatus === 'Pending').length,
    };

    // Calculate check-in count
    const checkInCount = eventGuestsList.filter(eg => eg.checkInStatus === 'CheckedIn').length;

    // Calculate check-in rate (percentage of confirmed attendees who checked in)
    // Requirements: 8.6 - checkInRate = (checkInCount / attending count) * 100
    const checkInRate = rsvpBreakdown.attending > 0
      ? (checkInCount / rsvpBreakdown.attending) * 100
      : 0;

    // Get all campaigns for this event
    const campaignsList = await db.query.campaigns.findMany({
      where: eq(campaigns.eventId, eventId),
      columns: { id: true },
    });

    const campaignIds = campaignsList.map(c => c.id);

    // Get campaign messages for email stats
    const campaignMessagesList = campaignIds.length > 0
      ? await db.query.campaignMessages.findMany({
          where: inArray(campaignMessages.campaignId, campaignIds),
        })
      : [];

    // Calculate emails sent (messages that have been sent - not Pending)
    const emailsSent = campaignMessagesList.filter(
      msg => msg.status !== 'Pending'
    ).length;

    // Calculate emails delivered
    const emailsDelivered = campaignMessagesList.filter(
      msg => msg.status === 'Delivered'
    ).length;

    return {
      totalInvited,
      emailsSent,
      emailsDelivered,
      rsvpBreakdown,
      checkInCount,
      checkInRate,
      automationMetrics: await this.getAutomationMetrics(eventId),
    };
  },

  /**
   * Get automation metrics for an event
   * Requirements: 8.6
   * 
   * Calculates:
   * - totalAutomations: count of automations for the event
   * - activeAutomations: count of automations with status 'Active'
   * - totalExecutions: count of all executions
   * - successfulExecutions: count of executions with status 'Success'
   * - failedExecutions: count of executions with status 'Failed'
   * - successRate: (successfulExecutions / totalExecutions) * 100
   */
  async getAutomationMetrics(eventId: string): Promise<EventAnalytics['automationMetrics']> {
    // Get all automations for this event
    const automationsList = await db.query.automations.findMany({
      where: eq(automations.eventId, eventId),
      columns: { id: true, status: true },
    });

    const totalAutomations = automationsList.length;
    const activeAutomations = automationsList.filter(a => a.status === 'Active').length;

    // Get automation IDs
    const automationIds = automationsList.map(a => a.id);

    // Get all executions for these automations
    const executionsList = automationIds.length > 0
      ? await db.query.automationExecutions.findMany({
          where: inArray(automationExecutions.automationId, automationIds),
          columns: { status: true },
        })
      : [];

    const totalExecutions = executionsList.length;
    const successfulExecutions = executionsList.filter(e => e.status === 'Success').length;
    const failedExecutions = executionsList.filter(e => e.status === 'Failed').length;
    const successRate = totalExecutions > 0
      ? (successfulExecutions / totalExecutions) * 100
      : 0;

    return {
      totalAutomations,
      activeAutomations,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      successRate,
    };
  },

  /**
   * Get analytics for a specific campaign
   * Requirements: 8.2
   * 
   * Calculates:
   * - totalSent: count of messages sent
   * - delivered: count of messages delivered
   * - deliveryRate: (delivered / totalSent) * 100
   */
  async getCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics> {
    if (!campaignId) {
      throw new Error('Campaign ID is required');
    }

    // Verify campaign exists
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get all messages for this campaign
    const messages = await db.query.campaignMessages.findMany({
      where: eq(campaignMessages.campaignId, campaignId),
    });

    // Calculate total sent (messages that have been sent - not Pending)
    const totalSent = messages.filter(
      msg => msg.status !== 'Pending'
    ).length;

    // Calculate delivered count
    const delivered = messages.filter(
      msg => msg.status === 'Delivered'
    ).length;

    // Calculate delivery rate
    const deliveryRate = totalSent > 0
      ? (delivered / totalSent) * 100
      : 0;

    // Use campaign-level counters for opens, clicks, bounces, unsubscribes
    // These are maintained by the tracking endpoints in real-time
    const opened = campaign.openedCount;
    const clicked = campaign.clickedCount;
    const bounced = campaign.bouncedCount;
    const unsubscribed = campaign.unsubscribedCount;

    const openRate = totalSent > 0 ? (opened / totalSent) * 100 : 0;
    const clickThroughRate = opened > 0 ? (clicked / opened) * 100 : 0;
    const bounceRate = totalSent > 0 ? (bounced / totalSent) * 100 : 0;
    const unsubscribeRate = totalSent > 0 ? (unsubscribed / totalSent) * 100 : 0;

    return {
      campaignId,
      campaignName: campaign.name,
      channel: campaign.channel,
      totalSent,
      delivered,
      deliveryRate,
      opened,
      openRate,
      clicked,
      clickThroughRate,
      bounced,
      bounceRate,
      unsubscribed,
      unsubscribeRate,
    };
  },
};

export default AnalyticsService;
