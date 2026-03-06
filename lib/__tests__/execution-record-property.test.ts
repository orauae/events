import { describe, expect, beforeEach, afterEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { db } from '@/db';
import {
  events,
  guests,
  eventGuests,
  automations,
  automationNodes,
  automationEdges,
  automationExecutions,
  executionSteps,
} from '@/db/schema';
import { AutomationService } from '../services/automation-service';
import { WorkflowEngine } from '../services/workflow-engine';
import { setEmailSender } from '../services/campaign-send-service';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

/**
 * @fileoverview Property-based tests for execution record creation
 *
 * Feature: automation-trigger-dev-integration, Property 4: Execution Record Creation
 *
 * For any automation execution, the task SHALL create an execution record in the
 * database with the correct automation ID, event guest ID, trigger data, and status.
 *
 * **Validates: Requirements 2.6**
 */

// Mock email sender to avoid actual email sending
const mockEmailSender = {
  send: vi.fn().mockResolvedValue({ data: { id: 'mock-email-id' } }),
};

/**
 * Helper to create test data with unique identifiers.
 */
async function createTestData() {
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

  const testGuest = {
    firstName: 'John',
    lastName: 'Doe',
    email: `john.doe-${uniqueId}@test.com`,
    company: 'Test Company',
    jobTitle: 'Engineer',
  };

  const [event] = await db.insert(events).values(testEvent).returning();
  const [guest] = await db.insert(guests).values(testGuest).returning();
  const [eventGuest] = await db
    .insert(eventGuests)
    .values({
      eventId: event.id,
      guestId: guest.id,
    })
    .returning();

  return { event, guest, eventGuest };
}

/**
 * Helper to clean up test data for a specific event.
 */
async function cleanupTestData(eventId: string, guestId: string) {
  // Get all automations for this event
  const eventAutomations = await db.query.automations.findMany({
    where: eq(automations.eventId, eventId),
  });

  for (const automation of eventAutomations) {
    // Get all executions for this automation
    const executions = await db.query.automationExecutions.findMany({
      where: eq(automationExecutions.automationId, automation.id),
    });

    // Delete execution steps
    for (const execution of executions) {
      await db
        .delete(executionSteps)
        .where(eq(executionSteps.executionId, execution.id));
    }

    // Delete executions
    await db
      .delete(automationExecutions)
      .where(eq(automationExecutions.automationId, automation.id));

    // Delete edges and nodes
    await db
      .delete(automationEdges)
      .where(eq(automationEdges.automationId, automation.id));
    await db
      .delete(automationNodes)
      .where(eq(automationNodes.automationId, automation.id));
  }

  // Delete automations
  await db.delete(automations).where(eq(automations.eventId, eventId));

  // Delete event guests
  await db.delete(eventGuests).where(eq(eventGuests.eventId, eventId));

  // Delete event
  await db.delete(events).where(eq(events.id, eventId));

  // Delete guest
  await db.delete(guests).where(eq(guests.id, guestId));
}

// Arbitrary for trigger sub-types
const triggerSubTypeArb = fc.constantFrom(
  'guest_rsvp_received',
  'guest_checked_in',
  'guest_added_to_event'
);

// Arbitrary for trigger data - generates various JSON-compatible objects
// Using .map to ensure plain objects (fc.record creates objects with __proto__: null)
const triggerDataArb = fc
  .record({
    source: fc.constantFrom('api', 'webhook', 'manual', 'scheduled'),
    timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
    hasMetadata: fc.boolean(),
    metadataKey: fc.string({ minLength: 1, maxLength: 20 }),
    metadataValue: fc.string({ minLength: 0, maxLength: 50 }),
  })
  .map(({ source, timestamp, hasMetadata, metadataKey, metadataValue }) => {
    // Create a plain object to avoid __proto__: null issues with Drizzle
    const result: Record<string, unknown> = {
      source,
      timestamp,
    };
    if (hasMetadata) {
      result.metadata = { key: metadataKey, value: metadataValue };
    }
    return result;
  });

/**
 * Feature: automation-trigger-dev-integration, Property 4: Execution Record Creation
 * **Validates: Requirements 2.6**
 */
describe('Property 4: Execution Record Creation', () => {
  beforeEach(() => {
    setEmailSender(mockEmailSender);
    mockEmailSender.send.mockClear();
  });

  afterEach(() => {
    setEmailSender(null);
  });

  test.prop([triggerSubTypeArb, triggerDataArb], { numRuns: 1 })(
    'execution record contains correct automation ID',
    async (triggerSubType, triggerData) => {
      const { event, guest, eventGuest } = await createTestData();

      try {
        // Create automation with the generated trigger type
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes: [
            {
              type: 'trigger',
              subType: triggerSubType,
              label: 'Trigger',
              position: { x: 100, y: 100 },
              config: {},
            },
          ],
          edges: [],
        });

        // Execute the workflow
        const result = await WorkflowEngine.execute(
          automation,
          eventGuest.id,
          triggerData
        );

        // Verify execution record has correct automation ID
        expect(result.execution).toBeDefined();
        expect(result.execution.automationId).toBe(automation.id);

        // Verify in database
        const dbExecution = await db.query.automationExecutions.findFirst({
          where: eq(automationExecutions.id, result.execution.id),
        });

        expect(dbExecution).not.toBeNull();
        expect(dbExecution!.automationId).toBe(automation.id);
      } finally {
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  test.prop([triggerSubTypeArb, triggerDataArb], { numRuns: 1 })(
    'execution record contains correct event guest ID',
    async (triggerSubType, triggerData) => {
      const { event, guest, eventGuest } = await createTestData();

      try {
        // Create automation
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes: [
            {
              type: 'trigger',
              subType: triggerSubType,
              label: 'Trigger',
              position: { x: 100, y: 100 },
              config: {},
            },
          ],
          edges: [],
        });

        // Execute the workflow
        const result = await WorkflowEngine.execute(
          automation,
          eventGuest.id,
          triggerData
        );

        // Verify execution record has correct event guest ID
        expect(result.execution).toBeDefined();
        expect(result.execution.eventGuestId).toBe(eventGuest.id);

        // Verify in database
        const dbExecution = await db.query.automationExecutions.findFirst({
          where: eq(automationExecutions.id, result.execution.id),
        });

        expect(dbExecution).not.toBeNull();
        expect(dbExecution!.eventGuestId).toBe(eventGuest.id);
      } finally {
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  test.prop([triggerSubTypeArb, triggerDataArb], { numRuns: 1 })(
    'execution record contains correct trigger data',
    async (triggerSubType, triggerData) => {
      const { event, guest, eventGuest } = await createTestData();

      try {
        // Create automation
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes: [
            {
              type: 'trigger',
              subType: triggerSubType,
              label: 'Trigger',
              position: { x: 100, y: 100 },
              config: {},
            },
          ],
          edges: [],
        });

        // Execute the workflow with the generated trigger data
        const result = await WorkflowEngine.execute(
          automation,
          eventGuest.id,
          triggerData
        );

        // Verify execution record has correct trigger data
        expect(result.execution).toBeDefined();
        expect(result.execution.triggerData).toEqual(triggerData);

        // Verify in database
        const dbExecution = await db.query.automationExecutions.findFirst({
          where: eq(automationExecutions.id, result.execution.id),
        });

        expect(dbExecution).not.toBeNull();
        expect(dbExecution!.triggerData).toEqual(triggerData);
      } finally {
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  test.prop([triggerSubTypeArb], { numRuns: 1 })(
    'successful execution record has appropriate status',
    async (triggerSubType) => {
      const { event, guest, eventGuest } = await createTestData();

      try {
        // Create automation with a simple trigger node
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes: [
            {
              type: 'trigger',
              subType: triggerSubType,
              label: 'Trigger',
              position: { x: 100, y: 100 },
              config: {},
            },
          ],
          edges: [],
        });

        // Execute the workflow
        const result = await WorkflowEngine.execute(automation, eventGuest.id, {
          test: 'data',
        });

        // Verify execution completed successfully
        expect(result.success).toBe(true);
        expect(result.execution.status).toBe('Success');

        // Verify in database
        const dbExecution = await db.query.automationExecutions.findFirst({
          where: eq(automationExecutions.id, result.execution.id),
        });

        expect(dbExecution).not.toBeNull();
        expect(dbExecution!.status).toBe('Success');
      } finally {
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  // Arbitrary for complex trigger data - creates plain objects
  const complexTriggerDataArb = fc
    .record({
      source: fc.string({ minLength: 1, maxLength: 10 }),
      value: fc.integer(),
      hasNested: fc.boolean(),
      nestedA: fc.boolean(),
      nestedB: fc.string({ minLength: 0, maxLength: 20 }),
    })
    .map(({ source, value, hasNested, nestedA, nestedB }) => {
      // Create a plain object to avoid __proto__: null issues with Drizzle
      const result: Record<string, unknown> = { source, value };
      if (hasNested) {
        result.nested = { a: nestedA, b: nestedB };
      }
      return result;
    });

  test.prop([triggerSubTypeArb, complexTriggerDataArb], { numRuns: 1 })(
    'execution record preserves complex trigger data structure',
    async (triggerSubType, complexTriggerData) => {
      const { event, guest, eventGuest } = await createTestData();

      try {
        // Create automation
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes: [
            {
              type: 'trigger',
              subType: triggerSubType,
              label: 'Trigger',
              position: { x: 100, y: 100 },
              config: {},
            },
          ],
          edges: [],
        });

        // Execute with complex trigger data
        const result = await WorkflowEngine.execute(
          automation,
          eventGuest.id,
          complexTriggerData
        );

        // Verify complex trigger data is preserved
        expect(result.execution.triggerData).toEqual(complexTriggerData);

        // Verify in database - complex data should be stored correctly
        const dbExecution = await db.query.automationExecutions.findFirst({
          where: eq(automationExecutions.id, result.execution.id),
        });

        expect(dbExecution).not.toBeNull();
        expect(dbExecution!.triggerData).toEqual(complexTriggerData);
      } finally {
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  test.prop([triggerSubTypeArb], { numRuns: 1 })(
    'execution record has valid timestamps',
    async (triggerSubType) => {
      const { event, guest, eventGuest } = await createTestData();
      const beforeExecution = new Date();

      try {
        // Create automation
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes: [
            {
              type: 'trigger',
              subType: triggerSubType,
              label: 'Trigger',
              position: { x: 100, y: 100 },
              config: {},
            },
          ],
          edges: [],
        });

        // Execute the workflow
        const result = await WorkflowEngine.execute(automation, eventGuest.id, {});
        const afterExecution = new Date();

        // Verify timestamps
        expect(result.execution.startedAt).toBeDefined();
        expect(new Date(result.execution.startedAt).getTime()).toBeGreaterThanOrEqual(
          beforeExecution.getTime() - 1000 // Allow 1 second tolerance
        );
        expect(new Date(result.execution.startedAt).getTime()).toBeLessThanOrEqual(
          afterExecution.getTime() + 1000
        );

        // For successful executions, completedAt should be set
        if (result.success) {
          expect(result.execution.completedAt).toBeDefined();
          expect(
            new Date(result.execution.completedAt!).getTime()
          ).toBeGreaterThanOrEqual(new Date(result.execution.startedAt).getTime());
        }
      } finally {
        await cleanupTestData(event.id, guest.id);
      }
    }
  );
});
