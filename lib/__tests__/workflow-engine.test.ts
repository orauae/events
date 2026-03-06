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
import { AutomationService, type AutomationWithDetails } from '../services/automation-service';
import { WorkflowEngine } from '../services/workflow-engine';
import { setEmailSender } from '../services/campaign-send-service';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// Mock email sender to avoid actual email sending
const mockEmailSender = {
  send: vi.fn().mockResolvedValue({ data: { id: 'mock-email-id' } }),
};

// Helper to create test data with unique identifiers
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
  const [eventGuest] = await db.insert(eventGuests).values({
    eventId: event.id,
    guestId: guest.id,
  }).returning();
  
  return { event, guest, eventGuest };
}

// Helper to clean up test data for a specific event
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
  
  // Delete guest
  await db.delete(guests).where(eq(guests.id, guestId));
}


// Generate valid config for a node based on its subType
function generateValidConfig(subType: string): Record<string, unknown> {
  switch (subType) {
    case 'event_date_approaching':
      return { daysBefore: 7 };
    case 'guest_tag_changed':
      return { tagIds: ['tag1'] };
    case 'check_rsvp_status':
      return { statuses: ['Attending'] };
    case 'check_guest_tag':
      return { tagId: 'tag1', hasTag: true };
    case 'check_guest_field':
      return { field: 'company', operator: 'equals', value: 'Test' };
    case 'check_time_window':
      return { startTime: '00:00', endTime: '23:59' }; // Always true for testing
    case 'send_email':
      return { subject: 'Test Subject', content: 'Test content' };
    case 'send_campaign':
      return { campaignId: 'campaign1' };
    case 'add_guest_tag':
    case 'remove_guest_tag':
      return { tagId: 'tag1' };
    case 'wait_delay':
      return { duration: 1, unit: 'days' };
    case 'send_webhook':
      return { url: 'https://example.com/webhook', method: 'POST' };
    case 'update_guest_field':
      return { field: 'company', value: 'New Company' };
    default:
      return {};
  }
}

// Arbitraries for node types
const triggerSubTypeArb = fc.constantFrom(
  'guest_rsvp_received',
  'guest_checked_in',
  'guest_added_to_event'
);

const actionSubTypeArb = fc.constantFrom(
  'wait_delay',
  'update_guest_field'
);

/**
 * Feature: event-automation-builder, Property 7: Execution Creates Complete Log
 * 
 * For any automation execution, the system should create an execution log with:
 * - timestamp
 * - trigger data
 * - status
 * - one execution step record per node traversed
 * Failed actions should include error messages in their step records.
 * 
 * Validates: Requirements 7.1, 7.4
 */
describe('Property 7: Execution Creates Complete Log', () => {
  beforeEach(() => {
    // Set up mock email sender
    setEmailSender(mockEmailSender);
    mockEmailSender.send.mockClear();
  });

  afterEach(() => {
    setEmailSender(null);
  });

  // Arbitrary for number of action nodes in a linear workflow
  const actionCountArb = fc.integer({ min: 0, max: 3 });

  test.prop([triggerSubTypeArb, actionCountArb], { numRuns: 3 })(
    'execution creates step record for each node traversed',
    async (triggerSubType, actionCount) => {
      const { event, guest, eventGuest } = await createTestData();
      try {
        // Create a linear workflow: trigger -> action1 -> action2 -> ...
        const nodes: Array<{
          type: 'trigger' | 'condition' | 'action';
          subType: string;
          label: string;
          position: { x: number; y: number };
          config: Record<string, unknown>;
        }> = [
          {
            type: 'trigger',
            subType: triggerSubType,
            label: 'Trigger',
            position: { x: 100, y: 100 },
            config: generateValidConfig(triggerSubType),
          },
        ];

        // Add action nodes
        for (let i = 0; i < actionCount; i++) {
          nodes.push({
            type: 'action',
            subType: 'wait_delay',
            label: `Action ${i + 1}`,
            position: { x: 100, y: 200 + i * 100 },
            config: generateValidConfig('wait_delay'),
          });
        }

        // Create edges connecting nodes sequentially
        const edges = [];
        for (let i = 0; i < nodes.length - 1; i++) {
          edges.push({
            sourceNodeId: String(i),
            targetNodeId: String(i + 1),
          });
        }

        // Create automation
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes,
          edges,
        });

        // Execute the workflow
        const triggerData = { test: 'data', timestamp: Date.now() };
        const result = await WorkflowEngine.execute(automation, eventGuest.id, triggerData);

        // Verify execution record was created
        expect(result.execution).toBeDefined();
        expect(result.execution.automationId).toBe(automation.id);
        expect(result.execution.eventGuestId).toBe(eventGuest.id);
        expect(result.execution.triggerData).toEqual(triggerData);
        expect(result.execution.startedAt).toBeDefined();

        // Verify step records were created for each node
        expect(result.steps.length).toBe(nodes.length);

        // Verify each step has required fields
        for (const step of result.steps) {
          expect(step.executionId).toBe(result.execution.id);
          expect(step.nodeId).toBeDefined();
          expect(step.status).toBeDefined();
          expect(step.startedAt).toBeDefined();
        }

        // Verify steps are in database
        const dbSteps = await db.query.executionSteps.findMany({
          where: eq(executionSteps.executionId, result.execution.id),
        });
        expect(dbSteps.length).toBe(nodes.length);
      } finally {
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  test.prop([triggerSubTypeArb], { numRuns: 3 })(
    'execution log includes timestamp and status',
    async (triggerSubType) => {
      const { event, guest, eventGuest } = await createTestData();
      try {
        // Create a simple workflow
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes: [
            {
              type: 'trigger',
              subType: triggerSubType,
              label: 'Trigger',
              position: { x: 100, y: 100 },
              config: generateValidConfig(triggerSubType),
            },
          ],
          edges: [],
        });

        const beforeExecution = new Date();
        const result = await WorkflowEngine.execute(automation, eventGuest.id, {});
        const afterExecution = new Date();

        // Verify timestamp
        expect(result.execution.startedAt).toBeDefined();
        expect(new Date(result.execution.startedAt).getTime()).toBeGreaterThanOrEqual(beforeExecution.getTime());
        expect(new Date(result.execution.startedAt).getTime()).toBeLessThanOrEqual(afterExecution.getTime());

        // Verify status
        expect(['Running', 'Success', 'Failed', 'Partial']).toContain(result.execution.status);
        
        // For successful execution, status should be Success
        if (result.success) {
          expect(result.execution.status).toBe('Success');
          expect(result.execution.completedAt).toBeDefined();
        }
      } finally {
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  test('failed action includes error message in step record', async () => {
    const { event, guest, eventGuest } = await createTestData();
    try {
      // Create automation with an action that will fail (send_webhook to invalid URL)
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
          {
            type: 'action',
            subType: 'send_webhook',
            label: 'Send Webhook',
            position: { x: 100, y: 200 },
            // Missing URL will cause failure
            config: { url: '', method: 'POST' },
          },
        ],
        edges: [{ sourceNodeId: '0', targetNodeId: '1' }],
      });

      const result = await WorkflowEngine.execute(automation, eventGuest.id, {});

      // Find the failed step
      const failedStep = result.steps.find(s => s.status === 'Failed');
      expect(failedStep).toBeDefined();
      expect(failedStep!.error).toBeDefined();
      expect(failedStep!.error).toBeTruthy();

      // Verify execution status reflects the failure
      expect(['Failed', 'Partial']).toContain(result.execution.status);
    } finally {
      await cleanupTestData(event.id, guest.id);
    }
  });

  test('execution preserves trigger data in log', async () => {
    const { event, guest, eventGuest } = await createTestData();
    try {
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

      const triggerData = {
        rsvpStatus: 'Attending',
        timestamp: Date.now(),
        source: 'test',
      };

      const result = await WorkflowEngine.execute(automation, eventGuest.id, triggerData);

      // Verify trigger data is preserved
      expect(result.execution.triggerData).toEqual(triggerData);

      // Verify in database
      const dbExecution = await db.query.automationExecutions.findFirst({
        where: eq(automationExecutions.id, result.execution.id),
      });
      expect(dbExecution).toBeDefined();
      expect(dbExecution!.triggerData).toEqual(triggerData);
    } finally {
      await cleanupTestData(event.id, guest.id);
    }
  });
});
