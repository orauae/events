import { describe, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { db, events, guests, eventGuests, badges, campaigns, campaignMessages } from '@/db';
import { eq, inArray } from 'drizzle-orm';
import { AnalyticsService } from '../services/analytics-service';
import { ExportService } from '../services/export-service';
import { EventGuestService } from '../services/event-guest-service';
import type { RSVPStatus } from '@/db/schema';

/**
 * Feature: event-os-mvp, Property 14: Analytics Aggregation Accuracy
 * 
 * For any event with guests, the analytics should accurately reflect:
 * - totalInvited equals count of EventGuest records
 * - rsvpBreakdown counts match actual rsvpStatus distribution
 * - checkInRate equals (checkInCount / attending count) * 100
 * 
 * Validates: Requirements 8.1, 8.2, 8.3, 8.6
 */
describe('Property 14: Analytics Aggregation Accuracy', () => {
  // Use a unique event per test iteration to avoid conflicts
  async function createTestEvent(): Promise<string> {
    const [event] = await db.insert(events).values({
      name: `Test Event ${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type: 'Conference',
      description: 'Test event for analytics property testing',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    }).returning();
    return event.id;
  }

  async function cleanupEvent(eventId: string): Promise<void> {
    // Get all event guests for this event
    const eventGuestsList = await db.select({ id: eventGuests.id, guestId: eventGuests.guestId })
      .from(eventGuests)
      .where(eq(eventGuests.eventId, eventId));

    if (eventGuestsList.length > 0) {
      // Delete badges for these event guests
      await db.delete(badges).where(inArray(badges.eventGuestId, eventGuestsList.map(eg => eg.id)));
    }

    // Delete campaign messages for campaigns of this event
    const campaignsList = await db.select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.eventId, eventId));
    
    if (campaignsList.length > 0) {
      await db.delete(campaignMessages).where(inArray(campaignMessages.campaignId, campaignsList.map(c => c.id)));
    }

    // Delete campaigns
    await db.delete(campaigns).where(eq(campaigns.eventId, eventId));

    // Delete event guests
    await db.delete(eventGuests).where(eq(eventGuests.eventId, eventId));

    // Delete guests
    if (eventGuestsList.length > 0) {
      await db.delete(guests).where(inArray(guests.id, eventGuestsList.map(eg => eg.guestId)));
    }

    // Delete event
    await db.delete(events).where(eq(events.id, eventId)).catch(() => {});
  }

  test.prop([
    fc.integer({ min: 1, max: 5 }),
  ], { numRuns: 3 })(
    'totalInvited should equal count of EventGuest records',
    async (guestCount) => {
      const testEventId = await createTestEvent();
      
      try {
        // Create guests and add to event
        for (let i = 0; i < guestCount; i++) {
          const [guest] = await db.insert(guests).values({
            firstName: `Guest${i}`,
            lastName: `Test`,
            email: `total-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}@test.com`,
          }).returning();
          await EventGuestService.addGuestToEvent(testEventId, guest.id);
        }

        // Get analytics
        const analytics = await AnalyticsService.getEventAnalytics(testEventId);

        // Verify totalInvited equals count of EventGuest records
        expect(analytics.totalInvited).toBe(guestCount);
      } finally {
        await cleanupEvent(testEventId);
      }
    }
  );

  test.prop([
    fc.record({
      attending: fc.integer({ min: 0, max: 3 }),
      notAttending: fc.integer({ min: 0, max: 3 }),
      pending: fc.integer({ min: 0, max: 3 }),
    }),
  ], { numRuns: 3 })(
    'rsvpBreakdown counts should match actual rsvpStatus distribution',
    async (distribution) => {
      const testEventId = await createTestEvent();
      
      try {
        const { attending, notAttending, pending } = distribution;
        let guestIndex = 0;

        // Create guests with Attending status
        for (let i = 0; i < attending; i++) {
          const [guest] = await db.insert(guests).values({
            firstName: `Attending${i}`,
            lastName: `Test`,
            email: `rsvp-a-${Date.now()}-${guestIndex++}-${Math.random().toString(36).substring(7)}@test.com`,
          }).returning();
          const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);
          await EventGuestService.updateRSVP(eventGuest.qrToken, 'Attending');
        }

        // Create guests with NotAttending status
        for (let i = 0; i < notAttending; i++) {
          const [guest] = await db.insert(guests).values({
            firstName: `NotAttending${i}`,
            lastName: `Test`,
            email: `rsvp-n-${Date.now()}-${guestIndex++}-${Math.random().toString(36).substring(7)}@test.com`,
          }).returning();
          const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);
          await EventGuestService.updateRSVP(eventGuest.qrToken, 'NotAttending');
        }

        // Create guests with Pending status (default)
        for (let i = 0; i < pending; i++) {
          const [guest] = await db.insert(guests).values({
            firstName: `Pending${i}`,
            lastName: `Test`,
            email: `rsvp-p-${Date.now()}-${guestIndex++}-${Math.random().toString(36).substring(7)}@test.com`,
          }).returning();
          await EventGuestService.addGuestToEvent(testEventId, guest.id);
        }

        // Get analytics
        const analytics = await AnalyticsService.getEventAnalytics(testEventId);

        // Verify RSVP breakdown matches expected
        expect(analytics.rsvpBreakdown.attending).toBe(attending);
        expect(analytics.rsvpBreakdown.notAttending).toBe(notAttending);
        expect(analytics.rsvpBreakdown.pending).toBe(pending);
      } finally {
        await cleanupEvent(testEventId);
      }
    }
  );

  test.prop([
    fc.integer({ min: 1, max: 5 }), // Number of attending guests
    fc.integer({ min: 0, max: 5 }), // Number of checked-in guests (will be capped to attending)
  ], { numRuns: 3 })(
    'checkInRate should equal (checkInCount / attending count) * 100',
    async (numAttending, numCheckIn) => {
      const testEventId = await createTestEvent();
      
      try {
        // Cap check-ins to attending count
        const actualCheckIns = Math.min(numCheckIn, numAttending);

        // Create attending guests
        const eventGuestsList = [];
        for (let i = 0; i < numAttending; i++) {
          const [guest] = await db.insert(guests).values({
            firstName: `Attending${i}`,
            lastName: `Test`,
            email: `checkin-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}@test.com`,
          }).returning();
          const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);
          await EventGuestService.updateRSVP(eventGuest.qrToken, 'Attending');
          eventGuestsList.push(eventGuest);
        }

        // Check in some guests
        for (let i = 0; i < actualCheckIns; i++) {
          await EventGuestService.checkIn(eventGuestsList[i].qrToken);
        }

        // Get analytics
        const analytics = await AnalyticsService.getEventAnalytics(testEventId);

        // Verify check-in count
        expect(analytics.checkInCount).toBe(actualCheckIns);

        // Verify check-in rate calculation
        const expectedRate = numAttending > 0 ? (actualCheckIns / numAttending) * 100 : 0;
        expect(analytics.checkInRate).toBeCloseTo(expectedRate, 5);
      } finally {
        await cleanupEvent(testEventId);
      }
    }
  );

  test.prop([
    fc.record({
      attending: fc.integer({ min: 0, max: 2 }),
      notAttending: fc.integer({ min: 0, max: 2 }),
      pending: fc.integer({ min: 0, max: 2 }),
    }),
  ], { numRuns: 3 })(
    'sum of rsvpBreakdown should equal totalInvited',
    async (distribution) => {
      const testEventId = await createTestEvent();
      
      try {
        const { attending, notAttending, pending } = distribution;
        let guestIndex = 0;

        // Create guests with various statuses
        for (let i = 0; i < attending; i++) {
          const [guest] = await db.insert(guests).values({
            firstName: `A${i}`,
            lastName: `T`,
            email: `sum-a-${Date.now()}-${guestIndex++}-${Math.random().toString(36).substring(7)}@test.com`,
          }).returning();
          const eg = await EventGuestService.addGuestToEvent(testEventId, guest.id);
          await EventGuestService.updateRSVP(eg.qrToken, 'Attending');
        }

        for (let i = 0; i < notAttending; i++) {
          const [guest] = await db.insert(guests).values({
            firstName: `N${i}`,
            lastName: `T`,
            email: `sum-n-${Date.now()}-${guestIndex++}-${Math.random().toString(36).substring(7)}@test.com`,
          }).returning();
          const eg = await EventGuestService.addGuestToEvent(testEventId, guest.id);
          await EventGuestService.updateRSVP(eg.qrToken, 'NotAttending');
        }

        for (let i = 0; i < pending; i++) {
          const [guest] = await db.insert(guests).values({
            firstName: `P${i}`,
            lastName: `T`,
            email: `sum-p-${Date.now()}-${guestIndex++}-${Math.random().toString(36).substring(7)}@test.com`,
          }).returning();
          await EventGuestService.addGuestToEvent(testEventId, guest.id);
        }

        // Get analytics
        const analytics = await AnalyticsService.getEventAnalytics(testEventId);

        // Verify sum of breakdown equals total
        const breakdownSum = 
          analytics.rsvpBreakdown.attending +
          analytics.rsvpBreakdown.notAttending +
          analytics.rsvpBreakdown.pending;

        expect(breakdownSum).toBe(analytics.totalInvited);
        expect(analytics.totalInvited).toBe(attending + notAttending + pending);
      } finally {
        await cleanupEvent(testEventId);
      }
    }
  );
});

/**
 * Feature: event-os-mvp, Property 15: Export Data Completeness
 * 
 * For any export request, the generated CSV should contain all records
 * matching the export criteria, with all specified fields present and
 * correctly formatted.
 * 
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4
 */
describe('Property 15: Export Data Completeness', () => {
  // Use unique event and campaign per test iteration
  async function createTestEventAndCampaign(): Promise<{ eventId: string; campaignId: string }> {
    const [event] = await db.insert(events).values({
      name: `Export Test Event ${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type: 'Conference',
      description: 'Test event for export property testing',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    }).returning();

    const [campaign] = await db.insert(campaigns).values({
      eventId: event.id,
      name: 'Test Campaign',
      type: 'Invitation',
      subject: 'Test Subject',
      content: 'Test Content',
      status: 'Draft',
    }).returning();

    return { eventId: event.id, campaignId: campaign.id };
  }

  async function cleanupEventAndCampaign(eventId: string): Promise<void> {
    // Get all event guests for this event
    const eventGuestsList = await db.select({ id: eventGuests.id, guestId: eventGuests.guestId })
      .from(eventGuests)
      .where(eq(eventGuests.eventId, eventId));

    if (eventGuestsList.length > 0) {
      // Delete badges for these event guests
      await db.delete(badges).where(inArray(badges.eventGuestId, eventGuestsList.map(eg => eg.id)));
    }

    // Delete campaign messages for campaigns of this event
    const campaignsList = await db.select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.eventId, eventId));
    
    if (campaignsList.length > 0) {
      await db.delete(campaignMessages).where(inArray(campaignMessages.campaignId, campaignsList.map(c => c.id)));
    }

    // Delete campaigns
    await db.delete(campaigns).where(eq(campaigns.eventId, eventId));

    // Delete event guests
    await db.delete(eventGuests).where(eq(eventGuests.eventId, eventId));

    // Delete guests
    if (eventGuestsList.length > 0) {
      await db.delete(guests).where(inArray(guests.id, eventGuestsList.map(eg => eg.guestId)));
    }

    // Delete event
    await db.delete(events).where(eq(events.id, eventId)).catch(() => {});
  }

  /**
   * Helper to parse CSV string into rows
   */
  function parseCSV(csv: string): string[][] {
    const lines = csv.split('\n');
    return lines.map(line => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current);
      return values;
    });
  }

  test.prop([
    fc.integer({ min: 1, max: 5 }),
  ], { numRuns: 3 })(
    'exportGuestList should contain all guests with all required fields',
    async (guestCount) => {
      const { eventId, campaignId } = await createTestEventAndCampaign();
      
      try {
        // Create guests and add to event
        const guestEmails: string[] = [];
        for (let i = 0; i < guestCount; i++) {
          const email = `export-guest-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}@test.com`;
          guestEmails.push(email);
          const [guest] = await db.insert(guests).values({
            firstName: `First${i}`,
            lastName: `Last${i}`,
            email,
            company: `Company${i}`,
            jobTitle: `Title${i}`,
          }).returning();
          await EventGuestService.addGuestToEvent(eventId, guest.id);
        }

        // Export guest list
        const csv = await ExportService.exportGuestList(eventId);
        const rows = parseCSV(csv);

        // Verify header row has all required fields (Requirement 9.1)
        const headers = rows[0];
        expect(headers).toContain('First Name');
        expect(headers).toContain('Last Name');
        expect(headers).toContain('Email');
        expect(headers).toContain('Mobile');
        expect(headers).toContain('Company');
        expect(headers).toContain('Job Title');
        expect(headers).toContain('Invitation Status');
        expect(headers).toContain('RSVP Status');
        expect(headers).toContain('Check-In Status');
        expect(headers).toContain('Check-In Time');

        // Verify number of data rows equals number of guests
        const dataRows = rows.slice(1);
        expect(dataRows.length).toBe(guestCount);

        // Verify each guest's email appears in the export
        const emailIndex = headers.indexOf('Email');
        const exportedEmails = dataRows.map(row => row[emailIndex]);
        for (const email of guestEmails) {
          expect(exportedEmails).toContain(email);
        }
      } finally {
        await cleanupEventAndCampaign(eventId);
      }
    }
  );

  test.prop([
    fc.integer({ min: 1, max: 5 }),
  ], { numRuns: 3 })(
    'exportAttendanceReport should contain all guests with attendance fields',
    async (guestCount) => {
      const { eventId, campaignId } = await createTestEventAndCampaign();
      
      try {
        // Create guests and add to event
        const guestEmails: string[] = [];
        for (let i = 0; i < guestCount; i++) {
          const email = `attendance-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}@test.com`;
          guestEmails.push(email);
          const [guest] = await db.insert(guests).values({
            firstName: `First${i}`,
            lastName: `Last${i}`,
            email,
          }).returning();
          await EventGuestService.addGuestToEvent(eventId, guest.id);
        }

        // Export attendance report
        const csv = await ExportService.exportAttendanceReport(eventId);
        const rows = parseCSV(csv);

        // Verify header row has all required fields (Requirement 9.2)
        const headers = rows[0];
        expect(headers).toContain('Guest Name');
        expect(headers).toContain('Email');
        expect(headers).toContain('Company');
        expect(headers).toContain('RSVP Status');
        expect(headers).toContain('Check-In Status');
        expect(headers).toContain('Check-In Time');

        // Verify number of data rows equals number of guests
        const dataRows = rows.slice(1);
        expect(dataRows.length).toBe(guestCount);

        // Verify each guest's email appears in the export
        const emailIndex = headers.indexOf('Email');
        const exportedEmails = dataRows.map(row => row[emailIndex]);
        for (const email of guestEmails) {
          expect(exportedEmails).toContain(email);
        }
      } finally {
        await cleanupEventAndCampaign(eventId);
      }
    }
  );

  test.prop([
    fc.integer({ min: 1, max: 5 }),
    fc.array(
      fc.constantFrom('Pending', 'Sent', 'Delivered', 'Failed', 'Bounced'),
      { minLength: 1, maxLength: 5 }
    ),
  ], { numRuns: 3 })(
    'exportCampaignReport should contain correct campaign metrics',
    async (guestCount, messageStatuses) => {
      const { eventId, campaignId } = await createTestEventAndCampaign();
      
      try {
        // Create guests and add to event
        const eventGuestsList = [];
        for (let i = 0; i < guestCount; i++) {
          const [guest] = await db.insert(guests).values({
            firstName: `Campaign${i}`,
            lastName: `Test`,
            email: `campaign-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}@test.com`,
          }).returning();
          const eventGuest = await EventGuestService.addGuestToEvent(eventId, guest.id);
          eventGuestsList.push(eventGuest);
        }

        // Create campaign messages with various statuses
        const messagesToCreate = Math.min(messageStatuses.length, eventGuestsList.length);
        for (let i = 0; i < messagesToCreate; i++) {
          await db.insert(campaignMessages).values({
            campaignId: campaignId,
            eventGuestId: eventGuestsList[i].id,
            status: messageStatuses[i] as any,
          });
        }

        // Export campaign report
        const csv = await ExportService.exportCampaignReport(campaignId);
        const rows = parseCSV(csv);

        // Verify header row has all required fields (Requirement 9.3)
        const headers = rows[0];
        expect(headers).toContain('Campaign Name');
        expect(headers).toContain('Type');
        expect(headers).toContain('Sent Count');
        expect(headers).toContain('Delivered Count');
        expect(headers).toContain('Delivery Rate (%)');

        // Verify data row exists
        expect(rows.length).toBeGreaterThanOrEqual(2);

        // Calculate expected metrics
        const sentStatuses = messageStatuses.slice(0, messagesToCreate).filter(s => s !== 'Pending');
        const deliveredStatuses = messageStatuses.slice(0, messagesToCreate).filter(s => s === 'Delivered');
        const expectedSent = sentStatuses.length;
        const expectedDelivered = deliveredStatuses.length;

        // Verify metrics in export
        const dataRow = rows[1];
        const sentIndex = headers.indexOf('Sent Count');
        const deliveredIndex = headers.indexOf('Delivered Count');

        expect(parseInt(dataRow[sentIndex])).toBe(expectedSent);
        expect(parseInt(dataRow[deliveredIndex])).toBe(expectedDelivered);
      } finally {
        await cleanupEventAndCampaign(eventId);
      }
    }
  );

  test.prop([
    fc.integer({ min: 1, max: 5 }),
  ], { numRuns: 3 })(
    'exported guest data should match original guest data',
    async (guestCount) => {
      const { eventId, campaignId } = await createTestEventAndCampaign();
      
      try {
        // Create guests with specific data and add to event
        const guestData: { firstName: string; lastName: string; email: string }[] = [];
        for (let i = 0; i < guestCount; i++) {
          const data = {
            firstName: `FirstName${i}`,
            lastName: `LastName${i}`,
            email: `match-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}@test.com`,
          };
          guestData.push(data);
          const [guest] = await db.insert(guests).values(data).returning();
          await EventGuestService.addGuestToEvent(eventId, guest.id);
        }

        // Export guest list
        const csv = await ExportService.exportGuestList(eventId);
        const rows = parseCSV(csv);
        const headers = rows[0];
        const dataRows = rows.slice(1);

        // Get column indices
        const firstNameIndex = headers.indexOf('First Name');
        const lastNameIndex = headers.indexOf('Last Name');
        const emailIndex = headers.indexOf('Email');

        // Verify each guest's data matches
        for (const data of guestData) {
          const matchingRow = dataRows.find(row => row[emailIndex] === data.email);
          expect(matchingRow).toBeDefined();
          expect(matchingRow![firstNameIndex]).toBe(data.firstName);
          expect(matchingRow![lastNameIndex]).toBe(data.lastName);
        }
      } finally {
        await cleanupEventAndCampaign(eventId);
      }
    }
  );

  test.prop([
    fc.integer({ min: 1, max: 3 }),
    fc.array(
      fc.constantFrom('Pending', 'Attending', 'NotAttending'),
      { minLength: 1, maxLength: 3 }
    ),
  ], { numRuns: 3 })(
    'attendance report should reflect correct RSVP and check-in statuses',
    async (guestCount, rsvpStatuses) => {
      const { eventId, campaignId } = await createTestEventAndCampaign();
      
      try {
        // Create guests and add to event with RSVP statuses
        const guestInfo: { email: string; expectedStatus: string }[] = [];
        for (let i = 0; i < guestCount; i++) {
          const email = `status-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}@test.com`;
          const status = rsvpStatuses[i % rsvpStatuses.length];
          guestInfo.push({ email, expectedStatus: status });

          const [guest] = await db.insert(guests).values({
            firstName: `Status${i}`,
            lastName: `Test`,
            email,
          }).returning();
          const eventGuest = await EventGuestService.addGuestToEvent(eventId, guest.id);
          
          // Set RSVP status if not Pending
          if (status !== 'Pending') {
            await EventGuestService.updateRSVP(eventGuest.qrToken, status as any);
          }
          
          // Check in attending guests
          if (status === 'Attending') {
            await EventGuestService.checkIn(eventGuest.qrToken);
          }
        }

        // Export attendance report
        const csv = await ExportService.exportAttendanceReport(eventId);
        const rows = parseCSV(csv);
        const headers = rows[0];
        const dataRows = rows.slice(1);

        // Get column indices
        const emailIndex = headers.indexOf('Email');
        const rsvpIndex = headers.indexOf('RSVP Status');
        const checkInIndex = headers.indexOf('Check-In Status');

        // Verify each guest's status in export
        for (const info of guestInfo) {
          const matchingRow = dataRows.find(row => row[emailIndex] === info.email);
          
          expect(matchingRow).toBeDefined();
          expect(matchingRow![rsvpIndex]).toBe(info.expectedStatus);
          
          // Verify check-in status
          if (info.expectedStatus === 'Attending') {
            expect(matchingRow![checkInIndex]).toBe('CheckedIn');
          } else {
            expect(matchingRow![checkInIndex]).toBe('NotCheckedIn');
          }
        }
      } finally {
        await cleanupEventAndCampaign(eventId);
      }
    }
  );
});
