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
 * @fileoverview Property-based tests for registration error handling
 *
 * Feature: automation-trigger-dev-integration, Property 13: Registration Error Handling
 *
 * For any schedule registration operation that fails, the `TriggerRegistrationService`
 * SHALL catch the error, log it, and not propagate the exception to the caller.
 *
 * **Validates: Requirements 6.7**
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

// Mock console methods to verify logging
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

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
 * Helper to create an automation with an existing schedule record.
 */
async function createTestAutomationWithSchedule(eventId: string) {
  const automation = await createTestAutomation(eventId);
  const scheduleId = `sched_${createId()}`;

  await db.insert(automationSchedules).values({
    id: createId(),
    automationId: automation.id,
    triggerDevScheduleId: scheduleId,
    cronExpression: '0 9 * * *',
    timezone: 'UTC',
    isActive: true,
  });

  return { automation, scheduleId };
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

// Arbitrary for error messages
const errorMessageArb = fc.string({ minLength: 1, maxLength: 100 });

// Arbitrary for valid cron expressions
const cronExpressionArb = fc.constantFrom(
  '0 9 * * *', // Daily at 9am
  '0 0 * * 1', // Weekly on Monday
  '0 0 1 * *', // First of month
  '*/15 * * * *' // Every 15 minutes
);

// Arbitrary for timezone
const timezoneArb = fc.constantFrom('UTC', 'America/New_York', 'Europe/London');

/**
 * Feature: automation-trigger-dev-integration, Property 13: Registration Error Handling
 * **Validates: Requirements 6.7**
 */
describe('Property 13: Registration Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsoleError.mockClear();
    mockConsoleLog.mockClear();
    mockConsoleWarn.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Test: schedules.create() errors are caught and not propagated
  test.prop([errorMessageArb, cronExpressionArb, timezoneArb], { numRuns: 1 })(
    'schedules.create() errors are caught, logged, and return success: false',
    async (errorMessage, cronExpression, timezone) => {
      const event = await createTestEvent();

      try {
        const automation = await createTestAutomation(event.id);

        // Mock schedules.create to throw an error
        mockBossSchedule.mockRejectedValueOnce(new Error(errorMessage));

        // Call registerScheduledTrigger - should NOT throw
        const result = await TriggerRegistrationService.registerScheduledTrigger(
          automation.id,
          cronExpression,
          timezone
        );

        // Verify the result indicates failure
        expect(result.success).toBe(false);
        expect(result.error).toBe(errorMessage);
        expect(result.scheduleId).toBeUndefined();

        // Verify error was logged
        expect(mockConsoleError).toHaveBeenCalled();
        const errorLogCall = mockConsoleError.mock.calls.find((call) =>
          call[0].includes('Failed to register scheduled trigger')
        );
        expect(errorLogCall).toBeDefined();
      } finally {
        await cleanupTestData(event.id);
      }
    }
  );

  // Test: schedules.del() errors are caught and not propagated
  test.prop([errorMessageArb], { numRuns: 1 })(
    'schedules.del() errors are caught, logged, and return success: false',
    async (errorMessage) => {
      const event = await createTestEvent();

      try {
        const { automation } = await createTestAutomationWithSchedule(event.id);

        // Mock schedules.del to throw an error
        mockBossUnschedule.mockRejectedValueOnce(new Error(errorMessage));

        // Call unregisterScheduledTrigger - should NOT throw
        const result = await TriggerRegistrationService.unregisterScheduledTrigger(
          automation.id
        );

        // Verify the result indicates failure
        expect(result.success).toBe(false);
        expect(result.error).toBe(errorMessage);

        // Verify error was logged
        expect(mockConsoleError).toHaveBeenCalled();
        const errorLogCall = mockConsoleError.mock.calls.find((call) =>
          call[0].includes('Failed to unregister scheduled trigger')
        );
        expect(errorLogCall).toBeDefined();
      } finally {
        await cleanupTestData(event.id);
      }
    }
  );

  // Test: schedules.update() errors are caught and not propagated
  test.prop([errorMessageArb, cronExpressionArb, timezoneArb], { numRuns: 1 })(
    'schedules.update() errors are caught, logged, and return success: false',
    async (errorMessage, cronExpression, timezone) => {
      const event = await createTestEvent();

      try {
        const { automation } = await createTestAutomationWithSchedule(event.id);

        // Mock schedules.update to throw an error
        mockBossSchedule.mockRejectedValueOnce(new Error(errorMessage));

        // Call updateScheduledTrigger - should NOT throw
        const result = await TriggerRegistrationService.updateScheduledTrigger(
          automation.id,
          cronExpression,
          timezone
        );

        // Verify the result indicates failure
        expect(result.success).toBe(false);
        expect(result.error).toBe(errorMessage);
        expect(result.scheduleId).toBeUndefined();

        // Verify error was logged
        expect(mockConsoleError).toHaveBeenCalled();
        const errorLogCall = mockConsoleError.mock.calls.find((call) =>
          call[0].includes('Failed to update scheduled trigger')
        );
        expect(errorLogCall).toBeDefined();
      } finally {
        await cleanupTestData(event.id);
      }
    }
  );

  // Test: Non-Error objects thrown are handled gracefully
  it('handles non-Error objects thrown by schedules.create()', async () => {
    const event = await createTestEvent();

    try {
      const automation = await createTestAutomation(event.id);

      // Mock schedules.create to throw a non-Error object
      mockBossSchedule.mockRejectedValueOnce('String error');

      // Call registerScheduledTrigger - should NOT throw
      const result = await TriggerRegistrationService.registerScheduledTrigger(
        automation.id,
        '0 9 * * *'
      );

      // Verify the result indicates failure with "Unknown error"
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');

      // Verify error was logged
      expect(mockConsoleError).toHaveBeenCalled();
    } finally {
      await cleanupTestData(event.id);
    }
  });

  // Test: Error handling does not affect subsequent operations
  it('error in one operation does not affect subsequent operations', async () => {
    const event = await createTestEvent();

    try {
      const automation1 = await createTestAutomation(event.id);
      const automation2 = await createTestAutomation(event.id);

      // First call fails
      mockBossSchedule.mockRejectedValueOnce(new Error('First error'));
      // Second call succeeds
      mockBossSchedule.mockResolvedValueOnce(undefined);

      // First registration fails
      const result1 = await TriggerRegistrationService.registerScheduledTrigger(
        automation1.id,
        '0 9 * * *'
      );
      expect(result1.success).toBe(false);

      // Second registration succeeds
      const result2 = await TriggerRegistrationService.registerScheduledTrigger(
        automation2.id,
        '0 9 * * *'
      );
      expect(result2.success).toBe(true);
      expect(result2.scheduleId).toBeDefined();
    } finally {
      await cleanupTestData(event.id);
    }
  });

  // Test: Error message is preserved in result
  test.prop([errorMessageArb], { numRuns: 1 })(
    'error message from exception is preserved in result.error',
    async (errorMessage) => {
      const event = await createTestEvent();

      try {
        const automation = await createTestAutomation(event.id);

        mockBossSchedule.mockRejectedValueOnce(new Error(errorMessage));

        const result = await TriggerRegistrationService.registerScheduledTrigger(
          automation.id,
          '0 9 * * *'
        );

        // The exact error message should be preserved
        expect(result.error).toBe(errorMessage);
      } finally {
        await cleanupTestData(event.id);
      }
    }
  );
});
