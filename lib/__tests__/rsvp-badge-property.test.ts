import { describe, expect, beforeEach, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { db, events, guests, eventGuests, badges } from '@/db';
import type { RSVPStatus } from '@/db/schema';
import { EventGuestService } from '../services/event-guest-service';
import { BadgeService } from '../services/badge-service';

/**
 * Feature: event-os-mvp, Property 9: RSVP Status Updates Correctly
 * 
 * For any valid RSVP submission with a valid qrToken and status, the corresponding
 * EventGuest record should be updated to reflect the new rsvpStatus, and the
 * updatedAt timestamp should be more recent than before.
 * 
 * Validates: Requirements 5.2, 5.4
 */
describe('Property 9: RSVP Status Updates Correctly', () => {
  let testEventId: string;

  beforeEach(async () => {
    // Clean up and create test event
    await db.delete(badges);
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);

    const [event] = await db.insert(events).values({
      name: 'Test Event for RSVP',
      type: 'Conference',
      description: 'Test event for RSVP property testing',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    }).returning();
    testEventId = event.id;
  });

  afterEach(async () => {
    await db.delete(badges);
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);
  });

  // Valid RSVP statuses (excluding Pending as it's the initial state)
  const validRSVPStatuses: RSVPStatus[] = ['Attending', 'NotAttending'];

  // Arbitrary for valid guest data
  const validGuestArb = fc.record({
    firstName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    lastName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    email: fc.emailAddress(),
    company: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    jobTitle: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  });

  // Arbitrary for valid RSVP status
  const validRSVPStatusArb = fc.constantFrom<RSVPStatus>(...validRSVPStatuses);

  test.prop([validGuestArb, validRSVPStatusArb], { numRuns: 100 })(
    'RSVP update should change rsvpStatus to the submitted value',
    async (guestData, newStatus) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Verify initial status is Pending
      expect(eventGuest.rsvpStatus).toBe('Pending');

      // Update RSVP status
      const updated = await EventGuestService.updateRSVP(eventGuest.qrToken, newStatus);

      // Verify the status was updated correctly
      expect(updated.rsvpStatus).toBe(newStatus);
      expect(updated.id).toBe(eventGuest.id);
    }
  );

  test.prop([validGuestArb, validRSVPStatusArb], { numRuns: 100 })(
    'RSVP update should update the updatedAt timestamp',
    async (guestData, newStatus) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);
      const originalUpdatedAt = eventGuest.updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      // Update RSVP status
      const updated = await EventGuestService.updateRSVP(eventGuest.qrToken, newStatus);

      // Verify the timestamp was updated
      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    }
  );

  test.prop([validGuestArb, fc.array(validRSVPStatusArb, { minLength: 2, maxLength: 5 })], { numRuns: 3 })(
    'multiple RSVP updates should each update the status and timestamp',
    async (guestData, statusSequence) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      let previousUpdatedAt = eventGuest.updatedAt;

      // Apply each status update in sequence
      for (const status of statusSequence) {
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const updated = await EventGuestService.updateRSVP(eventGuest.qrToken, status);

        // Verify status matches the submitted value
        expect(updated.rsvpStatus).toBe(status);
        
        // Verify timestamp was updated
        expect(updated.updatedAt.getTime()).toBeGreaterThan(previousUpdatedAt.getTime());
        
        previousUpdatedAt = updated.updatedAt;
      }
    }
  );

  test.prop([validGuestArb, validRSVPStatusArb], { numRuns: 100 })(
    'RSVP update should preserve other EventGuest fields',
    async (guestData, newStatus) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Update RSVP status
      const updated = await EventGuestService.updateRSVP(eventGuest.qrToken, newStatus);

      // Verify other fields are preserved
      expect(updated.eventId).toBe(eventGuest.eventId);
      expect(updated.guestId).toBe(eventGuest.guestId);
      expect(updated.qrToken).toBe(eventGuest.qrToken);
      expect(updated.invitationStatus).toBe(eventGuest.invitationStatus);
      expect(updated.checkInStatus).toBe(eventGuest.checkInStatus);
    }
  );
});

/**
 * Feature: event-os-mvp, Property 10: Badge Generation on Attendance Confirmation
 * 
 * For any EventGuest whose rsvpStatus changes to "Attending", a Badge record
 * should be created with a valid qrToken matching the EventGuest's qrToken,
 * and the badge should contain guest name, company, and event name.
 * 
 * Validates: Requirements 6.1, 6.2, 6.4
 */
describe('Property 10: Badge Generation on Attendance Confirmation', () => {
  let testEventId: string;
  let testEventName: string;

  beforeEach(async () => {
    // Clean up and create test event
    await db.delete(badges);
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);

    testEventName = 'Test Event for Badge Generation';
    const [event] = await db.insert(events).values({
      name: testEventName,
      type: 'Conference',
      description: 'Test event for badge property testing',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    }).returning();
    testEventId = event.id;
  });

  afterEach(async () => {
    await db.delete(badges);
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);
  });

  // Arbitrary for valid guest data
  const validGuestArb = fc.record({
    firstName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    lastName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    email: fc.emailAddress(),
    company: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    jobTitle: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  });

  // Non-attending statuses
  const nonAttendingStatusArb = fc.constantFrom<RSVPStatus>('NotAttending');

  test.prop([validGuestArb], { numRuns: 100 })(
    'badge should be created when RSVP status is set to Attending',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Verify no badge exists initially
      let badge = await BadgeService.getByEventGuest(eventGuest.id);
      expect(badge).toBeNull();

      // Update RSVP to Attending
      await EventGuestService.updateRSVP(eventGuest.qrToken, 'Attending');

      // Verify badge was created
      badge = await BadgeService.getByEventGuest(eventGuest.id);
      expect(badge).not.toBeNull();
    }
  );

  test.prop([validGuestArb], { numRuns: 100 })(
    'badge qrToken should match EventGuest qrToken',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Update RSVP to Attending
      await EventGuestService.updateRSVP(eventGuest.qrToken, 'Attending');

      // Verify badge qrToken matches EventGuest qrToken
      const badge = await BadgeService.getByEventGuest(eventGuest.id);
      expect(badge).not.toBeNull();
      expect(badge!.qrToken).toBe(eventGuest.qrToken);
    }
  );

  test.prop([validGuestArb], { numRuns: 100 })(
    'badge should contain guest name, company, and event name',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Update RSVP to Attending
      await EventGuestService.updateRSVP(eventGuest.qrToken, 'Attending');

      // Get badge with relations
      const badge = await BadgeService.getByEventGuest(eventGuest.id);
      expect(badge).not.toBeNull();

      // Verify badge contains guest information
      expect(badge!.eventGuest.guest.firstName).toBe(guestData.firstName);
      expect(badge!.eventGuest.guest.lastName).toBe(guestData.lastName);
      expect(badge!.eventGuest.guest.company).toBe(guestData.company ?? null);

      // Verify badge contains event information
      expect(badge!.eventGuest.event.name).toBe(testEventName);
    }
  );

  test.prop([validGuestArb, nonAttendingStatusArb], { numRuns: 100 })(
    'badge should NOT be created for non-Attending RSVP statuses',
    async (guestData, nonAttendingStatus) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Update RSVP to non-Attending status
      await EventGuestService.updateRSVP(eventGuest.qrToken, nonAttendingStatus);

      // Verify no badge was created
      const badge = await BadgeService.getByEventGuest(eventGuest.id);
      expect(badge).toBeNull();
    }
  );

  test.prop([validGuestArb], { numRuns: 3 })(
    'badge should only be created once even with multiple Attending updates',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Update RSVP to Attending multiple times
      await EventGuestService.updateRSVP(eventGuest.qrToken, 'Attending');
      const badge1 = await BadgeService.getByEventGuest(eventGuest.id);

      await EventGuestService.updateRSVP(eventGuest.qrToken, 'Attending');
      const badge2 = await BadgeService.getByEventGuest(eventGuest.id);

      // Verify same badge is returned (idempotent)
      expect(badge1).not.toBeNull();
      expect(badge2).not.toBeNull();
      expect(badge1!.id).toBe(badge2!.id);
    }
  );

  test.prop([validGuestArb], { numRuns: 3 })(
    'badge should persist even if RSVP changes from Attending to another status',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Update RSVP to Attending (creates badge)
      await EventGuestService.updateRSVP(eventGuest.qrToken, 'Attending');
      const badge1 = await BadgeService.getByEventGuest(eventGuest.id);
      expect(badge1).not.toBeNull();

      // Update RSVP to NotAttending
      await EventGuestService.updateRSVP(eventGuest.qrToken, 'NotAttending');

      // Badge should still exist
      const badge2 = await BadgeService.getByEventGuest(eventGuest.id);
      expect(badge2).not.toBeNull();
      expect(badge2!.id).toBe(badge1!.id);
    }
  );
});
