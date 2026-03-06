import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  LinkTrackingService, 
  clickMetadataSchema,
  DEFAULT_DEDUP_WINDOW_MINUTES,
} from '../services/link-tracking-service';
import { db } from '@/db';
import { 
  campaigns, 
  campaignLinks, 
  linkClicks, 
  events,
  guests,
  eventGuests,
  campaignMessages,
} from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('LinkTrackingService', () => {
  let testEventId: string;
  let testCampaignId: string;
  let testGuestId: string;
  let testEventGuestId: string;

  beforeEach(async () => {
    // Clean up test data
    await db.delete(linkClicks);
    await db.delete(campaignLinks);
    await db.delete(campaignMessages);
    await db.delete(campaigns);
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);

    // Create test event
    const [event] = await db.insert(events).values({
      name: 'Test Event',
      type: 'Conference',
      description: 'Test event description',
      startDate: new Date('2025-06-01'),
      endDate: new Date('2025-06-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    }).returning();
    testEventId = event.id;

    // Create test guest
    const [guest] = await db.insert(guests).values({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
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
      name: 'Test Campaign',
      type: 'Invitation',
      subject: 'Test Subject',
      content: 'Test Content',
      status: 'Draft',
      recipientCount: 100,
    }).returning();
    testCampaignId = campaign.id;
  });

  afterEach(async () => {
    await db.delete(linkClicks);
    await db.delete(campaignLinks);
    await db.delete(campaignMessages);
    await db.delete(campaigns);
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);
  });

  describe('Validation Schema', () => {
    it('should validate correct click metadata', () => {
      const validMetadata = {
        recipientEmail: 'user@example.com',
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1',
      };

      const result = clickMetadataSchema.parse(validMetadata);
      expect(result.recipientEmail).toBe('user@example.com');
    });

    it('should reject invalid email addresses', () => {
      const invalidMetadata = {
        recipientEmail: 'not-an-email',
      };

      expect(() => clickMetadataSchema.parse(invalidMetadata)).toThrow();
    });

    it('should allow optional fields', () => {
      const minimalMetadata = {
        recipientEmail: 'user@example.com',
      };

      const result = clickMetadataSchema.parse(minimalMetadata);
      expect(result.recipientEmail).toBe('user@example.com');
      expect(result.userAgent).toBeUndefined();
    });
  });

  describe('createTrackingLinks', () => {
    it('should wrap links in HTML content with tracking URLs', async () => {
      const content = '<p>Click <a href="https://example.com">here</a> to visit.</p>';
      const baseUrl = 'https://myapp.com';

      const result = await LinkTrackingService.createTrackingLinks(
        testCampaignId,
        content,
        baseUrl
      );

      expect(result).toContain('https://myapp.com/track/');
      expect(result).not.toContain('https://example.com');
      expect(result).toContain('>here</a>');
    });

    it('should create campaign link records for each unique URL', async () => {
      const content = `
        <a href="https://example.com/page1">Link 1</a>
        <a href="https://example.com/page2">Link 2</a>
        <a href="https://example.com/page1">Link 1 again</a>
      `;

      await LinkTrackingService.createTrackingLinks(
        testCampaignId,
        content,
        'https://myapp.com'
      );

      const links = await db.query.campaignLinks.findMany({
        where: eq(campaignLinks.campaignId, testCampaignId),
      });

      // Should have 2 unique links, not 3
      expect(links).toHaveLength(2);
    });

    it('should skip mailto links', async () => {
      const content = '<a href="mailto:test@example.com">Email us</a>';

      const result = await LinkTrackingService.createTrackingLinks(
        testCampaignId,
        content,
        'https://myapp.com'
      );

      expect(result).toContain('mailto:test@example.com');
      expect(result).not.toContain('/track/');
    });

    it('should skip tel links', async () => {
      const content = '<a href="tel:+1234567890">Call us</a>';

      const result = await LinkTrackingService.createTrackingLinks(
        testCampaignId,
        content,
        'https://myapp.com'
      );

      expect(result).toContain('tel:+1234567890');
      expect(result).not.toContain('/track/');
    });

    it('should skip anchor links', async () => {
      const content = '<a href="#section">Jump to section</a>';

      const result = await LinkTrackingService.createTrackingLinks(
        testCampaignId,
        content,
        'https://myapp.com'
      );

      expect(result).toContain('#section');
      expect(result).not.toContain('/track/');
    });

    it('should skip javascript links', async () => {
      const content = '<a href="javascript:void(0)">Click</a>';

      const result = await LinkTrackingService.createTrackingLinks(
        testCampaignId,
        content,
        'https://myapp.com'
      );

      expect(result).toContain('javascript:void(0)');
      expect(result).not.toContain('/track/');
    });

    it('should add UTM parameters to link records', async () => {
      const content = '<a href="https://example.com">Link</a>';

      await LinkTrackingService.createTrackingLinks(
        testCampaignId,
        content,
        'https://myapp.com',
        {
          utmSource: 'email',
          utmMedium: 'campaign',
          utmCampaign: 'test-campaign',
        }
      );

      const links = await db.query.campaignLinks.findMany({
        where: eq(campaignLinks.campaignId, testCampaignId),
      });

      expect(links[0].utmSource).toBe('email');
      expect(links[0].utmMedium).toBe('campaign');
      expect(links[0].utmCampaign).toBe('test-campaign');
    });

    it('should throw error for non-existent campaign', async () => {
      await expect(
        LinkTrackingService.createTrackingLinks(
          'non-existent-id',
          '<a href="https://example.com">Link</a>',
          'https://myapp.com'
        )
      ).rejects.toThrow('Campaign with ID "non-existent-id" not found');
    });

    it('should preserve other anchor tag attributes', async () => {
      const content = '<a href="https://example.com" class="btn" target="_blank">Link</a>';

      const result = await LinkTrackingService.createTrackingLinks(
        testCampaignId,
        content,
        'https://myapp.com'
      );

      expect(result).toContain('class="btn"');
      expect(result).toContain('target="_blank"');
    });

    it('should extract link labels from text content', async () => {
      const content = '<a href="https://example.com">Click here to register</a>';

      await LinkTrackingService.createTrackingLinks(
        testCampaignId,
        content,
        'https://myapp.com'
      );

      const links = await db.query.campaignLinks.findMany({
        where: eq(campaignLinks.campaignId, testCampaignId),
      });

      expect(links[0].label).toBe('Click here to register');
    });
  });

  describe('recordClick', () => {
    let testLinkId: string;

    beforeEach(async () => {
      // Create a test link
      const [link] = await db.insert(campaignLinks).values({
        campaignId: testCampaignId,
        originalUrl: 'https://example.com',
        trackingUrl: 'https://myapp.com/track/test-link',
      }).returning();
      testLinkId = link.id;
    });

    it('should record a click event', async () => {
      const click = await LinkTrackingService.recordClick(testLinkId, {
        recipientEmail: 'user@example.com',
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1',
      });

      expect(click.id).toBeDefined();
      expect(click.linkId).toBe(testLinkId);
      expect(click.recipientEmail).toBe('user@example.com');
      expect(click.userAgent).toBe('Mozilla/5.0');
      expect(click.ipAddress).toBe('192.168.1.1');
    });

    it('should increment campaign clicked count', async () => {
      await LinkTrackingService.recordClick(testLinkId, {
        recipientEmail: 'user@example.com',
      });

      const campaign = await db.query.campaigns.findFirst({
        where: eq(campaigns.id, testCampaignId),
      });

      expect(campaign?.clickedCount).toBe(1);
    });

    it('should update campaign message clicked_at on first click', async () => {
      // Create a campaign message
      const [message] = await db.insert(campaignMessages).values({
        campaignId: testCampaignId,
        eventGuestId: testEventGuestId,
        status: 'Sent',
      }).returning();

      await LinkTrackingService.recordClick(testLinkId, {
        recipientEmail: 'user@example.com',
        campaignMessageId: message.id,
      });

      const updatedMessage = await db.query.campaignMessages.findFirst({
        where: eq(campaignMessages.id, message.id),
      });

      expect(updatedMessage?.clickedAt).not.toBeNull();
    });

    it('should not update clicked_at on subsequent clicks', async () => {
      // Create a campaign message with existing clicked_at
      const originalClickedAt = new Date('2025-01-01');
      const [message] = await db.insert(campaignMessages).values({
        campaignId: testCampaignId,
        eventGuestId: testEventGuestId,
        status: 'Sent',
        clickedAt: originalClickedAt,
      }).returning();

      await LinkTrackingService.recordClick(testLinkId, {
        recipientEmail: 'user@example.com',
        campaignMessageId: message.id,
      });

      const updatedMessage = await db.query.campaignMessages.findFirst({
        where: eq(campaignMessages.id, message.id),
      });

      expect(updatedMessage?.clickedAt?.getTime()).toBe(originalClickedAt.getTime());
    });

    it('should throw error for non-existent link', async () => {
      await expect(
        LinkTrackingService.recordClick('non-existent-id', {
          recipientEmail: 'user@example.com',
        })
      ).rejects.toThrow('Link with ID "non-existent-id" not found');
    });

    it('should throw error for invalid email', async () => {
      await expect(
        LinkTrackingService.recordClick(testLinkId, {
          recipientEmail: 'not-an-email',
        })
      ).rejects.toThrow();
    });
  });

  describe('getClickStats', () => {
    beforeEach(async () => {
      // Create test links
      const [link1] = await db.insert(campaignLinks).values({
        campaignId: testCampaignId,
        originalUrl: 'https://example.com/page1',
        trackingUrl: 'https://myapp.com/track/link1',
        label: 'Page 1',
      }).returning();

      const [link2] = await db.insert(campaignLinks).values({
        campaignId: testCampaignId,
        originalUrl: 'https://example.com/page2',
        trackingUrl: 'https://myapp.com/track/link2',
        label: 'Page 2',
      }).returning();

      // Create clicks for link1
      await db.insert(linkClicks).values([
        { linkId: link1.id, recipientEmail: 'user1@example.com' },
        { linkId: link1.id, recipientEmail: 'user1@example.com' }, // Duplicate
        { linkId: link1.id, recipientEmail: 'user2@example.com' },
      ]);

      // Create clicks for link2
      await db.insert(linkClicks).values([
        { linkId: link2.id, recipientEmail: 'user1@example.com' },
      ]);
    });

    it('should return click statistics for a campaign', async () => {
      const stats = await LinkTrackingService.getClickStats(testCampaignId);

      expect(stats.campaignId).toBe(testCampaignId);
      expect(stats.totalLinks).toBe(2);
      expect(stats.totalClicks).toBe(4);
      expect(stats.uniqueClicks).toBe(2); // user1 and user2
    });

    it('should calculate click-through rate correctly', async () => {
      const stats = await LinkTrackingService.getClickStats(testCampaignId);

      // Campaign has 100 recipients, 2 unique clickers
      expect(stats.overallClickThroughRate).toBe(2);
    });

    it('should return per-link statistics', async () => {
      const stats = await LinkTrackingService.getClickStats(testCampaignId);

      expect(stats.linkStats).toHaveLength(2);
      
      // Links should be sorted by total clicks (descending)
      expect(stats.linkStats[0].totalClicks).toBe(3);
      expect(stats.linkStats[0].uniqueClicks).toBe(2);
      expect(stats.linkStats[1].totalClicks).toBe(1);
      expect(stats.linkStats[1].uniqueClicks).toBe(1);
    });

    it('should throw error for non-existent campaign', async () => {
      await expect(
        LinkTrackingService.getClickStats('non-existent-id')
      ).rejects.toThrow('Campaign with ID "non-existent-id" not found');
    });

    it('should return empty stats for campaign with no links', async () => {
      // Create a new campaign with no links
      const [newCampaign] = await db.insert(campaigns).values({
        eventId: testEventId,
        name: 'Empty Campaign',
        type: 'Reminder',
        subject: 'Test',
        content: 'Test',
        status: 'Draft',
      }).returning();

      const stats = await LinkTrackingService.getClickStats(newCampaign.id);

      expect(stats.totalLinks).toBe(0);
      expect(stats.totalClicks).toBe(0);
      expect(stats.uniqueClicks).toBe(0);
      expect(stats.linkStats).toHaveLength(0);
    });
  });

  describe('isDuplicateClick', () => {
    let testLinkId: string;

    beforeEach(async () => {
      // Clean up ALL existing clicks and links first to ensure isolation
      await db.delete(linkClicks);
      await db.delete(campaignLinks).where(eq(campaignLinks.campaignId, testCampaignId));
      
      const [link] = await db.insert(campaignLinks).values({
        campaignId: testCampaignId,
        originalUrl: 'https://example.com/dedup-test',
        trackingUrl: `https://myapp.com/track/dedup-${Date.now()}-${Math.random()}`,
      }).returning();
      testLinkId = link.id;
    });

    it('should return false for first click', async () => {
      // Verify no clicks exist for this link
      const existingClicks = await db.query.linkClicks.findMany({
        where: eq(linkClicks.linkId, testLinkId),
      });
      expect(existingClicks).toHaveLength(0);
      
      const isDupe = await LinkTrackingService.isDuplicateClick(
        testLinkId,
        'unique-first-click@example.com',
        5
      );

      expect(isDupe).toBe(false);
    });

    it('should return true for duplicate click within window', async () => {
      // Record a click
      await db.insert(linkClicks).values({
        linkId: testLinkId,
        recipientEmail: 'user@example.com',
        clickedAt: new Date(),
      });

      const isDupe = await LinkTrackingService.isDuplicateClick(
        testLinkId,
        'user@example.com',
        5
      );

      expect(isDupe).toBe(true);
    });

    it('should return false for click outside window', async () => {
      // Record a click 10 minutes ago
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      await db.insert(linkClicks).values({
        linkId: testLinkId,
        recipientEmail: 'user@example.com',
        clickedAt: tenMinutesAgo,
      });

      const isDupe = await LinkTrackingService.isDuplicateClick(
        testLinkId,
        'user@example.com',
        5
      );

      expect(isDupe).toBe(false);
    });

    it('should return false for different email', async () => {
      await db.insert(linkClicks).values({
        linkId: testLinkId,
        recipientEmail: 'user1@example.com',
        clickedAt: new Date(),
      });

      const isDupe = await LinkTrackingService.isDuplicateClick(
        testLinkId,
        'user2@example.com',
        5
      );

      expect(isDupe).toBe(false);
    });

    it('should use default window when not specified', async () => {
      await db.insert(linkClicks).values({
        linkId: testLinkId,
        recipientEmail: 'user@example.com',
        clickedAt: new Date(),
      });

      const isDupe = await LinkTrackingService.isDuplicateClick(
        testLinkId,
        'user@example.com'
      );

      expect(isDupe).toBe(true);
      expect(DEFAULT_DEDUP_WINDOW_MINUTES).toBe(5);
    });
  });

  describe('getLinkById', () => {
    it('should return link by ID', async () => {
      const [link] = await db.insert(campaignLinks).values({
        campaignId: testCampaignId,
        originalUrl: 'https://example.com',
        trackingUrl: 'https://myapp.com/track/test',
      }).returning();

      const result = await LinkTrackingService.getLinkById(link.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(link.id);
      expect(result?.originalUrl).toBe('https://example.com');
    });

    it('should return null for non-existent ID', async () => {
      const result = await LinkTrackingService.getLinkById('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getRedirectUrlWithUTM', () => {
    let localCampaignId: string;

    beforeEach(async () => {
      // Create a dedicated campaign for these tests
      const [campaign] = await db.insert(campaigns).values({
        eventId: testEventId,
        name: 'UTM Test Campaign',
        type: 'Invitation',
        subject: 'UTM Test Subject',
        content: 'UTM Test Content',
        status: 'Draft',
        recipientCount: 100,
      }).returning();
      localCampaignId = campaign.id;
    });

    it('should return original URL with UTM parameters injected', async () => {
      const [link] = await db.insert(campaignLinks).values({
        campaignId: localCampaignId,
        originalUrl: 'https://example.com/page',
        trackingUrl: `https://myapp.com/track/utm-test-${Date.now()}`,
        utmSource: 'email',
        utmMedium: 'campaign',
        utmCampaign: 'test-campaign',
        utmContent: 'cta-button',
      }).returning();

      const result = await LinkTrackingService.getRedirectUrlWithUTM(link.id);

      expect(result).toContain('https://example.com/page');
      expect(result).toContain('utm_source=email');
      expect(result).toContain('utm_medium=campaign');
      expect(result).toContain('utm_campaign=test-campaign');
      expect(result).toContain('utm_content=cta-button');
    });

    it('should return original URL when no UTM parameters are set', async () => {
      const [link] = await db.insert(campaignLinks).values({
        campaignId: localCampaignId,
        originalUrl: 'https://example.com/page',
        trackingUrl: `https://myapp.com/track/no-utm-test-${Date.now()}`,
      }).returning();

      const result = await LinkTrackingService.getRedirectUrlWithUTM(link.id);

      expect(result).toBe('https://example.com/page');
    });

    it('should return null for non-existent link', async () => {
      const result = await LinkTrackingService.getRedirectUrlWithUTM('non-existent-id');
      expect(result).toBeNull();
    });

    it('should handle partial UTM parameters', async () => {
      const [link] = await db.insert(campaignLinks).values({
        campaignId: localCampaignId,
        originalUrl: 'https://example.com/page',
        trackingUrl: `https://myapp.com/track/partial-utm-test-${Date.now()}`,
        utmSource: 'newsletter',
        utmCampaign: 'weekly',
      }).returning();

      const result = await LinkTrackingService.getRedirectUrlWithUTM(link.id);

      expect(result).not.toBeNull();
      expect(result).toContain('utm_source=newsletter');
      expect(result).toContain('utm_campaign=weekly');
      expect(result).not.toContain('utm_medium=');
      expect(result).not.toContain('utm_content=');
    });

    it('should preserve existing query parameters in original URL', async () => {
      const [link] = await db.insert(campaignLinks).values({
        campaignId: localCampaignId,
        originalUrl: 'https://example.com/page?existing=param&foo=bar',
        trackingUrl: `https://myapp.com/track/preserve-params-test-${Date.now()}`,
        utmSource: 'email',
      }).returning();

      const result = await LinkTrackingService.getRedirectUrlWithUTM(link.id);

      expect(result).not.toBeNull();
      expect(result).toContain('existing=param');
      expect(result).toContain('foo=bar');
      expect(result).toContain('utm_source=email');
    });
  });

  describe('getLinksByCampaign', () => {
    it('should return all links for a campaign', async () => {
      await db.insert(campaignLinks).values([
        {
          campaignId: testCampaignId,
          originalUrl: 'https://example.com/1',
          trackingUrl: 'https://myapp.com/track/1',
        },
        {
          campaignId: testCampaignId,
          originalUrl: 'https://example.com/2',
          trackingUrl: 'https://myapp.com/track/2',
        },
      ]);

      const links = await LinkTrackingService.getLinksByCampaign(testCampaignId);

      expect(links).toHaveLength(2);
    });

    it('should return empty array for campaign with no links', async () => {
      const links = await LinkTrackingService.getLinksByCampaign(testCampaignId);
      expect(links).toHaveLength(0);
    });
  });

  describe('getRecentClicks', () => {
    let testLinkId: string;

    beforeEach(async () => {
      const [link] = await db.insert(campaignLinks).values({
        campaignId: testCampaignId,
        originalUrl: 'https://example.com',
        trackingUrl: 'https://myapp.com/track/test',
      }).returning();
      testLinkId = link.id;

      // Create multiple clicks
      for (let i = 0; i < 5; i++) {
        await db.insert(linkClicks).values({
          linkId: testLinkId,
          recipientEmail: `user${i}@example.com`,
        });
      }
    });

    it('should return recent clicks for a link', async () => {
      const clicks = await LinkTrackingService.getRecentClicks(testLinkId);
      expect(clicks).toHaveLength(5);
    });

    it('should respect limit parameter', async () => {
      const clicks = await LinkTrackingService.getRecentClicks(testLinkId, 3);
      expect(clicks).toHaveLength(3);
    });

    it('should return clicks in descending order by time', async () => {
      const clicks = await LinkTrackingService.getRecentClicks(testLinkId);
      
      for (let i = 0; i < clicks.length - 1; i++) {
        expect(clicks[i].clickedAt.getTime()).toBeGreaterThanOrEqual(
          clicks[i + 1].clickedAt.getTime()
        );
      }
    });
  });

  describe('buildUrlWithUTM', () => {
    it('should add UTM parameters to URL', () => {
      const result = LinkTrackingService.buildUrlWithUTM(
        'https://example.com/page',
        {
          utmSource: 'email',
          utmMedium: 'campaign',
          utmCampaign: 'test',
          utmContent: 'button',
        }
      );

      expect(result).toContain('utm_source=email');
      expect(result).toContain('utm_medium=campaign');
      expect(result).toContain('utm_campaign=test');
      expect(result).toContain('utm_content=button');
    });

    it('should preserve existing query parameters', () => {
      const result = LinkTrackingService.buildUrlWithUTM(
        'https://example.com/page?existing=param',
        { utmSource: 'email' }
      );

      expect(result).toContain('existing=param');
      expect(result).toContain('utm_source=email');
    });

    it('should handle partial UTM parameters', () => {
      const result = LinkTrackingService.buildUrlWithUTM(
        'https://example.com',
        { utmSource: 'email' }
      );

      expect(result).toContain('utm_source=email');
      expect(result).not.toContain('utm_medium');
    });

    it('should return original URL for invalid URLs', () => {
      const result = LinkTrackingService.buildUrlWithUTM(
        'not-a-valid-url',
        { utmSource: 'email' }
      );

      expect(result).toBe('not-a-valid-url');
    });
  });

  describe('extractLinkLabel', () => {
    it('should extract text content from anchor tag', () => {
      const label = LinkTrackingService.extractLinkLabel(
        '<a href="https://example.com">Click here</a>'
      );
      expect(label).toBe('Click here');
    });

    it('should extract title attribute if no text content', () => {
      const label = LinkTrackingService.extractLinkLabel(
        '<a href="https://example.com" title="Visit our site"><img src="logo.png"/></a>'
      );
      expect(label).toBe('Visit our site');
    });

    it('should return null for anchor with no text or title', () => {
      const label = LinkTrackingService.extractLinkLabel(
        '<a href="https://example.com"><img src="logo.png"/></a>'
      );
      expect(label).toBeNull();
    });

    it('should truncate long labels', () => {
      const longText = 'A'.repeat(150);
      const label = LinkTrackingService.extractLinkLabel(
        `<a href="https://example.com">${longText}</a>`
      );
      expect(label?.length).toBeLessThanOrEqual(103); // 100 + '...'
    });
  });

  describe('generateTrackingUrl', () => {
    it('should generate a tracking URL with email parameter', () => {
      const url = LinkTrackingService.generateTrackingUrl(
        'link123',
        'https://myapp.com',
        'user@example.com'
      );

      expect(url).toBe('https://myapp.com/track/link123?email=user%40example.com');
    });

    it('should include campaign message ID when provided', () => {
      const url = LinkTrackingService.generateTrackingUrl(
        'link123',
        'https://myapp.com',
        'user@example.com',
        'msg456'
      );

      expect(url).toBe('https://myapp.com/track/link123?email=user%40example.com&mid=msg456');
    });

    it('should properly encode special characters in email', () => {
      const url = LinkTrackingService.generateTrackingUrl(
        'link123',
        'https://myapp.com',
        'user+test@example.com'
      );

      expect(url).toContain('email=user%2Btest%40example.com');
    });

    it('should handle base URLs with trailing slash', () => {
      const url = LinkTrackingService.generateTrackingUrl(
        'link123',
        'https://myapp.com/',
        'user@example.com'
      );

      // URL constructor normalizes the path
      expect(url).toContain('/track/link123');
      expect(url).toContain('email=user%40example.com');
    });
  });

  describe('personalizeTrackingLinks', () => {
    it('should add email parameter to tracking links', () => {
      const content = '<a href="https://myapp.com/track/abc123">Click here</a>';
      
      const result = LinkTrackingService.personalizeTrackingLinks(
        content,
        'https://myapp.com',
        'user@example.com'
      );

      expect(result).toContain('email=user%40example.com');
      expect(result).toContain('/track/abc123');
    });

    it('should add both email and message ID parameters', () => {
      const content = '<a href="https://myapp.com/track/abc123">Click here</a>';
      
      const result = LinkTrackingService.personalizeTrackingLinks(
        content,
        'https://myapp.com',
        'user@example.com',
        'msg456'
      );

      expect(result).toContain('email=user%40example.com');
      expect(result).toContain('mid=msg456');
    });

    it('should handle multiple tracking links', () => {
      const content = `
        <a href="https://myapp.com/track/link1">Link 1</a>
        <a href="https://myapp.com/track/link2">Link 2</a>
      `;
      
      const result = LinkTrackingService.personalizeTrackingLinks(
        content,
        'https://myapp.com',
        'user@example.com'
      );

      // Both links should be personalized
      const matches = result.match(/email=user%40example\.com/g);
      expect(matches).toHaveLength(2);
    });

    it('should preserve non-tracking links', () => {
      const content = `
        <a href="https://myapp.com/track/abc123">Tracked</a>
        <a href="https://example.com/page">Not tracked</a>
      `;
      
      const result = LinkTrackingService.personalizeTrackingLinks(
        content,
        'https://myapp.com',
        'user@example.com'
      );

      expect(result).toContain('https://example.com/page');
      expect(result).not.toContain('example.com/page?email=');
    });

    it('should handle single quotes in href attributes', () => {
      const content = "<a href='https://myapp.com/track/abc123'>Click here</a>";
      
      const result = LinkTrackingService.personalizeTrackingLinks(
        content,
        'https://myapp.com',
        'user@example.com'
      );

      expect(result).toContain('email=user%40example.com');
      expect(result).toContain("href='");
    });

    it('should not modify content without tracking links', () => {
      const content = '<a href="https://example.com">External link</a>';
      
      const result = LinkTrackingService.personalizeTrackingLinks(
        content,
        'https://myapp.com',
        'user@example.com'
      );

      expect(result).toBe(content);
    });
  });

  describe('escapeRegExp', () => {
    it('should escape special regex characters', () => {
      const escaped = LinkTrackingService.escapeRegExp('https://example.com/path?query=value');
      expect(escaped).toBe('https://example\\.com/path\\?query=value');
    });

    it('should handle strings without special characters', () => {
      const escaped = LinkTrackingService.escapeRegExp('simple-string');
      expect(escaped).toBe('simple-string');
    });
  });
});
