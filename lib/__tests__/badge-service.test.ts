import { describe, expect, beforeEach, afterEach, it } from 'vitest';
import { db, badges, eventGuests, guests, events } from '@/db';
import { EventService } from '../services/event-service';
import { GuestService } from '../services/guest-service';
import { EventGuestService } from '../services/event-guest-service';
import { BadgeService } from '../services/badge-service';

/**
 * Unit tests for BadgeService
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
describe('BadgeService', () => {
  // Test data
  const testEventInput = {
    name: 'Tech Conference 2026',
    type: 'Conference' as const,
    description: 'Annual technology conference',
    startDate: new Date('2026-06-15'),
    endDate: new Date('2026-06-17'),
    location: 'Convention Center',
    hostName: 'Event Host',
    hostEmail: 'host@techconf.com',
  };

  const testGuestInput = {
    firstName: 'Alice',
    lastName: 'Johnson',
    email: 'alice.johnson@example.com',
    company: 'Tech Corp',
    jobTitle: 'Software Engineer',
  };

  afterEach(async () => {
    // Clean up test data in correct order (respecting foreign keys)
    await db.delete(badges);
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);
  });

  describe('generate', () => {
    it('should create a badge for an EventGuest', async () => {
      // Create event, guest, and add guest to event
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      // Generate badge (Requirements 6.1)
      const badge = await BadgeService.generate(eventGuest.id);

      expect(badge).toBeDefined();
      expect(badge.eventGuestId).toBe(eventGuest.id);
      expect(badge.qrToken).toBe(eventGuest.qrToken);
      expect(badge.generatedAt).toBeDefined();
    });

    it('should return existing badge if already generated', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      // Generate badge twice
      const badge1 = await BadgeService.generate(eventGuest.id);
      const badge2 = await BadgeService.generate(eventGuest.id);

      // Should return the same badge
      expect(badge1.id).toBe(badge2.id);
    });

    it('should throw error for non-existent EventGuest', async () => {
      await expect(
        BadgeService.generate('non-existent-id')
      ).rejects.toThrow('EventGuest not found');
    });

    it('should include guest and event relations', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      const badge = await BadgeService.generate(eventGuest.id);

      // Verify relations (Requirements 6.2)
      expect(badge.eventGuest.guest.firstName).toBe(guest.firstName);
      expect(badge.eventGuest.guest.lastName).toBe(guest.lastName);
      expect(badge.eventGuest.guest.company).toBe(guest.company);
      expect(badge.eventGuest.event.name).toBe(event.name);
    });
  });

  describe('getByEventGuest', () => {
    it('should return badge by EventGuest ID', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);
      await BadgeService.generate(eventGuest.id);

      const badge = await BadgeService.getByEventGuest(eventGuest.id);

      expect(badge).not.toBeNull();
      expect(badge!.eventGuestId).toBe(eventGuest.id);
    });

    it('should return null for EventGuest without badge', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      const badge = await BadgeService.getByEventGuest(eventGuest.id);

      expect(badge).toBeNull();
    });

    it('should return null for empty ID', async () => {
      const badge = await BadgeService.getByEventGuest('');

      expect(badge).toBeNull();
    });
  });

  describe('generateQRCode', () => {
    it('should generate a valid QR code data URL', async () => {
      const qrToken = 'test-qr-token-12345';

      const qrDataUrl = await BadgeService.generateQRCode(qrToken);

      // Should be a valid PNG data URL
      expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('should throw error for empty QR token', async () => {
      await expect(
        BadgeService.generateQRCode('')
      ).rejects.toThrow('QR token is required');
    });
  });

  describe('generatePDF', () => {
    it('should generate a valid PDF buffer', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);
      const badge = await BadgeService.generate(eventGuest.id);

      // Generate PDF (Requirements 6.5)
      const pdfBuffer = await BadgeService.generatePDF(badge);

      // Should be a valid PDF (starts with %PDF)
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      expect(pdfBuffer.toString('utf8', 0, 4)).toBe('%PDF');
    });

    it('should generate PDF for guest without company', async () => {
      const event = await EventService.create(testEventInput);
      const guestWithoutCompany = await GuestService.create({
        firstName: 'Bob',
        lastName: 'Smith',
        email: 'bob.smith@example.com',
      });
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guestWithoutCompany.id);
      const badge = await BadgeService.generate(eventGuest.id);

      const pdfBuffer = await BadgeService.generatePDF(badge);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });
  });

  describe('generateWithPDF', () => {
    it('should generate badge and PDF together', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      const { badge, pdf } = await BadgeService.generateWithPDF(eventGuest.id);

      expect(badge).toBeDefined();
      expect(badge.eventGuestId).toBe(eventGuest.id);
      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(0);
    });
  });

  describe('Badge generation on RSVP=Attending', () => {
    it('should automatically generate badge when RSVP is set to Attending', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      // Verify no badge exists initially
      let badge = await BadgeService.getByEventGuest(eventGuest.id);
      expect(badge).toBeNull();

      // Update RSVP to Attending (Requirements 6.1)
      await EventGuestService.updateRSVP(eventGuest.qrToken, 'Attending');

      // Badge should now exist
      badge = await BadgeService.getByEventGuest(eventGuest.id);
      expect(badge).not.toBeNull();
      expect(badge!.qrToken).toBe(eventGuest.qrToken);
    });

    it('should not generate badge when RSVP is set to NotAttending', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      // Update RSVP to NotAttending
      await EventGuestService.updateRSVP(eventGuest.qrToken, 'NotAttending');

      // Badge should not exist
      const badge = await BadgeService.getByEventGuest(eventGuest.id);
      expect(badge).toBeNull();
    });

    it('should not generate badge when RSVP is set to NotAttending', async () => {
      const event = await EventService.create(testEventInput);
      const guest = await GuestService.create(testGuestInput);
      const eventGuest = await EventGuestService.addGuestToEvent(event.id, guest.id);

      // Update RSVP to NotAttending
      await EventGuestService.updateRSVP(eventGuest.qrToken, 'NotAttending');

      // Badge should not exist
      const badge = await BadgeService.getByEventGuest(eventGuest.id);
      expect(badge).toBeNull();
    });
  });
});
