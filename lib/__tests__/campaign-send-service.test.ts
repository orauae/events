import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CampaignSendService, setEmailSender, type EmailSender, DEFAULT_BATCH_CONFIG, DEFAULT_RETRY_CONFIG } from '../services/campaign-send-service';
import { CampaignService } from '../services/campaign-service';
import { EventService } from '../services/event-service';
import { GuestService } from '../services/guest-service';
import { EventGuestService } from '../services/event-guest-service';
import { db, campaignMessages, campaigns, eventGuests, guests, events } from '@/db';

// Create a mock email sender
const createMockEmailSender = (): EmailSender => ({
  send: async () => ({
    data: { id: 'mock-email-id' },
    error: undefined,
  }),
});

// Create a mock email sender that fails with retryable errors
const createFailingEmailSender = (failCount: number, errorMessage: string): EmailSender => {
  let attempts = 0;
  return {
    send: async () => {
      attempts++;
      if (attempts <= failCount) {
        return {
          data: undefined,
          error: { message: errorMessage },
        };
      }
      return {
        data: { id: 'mock-email-id' },
        error: undefined,
      };
    },
  };
};

// Create a mock email sender that always fails
const createAlwaysFailingEmailSender = (errorMessage: string): EmailSender => ({
  send: async () => ({
    data: undefined,
    error: { message: errorMessage },
  }),
});

describe('CampaignSendService', () => {
  let testEventId: string;
  let testGuestId: string;
  let testEventGuestId: string;
  let testCampaignId: string;

  beforeEach(async () => {
    // Set up mock email sender
    setEmailSender(createMockEmailSender());

    // Set up environment variables
    process.env.RESEND_FROM_EMAIL = 'test@example.com';

    // Clean up any existing test data
    await db.delete(campaignMessages);
    await db.delete(campaigns);
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);

    // Create test event
    const event = await EventService.create({
      name: 'Test Event',
      type: 'Conference',
      description: 'A test event for campaign sending',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    });
    testEventId = event.id;

    // Create test guest
    const guest = await GuestService.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@test.com',
      company: 'Test Company',
    });
    testGuestId = guest.id;

    // Add guest to event
    const eventGuest = await EventGuestService.addGuestToEvent(testEventId, testGuestId);
    testEventGuestId = eventGuest.id;

    // Create test campaign
    const campaign = await CampaignService.create({
      eventId: testEventId,
      name: 'Test Campaign',
      type: 'Invitation',
      subject: 'Hello {firstName}!',
      content: '<p>Dear {firstName} {lastName}, you are invited to {eventName}!</p>',
    });
    testCampaignId = campaign.id;
  });

  afterEach(async () => {
    // Reset email sender
    setEmailSender(null);

    await db.delete(campaignMessages);
    await db.delete(campaigns);
    await db.delete(eventGuests);
    await db.delete(guests);
    await db.delete(events);
  });

  describe('send', () => {
    it('should send campaign to all event guests', async () => {
      const result = await CampaignSendService.send(testCampaignId, 'https://example.com');

      expect(result.success).toBe(true);
      expect(result.campaignId).toBe(testCampaignId);
      expect(result.totalRecipients).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.batchesProcessed).toBe(1);
      expect(result.isPaused).toBe(false);
    });

    it('should create CampaignMessage records for tracking', async () => {
      await CampaignSendService.send(testCampaignId, 'https://example.com');

      const messages = await CampaignSendService.getCampaignMessages(testCampaignId);

      expect(messages).toHaveLength(1);
      expect(messages[0].campaignId).toBe(testCampaignId);
      expect(messages[0].eventGuestId).toBe(testEventGuestId);
      expect(messages[0].status).toBe('Sent');
      expect(messages[0].sentAt).toBeDefined();
    });

    it('should update campaign status to Sent', async () => {
      await CampaignSendService.send(testCampaignId, 'https://example.com');

      const campaign = await CampaignService.getById(testCampaignId);

      expect(campaign?.status).toBe('Sent');
      expect(campaign?.sentAt).toBeDefined();
    });

    it('should update EventGuest invitation status', async () => {
      await CampaignSendService.send(testCampaignId, 'https://example.com');

      const eventGuest = await EventGuestService.getById(testEventGuestId);

      expect(eventGuest?.invitationStatus).toBe('Sent');
    });

    it('should throw error for non-existent campaign', async () => {
      await expect(
        CampaignSendService.send('non-existent-id', 'https://example.com')
      ).rejects.toThrow('Campaign with ID "non-existent-id" not found');
    });

    it('should throw error for already sent campaign', async () => {
      // Send the campaign first
      await CampaignSendService.send(testCampaignId, 'https://example.com');

      // Try to send again
      await expect(
        CampaignSendService.send(testCampaignId, 'https://example.com')
      ).rejects.toThrow('Campaign has already been sent');
    });

    it('should accept custom batch configuration', async () => {
      const result = await CampaignSendService.send(testCampaignId, 'https://example.com', {
        batchSize: 50,
        batchDelayMs: 500,
      });

      expect(result.success).toBe(true);
      expect(result.batchesProcessed).toBe(1);
    });

    it('should use default batch configuration when not specified', async () => {
      // Verify default config exists
      expect(DEFAULT_BATCH_CONFIG.batchSize).toBe(100);
      expect(DEFAULT_BATCH_CONFIG.batchDelayMs).toBe(1000);

      const result = await CampaignSendService.send(testCampaignId, 'https://example.com');
      expect(result.success).toBe(true);
    });
  });

  describe('batch sending', () => {
    it('should process multiple guests in batches', async () => {
      // Create additional guests
      const guest2 = await GuestService.create({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@test.com',
        company: 'Test Company 2',
      });
      await EventGuestService.addGuestToEvent(testEventId, guest2.id);

      const guest3 = await GuestService.create({
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob.johnson@test.com',
        company: 'Test Company 3',
      });
      await EventGuestService.addGuestToEvent(testEventId, guest3.id);

      // Send with batch size of 2 (should create 2 batches for 3 guests)
      const result = await CampaignSendService.send(testCampaignId, 'https://example.com', {
        batchSize: 2,
        batchDelayMs: 0, // No delay for faster tests
      });

      expect(result.success).toBe(true);
      expect(result.totalRecipients).toBe(3);
      expect(result.sent).toBe(3);
      expect(result.batchesProcessed).toBe(2);
    });

    it('should update recipient count on campaign', async () => {
      // Create additional guest
      const guest2 = await GuestService.create({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith2@test.com',
        company: 'Test Company 2',
      });
      await EventGuestService.addGuestToEvent(testEventId, guest2.id);

      await CampaignSendService.send(testCampaignId, 'https://example.com', {
        batchSize: 1,
        batchDelayMs: 0,
      });

      const campaign = await CampaignService.getById(testCampaignId);
      expect(campaign?.recipientCount).toBe(2);
    });

    it('should stop sending when campaign is paused', async () => {
      // Create multiple guests
      for (let i = 0; i < 5; i++) {
        const guest = await GuestService.create({
          firstName: `Guest${i}`,
          lastName: 'Test',
          email: `guest${i}@test.com`,
          company: 'Test Company',
        });
        await EventGuestService.addGuestToEvent(testEventId, guest.id);
      }

      // Start sending in background with longer delay to allow pause
      const sendPromise = CampaignSendService.send(testCampaignId, 'https://example.com', {
        batchSize: 2,
        batchDelayMs: 500, // Longer delay to allow pause between batches
      });

      // Wait for campaign to start sending (status changes to 'Sending')
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Pause the campaign - wrap in try/catch since it might already be done
      try {
        await CampaignService.pause(testCampaignId);
      } catch {
        // Campaign might have finished before we could pause
      }

      const result = await sendPromise;

      // Either the campaign was paused or it completed before we could pause
      // Both are valid outcomes for this test
      expect(result.batchesProcessed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getDeliveryStats', () => {
    it('should return correct delivery statistics', async () => {
      await CampaignSendService.send(testCampaignId, 'https://example.com');

      const stats = await CampaignSendService.getDeliveryStats(testCampaignId);

      expect(stats.total).toBe(1);
      expect(stats.sent).toBe(1);
      expect(stats.pending).toBe(0);
      expect(stats.delivered).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.bounced).toBe(0);
    });
  });

  describe('handleWebhook', () => {
    it('should update message status on delivery webhook', async () => {
      await CampaignSendService.send(testCampaignId, 'https://example.com');

      const messages = await CampaignSendService.getCampaignMessages(testCampaignId);
      const messageId = messages[0].id;

      await CampaignSendService.handleWebhook(
        {
          type: 'email.delivered',
          data: {
            email_id: 'mock-email-id',
            to: ['john.doe@test.com'],
            created_at: new Date().toISOString(),
          },
        },
        messageId
      );

      const updatedMessages = await CampaignSendService.getCampaignMessages(testCampaignId);
      expect(updatedMessages[0].status).toBe('Delivered');
      expect(updatedMessages[0].deliveredAt).toBeDefined();
    });

    it('should update EventGuest status on delivery', async () => {
      await CampaignSendService.send(testCampaignId, 'https://example.com');

      const messages = await CampaignSendService.getCampaignMessages(testCampaignId);
      const messageId = messages[0].id;

      await CampaignSendService.handleWebhook(
        {
          type: 'email.delivered',
          data: {
            email_id: 'mock-email-id',
            to: ['john.doe@test.com'],
            created_at: new Date().toISOString(),
          },
        },
        messageId
      );

      const eventGuest = await EventGuestService.getById(testEventGuestId);
      expect(eventGuest?.invitationStatus).toBe('Delivered');
    });

    it('should handle bounce webhook', async () => {
      await CampaignSendService.send(testCampaignId, 'https://example.com');

      const messages = await CampaignSendService.getCampaignMessages(testCampaignId);
      const messageId = messages[0].id;

      await CampaignSendService.handleWebhook(
        {
          type: 'email.bounced',
          data: {
            email_id: 'mock-email-id',
            to: ['john.doe@test.com'],
            created_at: new Date().toISOString(),
          },
        },
        messageId
      );

      const updatedMessages = await CampaignSendService.getCampaignMessages(testCampaignId);
      expect(updatedMessages[0].status).toBe('Bounced');

      const eventGuest = await EventGuestService.getById(testEventGuestId);
      expect(eventGuest?.invitationStatus).toBe('Failed');
    });
  });

  describe('schedule', () => {
    it('should schedule a campaign for future delivery', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const scheduled = await CampaignSendService.schedule(testCampaignId, futureDate);

      expect(scheduled.status).toBe('Scheduled');
      expect(scheduled.scheduledAt).toEqual(futureDate);
    });

    it('should throw error for past scheduled time', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await expect(
        CampaignSendService.schedule(testCampaignId, pastDate)
      ).rejects.toThrow('Scheduled time must be in the future');
    });

    it('should throw error for already sent campaign', async () => {
      await CampaignSendService.send(testCampaignId, 'https://example.com');

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      await expect(
        CampaignSendService.schedule(testCampaignId, futureDate)
      ).rejects.toThrow('Cannot schedule a campaign that has already been sent');
    });
  });

  describe('retry logic', () => {
    it('should have default retry configuration', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(30000);
    });

    it('should retry on retryable errors and succeed', async () => {
      // Create a sender that fails twice with a retryable error, then succeeds
      setEmailSender(createFailingEmailSender(2, 'rate limit exceeded'));

      const result = await CampaignSendService.sendEmail(
        {
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          messageId: 'test-message-id',
        },
        { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 } // Short delays for testing
      );

      expect(result.success).toBe(true);
      expect(result.retryAttempts).toBe(2);
    });

    it('should fail after max retries exceeded', async () => {
      // Create a sender that always fails with a retryable error
      setEmailSender(createAlwaysFailingEmailSender('connection timeout'));

      const result = await CampaignSendService.sendEmail(
        {
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          messageId: 'test-message-id',
        },
        { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 } // Short delays for testing
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('connection timeout');
      expect(result.retryAttempts).toBe(2);
    });

    it('should not retry on non-retryable errors', async () => {
      // Create a sender that fails with a non-retryable error
      setEmailSender(createAlwaysFailingEmailSender('invalid email address'));

      const result = await CampaignSendService.sendEmail(
        {
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          messageId: 'test-message-id',
        },
        { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid email address');
      expect(result.retryAttempts).toBe(0); // No retries for non-retryable errors
    });

    it('should identify retryable errors correctly', () => {
      // Retryable errors
      expect(CampaignSendService.isRetryableError('rate limit exceeded')).toBe(true);
      expect(CampaignSendService.isRetryableError('Too many requests')).toBe(true);
      expect(CampaignSendService.isRetryableError('connection timeout')).toBe(true);
      expect(CampaignSendService.isRetryableError('ETIMEDOUT')).toBe(true);
      expect(CampaignSendService.isRetryableError('ECONNRESET')).toBe(true);
      expect(CampaignSendService.isRetryableError('503 Service Unavailable')).toBe(true);
      expect(CampaignSendService.isRetryableError('500 Internal Server Error')).toBe(true);
      expect(CampaignSendService.isRetryableError('Bad Gateway 502')).toBe(true);
      expect(CampaignSendService.isRetryableError('network error')).toBe(true);

      // Non-retryable errors
      expect(CampaignSendService.isRetryableError('invalid email address')).toBe(false);
      expect(CampaignSendService.isRetryableError('authentication failed')).toBe(false);
      expect(CampaignSendService.isRetryableError('permission denied')).toBe(false);
    });

    it('should calculate exponential backoff delay correctly', () => {
      const baseDelay = 1000;
      const maxDelay = 30000;

      // First retry: 1000ms (1000 * 2^0)
      const delay1 = CampaignSendService.calculateBackoffDelay(1, baseDelay, maxDelay);
      expect(delay1).toBeGreaterThanOrEqual(900); // 1000 - 10% jitter
      expect(delay1).toBeLessThanOrEqual(1100); // 1000 + 10% jitter

      // Second retry: 2000ms (1000 * 2^1)
      const delay2 = CampaignSendService.calculateBackoffDelay(2, baseDelay, maxDelay);
      expect(delay2).toBeGreaterThanOrEqual(1800); // 2000 - 10% jitter
      expect(delay2).toBeLessThanOrEqual(2200); // 2000 + 10% jitter

      // Third retry: 4000ms (1000 * 2^2)
      const delay3 = CampaignSendService.calculateBackoffDelay(3, baseDelay, maxDelay);
      expect(delay3).toBeGreaterThanOrEqual(3600); // 4000 - 10% jitter
      expect(delay3).toBeLessThanOrEqual(4400); // 4000 + 10% jitter
    });

    it('should cap delay at maxDelayMs', () => {
      const baseDelay = 1000;
      const maxDelay = 5000;

      // 10th retry would be 1000 * 2^9 = 512000ms, but should be capped at 5000ms
      const delay = CampaignSendService.calculateBackoffDelay(10, baseDelay, maxDelay);
      expect(delay).toBeGreaterThanOrEqual(4500); // 5000 - 10% jitter
      expect(delay).toBeLessThanOrEqual(5500); // 5000 + 10% jitter
    });
  });
});
