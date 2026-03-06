import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AnalyticsService } from '../services/analytics-service';
import { EventService } from '../services/event-service';
import { GuestService } from '../services/guest-service';
import { EventGuestService } from '../services/event-guest-service';
import { CampaignService } from '../services/campaign-service';
import { db, campaignMessages, campaigns, eventGuests, guests, events } from '@/db';
import { eq } from 'drizzle-orm';

describe('AnalyticsService', () => {
  let testEventId: string;
  let testGuestIds: string[] = [];
  let testCampaignId: string;

  beforeEach(async () => {
    // Create a test event
    const event = await EventService.create({
      name: 'Analytics Test Event',
      type: 'Conference',
      description: 'Test event for analytics',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-02'),
      location: 'Test Venue',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    });
    testEventId = event.id;

    // Create test guests
    const guest1 = await GuestService.create({
      firstName: 'Alice',
      lastName: 'Analytics',
      email: `alice-analytics-${Date.now()}@test.com`,
    });
    const guest2 = await GuestService.create({
      firstName: 'Bob',
      lastName: 'Analytics',
      email: `bob-analytics-${Date.now()}@test.com`,
    });
    const guest3 = await GuestService.create({
      firstName: 'Charlie',
      lastName: 'Analytics',
      email: `charlie-analytics-${Date.now()}@test.com`,
    });
    testGuestIds = [guest1.id, guest2.id, guest3.id];

    // Add guests to event
    await EventGuestService.addGuestToEvent(testEventId, guest1.id);
    await EventGuestService.addGuestToEvent(testEventId, guest2.id);
    await EventGuestService.addGuestToEvent(testEventId, guest3.id);

    // Create a test campaign
    const campaign = await CampaignService.create({
      eventId: testEventId,
      name: 'Test Campaign',
      type: 'Invitation',
      subject: 'Test Subject',
      content: 'Test Content',
    });
    testCampaignId = campaign.id;
  });

  afterEach(async () => {
    // Clean up test data
    if (testEventId) {
      await db.delete(events).where(eq(events.id, testEventId)).catch(() => {});
    }
    for (const guestId of testGuestIds) {
      await db.delete(guests).where(eq(guests.id, guestId)).catch(() => {});
    }
    testGuestIds = [];
  });

  describe('getEventAnalytics', () => {
    it('should return correct totalInvited count', async () => {
      const analytics = await AnalyticsService.getEventAnalytics(testEventId);
      
      expect(analytics.totalInvited).toBe(3);
    });

    it('should return correct RSVP breakdown with all pending', async () => {
      const analytics = await AnalyticsService.getEventAnalytics(testEventId);
      
      expect(analytics.rsvpBreakdown.pending).toBe(3);
      expect(analytics.rsvpBreakdown.attending).toBe(0);
      expect(analytics.rsvpBreakdown.notAttending).toBe(0);
    });

    it('should return correct RSVP breakdown after status updates', async () => {
      // Get event guests and update their RSVP statuses
      const eventGuests = await EventGuestService.getEventGuests(testEventId);
      
      await EventGuestService.updateRSVP(eventGuests[0].qrToken, 'Attending');
      await EventGuestService.updateRSVP(eventGuests[1].qrToken, 'NotAttending');
      await EventGuestService.updateRSVP(eventGuests[2].qrToken, 'NotAttending');

      const analytics = await AnalyticsService.getEventAnalytics(testEventId);
      
      expect(analytics.rsvpBreakdown.attending).toBe(1);
      expect(analytics.rsvpBreakdown.notAttending).toBe(2);
      expect(analytics.rsvpBreakdown.pending).toBe(0);
    });

    it('should return correct check-in count and rate', async () => {
      // Get event guests
      const eventGuests = await EventGuestService.getEventGuests(testEventId);
      
      // Set one guest as attending and check them in
      await EventGuestService.updateRSVP(eventGuests[0].qrToken, 'Attending');
      await EventGuestService.checkIn(eventGuests[0].qrToken);

      const analytics = await AnalyticsService.getEventAnalytics(testEventId);
      
      expect(analytics.checkInCount).toBe(1);
      expect(analytics.checkInRate).toBe(100); // 1 checked in / 1 attending = 100%
    });

    it('should calculate check-in rate correctly with multiple attendees', async () => {
      const eventGuests = await EventGuestService.getEventGuests(testEventId);
      
      // Set two guests as attending
      await EventGuestService.updateRSVP(eventGuests[0].qrToken, 'Attending');
      await EventGuestService.updateRSVP(eventGuests[1].qrToken, 'Attending');
      
      // Check in only one
      await EventGuestService.checkIn(eventGuests[0].qrToken);

      const analytics = await AnalyticsService.getEventAnalytics(testEventId);
      
      expect(analytics.rsvpBreakdown.attending).toBe(2);
      expect(analytics.checkInCount).toBe(1);
      expect(analytics.checkInRate).toBe(50); // 1 checked in / 2 attending = 50%
    });

    it('should return 0 check-in rate when no one is attending', async () => {
      const analytics = await AnalyticsService.getEventAnalytics(testEventId);
      
      expect(analytics.checkInRate).toBe(0);
    });

    it('should return zero email stats when no messages sent', async () => {
      const analytics = await AnalyticsService.getEventAnalytics(testEventId);
      
      expect(analytics.emailsSent).toBe(0);
      expect(analytics.emailsDelivered).toBe(0);
    });

    it('should throw error for non-existent event', async () => {
      await expect(
        AnalyticsService.getEventAnalytics('non-existent-id')
      ).rejects.toThrow('Event not found');
    });

    it('should throw error for empty event ID', async () => {
      await expect(
        AnalyticsService.getEventAnalytics('')
      ).rejects.toThrow('Event ID is required');
    });
  });

  describe('getCampaignAnalytics', () => {
    it('should return correct campaign analytics with no messages', async () => {
      const analytics = await AnalyticsService.getCampaignAnalytics(testCampaignId);
      
      expect(analytics.campaignId).toBe(testCampaignId);
      expect(analytics.campaignName).toBe('Test Campaign');
      expect(analytics.totalSent).toBe(0);
      expect(analytics.delivered).toBe(0);
      expect(analytics.deliveryRate).toBe(0);
    });

    it('should calculate delivery rate correctly with messages', async () => {
      // Create campaign messages directly
      const eventGuestsList = await EventGuestService.getEventGuests(testEventId);
      
      await db.insert(campaignMessages).values([
        { campaignId: testCampaignId, eventGuestId: eventGuestsList[0].id, status: 'Delivered' },
        { campaignId: testCampaignId, eventGuestId: eventGuestsList[1].id, status: 'Delivered' },
        { campaignId: testCampaignId, eventGuestId: eventGuestsList[2].id, status: 'Sent' },
      ]);

      const analytics = await AnalyticsService.getCampaignAnalytics(testCampaignId);
      
      expect(analytics.totalSent).toBe(3);
      expect(analytics.delivered).toBe(2);
      expect(analytics.deliveryRate).toBeCloseTo(66.67, 1);
    });

    it('should not count pending messages as sent', async () => {
      const eventGuestsList = await EventGuestService.getEventGuests(testEventId);
      
      await db.insert(campaignMessages).values([
        { campaignId: testCampaignId, eventGuestId: eventGuestsList[0].id, status: 'Pending' },
        { campaignId: testCampaignId, eventGuestId: eventGuestsList[1].id, status: 'Delivered' },
      ]);

      const analytics = await AnalyticsService.getCampaignAnalytics(testCampaignId);
      
      expect(analytics.totalSent).toBe(1);
      expect(analytics.delivered).toBe(1);
      expect(analytics.deliveryRate).toBe(100);
    });

    it('should throw error for non-existent campaign', async () => {
      await expect(
        AnalyticsService.getCampaignAnalytics('non-existent-id')
      ).rejects.toThrow('Campaign not found');
    });

    it('should throw error for empty campaign ID', async () => {
      await expect(
        AnalyticsService.getCampaignAnalytics('')
      ).rejects.toThrow('Campaign ID is required');
    });
  });
});
