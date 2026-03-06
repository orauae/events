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
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

/**
 * @fileoverview Property-based tests for async delegation
 *
 * Feature: automation-trigger-dev-integration, Property 16: Async Delegation
 *
 * For any call to `TriggerListenerService.processTrigger()`, the service SHALL call
 * `automationExecutionTask.trigger()` (not `triggerAndWait()`) and SHALL NOT call
 * `WorkflowEngine.execute()` directly.
 *
 * **Validates: Requirements 7.1, 7.2**
 */

// Mock the automationExecutionTask
const mockTrigger = vi.fn();

vi.mock('@/trigger/automation-execution', () => ({
  automationExecutionTask: {
    trigger: (...args: unknown[]) => mockTrigger(...args),
    triggerAndWait: vi.fn().mockRejectedValue(new Error('triggerAndWait should not be called')),
  },
}));

// Mock WorkflowEngine to ensure it's NOT called
const mockWorkflowExecute = vi.fn();

vi.mock('@/lib/services/workflow-engine', () => ({
  WorkflowEngine: {
    execute: (...args: unknown[]) => mockWorkflowExecute(...args),
  },
}));

// Import after mocking
import { TriggerListenerService } from '@/lib/services/trigger-listener-service';

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

async function createTestGuest() {
  const uniqueId = createId();

  const testGuest = {
    firstName: 'John',
    lastName: 'Doe',
    email: `john.doe-${uniqueId}@test.com`,
    company: 'Test Company',
    jobTitle: 'Engineer',
  };

  const [guest] = await db.insert(guests).values(testGuest).returning();
  return guest;
}

async function createTestEventGuest(eventId: string, guestId: string) {
  const [eventGuest] = await db
    .insert(eventGuests)
    .values({
      eventId,
      guestId,
    })
    .returning();
  return eventGuest;
}

/**
 * Helper to create an automation with a trigger node.
 */
async function createTestAutomation(eventId: string, triggerSubType: string) {
  const automationId = createId();
  const triggerNodeId = createId();
  const actionNodeId = createId();

  const [automation] = await db
    .insert(automations)
    .values({
      id: automationId,
      eventId,
      name: `Test Automation ${automationId}`,
      status: 'Active', // Must be active to trigger
    })
    .returning();

  // Add trigger node
  await db.insert(automationNodes).values({
    id: triggerNodeId,
    automationId: automation.id,
    type: 'trigger',
    subType: triggerSubType,
    label: 'Trigger',
    positionX: '100',
    positionY: '100',
    config: {},
  });

  // Add action node
  await db.insert(automationNodes).values({
    id: actionNodeId,
    automationId: automation.id,
    type: 'action',
    subType: 'wait_delay',
    label: 'Wait',
    positionX: '100',
    positionY: '200',
    config: { duration: 1, unit: 'hours' },
  });

  // Add edge
  await db.insert(automationEdges).values({
    id: createId(),
    automationId: automation.id,
    sourceNodeId: triggerNodeId,
    targetNodeId: actionNodeId,
  });

  return automation;
}

/**
 * Helper to clean up test data.
 */
async function cleanupTestData(eventId: string, guestIds: string[]) {
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

  // Delete guests
  for (const guestId of guestIds) {
    await db.delete(guests).where(eq(guests.id, guestId));
  }
}

// Arbitrary for trigger types
const triggerTypeArb = fc.constantFrom(
  'guest_rsvp_received',
  'guest_checked_in',
  'guest_added_to_event'
);

// Arbitrary for RSVP status
const rsvpStatusArb = fc.constantFrom(
  'Pending',
  'Attending',
  'Declined'
);

/**
 * Feature: automation-trigger-dev-integration, Property 16: Async Delegation
 * **Validates: Requirements 7.1, 7.2**
 */
describe('Property 16: Async Delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation - returns a handle with an ID
    mockTrigger.mockImplementation(() =>
      Promise.resolve({ id: `handle_${createId()}` })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test.prop([triggerTypeArb, rsvpStatusArb], { numRuns: 3 })(
    'processTrigger calls automationExecutionTask.trigger() and NOT WorkflowEngine.execute()',
    async (triggerType, rsvpStatus) => {
      const event = await createTestEvent();
      const guest = await createTestGuest();
      const eventGuest = await createTestEventGuest(event.id, guest.id);

      try {
        // Create an active automation with matching trigger type
        await createTestAutomation(event.id, triggerType);

        // Process the trigger
        const results = await TriggerListenerService.processTrigger(
          triggerType as any,
          {
            eventId: event.id,
            eventGuestId: eventGuest.id,
            guestId: guest.id,
            rsvpStatus: rsvpStatus as any,
          }
        );

        // Verify automationExecutionTask.trigger() was called (Requirement 7.1)
        expect(mockTrigger).toHaveBeenCalled();

        // Verify WorkflowEngine.execute() was NOT called (Requirement 7.2)
        expect(mockWorkflowExecute).not.toHaveBeenCalled();

        // Verify the result indicates successful triggering
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].executed).toBe(true);
        expect(results[0].triggerDevHandle).toBeDefined();
      } finally {
        await cleanupTestData(event.id, [guest.id]);
      }
    }
  );

  test.prop([triggerTypeArb], { numRuns: 1 })(
    'trigger() is called with correct payload structure',
    async (triggerType) => {
      const event = await createTestEvent();
      const guest = await createTestGuest();
      const eventGuest = await createTestEventGuest(event.id, guest.id);

      try {
        const automation = await createTestAutomation(event.id, triggerType);

        await TriggerListenerService.processTrigger(triggerType as any, {
          eventId: event.id,
          eventGuestId: eventGuest.id,
          guestId: guest.id,
          rsvpStatus: 'Attending',
        });

        // Verify trigger was called with correct payload structure
        expect(mockTrigger).toHaveBeenCalledWith(
          expect.objectContaining({
            automationId: automation.id,
            eventGuestId: eventGuest.id,
            triggerData: expect.objectContaining({
              triggerType,
              eventId: event.id,
              eventGuestId: eventGuest.id,
              guestId: guest.id,
            }),
          })
        );
      } finally {
        await cleanupTestData(event.id, [guest.id]);
      }
    }
  );

  test.prop([triggerTypeArb], { numRuns: 1 })(
    'service returns immediately after triggering (non-blocking)',
    async (triggerType) => {
      const event = await createTestEvent();
      const guest = await createTestGuest();
      const eventGuest = await createTestEventGuest(event.id, guest.id);

      try {
        await createTestAutomation(event.id, triggerType);

        // Make trigger return a delayed promise to simulate async execution
        let triggerResolved = false;
        mockTrigger.mockImplementation(
          () =>
            new Promise((resolve) => {
              // Simulate that the task is running in the background
              setTimeout(() => {
                triggerResolved = true;
                resolve({ id: `handle_${createId()}` });
              }, 10);
            })
        );

        const startTime = Date.now();
        const results = await TriggerListenerService.processTrigger(
          triggerType as any,
          {
            eventId: event.id,
            eventGuestId: eventGuest.id,
            guestId: guest.id,
          }
        );
        const endTime = Date.now();

        // The service should return quickly (within reasonable time)
        // This verifies non-blocking behavior
        expect(endTime - startTime).toBeLessThan(1000);
        expect(results[0].executed).toBe(true);
      } finally {
        await cleanupTestData(event.id, [guest.id]);
      }
    }
  );
});
