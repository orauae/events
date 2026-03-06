/**
 * @fileoverview Statistics Service - Event statistics for dashboards and presentation mode
 * 
 * This service calculates statistics for events, dashboards, and presentation mode.
 * It provides real-time statistics for event managers and admins.
 * 
 * @module lib/services/statistics-service
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { StatisticsService } from '@/lib/services';
 * 
 * // Get event statistics
 * const stats = await StatisticsService.getEventStats(eventId);
 * console.log(`Total guests: ${stats.totalGuests}`);
 * 
 * // Get presentation mode stats
 * const presentationStats = await StatisticsService.getPresentationStats(eventId);
 * ```
 * 
 * Requirements: 6.2, 6.3, 7.5
 */

import { db } from '@/db';
import { events, eventGuests, eventAssignments } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Statistics for a single event.
 * 
 * @property totalGuests - Count of guests added to the event
 * @property rsvpBreakdown - Counts by RSVP status
 * @property checkInCount - Number of guests who checked in
 * @property checkInPercentage - Percentage of attending guests who checked in
 * 
 * Requirements: 6.3, 7.5
 */
export interface EventStats {
  totalGuests: number;
  rsvpBreakdown: {
    attending: number;
    notAttending: number;
    pending: number;
  };
  checkInCount: number;
  checkInPercentage: number;
}

/**
 * Aggregated statistics for dashboard display.
 * 
 * @property totalGuests - Total guests across all assigned events
 * @property totalEvents - Number of events
 * @property upcomingEvents - Number of events with start date in the future
 * @property pendingRsvps - Total pending RSVPs across all events
 * @property totalAttending - Total confirmed attendees across all events
 * @property totalCheckedIn - Total checked-in guests across all events
 * 
 * Requirements: 6.2
 */
export interface DashboardStats {
  totalGuests: number;
  totalEvents: number;
  upcomingEvents: number;
  pendingRsvps: number;
  totalAttending: number;
  totalCheckedIn: number;
}

/**
 * Statistics formatted for presentation mode display.
 * 
 * @property eventName - Name of the event
 * @property totalGuests - Total guests for the event
 * @property rsvpBreakdown - Counts by RSVP status
 * @property checkInStats - Check-in count and percentage
 * @property lastUpdated - Timestamp of when stats were calculated
 * 
 * Requirements: 7.5
 */
export interface PresentationStats {
  eventName: string;
  totalGuests: number;
  rsvpBreakdown: {
    attending: number;
    notAttending: number;
    pending: number;
  };
  checkInStats: {
    checkedIn: number;
    notCheckedIn: number;
    percentage: number;
  };
  lastUpdated: Date;
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * StatisticsService - Calculates statistics for events and dashboards.
 * 
 * Provides real-time statistics including:
 * - Guest counts and RSVP breakdowns
 * - Check-in rates
 * - Aggregated dashboard metrics
 * - Presentation mode formatted stats
 * 
 * Requirements: 6.2, 6.3, 7.5
 */
export const StatisticsService = {
  /**
   * Calculates statistics for a single event.
   * 
   * @param eventId - The event to calculate stats for
   * @returns Event statistics including guest count, RSVP breakdown, and check-in stats
   * @throws {Error} If event ID is missing or event not found
   * 
   * @example
   * ```typescript
   * const stats = await StatisticsService.getEventStats('event123');
   * console.log(`Total guests: ${stats.totalGuests}`);
   * console.log(`Attending: ${stats.rsvpBreakdown.attending}`);
   * console.log(`Check-in rate: ${stats.checkInPercentage}%`);
   * ```
   * 
   * Requirements: 6.3
   */
  async getEventStats(eventId: string): Promise<EventStats> {
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

    // Calculate total guests
    const totalGuests = eventGuestsList.length;

    // Calculate RSVP breakdown
    const rsvpBreakdown = {
      attending: eventGuestsList.filter(eg => eg.rsvpStatus === 'Attending').length,
      notAttending: eventGuestsList.filter(eg => eg.rsvpStatus === 'NotAttending').length,
      pending: eventGuestsList.filter(eg => eg.rsvpStatus === 'Pending').length,
    };

    // Calculate check-in count
    const checkInCount = eventGuestsList.filter(eg => eg.checkInStatus === 'CheckedIn').length;

    // Calculate check-in percentage (percentage of attending guests who checked in)
    // Requirements: 7.5 - checkInPercentage = (checkInCount / attending count) * 100
    const checkInPercentage = rsvpBreakdown.attending > 0
      ? (checkInCount / rsvpBreakdown.attending) * 100
      : 0;

    return {
      totalGuests,
      rsvpBreakdown,
      checkInCount,
      checkInPercentage,
    };
  },

  /**
   * Calculates aggregated statistics for dashboard display.
   * 
   * @param eventIds - Array of event IDs to aggregate stats for
   * @returns Aggregated dashboard statistics
   * 
   * @example
   * ```typescript
   * const stats = await StatisticsService.getDashboardStats(['event1', 'event2']);
   * console.log(`Total guests: ${stats.totalGuests}`);
   * console.log(`Upcoming events: ${stats.upcomingEvents}`);
   * ```
   * 
   * Requirements: 6.2
   */
  async getDashboardStats(eventIds: string[]): Promise<DashboardStats> {
    if (eventIds.length === 0) {
      return {
        totalGuests: 0,
        totalEvents: 0,
        upcomingEvents: 0,
        pendingRsvps: 0,
        totalAttending: 0,
        totalCheckedIn: 0,
      };
    }

    // Get all events
    const eventsList = await db.query.events.findMany({
      where: inArray(events.id, eventIds),
    });

    const totalEvents = eventsList.length;

    // Calculate upcoming events (start date in the future)
    const now = new Date();
    const upcomingEvents = eventsList.filter(e => e.startDate > now).length;

    // Get all event guests for these events
    const eventGuestsList = await db.query.eventGuests.findMany({
      where: inArray(eventGuests.eventId, eventIds),
    });

    // Calculate totals
    const totalGuests = eventGuestsList.length;
    const pendingRsvps = eventGuestsList.filter(eg => eg.rsvpStatus === 'Pending').length;
    const totalAttending = eventGuestsList.filter(eg => eg.rsvpStatus === 'Attending').length;
    const totalCheckedIn = eventGuestsList.filter(eg => eg.checkInStatus === 'CheckedIn').length;

    return {
      totalGuests,
      totalEvents,
      upcomingEvents,
      pendingRsvps,
      totalAttending,
      totalCheckedIn,
    };
  },

  /**
   * Calculates statistics formatted for presentation mode.
   * 
   * @param eventId - The event to get presentation stats for
   * @returns Presentation-formatted statistics with event name and timestamp
   * @throws {Error} If event ID is missing or event not found
   * 
   * @example
   * ```typescript
   * const stats = await StatisticsService.getPresentationStats('event123');
   * console.log(`Event: ${stats.eventName}`);
   * console.log(`Check-in: ${stats.checkInStats.percentage}%`);
   * ```
   * 
   * Requirements: 7.5
   */
  async getPresentationStats(eventId: string): Promise<PresentationStats> {
    if (!eventId) {
      throw new Error('Event ID is required');
    }

    // Verify event exists and get name
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

    // Calculate total guests
    const totalGuests = eventGuestsList.length;

    // Calculate RSVP breakdown
    const rsvpBreakdown = {
      attending: eventGuestsList.filter(eg => eg.rsvpStatus === 'Attending').length,
      notAttending: eventGuestsList.filter(eg => eg.rsvpStatus === 'NotAttending').length,
      pending: eventGuestsList.filter(eg => eg.rsvpStatus === 'Pending').length,
    };

    // Calculate check-in stats
    const checkedIn = eventGuestsList.filter(eg => eg.checkInStatus === 'CheckedIn').length;
    const notCheckedIn = rsvpBreakdown.attending - checkedIn;

    // Calculate check-in percentage (percentage of attending guests who checked in)
    const percentage = rsvpBreakdown.attending > 0
      ? (checkedIn / rsvpBreakdown.attending) * 100
      : 0;

    return {
      eventName: event.name,
      totalGuests,
      rsvpBreakdown,
      checkInStats: {
        checkedIn,
        notCheckedIn: Math.max(0, notCheckedIn), // Ensure non-negative
        percentage,
      },
      lastUpdated: new Date(),
    };
  },

  /**
   * Gets dashboard stats for a specific user based on their assigned events.
   * 
   * @param userId - The user ID to get dashboard stats for
   * @returns Aggregated dashboard statistics for the user's assigned events
   * 
   * @example
   * ```typescript
   * const stats = await StatisticsService.getDashboardStatsForUser('user123');
   * console.log(`Total events: ${stats.totalEvents}`);
   * ```
   * 
   * Requirements: 6.2
   */
  async getDashboardStatsForUser(userId: string): Promise<DashboardStats> {
    if (!userId) {
      return {
        totalGuests: 0,
        totalEvents: 0,
        upcomingEvents: 0,
        pendingRsvps: 0,
        totalAttending: 0,
        totalCheckedIn: 0,
      };
    }

    // Get all event assignments for this user
    const assignments = await db.query.eventAssignments.findMany({
      where: eq(eventAssignments.assignedUserId, userId),
      columns: { eventId: true },
    });

    const eventIds = assignments.map(a => a.eventId);

    return this.getDashboardStats(eventIds);
  },

  /**
   * Gets admin dashboard stats - all campaigns, events, and email metrics.
   * Admin sees everything across the entire system.
   * 
   * @returns Admin dashboard statistics including campaigns and email metrics
   * 
   * Requirements: Admin Dashboard
   */
  async getAdminDashboardStats(): Promise<AdminDashboardStats> {
    // Import here to avoid circular dependencies
    const { campaigns, campaignMessages, events: eventsTable, eventGuests: eventGuestsTable } = await import('@/db/schema');
    
    // Get all campaigns
    const allCampaigns = await db.query.campaigns.findMany({
      orderBy: (campaigns, { desc }) => [desc(campaigns.createdAt)],
    });
    
    // Count campaigns by status
    const campaignStats = {
      total: allCampaigns.length,
      draft: allCampaigns.filter(c => c.status === 'Draft').length,
      scheduled: allCampaigns.filter(c => c.status === 'Scheduled').length,
      sending: allCampaigns.filter(c => c.status === 'Sending').length,
      sent: allCampaigns.filter(c => c.status === 'Sent').length,
      paused: allCampaigns.filter(c => c.status === 'Paused').length,
    };
    
    // Calculate email metrics from all campaigns
    const emailStats = {
      totalSent: allCampaigns.reduce((sum, c) => sum + (c.sentCount || 0), 0),
      delivered: allCampaigns.reduce((sum, c) => sum + (c.deliveredCount || 0), 0),
      opened: allCampaigns.reduce((sum, c) => sum + (c.openedCount || 0), 0),
      clicked: allCampaigns.reduce((sum, c) => sum + (c.clickedCount || 0), 0),
      bounced: allCampaigns.reduce((sum, c) => sum + (c.bouncedCount || 0), 0),
      openRate: 0,
      clickRate: 0,
    };
    
    // Calculate rates
    if (emailStats.delivered > 0) {
      emailStats.openRate = (emailStats.opened / emailStats.delivered) * 100;
      emailStats.clickRate = (emailStats.clicked / emailStats.delivered) * 100;
    }
    
    // Get template count (we'll count unique designJson values for now)
    // For now, just use a placeholder - templates may be stored differently
    const templateCount = 0; // TODO: Count from email_templates table if it exists
    
    // Get recent campaigns (last 5 sent campaigns)
    const recentCampaigns = allCampaigns
      .filter(c => c.status === 'Sent' || c.sentAt)
      .slice(0, 5)
      .map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        sentAt: c.sentAt?.toISOString() || null,
        openRate: c.deliveredCount > 0 ? (c.openedCount / c.deliveredCount) * 100 : 0,
      }));
    
    // Get all events count
    const allEvents = await db.query.events.findMany();
    const allEventGuests = await db.query.eventGuests.findMany();
    
    return {
      campaigns: campaignStats,
      emails: emailStats,
      templates: {
        total: templateCount,
      },
      recentCampaigns,
      events: {
        total: allEvents.length,
        upcoming: allEvents.filter(e => e.startDate > new Date()).length,
      },
      guests: {
        total: allEventGuests.length,
        attending: allEventGuests.filter(eg => eg.rsvpStatus === 'Attending').length,
        pending: allEventGuests.filter(eg => eg.rsvpStatus === 'Pending').length,
        checkedIn: allEventGuests.filter(eg => eg.checkInStatus === 'CheckedIn').length,
      },
    };
  },
};

/**
 * Admin dashboard statistics interface
 */
export interface AdminDashboardStats {
  campaigns: {
    total: number;
    draft: number;
    scheduled: number;
    sending: number;
    sent: number;
    paused: number;
  };
  emails: {
    totalSent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    openRate: number;
    clickRate: number;
  };
  templates: {
    total: number;
  };
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    sentAt: string | null;
    openRate: number;
  }>;
  events: {
    total: number;
    upcoming: number;
  };
  guests: {
    total: number;
    attending: number;
    pending: number;
    checkedIn: number;
  };
}

export default StatisticsService;
