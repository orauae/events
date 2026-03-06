import { describe, expect, beforeEach, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { CampaignService, CAMPAIGN_TYPES } from '../services/campaign-service';
import { EmailTemplateService, TEMPLATE_VARIABLES, TemplateContext } from '../services/email-template-service';
import { db, campaigns, events } from '@/db';
import { eq } from 'drizzle-orm';

/**
 * Feature: event-os-mvp, Property 7: Campaign-Event Association
 * 
 * For any campaign, it must be associated with exactly one event,
 * and the eventId must reference an existing event.
 * 
 * Validates: Requirements 4.1, 4.2
 */
describe('Property 7: Campaign-Event Association', () => {
  let testEventId: string;

  beforeEach(async () => {
    // Clean up and create test event
    await db.delete(campaigns);
    await db.delete(events);

    const [event] = await db.insert(events).values({
      name: 'Test Event for Campaigns',
      type: 'Conference',
      description: 'Test event for property testing',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: 'host@test.com',
    }).returning();
    testEventId = event.id;
  });

  afterEach(async () => {
    await db.delete(campaigns);
    await db.delete(events);
  });

  // Property test: Every created campaign must have exactly one event association
  test.prop([
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      type: fc.constantFrom(...CAMPAIGN_TYPES),
      subject: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
      content: fc.string({ minLength: 1, maxLength: 1000 }),
    }),
  ], { numRuns: 3 })(
    'every campaign must be associated with exactly one existing event',
    async (campaignData) => {
      const campaign = await CampaignService.create({
        eventId: testEventId,
        ...campaignData,
      });

      // Verify campaign has an eventId
      expect(campaign.eventId).toBeDefined();
      expect(campaign.eventId).toBe(testEventId);

      // Verify the event exists
      const event = await db.query.events.findFirst({
        where: eq(events.id, campaign.eventId),
      });
      expect(event).not.toBeNull();

      // Verify campaign can be retrieved with event relation
      const campaignWithEvent = await CampaignService.getById(campaign.id);
      expect(campaignWithEvent).not.toBeNull();
      expect(campaignWithEvent!.event).toBeDefined();
      expect(campaignWithEvent!.event.id).toBe(testEventId);
    }
  );

  // Property test: Campaign creation with non-existent event should fail
  test.prop([
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      type: fc.constantFrom(...CAMPAIGN_TYPES),
      subject: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
      content: fc.string({ minLength: 1, maxLength: 1000 }),
    }),
    fc.string({ minLength: 10, maxLength: 30 }).filter(s => s.trim().length > 0 && !s.includes(' ')),
  ], { numRuns: 3 })(
    'campaign creation with non-existent eventId should fail',
    async (campaignData, fakeEventId) => {
      // Ensure the fake event ID doesn't match our test event
      const nonExistentEventId = fakeEventId === testEventId ? `${fakeEventId}_fake` : fakeEventId;

      await expect(
        CampaignService.create({
          eventId: nonExistentEventId,
          ...campaignData,
        })
      ).rejects.toThrow();
    }
  );

  // Property test: Campaign type must be one of the valid types
  test.prop([
    fc.constantFrom(...CAMPAIGN_TYPES),
    fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  ], { numRuns: 3 })(
    'campaign type must be one of the valid campaign types',
    async (campaignType, name) => {
      const campaign = await CampaignService.create({
        eventId: testEventId,
        name,
        type: campaignType,
        subject: 'Test Subject',
        content: 'Test Content',
      });

      expect(CAMPAIGN_TYPES).toContain(campaign.type);
    }
  );
});

/**
 * Feature: event-os-mvp, Property 8: Email Template Variable Substitution
 * 
 * For any email template containing variables {firstName}, {lastName}, {eventName},
 * {rsvpLink}, {badgeLink}, {eventLocation}, {eventDate}, and any guest/event data,
 * rendering the template should replace all variables with the corresponding values,
 * leaving no unsubstituted variable placeholders.
 * 
 * Validates: Requirements 4.3
 */
describe('Property 8: Email Template Variable Substitution', () => {
  // Generator for valid template context
  const templateContextArb = fc.record({
    firstName: fc.string({ minLength: 1, maxLength: 50 }),
    lastName: fc.string({ minLength: 1, maxLength: 50 }),
    eventName: fc.string({ minLength: 1, maxLength: 100 }),
    rsvpLink: fc.webUrl(),
    badgeLink: fc.webUrl(),
    eventLocation: fc.string({ minLength: 1, maxLength: 100 }),
    eventDate: fc.string({ minLength: 1, maxLength: 50 }),
  });

  // Generator for templates with only supported variables
  const supportedVariableArb = fc.constantFrom(...TEMPLATE_VARIABLES);
  
  const templateWithSupportedVarsArb = fc.array(
    fc.oneof(
      fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('{') && !s.includes('}')),
      supportedVariableArb.map(v => `{${v}}`)
    ),
    { minLength: 1, maxLength: 20 }
  ).map(parts => parts.join(' '));

  // Property test: All supported variables should be substituted
  test.prop([
    templateContextArb,
    templateWithSupportedVarsArb,
  ])(
    'all supported variables should be substituted with context values',
    (context, template) => {
      const result = EmailTemplateService.render(template, context as TemplateContext);

      // All supported variables should be substituted
      expect(result.success).toBe(true);
      expect(result.unsubstitutedVariables).toHaveLength(0);

      // Verify no supported variable placeholders remain
      for (const variable of TEMPLATE_VARIABLES) {
        if (template.includes(`{${variable}}`)) {
          expect(result.content).not.toContain(`{${variable}}`);
        }
      }
    }
  );

  // Property test: Substituted values match context values
  test.prop([
    templateContextArb,
    supportedVariableArb,
  ])(
    'substituted values should match the corresponding context values',
    (context, variable) => {
      const template = `Value: {${variable}}`;
      const result = EmailTemplateService.render(template, context as TemplateContext);

      expect(result.success).toBe(true);
      expect(result.content).toBe(`Value: ${context[variable as keyof typeof context]}`);
    }
  );

  // Property test: Template with all variables should substitute all
  test.prop([
    templateContextArb,
  ])(
    'template with all supported variables should substitute all of them',
    (context) => {
      // Create template with all supported variables
      const template = TEMPLATE_VARIABLES.map(v => `{${v}}`).join(' | ');
      
      const result = EmailTemplateService.render(template, context as TemplateContext);

      expect(result.success).toBe(true);
      expect(result.unsubstitutedVariables).toHaveLength(0);

      // Verify each variable was substituted with its value
      const expectedContent = TEMPLATE_VARIABLES.map(v => context[v as keyof typeof context]).join(' | ');
      expect(result.content).toBe(expectedContent);
    }
  );

  // Property test: Unsupported variables should be reported
  test.prop([
    templateContextArb,
    fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => /^[a-zA-Z]+$/.test(s) && !TEMPLATE_VARIABLES.includes(s as any)),
  ])(
    'unsupported variables should be reported and kept in output',
    (context, unsupportedVar) => {
      const template = `Hello {firstName}, your {${unsupportedVar}} is ready`;
      
      const result = EmailTemplateService.render(template, context as TemplateContext);

      expect(result.success).toBe(false);
      expect(result.unsubstitutedVariables).toContain(unsupportedVar);
      expect(result.content).toContain(`{${unsupportedVar}}`);
      // But supported variable should still be substituted
      expect(result.content).not.toContain('{firstName}');
    }
  );

  // Property test: Repeated variables should all be substituted
  test.prop([
    templateContextArb,
    supportedVariableArb,
    fc.integer({ min: 2, max: 5 }),
  ])(
    'repeated variables should all be substituted with the same value',
    (context, variable, repeatCount) => {
      const template = Array(repeatCount).fill(`{${variable}}`).join(' - ');
      
      const result = EmailTemplateService.render(template, context as TemplateContext);

      expect(result.success).toBe(true);
      
      const expectedValue = context[variable as keyof typeof context];
      const expectedContent = Array(repeatCount).fill(expectedValue).join(' - ');
      expect(result.content).toBe(expectedContent);
    }
  );
});
