/**
 * @fileoverview E2E Tests for Campaign Lifecycle, Link Tracking, and Report Generation
 * 
 * Tests the complete campaign lifecycle from creation to report generation:
 * - Campaign creation and configuration
 * - Link tracking setup and click recording
 * - Email open tracking
 * - Report generation with accurate metrics
 * 
 * Requirements: 3, 6, 7
 * 
 * Note: These tests use Neon's HTTP driver which has eventual consistency.
 * Tests are designed to be self-contained with unique data per test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CampaignService } from '../services/campaign-service';
import { LinkTrackingService } from '../services/link-tracking-service';
import { ReportService } from '../services/report-service';
import { db } from '@/db';
import {
  campaigns,
  campaignMessages,
  campaignLinks,
  linkClicks,
  emailOpens,
  events,
  eventGuests,
  guests,
} from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('E2E: Campaign Lifecycle', () => {
  // Shared test data - unique per test run
  const TEST_RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  describe('Complete Campaign Lifecycle Flow', () => {
    const TEST_PREFIX = `e2e_full_${TEST_RUN_ID}_`;
    let testEventId: string;
    let testCampaignId: string;
    let testGuestIds: string[] = [];
    let testEventGuestIds: string[] = [];
    let testMessageIds: string[] = [];

    beforeEach(async () => {
      testGuestIds = [];
      testEventGuestIds = [];
      testMessageIds = [];
      testCampaignId = '';

      // Create test event
      const [event] = await db.insert(events).values({
        name: `${TEST_PREFIX}Event`,
        type: 'Conference',
        description: 'E2E test event',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-02'),
        location: 'Test Location',
        hostName: 'Test Host',
        hostEmail: `${TEST_PREFIX}host@example.com`,
      }).returning();
      testEventId = event.id;

      // Wait for Neon HTTP driver eventual consistency
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create 10 test guests
      for (let i = 0; i < 10; i++) {
        const [guest] = await db.insert(guests).values({
          firstName: `First${i}`,
          lastName: `Last${i}`,
          email: `${TEST_PREFIX}guest${i}@example.com`,
          company: `Company ${i}`,
        }).returning();
        testGuestIds.push(guest.id);

        // Wait for guest to be committed before creating event_guest
        await new Promise(resolve => setTimeout(resolve, 50));

        const [eventGuest] = await db.insert(eventGuests).values({
          eventId: testEventId,
          guestId: guest.id,
        }).returning();
        testEventGuestIds.push(eventGuest.id);
      }
    });

    afterEach(async () => {
      // Clean up in reverse dependency order
      if (testCampaignId) {
        const links = await db.query.campaignLinks.findMany({
          where: eq(campaignLinks.campaignId, testCampaignId),
        });
        for (const link of links) {
          await db.delete(linkClicks).where(eq(linkClicks.linkId, link.id));
        }
        for (const messageId of testMessageIds) {
          await db.delete(emailOpens).where(eq(emailOpens.campaignMessageId, messageId));
        }
        await db.delete(campaignLinks).where(eq(campaignLinks.campaignId, testCampaignId));
        await db.delete(campaignMessages).where(eq(campaignMessages.campaignId, testCampaignId));
        await db.delete(campaigns).where(eq(campaigns.id, testCampaignId));
      }
      for (const eventGuestId of testEventGuestIds) {
        await db.delete(eventGuests).where(eq(eventGuests.id, eventGuestId));
      }
      for (const guestId of testGuestIds) {
        await db.delete(guests).where(eq(guests.id, guestId));
      }
      if (testEventId) {
        await db.delete(events).where(eq(events.id, testEventId));
      }
    });

    it('should complete full campaign lifecycle: create, track, engage, report', async () => {
      // === STEP 1: Create Campaign ===
      const campaign = await CampaignService.create({
        eventId: testEventId,
        name: `${TEST_PREFIX}Lifecycle Campaign`,
        type: 'Invitation',
        subject: 'You are invited!',
        content: '<p>Click <a href="https://example.com/register">here</a> to register.</p>',
      });
      testCampaignId = campaign.id;

      expect(campaign.id).toBeDefined();
      expect(campaign.status).toBe('Draft');

      // === STEP 2: Create Tracking Links ===
      const contentWithTracking = await LinkTrackingService.createTrackingLinks(
        testCampaignId,
        campaign.content,
        'https://myapp.com',
        { utmSource: 'email', utmMedium: 'campaign' }
      );

      expect(contentWithTracking).toContain('/track/');
      
      const links = await LinkTrackingService.getLinksByCampaign(testCampaignId);
      expect(links.length).toBe(1);
      expect(links[0].utmSource).toBe('email');

      // === STEP 3: Simulate Campaign Send ===
      await db.update(campaigns)
        .set({ 
          status: 'Sent', 
          sentAt: new Date(),
          recipientCount: 10,
          sentCount: 10,
        })
        .where(eq(campaigns.id, testCampaignId));

      // Create campaign messages
      for (let i = 0; i < 10; i++) {
        const [message] = await db.insert(campaignMessages).values({
          campaignId: testCampaignId,
          eventGuestId: testEventGuestIds[i],
          status: 'Delivered',
          sentAt: new Date(),
          deliveredAt: new Date(),
        }).returning();
        testMessageIds.push(message.id);
      }

      // === STEP 4: Simulate Opens (5 recipients) ===
      for (let i = 0; i < 5; i++) {
        await db.insert(emailOpens).values({
          campaignMessageId: testMessageIds[i],
          openedAt: new Date(),
        });
        await db.update(campaignMessages)
          .set({ openedAt: new Date() })
          .where(eq(campaignMessages.id, testMessageIds[i]));
      }
      await db.update(campaigns)
        .set({ openedCount: 5 })
        .where(eq(campaigns.id, testCampaignId));

      // === STEP 5: Simulate Clicks (3 unique recipients) ===
      const linkId = links[0].id;
      
      // Record clicks
      await LinkTrackingService.recordClick(linkId, {
        recipientEmail: `${TEST_PREFIX}guest0@example.com`,
        campaignMessageId: testMessageIds[0],
      });
      await LinkTrackingService.recordClick(linkId, {
        recipientEmail: `${TEST_PREFIX}guest1@example.com`,
        campaignMessageId: testMessageIds[1],
      });
      await LinkTrackingService.recordClick(linkId, {
        recipientEmail: `${TEST_PREFIX}guest2@example.com`,
        campaignMessageId: testMessageIds[2],
      });

      // === STEP 6: Verify Click Statistics ===
      const clickStats = await LinkTrackingService.getClickStats(testCampaignId);
      
      expect(clickStats.totalLinks).toBe(1);
      expect(clickStats.totalClicks).toBe(3);
      expect(clickStats.uniqueClicks).toBe(3);

      // === STEP 7: Generate Report ===
      const report = await ReportService.getCampaignReport(testCampaignId);

      expect(report.campaignId).toBe(testCampaignId);
      expect(report.campaignStatus).toBe('Sent');
      expect(report.recipientCount).toBe(10);

      // Delivery metrics
      expect(report.delivery.totalSent).toBe(10);
      expect(report.delivery.delivered).toBe(10);
      expect(report.delivery.deliveryRate).toBe(100);

      // Engagement metrics
      expect(report.engagement.uniqueOpens).toBe(5);
      expect(report.engagement.openRate).toBe(50);
      expect(report.engagement.totalClicks).toBe(3);
      expect(report.engagement.uniqueClicks).toBe(3);
      expect(report.engagement.clickThroughRate).toBe(30);

      // Link performance
      expect(report.linkPerformance.length).toBe(1);
      expect(report.linkPerformance[0].totalClicks).toBe(3);
    });

    it('should handle bounced emails in reports', async () => {
      const campaign = await CampaignService.create({
        eventId: testEventId,
        name: `${TEST_PREFIX}Bounce Campaign`,
        type: 'Reminder',
        subject: 'Reminder',
        content: '<p>Reminder content</p>',
      });
      testCampaignId = campaign.id;

      await db.update(campaigns)
        .set({ 
          status: 'Sent', 
          sentAt: new Date(),
          recipientCount: 10,
          sentCount: 10,
        })
        .where(eq(campaigns.id, testCampaignId));

      // Create messages: 7 delivered, 2 bounced, 1 failed
      const statuses: Array<'Delivered' | 'Bounced' | 'Failed'> = [
        'Delivered', 'Delivered', 'Delivered', 'Delivered', 'Delivered',
        'Delivered', 'Delivered', 'Bounced', 'Bounced', 'Failed'
      ];
      
      for (let i = 0; i < 10; i++) {
        const [message] = await db.insert(campaignMessages).values({
          campaignId: testCampaignId,
          eventGuestId: testEventGuestIds[i],
          status: statuses[i],
          sentAt: new Date(),
          deliveredAt: statuses[i] === 'Delivered' ? new Date() : null,
          bounceType: statuses[i] === 'Bounced' ? 'hard' : null,
        }).returning();
        testMessageIds.push(message.id);
      }

      const report = await ReportService.getCampaignReport(testCampaignId);

      expect(report.delivery.delivered).toBe(7);
      expect(report.delivery.bounced).toBe(2);
      expect(report.delivery.hardBounces).toBe(2);
      expect(report.delivery.failed).toBe(1);
      expect(report.delivery.deliveryRate).toBe(70);
    });
  });

  describe('Link Tracking', () => {
    const TEST_PREFIX = `e2e_link_${TEST_RUN_ID}_`;
    let testEventId: string;
    let testCampaignId: string;
    let testGuestIds: string[] = [];
    let testEventGuestIds: string[] = [];

    beforeEach(async () => {
      testGuestIds = [];
      testEventGuestIds = [];
      testCampaignId = '';

      const [event] = await db.insert(events).values({
        name: `${TEST_PREFIX}Event`,
        type: 'Conference',
        description: 'Link tracking test',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-02'),
        location: 'Test Location',
        hostName: 'Test Host',
        hostEmail: `${TEST_PREFIX}host@example.com`,
      }).returning();
      testEventId = event.id;

      // Wait for Neon HTTP driver eventual consistency
      await new Promise(resolve => setTimeout(resolve, 100));

      for (let i = 0; i < 3; i++) {
        const [guest] = await db.insert(guests).values({
          firstName: `First${i}`,
          lastName: `Last${i}`,
          email: `${TEST_PREFIX}guest${i}@example.com`,
        }).returning();
        testGuestIds.push(guest.id);

        // Wait for guest to be committed before creating event_guest
        await new Promise(resolve => setTimeout(resolve, 50));

        const [eventGuest] = await db.insert(eventGuests).values({
          eventId: testEventId,
          guestId: guest.id,
        }).returning();
        testEventGuestIds.push(eventGuest.id);
      }
    });

    afterEach(async () => {
      if (testCampaignId) {
        const links = await db.query.campaignLinks.findMany({
          where: eq(campaignLinks.campaignId, testCampaignId),
        });
        for (const link of links) {
          await db.delete(linkClicks).where(eq(linkClicks.linkId, link.id));
        }
        await db.delete(campaignLinks).where(eq(campaignLinks.campaignId, testCampaignId));
        await db.delete(campaignMessages).where(eq(campaignMessages.campaignId, testCampaignId));
        await db.delete(campaigns).where(eq(campaigns.id, testCampaignId));
      }
      for (const eventGuestId of testEventGuestIds) {
        await db.delete(eventGuests).where(eq(eventGuests.id, eventGuestId));
      }
      for (const guestId of testGuestIds) {
        await db.delete(guests).where(eq(guests.id, guestId));
      }
      if (testEventId) {
        await db.delete(events).where(eq(events.id, testEventId));
      }
    });

    it('should track UTM parameters correctly', async () => {
      const campaign = await CampaignService.create({
        eventId: testEventId,
        name: `${TEST_PREFIX}UTM Campaign`,
        type: 'Invitation',
        subject: 'UTM Test',
        content: '<a href="https://example.com/page">Click</a>',
      });
      testCampaignId = campaign.id;

      await LinkTrackingService.createTrackingLinks(
        testCampaignId,
        campaign.content,
        'https://myapp.com',
        {
          utmSource: 'newsletter',
          utmMedium: 'email',
          utmCampaign: 'spring-2026',
          utmContent: 'cta-button',
        }
      );

      const links = await LinkTrackingService.getLinksByCampaign(testCampaignId);
      expect(links.length).toBe(1);
      expect(links[0].utmSource).toBe('newsletter');
      expect(links[0].utmMedium).toBe('email');
      expect(links[0].utmCampaign).toBe('spring-2026');
      expect(links[0].utmContent).toBe('cta-button');

      const redirectUrl = await LinkTrackingService.getRedirectUrlWithUTM(links[0].id);
      expect(redirectUrl).toContain('utm_source=newsletter');
      expect(redirectUrl).toContain('utm_medium=email');
    });

    it('should track multiple links in a single email', async () => {
      const campaign = await CampaignService.create({
        eventId: testEventId,
        name: `${TEST_PREFIX}Multi-Link`,
        type: 'Invitation',
        subject: 'Multi-Link Test',
        content: `
          <a href="https://example.com/register">Register</a>
          <a href="https://example.com/info">Info</a>
        `,
      });
      testCampaignId = campaign.id;

      await LinkTrackingService.createTrackingLinks(
        testCampaignId,
        campaign.content,
        'https://myapp.com'
      );

      const links = await LinkTrackingService.getLinksByCampaign(testCampaignId);
      expect(links.length).toBe(2);
      
      const urls = links.map(l => l.originalUrl);
      expect(urls).toContain('https://example.com/register');
      expect(urls).toContain('https://example.com/info');
    });
  });

  describe('Report Export', () => {
    const TEST_PREFIX = `e2e_export_${TEST_RUN_ID}_`;
    let testEventId: string;
    let testCampaignId: string;
    let testGuestIds: string[] = [];
    let testEventGuestIds: string[] = [];
    let testMessageIds: string[] = [];

    beforeEach(async () => {
      testGuestIds = [];
      testEventGuestIds = [];
      testMessageIds = [];
      testCampaignId = '';

      const [event] = await db.insert(events).values({
        name: `${TEST_PREFIX}Event`,
        type: 'Conference',
        description: 'Export test',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-02'),
        location: 'Test Location',
        hostName: 'Test Host',
        hostEmail: `${TEST_PREFIX}host@example.com`,
      }).returning();
      testEventId = event.id;

      // Wait for Neon HTTP driver eventual consistency
      await new Promise(resolve => setTimeout(resolve, 100));

      for (let i = 0; i < 3; i++) {
        const [guest] = await db.insert(guests).values({
          firstName: `First${i}`,
          lastName: `Last${i}`,
          email: `${TEST_PREFIX}guest${i}@example.com`,
        }).returning();
        testGuestIds.push(guest.id);

        // Wait for guest to be committed before creating event_guest
        await new Promise(resolve => setTimeout(resolve, 50));

        const [eventGuest] = await db.insert(eventGuests).values({
          eventId: testEventId,
          guestId: guest.id,
        }).returning();
        testEventGuestIds.push(eventGuest.id);
      }
    });

    afterEach(async () => {
      if (testCampaignId) {
        for (const messageId of testMessageIds) {
          await db.delete(emailOpens).where(eq(emailOpens.campaignMessageId, messageId));
        }
        await db.delete(campaignMessages).where(eq(campaignMessages.campaignId, testCampaignId));
        await db.delete(campaigns).where(eq(campaigns.id, testCampaignId));
      }
      for (const eventGuestId of testEventGuestIds) {
        await db.delete(eventGuests).where(eq(eventGuests.id, eventGuestId));
      }
      for (const guestId of testGuestIds) {
        await db.delete(guests).where(eq(guests.id, guestId));
      }
      if (testEventId) {
        await db.delete(events).where(eq(events.id, testEventId));
      }
    });

    it('should export report as CSV', async () => {
      const campaign = await CampaignService.create({
        eventId: testEventId,
        name: `${TEST_PREFIX}CSV Export`,
        type: 'ThankYou',
        subject: 'Thank you!',
        content: '<p>Thanks!</p>',
      });
      testCampaignId = campaign.id;

      await db.update(campaigns)
        .set({ status: 'Sent', sentAt: new Date(), recipientCount: 3, sentCount: 3 })
        .where(eq(campaigns.id, testCampaignId));

      for (let i = 0; i < 3; i++) {
        const [message] = await db.insert(campaignMessages).values({
          campaignId: testCampaignId,
          eventGuestId: testEventGuestIds[i],
          status: 'Delivered',
          sentAt: new Date(),
          deliveredAt: new Date(),
        }).returning();
        testMessageIds.push(message.id);
      }

      const csv = await ReportService.exportReport(testCampaignId, 'csv');

      expect(csv).toContain('CAMPAIGN SUMMARY');
      expect(csv).toContain('DELIVERY METRICS');
      expect(csv).toContain('ENGAGEMENT METRICS');
      expect(csv).toContain('RECIPIENT DETAILS');
      expect(csv).toContain(`${TEST_PREFIX}CSV Export`);
    });

    it('should export report as PDF (base64)', async () => {
      const campaign = await CampaignService.create({
        eventId: testEventId,
        name: `${TEST_PREFIX}PDF Export`,
        type: 'Feedback',
        subject: 'Feedback',
        content: '<p>Feedback</p>',
      });
      testCampaignId = campaign.id;

      await db.update(campaigns)
        .set({ status: 'Sent', sentAt: new Date(), recipientCount: 1 })
        .where(eq(campaigns.id, testCampaignId));

      const pdf = await ReportService.exportReport(testCampaignId, 'pdf');

      // Verify valid base64
      expect(() => Buffer.from(pdf, 'base64')).not.toThrow();
      
      const decoded = Buffer.from(pdf, 'base64').toString('utf-8');
      expect(decoded).toContain('Campaign Report');
      expect(decoded).toContain(`${TEST_PREFIX}PDF Export`);
    });
  });
});
