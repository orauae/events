import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { 
  BounceService, 
  SOFT_BOUNCE_THRESHOLD,
  UNDELIVERABLE_REASONS,
} from '../services/bounce-service';
import { db } from '@/db';
import { bounces, unsubscribes, campaigns, campaignMessages, events, eventGuests, guests } from '@/db/schema';
import { eq, like } from 'drizzle-orm';

describe('BounceService', () => {
  // Test data - use unique prefix to avoid conflicts with other tests
  const TEST_PREFIX = 'bounce_test_';
  let testEventId: string;
  let testCampaignId: string;
  let testGuestId: string;
  let testEventGuestId: string;
  let testMessageId: string;

  // Setup test data once before all tests
  beforeAll(async () => {
    // Create test event
    const [event] = await db.insert(events).values({
      name: `${TEST_PREFIX}Event`,
      type: 'Conference',
      description: 'Test event for bounce service tests',
      startDate: new Date('2025-06-01'),
      endDate: new Date('2025-06-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: `${TEST_PREFIX}host@example.com`,
    }).returning();
    testEventId = event.id;

    // Create test guest
    const [guest] = await db.insert(guests).values({
      firstName: 'Test',
      lastName: 'User',
      email: `${TEST_PREFIX}guest@example.com`,
    }).returning();
    testGuestId = guest.id;

    // Create test event guest
    const [eventGuest] = await db.insert(eventGuests).values({
      eventId: testEventId,
      guestId: testGuestId,
    }).returning();
    testEventGuestId = eventGuest.id;

    // Create test campaign
    const [campaign] = await db.insert(campaigns).values({
      eventId: testEventId,
      name: `${TEST_PREFIX}Campaign`,
      type: 'Invitation',
      subject: 'Test Subject',
      content: 'Test Content',
      status: 'Sent',
      sentCount: 100,
    }).returning();
    testCampaignId = campaign.id;

    // Create test campaign message
    const [message] = await db.insert(campaignMessages).values({
      campaignId: testCampaignId,
      eventGuestId: testEventGuestId,
      status: 'Sent',
    }).returning();
    testMessageId = message.id;
  });

  // Clean up bounces and unsubscribes before each test to ensure isolation
  beforeEach(async () => {
    // Only clean up bounces and unsubscribes - keep the test fixtures
    await db.delete(bounces).where(like(bounces.email, `%${TEST_PREFIX}%`));
    await db.delete(bounces).where(like(bounces.email, '%example.com'));
    await db.delete(unsubscribes).where(like(unsubscribes.email, `%${TEST_PREFIX}%`));
    await db.delete(unsubscribes).where(like(unsubscribes.email, '%example.com'));
  });

  // Clean up all test data after all tests
  afterAll(async () => {
    await db.delete(bounces).where(like(bounces.email, '%example.com'));
    await db.delete(unsubscribes).where(like(unsubscribes.email, '%example.com'));
    await db.delete(campaignMessages).where(eq(campaignMessages.campaignId, testCampaignId));
    await db.delete(campaigns).where(eq(campaigns.id, testCampaignId));
    await db.delete(eventGuests).where(eq(eventGuests.id, testEventGuestId));
    await db.delete(guests).where(eq(guests.id, testGuestId));
    await db.delete(events).where(eq(events.id, testEventId));
  });

  describe('recordBounce', () => {
    it('should record a hard bounce and mark as undeliverable immediately', async () => {
      const result = await BounceService.recordBounce(
        'hardbounce@example.com',
        'hard',
        'Mailbox does not exist'
      );

      expect(result.success).toBe(true);
      expect(result.bounceType).toBe('hard');
      expect(result.isNowUndeliverable).toBe(true);

      // Verify email is now undeliverable
      const isDeliverable = await BounceService.isDeliverable('hardbounce@example.com');
      expect(isDeliverable).toBe(false);
    });

    it('should record a soft bounce without marking as undeliverable on first occurrence', async () => {
      const result = await BounceService.recordBounce(
        'softbounce@example.com',
        'soft',
        'Mailbox full'
      );

      expect(result.success).toBe(true);
      expect(result.bounceType).toBe('soft');
      expect(result.isNowUndeliverable).toBe(false);
      expect(result.softBounceCount).toBe(1);

      // Verify email is still deliverable
      const isDeliverable = await BounceService.isDeliverable('softbounce@example.com');
      expect(isDeliverable).toBe(true);
    });

    it('should mark as undeliverable after 3 soft bounces (3-strike rule)', async () => {
      const email = 'threestrike@example.com';

      // First soft bounce
      let result = await BounceService.recordBounce(email, 'soft', 'Mailbox full');
      expect(result.isNowUndeliverable).toBe(false);
      expect(result.softBounceCount).toBe(1);

      // Second soft bounce
      result = await BounceService.recordBounce(email, 'soft', 'Mailbox full');
      expect(result.isNowUndeliverable).toBe(false);
      expect(result.softBounceCount).toBe(2);

      // Third soft bounce - should trigger undeliverable
      result = await BounceService.recordBounce(email, 'soft', 'Mailbox full');
      expect(result.isNowUndeliverable).toBe(true);
      expect(result.softBounceCount).toBe(3);

      // Verify email is now undeliverable
      const isDeliverable = await BounceService.isDeliverable(email);
      expect(isDeliverable).toBe(false);
    });

    it('should record bounce with campaign message ID', async () => {
      const testEmail = `${TEST_PREFIX}msgid@example.com`;
      const result = await BounceService.recordBounce(
        testEmail,
        'hard',
        'Invalid address',
        testMessageId
      );

      expect(result.success).toBe(true);

      // Verify bounce record has campaign message ID
      const bounceRecords = await BounceService.getBouncesForEmail(testEmail);
      expect(bounceRecords.length).toBe(1);
      expect(bounceRecords[0].campaignMessageId).toBe(testMessageId);
    });
  });

  describe('getSoftBounceCount', () => {
    it('should return 0 for email with no bounces', async () => {
      const count = await BounceService.getSoftBounceCount('nobounces@example.com');
      expect(count).toBe(0);
    });

    it('should count only soft bounces', async () => {
      const email = 'mixed@example.com';

      await BounceService.recordBounce(email, 'soft', 'Mailbox full');
      await BounceService.recordBounce(email, 'hard', 'Invalid address');
      await BounceService.recordBounce(email, 'soft', 'Temporarily unavailable');

      const softCount = await BounceService.getSoftBounceCount(email);
      expect(softCount).toBe(2);
    });
  });

  describe('isDeliverable', () => {
    it('should return true for email with no bounces', async () => {
      const isDeliverable = await BounceService.isDeliverable('clean@example.com');
      expect(isDeliverable).toBe(true);
    });

    it('should return false for email with hard bounce', async () => {
      await BounceService.recordBounce('hardbounce@example.com', 'hard');
      
      const isDeliverable = await BounceService.isDeliverable('hardbounce@example.com');
      expect(isDeliverable).toBe(false);
    });

    it('should return false for email in unsubscribes table', async () => {
      await db.insert(unsubscribes).values({
        email: 'unsubscribed@example.com',
        reason: 'user_request',
      });

      const isDeliverable = await BounceService.isDeliverable('unsubscribed@example.com');
      expect(isDeliverable).toBe(false);
    });

    it('should be case-insensitive', async () => {
      await BounceService.recordBounce('CaseSensitive@Example.COM', 'hard');
      
      const isDeliverable = await BounceService.isDeliverable('casesensitive@example.com');
      expect(isDeliverable).toBe(false);
    });
  });

  describe('filterDeliverableEmails', () => {
    it('should return all emails when none are undeliverable', async () => {
      const emails = ['a@example.com', 'b@example.com', 'c@example.com'];
      
      const deliverable = await BounceService.filterDeliverableEmails(emails);
      
      expect(deliverable).toHaveLength(3);
      expect(deliverable).toContain('a@example.com');
      expect(deliverable).toContain('b@example.com');
      expect(deliverable).toContain('c@example.com');
    });

    it('should filter out undeliverable emails', async () => {
      await BounceService.recordBounce('bad@example.com', 'hard');
      
      const emails = ['good@example.com', 'bad@example.com', 'another@example.com'];
      const deliverable = await BounceService.filterDeliverableEmails(emails);
      
      expect(deliverable).toHaveLength(2);
      expect(deliverable).toContain('good@example.com');
      expect(deliverable).toContain('another@example.com');
      expect(deliverable).not.toContain('bad@example.com');
    });

    it('should return empty array for empty input', async () => {
      const deliverable = await BounceService.filterDeliverableEmails([]);
      expect(deliverable).toHaveLength(0);
    });

    it('should filter out emails that have reached soft bounce threshold', async () => {
      const email = 'softlimit@example.com';
      
      // Add 3 soft bounces
      for (let i = 0; i < SOFT_BOUNCE_THRESHOLD; i++) {
        await db.insert(bounces).values({
          email: email.toLowerCase(),
          bounceType: 'soft',
          bounceReason: 'Mailbox full',
        });
      }

      const emails = ['good@example.com', email];
      const deliverable = await BounceService.filterDeliverableEmails(emails);
      
      expect(deliverable).toHaveLength(1);
      expect(deliverable).toContain('good@example.com');
    });
  });

  describe('getCampaignBounceStats', () => {
    it('should return zero stats for campaign with no bounces', async () => {
      const stats = await BounceService.getCampaignBounceStats(testCampaignId);
      
      expect(stats.campaignId).toBe(testCampaignId);
      expect(stats.totalBounces).toBe(0);
      expect(stats.hardBounces).toBe(0);
      expect(stats.softBounces).toBe(0);
      expect(stats.bounceRate).toBe(0);
    });

    it('should calculate bounce stats correctly', async () => {
      // Add bounces linked to the campaign message
      await db.insert(bounces).values([
        { email: 'hard1@example.com', bounceType: 'hard', campaignMessageId: testMessageId },
        { email: 'hard2@example.com', bounceType: 'hard', campaignMessageId: testMessageId },
        { email: 'soft1@example.com', bounceType: 'soft', campaignMessageId: testMessageId },
      ]);

      const stats = await BounceService.getCampaignBounceStats(testCampaignId);
      
      expect(stats.totalBounces).toBe(3);
      expect(stats.hardBounces).toBe(2);
      expect(stats.softBounces).toBe(1);
      expect(stats.bounceRate).toBe(3); // 3/100 * 100 = 3%
    });
  });

  describe('markAsUndeliverable', () => {
    it('should add email to unsubscribes table', async () => {
      await BounceService.markAsUndeliverable('mark@example.com', UNDELIVERABLE_REASONS.HARD_BOUNCE);
      
      const record = await db.query.unsubscribes.findFirst({
        where: eq(unsubscribes.email, 'mark@example.com'),
      });
      
      expect(record).not.toBeNull();
      expect(record?.reason).toBe(UNDELIVERABLE_REASONS.HARD_BOUNCE);
    });

    it('should be idempotent - not duplicate entries', async () => {
      await BounceService.markAsUndeliverable('idempotent@example.com', UNDELIVERABLE_REASONS.HARD_BOUNCE);
      await BounceService.markAsUndeliverable('idempotent@example.com', UNDELIVERABLE_REASONS.SOFT_BOUNCE_THRESHOLD);
      
      const records = await db.query.unsubscribes.findMany({
        where: eq(unsubscribes.email, 'idempotent@example.com'),
      });
      
      expect(records).toHaveLength(1);
      expect(records[0].reason).toBe(UNDELIVERABLE_REASONS.HARD_BOUNCE); // First reason preserved
    });
  });

  describe('restoreDeliverability', () => {
    it('should remove email from unsubscribes table', async () => {
      await BounceService.markAsUndeliverable('restore@example.com', UNDELIVERABLE_REASONS.HARD_BOUNCE);
      
      let isDeliverable = await BounceService.isDeliverable('restore@example.com');
      expect(isDeliverable).toBe(false);
      
      const restored = await BounceService.restoreDeliverability('restore@example.com');
      expect(restored).toBe(true);
      
      isDeliverable = await BounceService.isDeliverable('restore@example.com');
      expect(isDeliverable).toBe(true);
    });

    it('should return false for email not in unsubscribes', async () => {
      const restored = await BounceService.restoreDeliverability('notinlist@example.com');
      expect(restored).toBe(false);
    });
  });

  describe('getEmailBounceStats', () => {
    it('should return stats for email with bounces', async () => {
      const email = 'stats@example.com';
      
      await BounceService.recordBounce(email, 'hard', 'Invalid');
      await BounceService.recordBounce(email, 'soft', 'Full');
      await BounceService.recordBounce(email, 'soft', 'Temp');
      
      const stats = await BounceService.getEmailBounceStats(email);
      
      expect(stats.email).toBe(email.toLowerCase());
      expect(stats.totalBounces).toBe(3);
      expect(stats.hardBounces).toBe(1);
      expect(stats.softBounces).toBe(2);
      expect(stats.isUndeliverable).toBe(true); // Has hard bounce
      expect(stats.lastBounceAt).not.toBeNull();
    });

    it('should return empty stats for email with no bounces', async () => {
      const stats = await BounceService.getEmailBounceStats('nobounces@example.com');
      
      expect(stats.totalBounces).toBe(0);
      expect(stats.hardBounces).toBe(0);
      expect(stats.softBounces).toBe(0);
      expect(stats.isUndeliverable).toBe(false);
      expect(stats.lastBounceAt).toBeNull();
    });
  });

  describe('checkBulkDeliverability', () => {
    it('should categorize emails correctly', async () => {
      await BounceService.recordBounce('bad@example.com', 'hard');
      
      const result = await BounceService.checkBulkDeliverability([
        'good@example.com',
        'bad@example.com',
        'another@example.com',
      ]);
      
      expect(result.totalChecked).toBe(3);
      expect(result.deliverable).toHaveLength(2);
      expect(result.undeliverable).toHaveLength(1);
      expect(result.undeliverable[0].email).toBe('bad@example.com');
      expect(result.undeliverable[0].reason).toBe(UNDELIVERABLE_REASONS.HARD_BOUNCE);
    });
  });

  describe('clearBounceHistory', () => {
    it('should remove all bounce records and restore deliverability', async () => {
      const email = 'clear@example.com';
      
      await BounceService.recordBounce(email, 'hard');
      await BounceService.recordBounce(email, 'soft');
      
      let isDeliverable = await BounceService.isDeliverable(email);
      expect(isDeliverable).toBe(false);
      
      const deleted = await BounceService.clearBounceHistory(email);
      expect(deleted).toBe(2);
      
      isDeliverable = await BounceService.isDeliverable(email);
      expect(isDeliverable).toBe(true);
      
      const bounceRecords = await BounceService.getBouncesForEmail(email);
      expect(bounceRecords).toHaveLength(0);
    });
  });

  describe('SOFT_BOUNCE_THRESHOLD constant', () => {
    it('should be set to 3', () => {
      expect(SOFT_BOUNCE_THRESHOLD).toBe(3);
    });
  });
});
