/**
 * @fileoverview Statistics Service Property Tests
 * 
 * Tests for the Statistics Service.
 * Tests verify that computed statistics match actual counts derived
 * from guest records.
 * 
 * Feature: event-manager-roles
 */

import { describe, expect, afterAll, it } from 'vitest';
import { db } from '@/db';
import { 
  events,
  guests,
  eventGuests,
} from '@/db/schema';
import { StatisticsService } from '../services/statistics-service';
import { createId } from '@paralleldrive/cuid2';
import { like, inArray } from 'drizzle-orm';

// Test prefix to identify test data for cleanup
const TEST_PREFIX = 'stats-svc-test-';

/**
 * Feature: event-manager-roles, Property 17: Statistics Accuracy
 * 
 * For any event, the computed statistics (guest count, RSVP breakdown,
 * check-in count, check-in percentage) SHALL match the actual counts
 * derived from the event's guest records.
 * 
 * Validates: Requirements 6.2, 6.3, 7.5
 */
describe('Property 17: Statistics Accuracy', () => {
  // Clean up all test data after all tests complete
  afterAll(async () => {
    // Find all test events by name pattern
    const testEvents = await db.query.events.findMany({
      where: like(events.name, `${TEST_PREFIX}%`),
      columns: { id: true },
    });
    
    if (testEvents.length > 0) {
      const eventIds = testEvents.map(e => e.id);
      await db.delete(eventGuests).where(inArray(eventGuests.eventId, eventIds));
      await db.delete(events).where(inArray(events.id, eventIds));
    }
    
    // Find all test guests by email pattern
    const testGuests = await db.query.guests.findMany({
      where: like(guests.email, `${TEST_PREFIX}%`),
      columns: { id: true },
    });
    
    if (testGuests.length > 0) {
      const guestIds = testGuests.map(g => g.id);
      await db.delete(guests).where(inArray(guests.id, guestIds));
    }
  });

  it('getEventStats returns accurate counts matching actual guest records', async () => {
    const iterationId = createId();
    
    // Define guest configurations
    const guestConfigs = [
      { rsvpStatus: 'Attending' as const, checkInStatus: 'CheckedIn' as const },
      { rsvpStatus: 'Attending' as const, checkInStatus: 'NotCheckedIn' as const },
      { rsvpStatus: 'Pending' as const, checkInStatus: 'NotCheckedIn' as const },
      { rsvpStatus: 'NotAttending' as const, checkInStatus: 'NotCheckedIn' as const },
      { rsvpStatus: 'Pending' as const, checkInStatus: 'NotCheckedIn' as const },
    ];
    
    // Create test event
    const eventId = createId();
    await db.insert(events).values({
      id: eventId,
      name: `${TEST_PREFIX}event-${iterationId}`,
      type: 'Conference',
      description: 'Test event for statistics',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    });

    // Create guests and event guests with specified configurations
    for (let i = 0; i < guestConfigs.length; i++) {
      const config = guestConfigs[i];
      const guestId = createId();
      
      await db.insert(guests).values({
        id: guestId,
        firstName: `Guest${i}`,
        lastName: 'Test',
        email: `${TEST_PREFIX}guest-${iterationId}-${i}@test.com`,
      });

      await db.insert(eventGuests).values({
        eventId,
        guestId,
        rsvpStatus: config.rsvpStatus,
        checkInStatus: config.checkInStatus,
        checkInTime: config.checkInStatus === 'CheckedIn' ? new Date() : null,
      });
    }

    // Calculate expected values from input
    const expectedTotalGuests = guestConfigs.length;
    const expectedAttending = guestConfigs.filter(g => g.rsvpStatus === 'Attending').length;
    const expectedNotAttending = guestConfigs.filter(g => g.rsvpStatus === 'NotAttending').length;
    const expectedPending = guestConfigs.filter(g => g.rsvpStatus === 'Pending').length;
    const expectedCheckInCount = guestConfigs.filter(g => g.checkInStatus === 'CheckedIn').length;
    const expectedCheckInPercentage = expectedAttending > 0
      ? (expectedCheckInCount / expectedAttending) * 100
      : 0;

    // Get statistics from service
    const stats = await StatisticsService.getEventStats(eventId);

    // Verify all statistics match expected values
    expect(stats.totalGuests).toBe(expectedTotalGuests);
    expect(stats.rsvpBreakdown.attending).toBe(expectedAttending);
    expect(stats.rsvpBreakdown.notAttending).toBe(expectedNotAttending);
    expect(stats.rsvpBreakdown.pending).toBe(expectedPending);
    expect(stats.checkInCount).toBe(expectedCheckInCount);
    expect(stats.checkInPercentage).toBeCloseTo(expectedCheckInPercentage, 5);
  });

  it('getPresentationStats returns accurate counts matching actual guest records', async () => {
    const iterationId = createId();
    const eventName = `${TEST_PREFIX}pres-event-${iterationId}`;
    
    // Define guest configurations
    const guestConfigs = [
      { rsvpStatus: 'Attending' as const, checkInStatus: 'CheckedIn' as const },
      { rsvpStatus: 'Attending' as const, checkInStatus: 'NotCheckedIn' as const },
      { rsvpStatus: 'Pending' as const, checkInStatus: 'NotCheckedIn' as const },
      { rsvpStatus: 'Pending' as const, checkInStatus: 'NotCheckedIn' as const },
    ];
    
    // Create test event
    const eventId = createId();
    await db.insert(events).values({
      id: eventId,
      name: eventName,
      type: 'Conference',
      description: 'Test event for presentation stats',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    });

    // Create guests and event guests with specified configurations
    for (let i = 0; i < guestConfigs.length; i++) {
      const config = guestConfigs[i];
      const guestId = createId();
      
      await db.insert(guests).values({
        id: guestId,
        firstName: `Guest${i}`,
        lastName: 'Test',
        email: `${TEST_PREFIX}pres-guest-${iterationId}-${i}@test.com`,
      });

      await db.insert(eventGuests).values({
        eventId,
        guestId,
        rsvpStatus: config.rsvpStatus,
        checkInStatus: config.checkInStatus,
        checkInTime: config.checkInStatus === 'CheckedIn' ? new Date() : null,
      });
    }

    // Calculate expected values from input
    const expectedTotalGuests = guestConfigs.length;
    const expectedAttending = guestConfigs.filter(g => g.rsvpStatus === 'Attending').length;
    const expectedNotAttending = guestConfigs.filter(g => g.rsvpStatus === 'NotAttending').length;
    const expectedPending = guestConfigs.filter(g => g.rsvpStatus === 'Pending').length;
    const expectedCheckedIn = guestConfigs.filter(g => g.checkInStatus === 'CheckedIn').length;
    const expectedNotCheckedIn = Math.max(0, expectedAttending - expectedCheckedIn);
    const expectedPercentage = expectedAttending > 0
      ? (expectedCheckedIn / expectedAttending) * 100
      : 0;

    // Get presentation statistics from service
    const stats = await StatisticsService.getPresentationStats(eventId);

    // Verify all statistics match expected values
    expect(stats.eventName).toBe(eventName);
    expect(stats.totalGuests).toBe(expectedTotalGuests);
    expect(stats.rsvpBreakdown.attending).toBe(expectedAttending);
    expect(stats.rsvpBreakdown.notAttending).toBe(expectedNotAttending);
    expect(stats.rsvpBreakdown.pending).toBe(expectedPending);
    expect(stats.checkInStats.checkedIn).toBe(expectedCheckedIn);
    expect(stats.checkInStats.notCheckedIn).toBe(expectedNotCheckedIn);
    expect(stats.checkInStats.percentage).toBeCloseTo(expectedPercentage, 5);
    expect(stats.lastUpdated).toBeInstanceOf(Date);
  });

  it('getDashboardStats returns accurate aggregated counts across multiple events', async () => {
    const iterationId = createId();
    const eventIds: string[] = [];
    
    // Define event configurations
    const eventConfigs = [
      { guestCount: 3, isUpcoming: true, attendingCount: 2, pendingCount: 1 },
      { guestCount: 2, isUpcoming: false, attendingCount: 1, pendingCount: 0 },
    ];
    
    // Track expected totals
    let expectedTotalGuests = 0;
    let expectedUpcomingEvents = 0;
    let expectedPendingRsvps = 0;
    let expectedTotalAttending = 0;
    let expectedTotalCheckedIn = 0;

    // Create events and guests
    for (let e = 0; e < eventConfigs.length; e++) {
      const config = eventConfigs[e];
      const eventId = createId();
      eventIds.push(eventId);

      // Set start date based on isUpcoming
      const startDate = config.isUpcoming 
        ? new Date('2027-06-01') // Future date
        : new Date('2024-06-01'); // Past date

      await db.insert(events).values({
        id: eventId,
        name: `${TEST_PREFIX}dash-event-${iterationId}-${e}`,
        type: 'Conference',
        description: 'Test event for dashboard stats',
        startDate,
        endDate: new Date(startDate.getTime() + 86400000), // +1 day
        location: 'Test Location',
        hostName: 'Test Host',
        hostEmail: 'host@test.com',
      });

      if (config.isUpcoming) {
        expectedUpcomingEvents++;
      }

      // Create guests for this event
      const totalGuestsForEvent = config.guestCount;
      const attendingCount = config.attendingCount;
      const pendingCount = config.pendingCount;
      
      expectedTotalGuests += totalGuestsForEvent;
      expectedTotalAttending += attendingCount;
      expectedPendingRsvps += pendingCount;

      for (let g = 0; g < totalGuestsForEvent; g++) {
        const guestId = createId();
        
        await db.insert(guests).values({
          id: guestId,
          firstName: `Guest${g}`,
          lastName: 'Test',
          email: `${TEST_PREFIX}dash-guest-${iterationId}-${e}-${g}@test.com`,
        });

        // Determine RSVP status
        let rsvpStatus: 'Attending' | 'Pending' = 'Pending';
        if (g < attendingCount) {
          rsvpStatus = 'Attending';
        } else if (g < attendingCount + pendingCount) {
          rsvpStatus = 'Pending';
        }

        // Check in some attending guests (half of them)
        const isCheckedIn = rsvpStatus === 'Attending' && g % 2 === 0;
        if (isCheckedIn) {
          expectedTotalCheckedIn++;
        }

        await db.insert(eventGuests).values({
          eventId,
          guestId,
          rsvpStatus,
          checkInStatus: isCheckedIn ? 'CheckedIn' : 'NotCheckedIn',
          checkInTime: isCheckedIn ? new Date() : null,
        });
      }
    }

    // Get dashboard statistics from service
    const stats = await StatisticsService.getDashboardStats(eventIds);

    // Verify all statistics match expected values
    expect(stats.totalEvents).toBe(eventConfigs.length);
    expect(stats.totalGuests).toBe(expectedTotalGuests);
    expect(stats.upcomingEvents).toBe(expectedUpcomingEvents);
    expect(stats.pendingRsvps).toBe(expectedPendingRsvps);
    expect(stats.totalAttending).toBe(expectedTotalAttending);
    expect(stats.totalCheckedIn).toBe(expectedTotalCheckedIn);
  });

  it('getDashboardStats returns zeros for empty event list', async () => {
    const stats = await StatisticsService.getDashboardStats([]);

    expect(stats.totalEvents).toBe(0);
    expect(stats.totalGuests).toBe(0);
    expect(stats.upcomingEvents).toBe(0);
    expect(stats.pendingRsvps).toBe(0);
    expect(stats.totalAttending).toBe(0);
    expect(stats.totalCheckedIn).toBe(0);
  });

  it('getEventStats throws error for non-existent event', async () => {
    await expect(
      StatisticsService.getEventStats('non-existent-event-id')
    ).rejects.toThrow('Event not found');
  });

  it('getPresentationStats throws error for non-existent event', async () => {
    await expect(
      StatisticsService.getPresentationStats('non-existent-event-id')
    ).rejects.toThrow('Event not found');
  });

  it('getEventStats throws error for empty event ID', async () => {
    await expect(
      StatisticsService.getEventStats('')
    ).rejects.toThrow('Event ID is required');
  });

  it('getPresentationStats throws error for empty event ID', async () => {
    await expect(
      StatisticsService.getPresentationStats('')
    ).rejects.toThrow('Event ID is required');
  });
});
