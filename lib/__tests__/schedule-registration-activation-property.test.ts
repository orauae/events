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
 * @fileoverview Property-based tests for schedule registration on activation
 *
 * Feature: automation-trigger-dev-integration, Property 9: Schedule Registration on Activation
 *
 * For any automation with a scheduled trigger that is activated, the
 * `TriggerRegistrationService` SHALL call `schedules.create()` with the
 * automation's cron expression and automation ID as external ID.
 *
 * **Validates: Requirements 4.5, 6.2**
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

// Arbitrary for timezone
const timezoneArb = fc.constantFrom(
  'UTC',
  'America/New_York',
  'Europe/London',
  'Asia/Tokyo'
);

/**
 * Feature: automation-trigger-dev-integration, Property 9: Schedule Registration on Activation
 * **Validates: Requirements 4.5, 6.2**
 */
describe('Property 9: Schedule Registration on Activation', () => {
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

  test.prop([cronExpressionArb, timezoneArb], { numRuns: 3 })(
    'activating automation with scheduled trigger calls schedules.create() with correct parameters',
    async (cronExpression, timezone) => {
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
              config: { cronExpression, timezone },
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

        // Activate the automation
        await AutomationService.setStatus(automation.id, 'Active');

        // Verify boss.schedule was called with correct parameters
        expect(mockBossSchedule).toHaveBeenCalledWith(
          `scheduled-automation__${automation.id}`,
          cronExpression,
          { automationId: automation.id },
          { tz: timezone },
        );
      } finally {
        await cleanupTestData(event.id);
      }
    }
  );

  test.prop([cronExpressionArb], { numRuns: 2 })(
    'activating automation with scheduled trigger creates schedule record in database',
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

        // Activate the automation
        await AutomationService.setStatus(automation.id, 'Active');

        // Verify schedule record was created in database
        const scheduleRecords = await db.query.automationSchedules.findMany({
          where: eq(automationSchedules.automationId, automation.id),
        });

        expect(scheduleRecords).toHaveLength(1);
        expect(scheduleRecords[0].automationId).toBe(automation.id);
        expect(scheduleRecords[0].cronExpression).toBe(cronExpression);
        expect(scheduleRecords[0].isActive).toBe(true);
      } finally {
        await cleanupTestData(event.id);
      }
    }
  );

  test.prop([cronExpressionArb], { numRuns: 1 })(
    'automation without scheduled trigger does not call schedules.create()',
    async (cronExpression) => {
      const event = await createTestEvent();

      try {
        // Create automation with non-scheduled trigger
        const automation = await AutomationService.create(event.id, {
          name: 'RSVP Automation',
          nodes: [
            {
              type: 'trigger',
              subType: 'guest_rsvp_received',
              label: 'RSVP Trigger',
              position: { x: 100, y: 100 },
              config: {},
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

        // Activate the automation
        await AutomationService.setStatus(automation.id, 'Active');

        // Verify schedules.create was NOT called
        expect(mockBossSchedule).not.toHaveBeenCalled();
      } finally {
        await cleanupTestData(event.id);
      }
    }
  );

  test.prop([cronExpressionArb], { numRuns: 1 })(
    'automation ID is embedded in the schedule name',
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

        // Activate the automation
        await AutomationService.setStatus(automation.id, 'Active');

        // Verify the schedule name contains the automation ID
        const scheduleName = mockBossSchedule.mock.calls[0][0];
        expect(scheduleName).toBe(`scheduled-automation__${automation.id}`);

        // Verify automationId is in the job data
        const jobData = mockBossSchedule.mock.calls[0][2];
        expect(jobData.automationId).toBe(automation.id);
      } finally {
        await cleanupTestData(event.id);
      }
    }
  );
});
