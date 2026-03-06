import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CampaignService, createCampaignSchema, CAMPAIGN_TYPES } from '../services/campaign-service';
import { EventService } from '../services/event-service';
import { db, campaigns, events } from '@/db';

describe('CampaignService', () => {
  let testEventId: string;

  beforeEach(async () => {
    // Clean up any existing test data
    await db.delete(campaigns);
    await db.delete(events);

    // Create a test event for campaigns
    const event = await EventService.create({
      name: 'Test Event for Campaigns',
      type: 'Conference',
      description: 'A test event',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    });
    testEventId = event.id;
  });

  afterEach(async () => {
    await db.delete(campaigns);
    await db.delete(events);
  });

  describe('create', () => {
    it('should create a campaign with valid data', async () => {
      const input = {
        eventId: testEventId,
        name: 'Welcome Campaign',
        type: 'Invitation' as const,
        subject: 'You are invited!',
        content: 'Dear {firstName}, you are invited to our event.',
      };

      const campaign = await CampaignService.create(input);

      expect(campaign.id).toBeDefined();
      expect(campaign.eventId).toBe(testEventId);
      expect(campaign.name).toBe('Welcome Campaign');
      expect(campaign.type).toBe('Invitation');
      expect(campaign.subject).toBe('You are invited!');
      expect(campaign.content).toBe('Dear {firstName}, you are invited to our event.');
      expect(campaign.status).toBe('Draft');
    });

    it('should reject campaign creation with non-existent event', async () => {
      const input = {
        eventId: 'non-existent-event-id',
        name: 'Test Campaign',
        type: 'Invitation' as const,
        subject: 'Test Subject',
        content: 'Test Content',
      };

      await expect(CampaignService.create(input)).rejects.toThrow(
        'Event with ID "non-existent-event-id" not found'
      );
    });

    it('should reject campaign creation with invalid type', () => {
      const input = {
        eventId: testEventId,
        name: 'Test Campaign',
        type: 'InvalidType',
        subject: 'Test Subject',
        content: 'Test Content',
      };

      expect(() => createCampaignSchema.parse(input)).toThrow();
    });

    it('should accept all valid campaign types', async () => {
      for (const type of CAMPAIGN_TYPES) {
        const campaign = await CampaignService.create({
          eventId: testEventId,
          name: `${type} Campaign`,
          type,
          subject: `${type} Subject`,
          content: `${type} Content`,
        });

        expect(campaign.type).toBe(type);
      }
    });
  });

  describe('getById', () => {
    it('should return campaign with event relation', async () => {
      const created = await CampaignService.create({
        eventId: testEventId,
        name: 'Test Campaign',
        type: 'Reminder',
        subject: 'Reminder Subject',
        content: 'Reminder Content',
      });

      const campaign = await CampaignService.getById(created.id);

      expect(campaign).not.toBeNull();
      expect(campaign!.id).toBe(created.id);
      expect(campaign!.event).toBeDefined();
      expect(campaign!.event.id).toBe(testEventId);
      expect(campaign!.event.name).toBe('Test Event for Campaigns');
    });

    it('should return null for non-existent campaign', async () => {
      const campaign = await CampaignService.getById('non-existent-id');
      expect(campaign).toBeNull();
    });
  });

  describe('getByEvent', () => {
    it('should return all campaigns for an event', async () => {
      await CampaignService.create({
        eventId: testEventId,
        name: 'Campaign 1',
        type: 'Invitation',
        subject: 'Subject 1',
        content: 'Content 1',
      });

      await CampaignService.create({
        eventId: testEventId,
        name: 'Campaign 2',
        type: 'Reminder',
        subject: 'Subject 2',
        content: 'Content 2',
      });

      const campaigns = await CampaignService.getByEvent(testEventId);

      expect(campaigns).toHaveLength(2);
      expect(campaigns.map((c) => c.name)).toContain('Campaign 1');
      expect(campaigns.map((c) => c.name)).toContain('Campaign 2');
    });

    it('should return empty array for event with no campaigns', async () => {
      const campaigns = await CampaignService.getByEvent(testEventId);
      expect(campaigns).toHaveLength(0);
    });

    it('should return campaigns ordered by createdAt desc', async () => {
      await CampaignService.create({
        eventId: testEventId,
        name: 'First Campaign',
        type: 'Invitation',
        subject: 'Subject',
        content: 'Content',
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await CampaignService.create({
        eventId: testEventId,
        name: 'Second Campaign',
        type: 'Reminder',
        subject: 'Subject',
        content: 'Content',
      });

      const campaigns = await CampaignService.getByEvent(testEventId);

      expect(campaigns[0].name).toBe('Second Campaign');
      expect(campaigns[1].name).toBe('First Campaign');
    });
  });
});
