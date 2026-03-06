import { describe, expect, beforeEach, afterEach, vi } from 'vitest';
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
 * @fileoverview Property-based tests for schedule removal on pause
 *
 * Feature: automation-trigger-dev-integration, Property 10: Schedule Removal on Pause
 *
 * For any automation with a scheduled trigger that is paused or deleted, the
 * `TriggerRegistrationService` SHALL call `schedules.del()` to remove the
 * associated schedule.
 *
 * **Validates: Requirements 4.6, 6.3**
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
import { AutomationService } from '@/lib/services/automation-service';

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

/**
 * Feature: automation-trigger-dev-integration, Property 10: Schedule Removal on Pause
 * **Validates: Requirements 4.6, 6.3**
 */
describe('Property 10: Schedule Removal on Pause', () => {
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

  test.prop([cronExpressionArb], { numRuns: 3 })(
    'pausing an active automation with scheduled trigger calls schedules.del()',
    async (cronExpression) => {
      const event = await createTestEvent();

      try {
        // Create automation with scheduled trigger
        const automation = await AutomationService.create(event.id, {
          name: 'Scheduled Automation',
          nodes: [
            {
              type: 'trigger',
              subType: 'scheduled',
              label: 'Scheduled Trigger',
              position: { x: 100, y: 100 },
              config: { cronExpression },
            },
            {
              type: 'action',
              subType: 'send_email',
              label: 'Send Email',
              position: { x: 100, y: 200 },
              config: { subject: 'Test', content: 'Test content' },
            },
          ],
          edges: [{ sourceNodeId: '0', targetNodeId: '1' }],
        });

        // Activate the automation first
        await AutomationService.setStatus(automation.id, 'Active');

        // Get the schedule ID that was created
        const scheduleRecord = await db.query.automationSchedules.findFirst({
          where: eq(automationSchedules.automationId, automation.id),
        });
        const scheduleId = scheduleRecord?.triggerDevScheduleId;

        // Clear mocks to track only the pause operation
        vi.clearAllMocks();

        // Pause the automation
        await AutomationService.setStatus(automation.id, 'Paused');

        // Verify schedules.del was called with the schedule ID
        expect(mockBossUnschedule).toHaveBeenCalledWith(scheduleId);
      } finally {
        await cleanupTestData(event.id);
      }
    }
  );

  test.prop([cronExpressionArb], { numRuns: 2 })(
    'pausing automation marks schedule as inactive in database',
    async (cronExpression) => {
      const event = await createTestEvent();

      try {
        // Create automation with scheduled trigger
        const automation = await AutomationService.create(event.id, {
          name: 'Scheduled Automation',
          nodes: [
            {
              type: 'trigger',
              subType: 'scheduled',
              label: 'Scheduled Trigger',
              position: { x: 100, y: 100 },
              config: { cronExpression },
            },
            {
              type: 'action',
              subType: 'send_email',
              label: 'Send Email',
              position: { x: 100, y: 200 },
              config: { subject: 'Test', content: 'Test content' },
            },
          ],
          edges: [{ sourceNodeId: '0', targetNodeId: '1' }],
        });

        // Activate the automation first
        await AutomationService.setStatus(automation.id, 'Active');

        // Verify schedule is active
        let scheduleRecord = await db.query.automationSchedules.findFirst({
          where: eq(automationSchedules.automationId, automation.id),
        });
        expect(scheduleRecord?.isActive).toBe(true);

        // Pause the automation
        await AutomationService.setStatus(automation.id, 'Paused');

        // Verify schedule is now inactive
        scheduleRecord = await db.query.automationSchedules.findFirst({
          where: eq(automationSchedules.automationId, automation.id),
        });
        expect(scheduleRecord?.isActive).toBe(false);
      } finally {
        await cleanupTestData(event.id);
      }
    }
  );

  test.prop([cronExpressionArb], { numRuns: 2 })(
    'deleting an active automation with scheduled trigger calls schedules.del()',
    async (cronExpression) => {
      const event = await createTestEvent();

      try {
        // Create automation with scheduled trigger
        const automation = await AutomationService.create(event.id, {
          name: 'Scheduled Automation',
          nodes: [
            {
              type: 'trigger',
              subType: 'scheduled',
              label: 'Scheduled Trigger',
              position: { x: 100, y: 100 },
              config: { cronExpression },
            },
            {
              type: 'action',
              subType: 'send_email',
              label: 'Send Email',
              position: { x: 100, y: 200 },
              config: { subject: 'Test', content: 'Test content' },
            },
          ],
          edges: [{ sourceNodeId: '0', targetNodeId: '1' }],
        });

        // Activate the automation first
        await AutomationService.setStatus(automation.id, 'Active');

        // Get the schedule ID that was created
        const scheduleRecord = await db.query.automationSchedules.findFirst({
          where: eq(automationSchedules.automationId, automation.id),
        });
        const scheduleId = scheduleRecord?.triggerDevScheduleId;

        // Clear mocks to track only the delete operation
        vi.clearAllMocks();

        // Delete the automation
        await AutomationService.delete(automation.id);

        // Verify schedules.del was called with the schedule ID
        expect(mockBossUnschedule).toHaveBeenCalledWith(scheduleId);
      } finally {
        // Cleanup remaining test data (event only, automation already deleted)
        await db.delete(events).where(eq(events.id, event.id));
      }
    }
  );

  test.prop([cronExpressionArb], { numRuns: 1 })(
    'setting status to Draft also removes schedule',
    async (cronExpression) => {
      const event = await createTestEvent();

      try {
        // Create automation with scheduled trigger
        const automation = await AutomationService.create(event.id, {
          name: 'Scheduled Automation',
          nodes: [
            {
              type: 'trigger',
              subType: 'scheduled',
              label: 'Scheduled Trigger',
              position: { x: 100, y: 100 },
              config: { cronExpression },
            },
            {
              type: 'action',
              subType: 'send_email',
              label: 'Send Email',
              position: { x: 100, y: 200 },
              config: { subject: 'Test', content: 'Test content' },
            },
          ],
          edges: [{ sourceNodeId: '0', targetNodeId: '1' }],
        });

        // Activate the automation first
        await AutomationService.setStatus(automation.id, 'Active');

        // Get the schedule ID that was created
        const scheduleRecord = await db.query.automationSchedules.findFirst({
          where: eq(automationSchedules.automationId, automation.id),
        });
        const scheduleId = scheduleRecord?.triggerDevScheduleId;

        // Clear mocks to track only the draft operation
        vi.clearAllMocks();

        // Set status back to Draft
        await AutomationService.setStatus(automation.id, 'Draft');

        // Verify schedules.del was called with the schedule ID
        expect(mockBossUnschedule).toHaveBeenCalledWith(scheduleId);

        // Verify schedule is now inactive
        const updatedScheduleRecord = await db.query.automationSchedules.findFirst({
          where: eq(automationSchedules.automationId, automation.id),
        });
        expect(updatedScheduleRecord?.isActive).toBe(false);
      } finally {
        await cleanupTestData(event.id);
      }
    }
  );
});
