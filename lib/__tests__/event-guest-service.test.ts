import { describe, expect, beforeEach, afterEach, it } from 'vitest';
import { db, eventGuests, guests, events } from '@/db';
import { EventService } from '../services/event-service';
import { GuestService } from '../services/guest-service';
import { EventGuestService } from '../services/event-guest-service';

/**
 * Unit tests for EventGuestService
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
describe('EventGuestService', () => {
  // Test data
  const testEventInput = {
    name: 'Test Conference',
    type: 'Conference' as const,
    description: 'A test conference',
    startDate: new Date('2026-03-01'),
    endDate: new Date('2026-03-02'),
    location: 'Test Venue',
    hostName: 'Test Host',
    hostEmail: 'host@test.com',
  };

  const testGuestInput = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@test.com',
    company: 'Test Corp',
    jobTitle: 'Developer',
  };

  afterEach(async () => {
    // Clean up test data in correct order (respecting foreign keys)
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);
  });

  describe('addGuestToEvent', () => {
    it('should create an EventGuest record with correct initial statuses', async () => {
      // Create event and guest
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);

      // Add guest to event
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      // Verify initial statuses (Requirements 3.1, 3.2, 3.5)
      expect(eventGuest.invitationStatus).toBe('Pending');
      expect(eventGuest.rsvpStatus).toBe('Pending');
      expect(eventGuest.checkInStatus).toBe('NotCheckedIn');
      expect(eventGuest.checkInTime).toBeNull();

      // Verify QR token is generated and non-empty (Requirements 3.2)
      expect(eventGuest.qrToken).toBeDefined();
      expect(eventGuest.qrToken.length).toBeGreaterThan(0);

      // Verify relations are included
      expect(eventGuest.event.id).toBe(event.id);
      expect(eventGuest.guest.id).toBe(guest.id);
    });

    it('should throw error when event does not exist', async () => {
      const guest = await GuestService.create(testGuestInput);

      await expect(
        EventGuestService.addGuestToEvent('non-existent-event-id', guest.id)
      ).rejects.toThrow('Event not found');
    });

    it('should throw error when guest does not exist', async () => {
      const event = await EventService.create(testEventInput);

      await expect(
        EventGuestService.addGuestToEvent(event.id, 'non-existent-guest-id')
      ).rejects.toThrow('Guest not found');
    });

    it('should throw error when adding same guest to same event twice', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);

      // First add should succeed
      await EventGuestService.addGuestToEvent(event.id, guest.id);

      // Second add should fail (unique constraint)
      await expect(
        EventGuestService.addGuestToEvent(event.id, guest.id)
      ).rejects.toThrow();
    });
  });

  describe('removeGuestFromEvent', () => {
    it('should delete the EventGuest record', async () => {
      // Create event, guest, and add guest to event
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      await EventGuestService.addGuestToEvent(event.id, guest.id);

      // Remove guest from event (Requirements 3.4)
      await EventGuestService.removeGuestFromEvent(event.id, guest.id);

      // Verify the record is deleted
      const eventGuest = await EventGuestService.getByEventAndGuest(event.id, guest.id);
      expect(eventGuest).toBeNull();
    });

    it('should throw error when EventGuest record does not exist', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);

      await expect(
        EventGuestService.removeGuestFromEvent(event.id, guest.id)
      ).rejects.toThrow();
    });
  });

  describe('getEventGuests', () => {
    it('should return all guests for an event with their statuses', async () => {
      // Create event and multiple guests
      const event = await EventService.create(testEventInput);
      const guest1 = await GuestService.create(testGuestInput);
      const guest2 = await GuestService.create({
        ...testGuestInput,
        email: 'jane.doe@test.com',
        firstName: 'Jane',
      });

      // Add both guests to event
      await EventGuestService.addGuestToEvent(event.id, guest1.id);
      await EventGuestService.addGuestToEvent(event.id, guest2.id);

      // Get event guests (Requirements 3.3)
      const eventGuests = await EventGuestService.getEventGuests(event.id);

      expect(eventGuests).toHaveLength(2);
      expect(eventGuests.every(eg => eg.event.id === event.id)).toBe(true);
      expect(eventGuests.every(eg => eg.guest !== undefined)).toBe(true);
    });

    it('should return empty array for event with no guests', async () => {
      const event = await EventService.create(testEventInput);

      const eventGuests = await EventGuestService.getEventGuests(event.id);

      expect(eventGuests).toHaveLength(0);
    });
  });

  describe('getByQRToken', () => {
    it('should return EventGuest by QR token', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      const found = await EventGuestService.getByQRToken(eventGuest.qrToken);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(eventGuest.id);
      expect(found!.guest.id).toBe(guest.id);
      expect(found!.event.id).toBe(event.id);
    });

    it('should return null for invalid QR token', async () => {
      const found = await EventGuestService.getByQRToken('invalid-token');

      expect(found).toBeNull();
    });
  });

  describe('updateRSVP', () => {
    it('should update RSVP status to Attending', async () => {
      // Create event, guest, and add guest to event
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      // Update RSVP status (Requirements 5.2)
      const updated = await EventGuestService.updateRSVP(eventGuest.qrToken, 'Attending');

      expect(updated.rsvpStatus).toBe('Attending');
      expect(updated.id).toBe(eventGuest.id);
      expect(updated.guest.id).toBe(guest.id);
      expect(updated.event.id).toBe(event.id);
    });

    it('should update RSVP status to NotAttending', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      const updated = await EventGuestService.updateRSVP(eventGuest.qrToken, 'NotAttending');

      expect(updated.rsvpStatus).toBe('NotAttending');
    });

    it('should update RSVP status to NotAttending', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      const updated = await EventGuestService.updateRSVP(eventGuest.qrToken, 'NotAttending');

      expect(updated.rsvpStatus).toBe('NotAttending');
    });

    it('should update timestamp when RSVP is updated (Requirements 5.4)', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);
      const originalUpdatedAt = eventGuest.updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await EventGuestService.updateRSVP(eventGuest.qrToken, 'Attending');

      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should throw error for invalid QR token', async () => {
      await expect(
        EventGuestService.updateRSVP('invalid-token', 'Attending')
      ).rejects.toThrow('Invalid QR token');
    });

    it('should throw error for empty QR token', async () => {
      await expect(
        EventGuestService.updateRSVP('', 'Attending')
      ).rejects.toThrow();
    });

    it('should allow updating RSVP multiple times', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      // First update to Attending
      let updated = await EventGuestService.updateRSVP(eventGuest.qrToken, 'Attending');
      expect(updated.rsvpStatus).toBe('Attending');

      // Second update to NotAttending
      updated = await EventGuestService.updateRSVP(eventGuest.qrToken, 'NotAttending');
      expect(updated.rsvpStatus).toBe('NotAttending');

      // Third update back to Attending
      updated = await EventGuestService.updateRSVP(eventGuest.qrToken, 'Attending');
      expect(updated.rsvpStatus).toBe('Attending');
    });
  });
});
