import { describe, expect, beforeEach, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { db, events, guests, eventGuests } from '@/db';

/**
 * Feature: event-os-mvp, Property 11: QR Token Uniqueness and Security
 * 
 * For any set of EventGuest records, all qrTokens should be unique,
 * and each token should have sufficient entropy (minimum 21 characters
 * using CUID format) to be non-guessable.
 * 
 * Validates: Requirements 6.3, 6.6
 */
describe('Property 11: QR Token Uniqueness and Security', () => {
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
    // Clean up test data
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);
  });

  // Property test: QR tokens are unique across multiple EventGuest records
  test.prop([
    fc.array(
      fc.record({
        firstName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        lastName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        email: fc.emailAddress(),
      }),
      { minLength: 2, maxLength: 10 }
    ),
  ], { numRuns: 3 })(
    'all QR tokens should be unique across EventGuest records',
    async (guestDataArray) => {
      // Create unique guests (deduplicate by email)
      const uniqueGuests = new Map<string, { firstName: string; lastName: string; email: string }>();
      for (const guest of guestDataArray) {
        uniqueGuests.set(guest.email, guest);
      }

      const createdGuests = await Promise.all(
        Array.from(uniqueGuests.values()).map((guestData) =>
          db.insert(guests).values(guestData).returning().then(([g]) => g)
        )
      );

      // Add all guests to the event
      const eventGuestsList = await Promise.all(
        createdGuests.map((guest) =>
          db.insert(eventGuests).values({
            eventId: testEventId,
            guestId: guest.id,
          }).returning().then(([eg]) => eg)
        )
      );

      // Collect all QR tokens
      const qrTokens = eventGuestsList.map((eg) => eg.qrToken);

      // Verify all tokens are unique
      const uniqueTokens = new Set(qrTokens);
      expect(uniqueTokens.size).toBe(qrTokens.length);
    }
  );

  // Property test: QR tokens have sufficient entropy (minimum 21 characters)
  test.prop([
    fc.record({
      firstName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      lastName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      email: fc.emailAddress(),
    }),
  ], { numRuns: 3 })(
    'QR tokens should have minimum 21 characters for sufficient entropy',
    async (guestData) => {
      const [guest] = await db.insert(guests).values(guestData).returning();

      const [eventGuest] = await db.insert(eventGuests).values({
        eventId: testEventId,
        guestId: guest.id,
      }).returning();

      // CUID format should be at least 21 characters
      expect(eventGuest.qrToken.length).toBeGreaterThanOrEqual(21);
    }
  );

  // Property test: QR tokens follow CUID format (alphanumeric)
  test.prop([
    fc.record({
      firstName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      lastName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      email: fc.emailAddress(),
    }),
  ], { numRuns: 3 })(
    'QR tokens should be alphanumeric (CUID format)',
    async (guestData) => {
      const [guest] = await db.insert(guests).values(guestData).returning();

      const [eventGuest] = await db.insert(eventGuests).values({
        eventId: testEventId,
        guestId: guest.id,
      }).returning();

      // CUID tokens should only contain alphanumeric characters
      const alphanumericRegex = /^[a-z0-9]+$/;
      expect(eventGuest.qrToken).toMatch(alphanumericRegex);
    }
  );
});
