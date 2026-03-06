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
import { ExecutionService } from '../services/execution-service';
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
  
  // Delete event guests
  await db.delete(eventGuests).where(eq(eventGuests.eventId, eventId));
  
  // Delete event
  await db.delete(events).where(eq(events.id, eventId));
  
  // Delete guest
  await db.delete(guests).where(eq(guests.id, guestId));
}

// Helper to create a simple automation
async function createSimpleAutomation(eventId: string) {
  return AutomationService.create(eventId, {
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
}

/**
 * Feature: event-automation-builder, Property 8: Execution History Pagination
 * 
 * For any automation with executions, querying execution history should return
 * at most the requested limit (default 100), ordered by most recent first,
 * with accurate total count for pagination.
 * 
 * Validates: Requirements 7.2
 */
describe('Property 8: Execution History Pagination', () => {
  beforeEach(() => {
    setEmailSender(mockEmailSender);
    mockEmailSender.send.mockClear();
  });

  afterEach(() => {
    setEmailSender(null);
  });

  // Arbitrary for number of executions to create (keep small for test performance)
  const executionCountArb = fc.integer({ min: 0, max: 5 });

  // Arbitrary for limit values
  const limitArb = fc.integer({ min: 1, max: 50 });

  // Arbitrary for offset values
  const offsetArb = fc.integer({ min: 0, max: 10 });

  test.prop([executionCountArb], { numRuns: 1, timeout: 60000 })(
    'returns at most the requested limit (default 100)',
    async (executionCount) => {
      // Create test data for this specific test run
      const { event, guest, eventGuest } = await createTestData();
      
      try {
        // Create automation
        const automation = await createSimpleAutomation(event.id);

        // Create executions
        for (let i = 0; i < executionCount; i++) {
          await WorkflowEngine.execute(automation, eventGuest.id, { index: i });
        }

        // Query with default limit
        const result = await ExecutionService.getByAutomation(automation.id);

        // Verify limit is respected
        expect(result.executions.length).toBeLessThanOrEqual(100);
        expect(result.executions.length).toBe(Math.min(executionCount, 100));
        expect(result.limit).toBe(100);
      } finally {
        // Clean up test data
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  test.prop([executionCountArb, limitArb], { numRuns: 1, timeout: 60000 })(
    'returns at most the specified limit',
    async (executionCount, limit) => {
      // Create test data for this specific test run
      const { event, guest, eventGuest } = await createTestData();
      
      try {
        // Create automation
        const automation = await createSimpleAutomation(event.id);

        // Create executions
        for (let i = 0; i < executionCount; i++) {
          await WorkflowEngine.execute(automation, eventGuest.id, { index: i });
        }

        // Query with specified limit
        const result = await ExecutionService.getByAutomation(automation.id, { limit });

        // Verify limit is respected (capped at 100)
        const effectiveLimit = Math.min(limit, 100);
        expect(result.executions.length).toBeLessThanOrEqual(effectiveLimit);
        expect(result.executions.length).toBe(Math.min(executionCount, effectiveLimit));
        expect(result.limit).toBe(effectiveLimit);
      } finally {
        // Clean up test data
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  test.prop([executionCountArb], { numRuns: 1, timeout: 60000 })(
    'returns accurate total count for pagination',
    async (executionCount) => {
      // Create test data for this specific test run
      const { event, guest, eventGuest } = await createTestData();
      
      try {
        // Create automation
        const automation = await createSimpleAutomation(event.id);

        // Create executions
        for (let i = 0; i < executionCount; i++) {
          await WorkflowEngine.execute(automation, eventGuest.id, { index: i });
        }

        // Query executions
        const result = await ExecutionService.getByAutomation(automation.id);

        // Verify total count is accurate
        expect(result.total).toBe(executionCount);
      } finally {
        // Clean up test data
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  test.prop([fc.integer({ min: 3, max: 5 })], { numRuns: 1, timeout: 60000 })(
    'returns executions ordered by most recent first',
    async (executionCount) => {
      // Create test data for this specific test run
      const { event, guest, eventGuest } = await createTestData();
      
      try {
        // Create automation
        const automation = await createSimpleAutomation(event.id);

        // Create executions with small delays to ensure different timestamps
        for (let i = 0; i < executionCount; i++) {
          await WorkflowEngine.execute(automation, eventGuest.id, { index: i });
        }

        // Query executions
        const result = await ExecutionService.getByAutomation(automation.id);

        // Verify ordering (most recent first)
        for (let i = 1; i < result.executions.length; i++) {
          const current = new Date(result.executions[i].startedAt).getTime();
          const previous = new Date(result.executions[i - 1].startedAt).getTime();
          expect(previous).toBeGreaterThanOrEqual(current);
        }
      } finally {
        // Clean up test data
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  test.prop([fc.integer({ min: 3, max: 5 }), offsetArb], { numRuns: 1, timeout: 60000 })(
    'offset correctly skips executions',
    async (executionCount, offset) => {
      // Create test data for this specific test run
      const { event, guest, eventGuest } = await createTestData();
      
      try {
        // Create automation
        const automation = await createSimpleAutomation(event.id);

        // Create executions
        for (let i = 0; i < executionCount; i++) {
          await WorkflowEngine.execute(automation, eventGuest.id, { index: i });
        }

        // Query with offset
        const result = await ExecutionService.getByAutomation(automation.id, { offset });

        // Verify offset is applied
        expect(result.offset).toBe(offset);
        expect(result.executions.length).toBe(Math.max(0, executionCount - offset));
        expect(result.total).toBe(executionCount);
      } finally {
        // Clean up test data
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  test('getById returns execution with steps', async () => {
    // Create test data for this specific test run
    const { event, guest, eventGuest } = await createTestData();
    
    try {
      // Create automation with multiple nodes
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
            subType: 'wait_delay',
            label: 'Wait',
            position: { x: 100, y: 200 },
            config: { duration: 1, unit: 'days' },
          },
        ],
        edges: [{ sourceNodeId: '0', targetNodeId: '1' }],
      });

      // Execute workflow
      const executionResult = await WorkflowEngine.execute(automation, eventGuest.id, {});

      // Get execution by ID
      const execution = await ExecutionService.getById(executionResult.execution.id);

      // Verify execution and steps are returned
      expect(execution).not.toBeNull();
      expect(execution!.id).toBe(executionResult.execution.id);
      expect(execution!.steps).toBeDefined();
      expect(execution!.steps.length).toBe(2); // trigger + action
    } finally {
      // Clean up test data
      await cleanupTestData(event.id, guest.id);
    }
  });

  test('getSteps returns steps for execution', async () => {
    // Create test data for this specific test run
    const { event, guest, eventGuest } = await createTestData();
    
    try {
      // Create automation
      const automation = await createSimpleAutomation(event.id);

      // Execute workflow
      const executionResult = await WorkflowEngine.execute(automation, eventGuest.id, {});

      // Get steps
      const steps = await ExecutionService.getSteps(executionResult.execution.id);

      // Verify steps are returned
      expect(steps.length).toBe(1); // Just the trigger node
      expect(steps[0].executionId).toBe(executionResult.execution.id);
    } finally {
      // Clean up test data
      await cleanupTestData(event.id, guest.id);
    }
  });

  test('limit is capped at 100', async () => {
    // Create test data for this specific test run
    const { event, guest } = await createTestData();
    
    try {
      // Create automation
      const automation = await createSimpleAutomation(event.id);

      // Query with limit > 100
      const result = await ExecutionService.getByAutomation(automation.id, { limit: 200 });

      // Verify limit is capped
      expect(result.limit).toBe(100);
    } finally {
      // Clean up test data
      await cleanupTestData(event.id, guest.id);
    }
  });
});
