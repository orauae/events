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
  guestTags,
  eventGuestTags,
} from '@/db/schema';
import { AutomationService } from '../services/automation-service';
import { setEmailSender } from '../services/campaign-send-service';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// Mock the automationExecutionTask
const mockTrigger = vi.fn();

vi.mock('@/trigger/automation-execution', () => ({
  automationExecutionTask: {
    trigger: (...args: unknown[]) => mockTrigger(...args),
  },
}));

// Import after mocking
import { TriggerListenerService } from '../services/trigger-listener-service';

// Mock email sender to avoid actual email sending
const mockEmailSender = {
  send: vi.fn().mockResolvedValue({ data: { id: 'mock-email-id' } }),
};

// Helper to create test data with unique identifiers
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
  const [eventGuest] = await db.insert(eventGuests).values({
    eventId,
    guestId,
  }).returning();
  return eventGuest;
}

// Helper to clean up test data for a specific event
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
      await db.delete(executionSteps).where(eq(executionSteps.executionId, execution.id));
    }
    
    // Delete executions
    await db.delete(automationExecutions).where(eq(automationExecutions.automationId, automation.id));
    
    // Delete edges and nodes
    await db.delete(automationEdges).where(eq(automationEdges.automationId, automation.id));
    await db.delete(automationNodes).where(eq(automationNodes.automationId, automation.id));
  }
  
  // Delete automations
  await db.delete(automations).where(eq(automations.eventId, eventId));
  
  // Delete event guest tags
  const eventGuestsList = await db.query.eventGuests.findMany({
    where: eq(eventGuests.eventId, eventId),
  });
  for (const eg of eventGuestsList) {
    await db.delete(eventGuestTags).where(eq(eventGuestTags.eventGuestId, eg.id));
  }
  
  // Delete guest tags
  await db.delete(guestTags).where(eq(guestTags.eventId, eventId));
  
  // Delete event guests
  await db.delete(eventGuests).where(eq(eventGuests.eventId, eventId));
  
  // Delete event
  await db.delete(events).where(eq(events.id, eventId));
  
  // Delete guests
  for (const guestId of guestIds) {
    await db.delete(guests).where(eq(guests.id, guestId));
  }
}

/**
 * Feature: event-automation-builder, Property 11: Trigger Scope Limited to Event Guests
 * 
 * For any automation trigger execution, the trigger should only match and process 
 * guests that are linked to the automation's associated event (via event_guests table).
 * 
 * Validates: Requirements 8.5
 */
describe('Property 11: Trigger Scope Limited to Event Guests', () => {
  beforeEach(() => {
    // Set up mock email sender
    setEmailSender(mockEmailSender);
    mockEmailSender.send.mockClear();
    
    // Set up mock for automationExecutionTask.trigger()
    vi.clearAllMocks();
    mockTrigger.mockImplementation(() =>
      Promise.resolve({ id: `handle_${createId()}` })
    );
  });

  afterEach(() => {
    setEmailSender(null);
    vi.clearAllMocks();
  });

  // Arbitrary for trigger types
  const triggerTypeArb = fc.constantFrom(
    'guest_rsvp_received',
    'guest_checked_in',
    'guest_added_to_event'
  );

  test.prop([triggerTypeArb], { numRuns: 1 })(
    'trigger only executes for guests linked to the automation event',
    async (triggerType) => {
      // Create two separate events
      const event1 = await createTestEvent();
      const event2 = await createTestEvent();
      
      // Create guests
      const guest1 = await createTestGuest();
      const guest2 = await createTestGuest();
      
      // Link guest1 to event1, guest2 to event2
      const eventGuest1 = await createTestEventGuest(event1.id, guest1.id);
      const eventGuest2 = await createTestEventGuest(event2.id, guest2.id);
      
      try {
        // Create an active automation for event1
        const automation = await AutomationService.create(event1.id, {
          name: 'Test Automation',
          nodes: [
            {
              type: 'trigger',
              subType: triggerType,
              label: 'Trigger',
              position: { x: 100, y: 100 },
              config: {},
            },
            {
              type: 'action',
              subType: 'wait_delay',
              label: 'Wait',
              position: { x: 100, y: 200 },
              config: { duration: 1, unit: 'days' },
            },
          ],
          edges: [{ sourceNodeId: '0', targetNodeId: '1' }],
        });
        
        // Activate the automation
        await AutomationService.setStatus(automation.id, 'Active');
        
        // Process trigger for guest1 (linked to event1) - should execute
        const results1 = await TriggerListenerService.processTrigger(triggerType as any, {
          eventId: event1.id,
          eventGuestId: eventGuest1.id,
          guestId: guest1.id,
          rsvpStatus: 'Attending',
        });
        
        // Should have executed for guest1
        expect(results1.length).toBe(1);
        expect(results1[0].executed).toBe(true);
        expect(results1[0].automationId).toBe(automation.id);
        
        // Process trigger for guest2 (linked to event2) with event1's automation
        // This should NOT execute because guest2 is not linked to event1
        const results2 = await TriggerListenerService.processTrigger(triggerType as any, {
          eventId: event2.id, // Different event
          eventGuestId: eventGuest2.id,
          guestId: guest2.id,
          rsvpStatus: 'Attending',
        });
        
        // Should NOT have executed for guest2 (no automations for event2)
        expect(results2.length).toBe(0);
        
        // Try to trick the system by using event1's ID but guest2's eventGuestId
        // This should fail because eventGuest2 is not linked to event1
        const results3 = await TriggerListenerService.processTrigger(triggerType as any, {
          eventId: event1.id, // Event1's ID
          eventGuestId: eventGuest2.id, // But guest2's eventGuestId
          guestId: guest2.id,
          rsvpStatus: 'Attending',
        });
        
        // Should have attempted but failed due to scope check
        expect(results3.length).toBe(1);
        expect(results3[0].executed).toBe(false);
        expect(results3[0].error).toContain('does not belong');
      } finally {
        await cleanupTestData(event1.id, [guest1.id]);
        await cleanupTestData(event2.id, [guest2.id]);
      }
    }
  );

  test.prop([triggerTypeArb], { numRuns: 1 })(
    'automation only triggers for its own event guests',
    async (triggerType) => {
      // Create one event with multiple guests
      const event = await createTestEvent();
      const guest1 = await createTestGuest();
      const guest2 = await createTestGuest();
      
      const eventGuest1 = await createTestEventGuest(event.id, guest1.id);
      const eventGuest2 = await createTestEventGuest(event.id, guest2.id);
      
      try {
        // Create an active automation for the event
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes: [
            {
              type: 'trigger',
              subType: triggerType,
              label: 'Trigger',
              position: { x: 100, y: 100 },
              config: {},
            },
          ],
          edges: [],
        });
        
        await AutomationService.setStatus(automation.id, 'Active');
        
        // Both guests should trigger the automation since they're both linked to the event
        const results1 = await TriggerListenerService.processTrigger(triggerType as any, {
          eventId: event.id,
          eventGuestId: eventGuest1.id,
          guestId: guest1.id,
        });
        
        const results2 = await TriggerListenerService.processTrigger(triggerType as any, {
          eventId: event.id,
          eventGuestId: eventGuest2.id,
          guestId: guest2.id,
        });
        
        // Both should execute successfully
        expect(results1.length).toBe(1);
        expect(results1[0].executed).toBe(true);
        
        expect(results2.length).toBe(1);
        expect(results2[0].executed).toBe(true);
        
        // Verify executions are for different event guests (different handles)
        expect(results1[0].triggerDevHandle).not.toBe(results2[0].triggerDevHandle);
      } finally {
        await cleanupTestData(event.id, [guest1.id, guest2.id]);
      }
    }
  );

  test('trigger does not execute for non-existent event guest', async () => {
    const event = await createTestEvent();
    const guest = await createTestGuest();
    const eventGuest = await createTestEventGuest(event.id, guest.id);
    
    try {
      // Create an active automation
      const automation = await AutomationService.create(event.id, {
        name: 'Test Automation',
        nodes: [
          {
            type: 'trigger',
            subType: 'guest_rsvp_received',
            label: 'Trigger',
            position: { x: 100, y: 100 },
            config: {},
          },
        ],
        edges: [],
      });
      
      await AutomationService.setStatus(automation.id, 'Active');
      
      // Try to trigger with a non-existent eventGuestId
      const results = await TriggerListenerService.processTrigger('guest_rsvp_received', {
        eventId: event.id,
        eventGuestId: 'non-existent-id',
        guestId: guest.id,
      });
      
      // Should have attempted but failed
      expect(results.length).toBe(1);
      expect(results[0].executed).toBe(false);
      expect(results[0].error).toBeDefined();
    } finally {
      await cleanupTestData(event.id, [guest.id]);
    }
  });

  test('inactive automations do not trigger', async () => {
    const event = await createTestEvent();
    const guest = await createTestGuest();
    const eventGuest = await createTestEventGuest(event.id, guest.id);
    
    try {
      // Create a draft automation (not active)
      const automation = await AutomationService.create(event.id, {
        name: 'Test Automation',
        nodes: [
          {
            type: 'trigger',
            subType: 'guest_rsvp_received',
            label: 'Trigger',
            position: { x: 100, y: 100 },
            config: {},
          },
        ],
        edges: [],
      });
      
      // Don't activate - leave as Draft
      
      // Try to trigger
      const results = await TriggerListenerService.processTrigger('guest_rsvp_received', {
        eventId: event.id,
        eventGuestId: eventGuest.id,
        guestId: guest.id,
      });
      
      // Should not execute because automation is not active
      expect(results.length).toBe(0);
    } finally {
      await cleanupTestData(event.id, [guest.id]);
    }
  });
});
