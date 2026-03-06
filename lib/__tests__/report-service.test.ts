import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReportService } from '../services/report-service';
import { db } from '@/db';
import {
  campaigns,
  campaignMessages,
  campaignLinks,
  linkClicks,
  emailOpens,
  unsubscribes,
  events,
  eventGuests,
  guests,
} from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('ReportService', () => {
  // Test data - use timestamp to ensure uniqueness across test runs
  const TEST_PREFIX = `report_test_${Date.now()}_`;
  let testEventId: string;
  let testCampaignId: string;
  let testGuestIds: string[] = [];
  let testEventGuestIds: string[] = [];
  let testMessageIds: string[] = [];
  let testLinkIds: string[] = [];

  // Setup test data before each test
  beforeEach(async () => {
    // Reset arrays
    testGuestIds = [];
    testEventGuestIds = [];
    testMessageIds = [];
    testLinkIds = [];

    // Create test event
    const [event] = await db.insert(events).values({
      name: `${TEST_PREFIX}Event`,
      type: 'Conference',
      description: 'Test event for report service tests',
      startDate: new Date('2025-06-01'),
      endDate: new Date('2025-06-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: `${TEST_PREFIX}host@example.com`,
    }).returning();
    testEventId = event.id;

    // Create test guests
    for (let i = 0; i < 5; i++) {
      const [guest] = await db.insert(guests).values({
        firstName: `Test${i}`,
        lastName: `User${i}`,
        email: `${TEST_PREFIX}guest${i}@example.com`,
        company: `Company ${i}`,
      }).returning();
      testGuestIds.push(guest.id);

      // Create event guests
      const [eventGuest] = await db.insert(eventGuests).values({
        eventId: testEventId,
        guestId: guest.id,
      }).returning();
      testEventGuestIds.push(eventGuest.id);
    }

    // Create test campaign
    const [campaign] = await db.insert(campaigns).values({
      eventId: testEventId,
      name: `${TEST_PREFIX}Campaign`,
      type: 'Invitation',
      subject: 'Test Subject',
      content: 'Test Content',
      status: 'Sent',
      recipientCount: 5,
      sentCount: 5,
      sentAt: new Date('2025-01-15T10:00:00Z'),
    }).returning();
    testCampaignId = campaign.id;

    // Create campaign messages with various statuses
    const messageStatuses = ['Delivered', 'Delivered', 'Delivered', 'Bounced', 'Failed'];
    for (let i = 0; i < 5; i++) {
      const [message] = await db.insert(campaignMessages).values({
        campaignId: testCampaignId,
        eventGuestId: testEventGuestIds[i],
        status: messageStatuses[i] as 'Pending' | 'Sent' | 'Delivered' | 'Failed' | 'Bounced',
        sentAt: new Date('2025-01-15T10:00:00Z'),
        deliveredAt: messageStatuses[i] === 'Delivered' ? new Date('2025-01-15T10:01:00Z') : null,
        openedAt: i < 2 ? new Date(`2025-01-15T1${i}:00:00Z`) : null,
        clickedAt: i === 0 ? new Date('2025-01-15T11:30:00Z') : null,
        bounceType: messageStatuses[i] === 'Bounced' ? 'hard' : null,
      }).returning();
      testMessageIds.push(message.id);
    }

    // Create campaign links
    const [link1] = await db.insert(campaignLinks).values({
      campaignId: testCampaignId,
      originalUrl: 'https://example.com/page1',
      trackingUrl: `https://myapp.com/track/${TEST_PREFIX}link1_${Date.now()}`,
      label: 'Page 1',
    }).returning();
    testLinkIds.push(link1.id);

    const [link2] = await db.insert(campaignLinks).values({
      campaignId: testCampaignId,
      originalUrl: 'https://example.com/page2',
      trackingUrl: `https://myapp.com/track/${TEST_PREFIX}link2_${Date.now()}`,
      label: 'Page 2',
    }).returning();
    testLinkIds.push(link2.id);

    // Create link clicks
    await db.insert(linkClicks).values([
      { linkId: link1.id, recipientEmail: `${TEST_PREFIX}guest0@example.com`, clickedAt: new Date('2025-01-15T11:30:00Z') },
      { linkId: link1.id, recipientEmail: `${TEST_PREFIX}guest0@example.com`, clickedAt: new Date('2025-01-15T11:35:00Z') },
      { linkId: link1.id, recipientEmail: `${TEST_PREFIX}guest1@example.com`, clickedAt: new Date('2025-01-15T12:00:00Z') },
      { linkId: link2.id, recipientEmail: `${TEST_PREFIX}guest0@example.com`, clickedAt: new Date('2025-01-15T11:45:00Z') },
    ]);

    // Create email opens
    await db.insert(emailOpens).values([
      { campaignMessageId: testMessageIds[0], openedAt: new Date('2025-01-15T10:30:00Z') },
      { campaignMessageId: testMessageIds[0], openedAt: new Date('2025-01-15T10:45:00Z') },
      { campaignMessageId: testMessageIds[1], openedAt: new Date('2025-01-15T11:00:00Z') },
    ]);

    // Create unsubscribe
    await db.insert(unsubscribes).values({
      email: `${TEST_PREFIX}guest4@example.com`,
      campaignId: testCampaignId,
      reason: 'user_request',
    });
  });

  // Clean up after each test
  afterEach(async () => {
    // Clean up in reverse order of dependencies
    for (const linkId of testLinkIds) {
      await db.delete(linkClicks).where(eq(linkClicks.linkId, linkId));
    }
    for (const messageId of testMessageIds) {
      await db.delete(emailOpens).where(eq(emailOpens.campaignMessageId, messageId));
    }
    if (testCampaignId) {
      await db.delete(unsubscribes).where(eq(unsubscribes.campaignId, testCampaignId));
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

  describe('getDeliveryMetrics', () => {
    it('should calculate delivery metrics correctly', async () => {
      const metrics = await ReportService.getDeliveryMetrics(testCampaignId);

      expect(metrics.totalSent).toBe(5);
      expect(metrics.delivered).toBe(3);
      expect(metrics.bounced).toBe(1);
      expect(metrics.hardBounces).toBe(1);
      expect(metrics.softBounces).toBe(0);
      expect(metrics.failed).toBe(1);
      expect(metrics.pending).toBe(0);
      expect(metrics.deliveryRate).toBe(60); // 3/5 * 100
    });

    it('should throw error for non-existent campaign', async () => {
      await expect(
        ReportService.getDeliveryMetrics('non-existent-id')
      ).rejects.toThrow('Campaign with ID "non-existent-id" not found');
    });
  });

  describe('getEngagementMetrics', () => {
    it('should calculate engagement metrics correctly', async () => {
      const metrics = await ReportService.getEngagementMetrics(testCampaignId);

      expect(metrics.totalOpens).toBe(3); // 3 open records
      expect(metrics.uniqueOpens).toBe(2); // 2 messages with openedAt
      expect(metrics.openRate).toBe(40); // 2/5 * 100
      expect(metrics.totalClicks).toBe(4); // 4 click records
      expect(metrics.uniqueClicks).toBe(2); // 2 unique emails clicked
      expect(metrics.clickThroughRate).toBe(40); // 2/5 * 100
      expect(metrics.unsubscribes).toBe(1);
      expect(metrics.unsubscribeRate).toBe(20); // 1/5 * 100
    });

    it('should throw error for non-existent campaign', async () => {
      await expect(
        ReportService.getEngagementMetrics('non-existent-id')
      ).rejects.toThrow('Campaign with ID "non-existent-id" not found');
    });
  });

  describe('getLinkPerformance', () => {
    it('should return link performance sorted by clicks', async () => {
      const performance = await ReportService.getLinkPerformance(testCampaignId);

      expect(performance).toHaveLength(2);
      // Link 1 has 3 clicks, Link 2 has 1 click
      expect(performance[0].totalClicks).toBe(3);
      expect(performance[0].uniqueClicks).toBe(2);
      expect(performance[0].label).toBe('Page 1');
      expect(performance[1].totalClicks).toBe(1);
      expect(performance[1].uniqueClicks).toBe(1);
      expect(performance[1].label).toBe('Page 2');
    });

    it('should throw error for non-existent campaign', async () => {
      await expect(
        ReportService.getLinkPerformance('non-existent-id')
      ).rejects.toThrow('Campaign with ID "non-existent-id" not found');
    });
  });

  describe('getRecipientStatus', () => {
    it('should return paginated recipient status', async () => {
      const result = await ReportService.getRecipientStatus(testCampaignId);

      expect(result.total).toBe(5);
      expect(result.data).toHaveLength(5);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
    });

    it('should filter by status', async () => {
      const result = await ReportService.getRecipientStatus(testCampaignId, {
        status: 'Delivered',
      });

      expect(result.total).toBe(3);
      result.data.forEach(r => {
        expect(r.messageStatus).toBe('Delivered');
      });
    });

    it('should throw error for non-existent campaign', async () => {
      await expect(
        ReportService.getRecipientStatus('non-existent-id')
      ).rejects.toThrow('Campaign with ID "non-existent-id" not found');
    });
  });

  describe('getCampaignReport', () => {
    it('should return full campaign report', async () => {
      const report = await ReportService.getCampaignReport(testCampaignId);

      expect(report.campaignId).toBe(testCampaignId);
      expect(report.campaignName).toBe(`${TEST_PREFIX}Campaign`);
      expect(report.campaignType).toBe('Invitation');
      expect(report.campaignStatus).toBe('Sent');
      expect(report.eventId).toBe(testEventId);
      expect(report.recipientCount).toBe(5);
      
      // Verify delivery metrics are included
      expect(report.delivery).toBeDefined();
      expect(report.delivery.totalSent).toBe(5);
      
      // Verify engagement metrics are included
      expect(report.engagement).toBeDefined();
      expect(report.engagement.uniqueOpens).toBe(2);
      
      // Verify link performance is included
      expect(report.linkPerformance).toBeDefined();
      expect(report.linkPerformance).toHaveLength(2);
    });

    it('should throw error for non-existent campaign', async () => {
      await expect(
        ReportService.getCampaignReport('non-existent-id')
      ).rejects.toThrow('Campaign with ID "non-existent-id" not found');
    });
  });

  describe('exportReport', () => {
    it('should export report as CSV', async () => {
      const csv = await ReportService.exportReport(testCampaignId, 'csv');

      expect(csv).toContain('CAMPAIGN SUMMARY');
      expect(csv).toContain('DELIVERY METRICS');
      expect(csv).toContain('ENGAGEMENT METRICS');
      expect(csv).toContain('RECIPIENT DETAILS');
    });

    it('should export report as PDF (base64)', async () => {
      const pdf = await ReportService.exportReport(testCampaignId, 'pdf');

      // Should be base64 encoded
      expect(() => Buffer.from(pdf, 'base64')).not.toThrow();
      
      // Decode and check content
      const decoded = Buffer.from(pdf, 'base64').toString('utf-8');
      expect(decoded).toContain('Campaign Report');
    });

    it('should throw error for unsupported format', async () => {
      await expect(
        ReportService.exportReport(testCampaignId, 'xml' as 'csv')
      ).rejects.toThrow('Unsupported export format: xml');
    });
  });

  describe('getCampaignSummary', () => {
    it('should return campaign summary', async () => {
      const summary = await ReportService.getCampaignSummary(testCampaignId);

      expect(summary.campaignId).toBe(testCampaignId);
      expect(summary.name).toBe(`${TEST_PREFIX}Campaign`);
      expect(summary.status).toBe('Sent');
      expect(summary.recipientCount).toBe(5);
      expect(summary.deliveryRate).toBe(60);
      expect(summary.openRate).toBe(40);
      expect(summary.clickThroughRate).toBe(40);
    });

    it('should throw error for non-existent campaign', async () => {
      await expect(
        ReportService.getCampaignSummary('non-existent-id')
      ).rejects.toThrow('Campaign with ID "non-existent-id" not found');
    });
  });
});
