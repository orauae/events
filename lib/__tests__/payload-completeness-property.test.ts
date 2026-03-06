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
 * @fileoverview Property-based tests for payload completeness
 *
 * Feature: automation-trigger-dev-integration, Property 1: Payload Completeness
 *
 * For any automation trigger event with automation ID, event guest ID, and trigger data,
 * the task payload passed to `automationExecutionTask.trigger()` SHALL contain all three
 * values unchanged.
 *
 * **Validates: Requirements 2.2, 7.3**
 */

// Capture the payload passed to trigger
let capturedPayload: {
  automationId: string;
  eventGuestId: string;
  triggerData: Record<string, unknown>;
} | null = null;

const mockTrigger = vi.fn();

vi.mock('@/trigger/automation-execution', () => ({
  automationExecutionTask: {
    trigger: (payload: any) => {
      capturedPayload = payload;
      return mockTrigger(payload);
    },
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

  const [automation] = await db
    .insert(automations)
    .values({
      id: automationId,
      eventId,
      name: `Test Automation ${automationId}`,
      status: 'Active',
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

  return automation;
}

/**
 * Helper to clean up test data.
 */
async function cleanupTestData(eventId: string, guestIds: string[]) {
  const eventAutomations = await db.query.automations.findMany({
    where: eq(automations.eventId, eventId),
  });

  for (const automation of eventAutomations) {
    const executions = await db.query.automationExecutions.findMany({
      where: eq(automationExecutions.automationId, automation.id),
    });

    for (const execution of executions) {
      await db
        .delete(executionSteps)
        .where(eq(executionSteps.executionId, execution.id));
    }

    await db
      .delete(automationExecutions)
      .where(eq(automationExecutions.automationId, automation.id));

    await db
      .delete(automationEdges)
      .where(eq(automationEdges.automationId, automation.id));
    await db
      .delete(automationNodes)
      .where(eq(automationNodes.automationId, automation.id));
  }

  await db.delete(automations).where(eq(automations.eventId, eventId));
  await db.delete(eventGuests).where(eq(eventGuests.eventId, eventId));
  await db.delete(events).where(eq(events.id, eventId));

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
 * Feature: automation-trigger-dev-integration, Property 1: Payload Completeness
 * **Validates: Requirements 2.2, 7.3**
 */
describe('Property 1: Payload Completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedPayload = null;
    mockTrigger.mockImplementation(() =>
      Promise.resolve({ id: `handle_${createId()}` })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    capturedPayload = null;
  });

  test.prop([triggerTypeArb, rsvpStatusArb], { numRuns: 3 })(
    'payload contains automationId unchanged',
    async (triggerType, rsvpStatus) => {
      const event = await createTestEvent();
      const guest = await createTestGuest();
      const eventGuest = await createTestEventGuest(event.id, guest.id);

      try {
        const automation = await createTestAutomation(event.id, triggerType);

        await TriggerListenerService.processTrigger(triggerType as any, {
          eventId: event.id,
          eventGuestId: eventGuest.id,
          guestId: guest.id,
          rsvpStatus: rsvpStatus as any,
        });

        // Verify automationId is passed unchanged
        expect(capturedPayload).not.toBeNull();
        expect(capturedPayload!.automationId).toBe(automation.id);
      } finally {
        await cleanupTestData(event.id, [guest.id]);
      }
    }
  );

  test.prop([triggerTypeArb, rsvpStatusArb], { numRuns: 3 })(
    'payload contains eventGuestId unchanged',
    async (triggerType, rsvpStatus) => {
      const event = await createTestEvent();
      const guest = await createTestGuest();
      const eventGuest = await createTestEventGuest(event.id, guest.id);

      try {
        await createTestAutomation(event.id, triggerType);

        await TriggerListenerService.processTrigger(triggerType as any, {
          eventId: event.id,
          eventGuestId: eventGuest.id,
          guestId: guest.id,
          rsvpStatus: rsvpStatus as any,
        });

        // Verify eventGuestId is passed unchanged
        expect(capturedPayload).not.toBeNull();
        expect(capturedPayload!.eventGuestId).toBe(eventGuest.id);
      } finally {
        await cleanupTestData(event.id, [guest.id]);
      }
    }
  );

  test.prop([triggerTypeArb, rsvpStatusArb], { numRuns: 3 })(
    'payload contains triggerData with all required fields',
    async (triggerType, rsvpStatus) => {
      const event = await createTestEvent();
      const guest = await createTestGuest();
      const eventGuest = await createTestEventGuest(event.id, guest.id);

      try {
        await createTestAutomation(event.id, triggerType);

        await TriggerListenerService.processTrigger(triggerType as any, {
          eventId: event.id,
          eventGuestId: eventGuest.id,
          guestId: guest.id,
          rsvpStatus: rsvpStatus as any,
        });

        // Verify triggerData contains all required fields unchanged
        expect(capturedPayload).not.toBeNull();
        expect(capturedPayload!.triggerData).toBeDefined();
        expect(capturedPayload!.triggerData.triggerType).toBe(triggerType);
        expect(capturedPayload!.triggerData.eventId).toBe(event.id);
        expect(capturedPayload!.triggerData.eventGuestId).toBe(eventGuest.id);
        expect(capturedPayload!.triggerData.guestId).toBe(guest.id);
        expect(capturedPayload!.triggerData.timestamp).toBeDefined();
      } finally {
        await cleanupTestData(event.id, [guest.id]);
      }
    }
  );

  test.prop([rsvpStatusArb], { numRuns: 2 })(
    'payload includes RSVP-specific data when present',
    async (rsvpStatus) => {
      const event = await createTestEvent();
      const guest = await createTestGuest();
      const eventGuest = await createTestEventGuest(event.id, guest.id);

      try {
        await createTestAutomation(event.id, 'guest_rsvp_received');

        await TriggerListenerService.processTrigger('guest_rsvp_received', {
          eventId: event.id,
          eventGuestId: eventGuest.id,
          guestId: guest.id,
          rsvpStatus: rsvpStatus as any,
          previousRsvpStatus: 'Pending',
        });

        // Verify RSVP-specific data is included
        expect(capturedPayload).not.toBeNull();
        expect(capturedPayload!.triggerData.rsvpStatus).toBe(rsvpStatus);
        expect(capturedPayload!.triggerData.previousRsvpStatus).toBe('Pending');
      } finally {
        await cleanupTestData(event.id, [guest.id]);
      }
    }
  );

  test.prop([triggerTypeArb], { numRuns: 1 })(
    'payload includes tag-specific data when present',
    async (triggerType) => {
      const event = await createTestEvent();
      const guest = await createTestGuest();
      const eventGuest = await createTestEventGuest(event.id, guest.id);
      const tagId = createId();

      try {
        await createTestAutomation(event.id, 'guest_tag_changed');

        await TriggerListenerService.processTrigger('guest_tag_changed', {
          eventId: event.id,
          eventGuestId: eventGuest.id,
          guestId: guest.id,
          tagId,
          tagAction: 'added',
        });

        // Verify tag-specific data is included
        expect(capturedPayload).not.toBeNull();
        expect(capturedPayload!.triggerData.tagId).toBe(tagId);
        expect(capturedPayload!.triggerData.tagAction).toBe('added');
      } finally {
        await cleanupTestData(event.id, [guest.id]);
      }
    }
  );
});
