import { describe, expect, beforeEach, afterEach, vi, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { db } from '@/db';
import {
  events,
  automations,
  automationNodes,
  automationSchedules,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

/**
 * @fileoverview Property-based tests for schedule uniqueness
 *
 * Feature: automation-trigger-dev-integration, Property 11: Schedule Uniqueness
 *
 * For any automation, at most one Trigger.dev schedule SHALL exist, enforced by
 * using the automation ID as both `externalId` and `deduplicationKey`.
 *
 * **Validates: Requirements 6.4, 6.5**
 */

// Mock the pg-boss queue module
const mockBossSchedule = vi.fn();
const mockBossUnschedule = vi.fn();

vi.mock('@/lib/jobs/queue', () => ({
  getQueue: vi.fn().mockResolvedValue({
    schedule: (...args: unknown[]) => mockBossSchedule(...args),
    unschedule: (...args: unknown[]) => mockBossUnschedule(...args),
  }),
}));

vi.mock('@/lib/jobs/register-workers', () => ({
  registerScheduledAutomationHandler: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocking
import { TriggerRegistrationService } from '@/lib/services/trigger-registration-service';

/**
 * Helper to create test data with unique identifiers.
 */
async function createTestEvent() {
  const uniqueId = createId();

  const testEvent = {
    name: `Test Event ${uniqueId}`,
    type: 'Conference' as const,
    description: 'Test description',
    startDate: new Date('2026-02-01'),
    endDate: new Date('2026-02-02'),
    location: 'Test Location',
    hostName: 'Test Host',
    hostEmail: `host-${uniqueId}@test.com`,
  };

  const [event] = await db.insert(events).values(testEvent).returning();
  return event;
}

/**
 * Helper to create an automation for testing.
 */
async function createTestAutomation(eventId: string) {
  const automationId = createId();

  const [automation] = await db
    .insert(automations)
    .values({
      id: automationId,
      eventId,
      name: `Test Automation ${automationId}`,
      status: 'Draft',
    })
    .returning();

  // Add a scheduled trigger node
  await db.insert(automationNodes).values({
    id: createId(),
    automationId: automation.id,
    type: 'trigger',
    subType: 'scheduled',
    label: 'Scheduled Trigger',
    positionX: '100',
    positionY: '100',
    config: { cronExpression: '0 9 * * *' },
  });

  return automation;
}

/**
 * Helper to clean up test data.
 */
async function cleanupTestData(eventId: string) {
  // Get all automations for this event
  const eventAutomations = await db.query.automations.findMany({
    where: eq(automations.eventId, eventId),
  });

  for (const automation of eventAutomations) {
    // Delete automation schedules
    await db
      .delete(automationSchedules)
      .where(eq(automationSchedules.automationId, automation.id));

    // Delete automation nodes
    await db
      .delete(automationNodes)
      .where(eq(automationNodes.automationId, automation.id));
  }

  // Delete automations
  await db.delete(automations).where(eq(automations.eventId, eventId));

  // Delete event
  await db.delete(events).where(eq(events.id, eventId));
}

// Arbitrary for valid cron expressions
const cronExpressionArb = fc.constantFrom(
  '0 9 * * *', // Daily at 9am
  '0 0 * * 1', // Weekly on Monday
  '0 0 1 * *', // First of month
  '*/15 * * * *', // Every 15 minutes
  '0 12 * * MON-FRI', // Weekdays at noon
  '0 6,18 * * *' // 6am and 6pm daily
);

// Arbitrary for timezone
const timezoneArb = fc.constantFrom(
  'UTC',
  'America/New_York',
  'Europe/London',
  'Asia/Tokyo'
);

/**
 * Feature: automation-trigger-dev-integration, Property 11: Schedule Uniqueness
 * **Validates: Requirements 6.4, 6.5**
 */
describe('Property 11: Schedule Uniqueness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation - returns a unique schedule ID
    mockBossSchedule.mockImplementation(() =>
      Promise.resolve(undefined)
    );
    mockBossUnschedule.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Consolidated test: verifies multiple uniqueness properties in one database session
  test.prop([cronExpressionArb, timezoneArb], { numRuns: 1 })(
    'schedule uniqueness is enforced via externalId and deduplicationKey',
    async (cronExpression, timezone) => {
      const event = await createTestEvent();

      try {
        const automation = await createTestAutomation(event.id);

        // Register the automation
        await TriggerRegistrationService.registerScheduledTrigger(
          automation.id,
          cronExpression,
          timezone
        );

        // Verify boss.schedule was called with correct schedule name
        expect(mockBossSchedule).toHaveBeenCalledWith(
          `scheduled-automation__${automation.id}`,
          cronExpression,
          { automationId: automation.id },
          expect.objectContaining({ tz: timezone }),
        );

        // Verify schedule name embeds automation ID
        const scheduleName = mockBossSchedule.mock.calls[0][0];
        expect(scheduleName).toContain(automation.id);

        // Register again - should not create duplicate
        await TriggerRegistrationService.registerScheduledTrigger(
          automation.id,
          cronExpression,
          timezone
        );

        // Verify only one schedule record exists
        const scheduleRecords = await db.query.automationSchedules.findMany({
          where: eq(automationSchedules.automationId, automation.id),
        });

        expect(scheduleRecords).toHaveLength(1);
        expect(scheduleRecords[0].automationId).toBe(automation.id);
        expect(scheduleRecords[0].cronExpression).toBe(cronExpression);
        expect(scheduleRecords[0].timezone).toBe(timezone);

        // schedules.create should only be called once
        expect(mockBossSchedule).toHaveBeenCalledTimes(1);
      } finally {
        await cleanupTestData(event.id);
      }
    }
  );

  // Test that different automations can have separate schedules
  it('different automations can each have their own schedule', async () => {
    const event = await createTestEvent();
    const cronExpression = '0 9 * * *';

    try {
      const automation1 = await createTestAutomation(event.id);
      const automation2 = await createTestAutomation(event.id);

      await TriggerRegistrationService.registerScheduledTrigger(
        automation1.id,
        cronExpression
      );
      await TriggerRegistrationService.registerScheduledTrigger(
        automation2.id,
        cronExpression
      );

      // Verify each automation has exactly one schedule
      const schedules1 = await db.query.automationSchedules.findMany({
        where: eq(automationSchedules.automationId, automation1.id),
      });
      const schedules2 = await db.query.automationSchedules.findMany({
        where: eq(automationSchedules.automationId, automation2.id),
      });

      expect(schedules1).toHaveLength(1);
      expect(schedules2).toHaveLength(1);
      expect(schedules1[0].id).not.toBe(schedules2[0].id);
      expect(mockBossSchedule).toHaveBeenCalledTimes(2);
    } finally {
      await cleanupTestData(event.id);
    }
  });

  // Test cron expression updates don't create duplicates
  it('updating cron expression does not create duplicate schedules', async () => {
    const event = await createTestEvent();

    try {
      const automation = await createTestAutomation(event.id);

      await TriggerRegistrationService.registerScheduledTrigger(
        automation.id,
        '0 9 * * *'
      );
      await TriggerRegistrationService.registerScheduledTrigger(
        automation.id,
        '0 10 * * *'
      );

      const scheduleRecords = await db.query.automationSchedules.findMany({
        where: eq(automationSchedules.automationId, automation.id),
      });

      expect(scheduleRecords).toHaveLength(1);
      expect(scheduleRecords[0].cronExpression).toBe('0 10 * * *');
    } finally {
      await cleanupTestData(event.id);
    }
  });
});
