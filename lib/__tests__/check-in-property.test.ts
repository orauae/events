import { describe, expect, beforeEach, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { db, events, guests, eventGuests, badges } from '@/db';
import { EventGuestService } from '../services/event-guest-service';

/**
 * Feature: event-os-mvp, Property 12: Check-In Process Updates Status
 * 
 * For any valid QR token scan where the guest has not been checked in,
 * the EventGuest record should be updated with checkInStatus="CheckedIn"
 * and checkInTime set to the current timestamp.
 * 
 * Validates: Requirements 7.1, 7.4
 */
describe('Property 12: Check-In Process Updates Status', () => {
  let testEventId: string;

  beforeEach(async () => {
    // Clean up and create test event
    await db.delete(badges);
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);

    const [event] = await db.insert(events).values({
      name: 'Test Event for Check-In',
      type: 'Conference',
      description: 'Test event for check-in property testing',
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

  test.prop([validGuestArb], { numRuns: 100 })(
    'check-in should update checkInStatus to CheckedIn',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Verify initial status is NotCheckedIn
      expect(eventGuest.checkInStatus).toBe('NotCheckedIn');
      expect(eventGuest.checkInTime).toBeNull();

      // Perform check-in
      const result = await EventGuestService.checkIn(eventGuest.qrToken);

      // Verify check-in was successful
      expect(result.success).toBe(true);
      expect(result.alreadyCheckedIn).toBe(false);
      expect(result.eventGuest.checkInStatus).toBe('CheckedIn');
    }
  );

  test.prop([validGuestArb], { numRuns: 100 })(
    'check-in should set checkInTime to current timestamp',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Record time before check-in
      const beforeCheckIn = new Date();

      // Perform check-in
      const result = await EventGuestService.checkIn(eventGuest.qrToken);

      // Record time after check-in
      const afterCheckIn = new Date();

      // Verify checkInTime is set and within expected range
      expect(result.eventGuest.checkInTime).not.toBeNull();
      expect(result.eventGuest.checkInTime!.getTime()).toBeGreaterThanOrEqual(beforeCheckIn.getTime());
      expect(result.eventGuest.checkInTime!.getTime()).toBeLessThanOrEqual(afterCheckIn.getTime());
    }
  );

  test.prop([validGuestArb], { numRuns: 100 })(
    'check-in should preserve other EventGuest fields',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Perform check-in
      const result = await EventGuestService.checkIn(eventGuest.qrToken);

      // Verify other fields are preserved
      expect(result.eventGuest.eventId).toBe(eventGuest.eventId);
      expect(result.eventGuest.guestId).toBe(eventGuest.guestId);
      expect(result.eventGuest.qrToken).toBe(eventGuest.qrToken);
      expect(result.eventGuest.invitationStatus).toBe(eventGuest.invitationStatus);
      expect(result.eventGuest.rsvpStatus).toBe(eventGuest.rsvpStatus);
    }
  );

  test.prop([validGuestArb], { numRuns: 100 })(
    'check-in result should include guest and event relations',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Perform check-in
      const result = await EventGuestService.checkIn(eventGuest.qrToken);

      // Verify relations are included (Requirements 7.1 - display guest information)
      expect(result.eventGuest.guest).toBeDefined();
      expect(result.eventGuest.guest.firstName).toBe(guestData.firstName);
      expect(result.eventGuest.guest.lastName).toBe(guestData.lastName);
      expect(result.eventGuest.guest.email).toBe(guestData.email);
      expect(result.eventGuest.event).toBeDefined();
      expect(result.eventGuest.event.id).toBe(testEventId);
    }
  );

  test.prop([validGuestArb], { numRuns: 100 })(
    'check-in should persist to database',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // Perform check-in
      await EventGuestService.checkIn(eventGuest.qrToken);

      // Retrieve from database and verify persistence
      const retrieved = await EventGuestService.getByQRToken(eventGuest.qrToken);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.checkInStatus).toBe('CheckedIn');
      expect(retrieved!.checkInTime).not.toBeNull();
    }
  );
});


/**
 * Feature: event-os-mvp, Property 13: Duplicate Check-In Warning
 * 
 * For any QR token scan where the guest has already been checked in,
 * the system should return alreadyCheckedIn=true and include the previousCheckInTime.
 * 
 * Validates: Requirements 7.2, 7.5
 */
describe('Property 13: Duplicate Check-In Warning', () => {
  let testEventId: string;

  beforeEach(async () => {
    // Clean up and create test event
    await db.delete(badges);
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);

    const [event] = await db.insert(events).values({
      name: 'Test Event for Duplicate Check-In',
      type: 'Conference',
      description: 'Test event for duplicate check-in property testing',
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

  test.prop([validGuestArb], { numRuns: 100 })(
    'duplicate check-in should return alreadyCheckedIn=true',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // First check-in
      const firstResult = await EventGuestService.checkIn(eventGuest.qrToken);
      expect(firstResult.alreadyCheckedIn).toBe(false);

      // Second check-in (duplicate)
      const secondResult = await EventGuestService.checkIn(eventGuest.qrToken);
      expect(secondResult.alreadyCheckedIn).toBe(true);
    }
  );

  test.prop([validGuestArb], { numRuns: 100 })(
    'duplicate check-in should include previousCheckInTime',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // First check-in
      const firstResult = await EventGuestService.checkIn(eventGuest.qrToken);
      const originalCheckInTime = firstResult.eventGuest.checkInTime;

      // Small delay to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second check-in (duplicate)
      const secondResult = await EventGuestService.checkIn(eventGuest.qrToken);

      // Verify previousCheckInTime is included and matches original
      expect(secondResult.previousCheckInTime).toBeDefined();
      expect(secondResult.previousCheckInTime!.getTime()).toBe(originalCheckInTime!.getTime());
    }
  );

  test.prop([validGuestArb], { numRuns: 100 })(
    'duplicate check-in should not update checkInTime',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // First check-in
      const firstResult = await EventGuestService.checkIn(eventGuest.qrToken);
      const originalCheckInTime = firstResult.eventGuest.checkInTime;

      // Small delay to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second check-in (duplicate)
      const secondResult = await EventGuestService.checkIn(eventGuest.qrToken);

      // Verify checkInTime was not updated
      expect(secondResult.eventGuest.checkInTime!.getTime()).toBe(originalCheckInTime!.getTime());
    }
  );

  test.prop([validGuestArb], { numRuns: 100 })(
    'duplicate check-in should still return success=true',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // First check-in
      await EventGuestService.checkIn(eventGuest.qrToken);

      // Second check-in (duplicate)
      const secondResult = await EventGuestService.checkIn(eventGuest.qrToken);

      // Verify success is still true (it's a valid scan, just already checked in)
      expect(secondResult.success).toBe(true);
    }
  );

  test.prop([validGuestArb, fc.integer({ min: 2, max: 5 })], { numRuns: 3 })(
    'multiple duplicate check-ins should all return same previousCheckInTime',
    async (guestData, numDuplicates) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // First check-in
      const firstResult = await EventGuestService.checkIn(eventGuest.qrToken);
      const originalCheckInTime = firstResult.eventGuest.checkInTime;

      // Multiple duplicate check-ins
      for (let i = 0; i < numDuplicates; i++) {
        await new Promise(resolve => setTimeout(resolve, 5));
        const result = await EventGuestService.checkIn(eventGuest.qrToken);

        expect(result.alreadyCheckedIn).toBe(true);
        expect(result.previousCheckInTime!.getTime()).toBe(originalCheckInTime!.getTime());
        expect(result.eventGuest.checkInTime!.getTime()).toBe(originalCheckInTime!.getTime());
      }
    }
  );

  test.prop([validGuestArb], { numRuns: 100 })(
    'duplicate check-in should include guest information for display',
    async (guestData) => {
      // Create guest and add to event
      const [guest] = await db.insert(guests).values(guestData).returning();
      const eventGuest = await EventGuestService.addGuestToEvent(testEventId, guest.id);

      // First check-in
      await EventGuestService.checkIn(eventGuest.qrToken);

      // Second check-in (duplicate)
      const secondResult = await EventGuestService.checkIn(eventGuest.qrToken);

      // Verify guest information is included (Requirements 7.2 - display warning with timestamp)
      expect(secondResult.eventGuest.guest).toBeDefined();
      expect(secondResult.eventGuest.guest.firstName).toBe(guestData.firstName);
      expect(secondResult.eventGuest.guest.lastName).toBe(guestData.lastName);
      expect(secondResult.eventGuest.event).toBeDefined();
    }
  );
});
