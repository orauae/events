import { describe, expect, beforeEach, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { db, events, guests, eventGuests } from '@/db';
import { EventGuestService } from '../services/event-guest-service';

/**
 * Feature: event-os-mvp, Property 6: Event Guest Lifecycle
 * 
 * For any guest added to an event, the resulting EventGuest record should have
 * invitationStatus="Pending", rsvpStatus="Pending", checkInStatus="NotCheckedIn",
 * and a unique non-empty qrToken.
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */
describe('Property 6: Event Guest Lifecycle', () => {
  let testEventId: string;

  beforeEach(async () => {
    // Create a test event for the property tests
    const [event] = await db.insert(events).values({
      name: 'Test Event',
      type: 'Conference',
      description: 'Test event for property testing',
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-02-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    }).returning();
    testEventId = event.id;
  });

  afterEach(async () => {
    // Clean up test data in correct order (respecting foreign keys)
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);
  });

  // Arbitrary for valid guest data
  const validGuestArb = fc.record({
    firstName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    lastName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    email: fc.emailAddress(),
    company: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
    jobTitle: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  });

  test.prop([validGuestArb], { numRuns: 100 })(
    'adding a guest to an event should create EventGuest with correct initial statuses',
    async (guestData) => {
      // Create the guest
      const [guest] = await db.insert(guests).values(guestData).returning();

      // Add guest to event using the service
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Verify initial statuses (Requirements 3.1, 3.5)
      expect(eventGuest.invitationStatus).toBe('Pending');
      expect(eventGuest.rsvpStatus).toBe('Pending');
      expect(eventGuest.checkInStatus).toBe('NotCheckedIn');
      expect(eventGuest.checkInTime).toBeNull();

      // Verify QR token is generated and non-empty (Requirements 3.2)
      expect(eventGuest.qrToken).toBeDefined();
      expect(eventGuest.qrToken.length).toBeGreaterThan(0);

      // Verify relations are correctly set
      expect(eventGuest.eventId).toBe(testEventId);
      expect(eventGuest.guestId).toBe(guest.id);
      expect(eventGuest.event).toBeDefined();
      expect(eventGuest.guest).toBeDefined();
    }
  );

  test.prop([
    fc.array(validGuestArb, { minLength: 2, maxLength: 5 }),
  ], { numRuns: 3 })(
    'each EventGuest should have a unique qrToken',
    async (guestDataArray) => {
      // Deduplicate by email to avoid unique constraint violations
      const uniqueGuests = new Map<string, typeof guestDataArray[0]>();
      for (const guest of guestDataArray) {
        uniqueGuests.set(guest.email, guest);
      }

      // Create guests
      const createdGuests = await Promise.all(
        Array.from(uniqueGuests.values()).map((guestData) =>
          db.insert(guests).values(guestData).returning().then(([g]) => g)
        )
      );

      // Add all guests to the event
      const eventGuestsList = await Promise.all(
        createdGuests.map((guest) =>
          EventGuestService.addGuestToEvent(testEventId, guest.id)
        )
      );

      // Collect all QR tokens
      const qrTokens = eventGuestsList.map((eg) => eg.qrToken);

      // Verify all tokens are unique
      const uniqueTokens = new Set(qrTokens);
      expect(uniqueTokens.size).toBe(qrTokens.length);
    }
  );

  test.prop([validGuestArb], { numRuns: 100 })(
    'EventGuest can be retrieved by QR token after creation',
    async (guestData) => {
      // Create the guest
      const [guest] = await db.insert(guests).values(guestData).returning();

      // Add guest to event
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Retrieve by QR token (Requirements 3.2)
      const retrieved = await EventGuestService.getByQRToken(eventGuest.qrToken);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(eventGuest.id);
      expect(retrieved!.eventId).toBe(testEventId);
      expect(retrieved!.guestId).toBe(guest.id);
    }
  );

  test.prop([validGuestArb], { numRuns: 100 })(
    'EventGuest appears in getEventGuests list after being added',
    async (guestData) => {
      // Create the guest
      const [guest] = await db.insert(guests).values(guestData).returning();

      // Add guest to event
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Get all event guests (Requirements 3.3)
      const eventGuests = await EventGuestService.getEventGuests(testEventId);

      // Verify the guest appears in the list
      const found = eventGuests.find((eg) => eg.id === eventGuest.id);
      expect(found).toBeDefined();
      expect(found!.guest.id).toBe(guest.id);
    }
  );

  test.prop([validGuestArb], { numRuns: 100 })(
    'removing a guest from an event should delete the EventGuest record',
    async (guestData) => {
      // Create the guest
      const [guest] = await db.insert(guests).values(guestData).returning();

      // Add guest to event
      await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Remove guest from event (Requirements 3.4)
      await EventGuestService.removeGuestFromEvent(testEventId, guest.id);

      // Verify the record is deleted
      const eventGuest = await EventGuestService.getByEventAndGuest(testEventId, guest.id);
      expect(eventGuest).toBeNull();

      // Verify guest no longer appears in event guests list
      const eventGuests = await EventGuestService.getEventGuests(testEventId);
      const found = eventGuests.find((eg) => eg.guestId === guest.id);
      expect(found).toBeUndefined();
    }
  );
});
