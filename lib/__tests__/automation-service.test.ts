import { describe, expect, beforeEach, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { db } from '@/db';
import { events, automations, automationNodes, automationEdges } from '@/db/schema';
import { AutomationService, type AutomationWithDetails } from '../services/automation-service';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// Helper to create a test event with unique data
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

// Helper to clean up test data for a specific event
async function cleanupTestEvent(eventId: string) {
  // Get all automations for this event
  const eventAutomations = await db.query.automations.findMany({
    where: eq(automations.eventId, eventId),
  });
  
  for (const automation of eventAutomations) {
    // Delete edges and nodes
    await db.delete(automationEdges).where(eq(automationEdges.automationId, automation.id));
    await db.delete(automationNodes).where(eq(automationNodes.automationId, automation.id));
  }
  
  // Delete automations
  await db.delete(automations).where(eq(automations.eventId, eventId));
  
  // Delete event
  await db.delete(events).where(eq(events.id, eventId));
}

// Arbitraries for node types
const nodeTypeArb = fc.constantFrom('trigger', 'condition', 'action') as fc.Arbitrary<'trigger' | 'condition' | 'action'>;

const triggerSubTypeArb = fc.constantFrom(
  'guest_rsvp_received',
  'guest_checked_in',
  'event_date_approaching',
  'campaign_sent',
  'guest_added_to_event',
  'guest_tag_changed'
);

const conditionSubTypeArb = fc.constantFrom(
  'check_rsvp_status',
  'check_guest_tag',
  'check_guest_field',
  'check_time_window'
);

const actionSubTypeArb = fc.constantFrom(
  'send_email',
  'send_campaign',
  'add_guest_tag',
  'remove_guest_tag',
  'update_guest_field',
  'wait_delay',
  'send_webhook'
);


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
      return { startTime: '09:00', endTime: '17:00' };
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

// Arbitrary for a valid node with proper config
const validNodeArb = fc.record({
  type: nodeTypeArb,
  label: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  position: fc.record({ x: fc.integer({ min: 0, max: 1000 }), y: fc.integer({ min: 0, max: 1000 }) }),
}).chain(base => {
  let subTypeArb: fc.Arbitrary<string>;
  if (base.type === 'trigger') {
    subTypeArb = triggerSubTypeArb;
  } else if (base.type === 'condition') {
    subTypeArb = conditionSubTypeArb;
  } else {
    subTypeArb = actionSubTypeArb;
  }
  return subTypeArb.map(subType => ({
    ...base,
    subType,
    config: generateValidConfig(subType),
  }));
});


/**
 * Feature: event-automation-builder, Property 2: Exactly One Trigger Per Automation
 * 
 * For any valid automation, there must be exactly one node of type "trigger".
 * Automations with zero or more than one trigger node should fail validation.
 * 
 * Validates: Requirements 2.5
 */
describe('Property 2: Exactly One Trigger Per Automation', () => {
  // Arbitrary for generating a list of nodes with a specific number of triggers
  const nodesWithTriggerCountArb = (triggerCount: number) => {
    const triggerNodes = fc.array(
      fc.record({
        type: fc.constant('trigger' as const),
        subType: triggerSubTypeArb,
        label: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        position: fc.record({ x: fc.integer({ min: 0, max: 500 }), y: fc.integer({ min: 0, max: 500 }) }),
      }).map(n => ({ ...n, config: generateValidConfig(n.subType) })),
      { minLength: triggerCount, maxLength: triggerCount }
    );

    const otherNodes = fc.array(
      fc.record({
        type: fc.constantFrom('condition', 'action') as fc.Arbitrary<'condition' | 'action'>,
        label: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        position: fc.record({ x: fc.integer({ min: 0, max: 500 }), y: fc.integer({ min: 0, max: 500 }) }),
      }).chain(base => {
        const subTypeArb = base.type === 'condition' ? conditionSubTypeArb : actionSubTypeArb;
        return subTypeArb.map(subType => ({
          ...base,
          subType,
          config: generateValidConfig(subType),
        }));
      }),
      { minLength: 0, maxLength: 3 }
    );

    return fc.tuple(triggerNodes, otherNodes).map(([triggers, others]) => [...triggers, ...others]);
  };


  test.prop([nodesWithTriggerCountArb(1)], { numRuns: 3 })(
    'automation with exactly one trigger should pass trigger validation',
    async (nodes) => {
      const event = await createTestEvent();
      try {
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes,
          edges: [],
        });

        const result = AutomationService.validate(automation);
        
        // Should not have trigger-related errors
        const triggerErrors = result.errors.filter(e => 
          e.message.includes('trigger node')
        );
        expect(triggerErrors).toHaveLength(0);
      } finally {
        await cleanupTestEvent(event.id);
      }
    }
  );

  test.prop([nodesWithTriggerCountArb(0)], { numRuns: 3 })(
    'automation with zero triggers should fail validation',
    async (nodes) => {
      const event = await createTestEvent();
      try {
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes,
          edges: [],
        });

        const result = AutomationService.validate(automation);
        
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('must have exactly one trigger'))).toBe(true);
      } finally {
        await cleanupTestEvent(event.id);
      }
    }
  );

  test.prop([nodesWithTriggerCountArb(2)], { numRuns: 3 })(
    'automation with multiple triggers should fail validation',
    async (nodes) => {
      const event = await createTestEvent();
      try {
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes,
          edges: [],
        });

        const result = AutomationService.validate(automation);
        
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('can only have one trigger'))).toBe(true);
      } finally {
        await cleanupTestEvent(event.id);
      }
    }
  );
});


/**
 * Feature: event-automation-builder, Property 6: Invalid Automation Cannot Be Activated
 * 
 * For any automation with validation errors (disconnected nodes, missing required
 * config fields, no trigger node), attempting to set status to "Active" should
 * fail and return validation errors.
 * 
 * Validates: Requirements 6.5
 */
describe('Property 6: Invalid Automation Cannot Be Activated', () => {
  // Arbitrary for invalid automations (no trigger)
  const invalidNoTriggerArb = fc.array(
    fc.record({
      type: fc.constantFrom('condition', 'action') as fc.Arbitrary<'condition' | 'action'>,
      label: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      position: fc.record({ x: fc.integer({ min: 0, max: 500 }), y: fc.integer({ min: 0, max: 500 }) }),
    }).chain(base => {
      const subTypeArb = base.type === 'condition' ? conditionSubTypeArb : actionSubTypeArb;
      return subTypeArb.map(subType => ({
        ...base,
        subType,
        config: generateValidConfig(subType),
      }));
    }),
    { minLength: 1, maxLength: 3 }
  );

  test.prop([invalidNoTriggerArb], { numRuns: 3 })(
    'automation without trigger cannot be activated',
    async (nodes) => {
      const event = await createTestEvent();
      try {
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes,
          edges: [],
        });

        // Attempting to activate should throw
        await expect(
          AutomationService.setStatus(automation.id, 'Active')
        ).rejects.toThrow('Cannot activate automation');
      } finally {
        await cleanupTestEvent(event.id);
      }
    }
  );


  // Arbitrary for automation with missing required config
  const invalidMissingConfigArb = fc.record({
    subType: fc.constantFrom('send_email', 'wait_delay', 'send_webhook'),
    label: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
    position: fc.record({ x: fc.integer({ min: 0, max: 500 }), y: fc.integer({ min: 0, max: 500 }) }),
  }).map(node => ({
    ...node,
    type: 'action' as const,
    config: {}, // Empty config - missing required fields
  }));

  test.prop([invalidMissingConfigArb], { numRuns: 3 })(
    'automation with missing required config cannot be activated',
    async (invalidActionNode) => {
      const event = await createTestEvent();
      try {
        // Create a valid trigger node
        const triggerNode = {
          type: 'trigger' as const,
          subType: 'guest_rsvp_received',
          label: 'Trigger',
          position: { x: 100, y: 100 },
          config: {},
        };

        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes: [triggerNode, invalidActionNode],
          edges: [{ sourceNodeId: '0', targetNodeId: '1' }],
        });

        // Attempting to activate should throw due to missing config
        await expect(
          AutomationService.setStatus(automation.id, 'Active')
        ).rejects.toThrow('Cannot activate automation');
      } finally {
        await cleanupTestEvent(event.id);
      }
    }
  );

  test('valid automation can be activated', async () => {
    const event = await createTestEvent();
    try {
      const automation = await AutomationService.create(event.id, {
        name: 'Valid Automation',
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
            config: { subject: 'Welcome!', content: 'Hello' },
          },
        ],
        edges: [{ sourceNodeId: '0', targetNodeId: '1' }],
      });

      const activated = await AutomationService.setStatus(automation.id, 'Active');
      expect(activated.status).toBe('Active');
    } finally {
      await cleanupTestEvent(event.id);
    }
  });
});


/**
 * Feature: event-automation-builder, Property 5: Automation Duplication Creates Independent Copy
 * 
 * For any automation, duplicating it should create a new automation with:
 * - A different ID
 * - The same node/edge structure
 * - "(Copy)" appended to the name
 * - Status set to "Draft"
 * Changes to the copy should not affect the original.
 * 
 * Validates: Requirements 6.3
 */
describe('Property 5: Automation Duplication Creates Independent Copy', () => {
  // Arbitrary for automation name
  const automationNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

  // Arbitrary for a valid workflow (trigger + optional actions)
  const validWorkflowArb = fc.tuple(
    // Trigger node
    fc.record({
      type: fc.constant('trigger' as const),
      subType: triggerSubTypeArb,
      label: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      position: fc.record({ x: fc.integer({ min: 0, max: 500 }), y: fc.integer({ min: 0, max: 100 }) }),
    }).map(n => ({ ...n, config: generateValidConfig(n.subType) })),
    // Action nodes
    fc.array(
      fc.record({
        type: fc.constant('action' as const),
        subType: actionSubTypeArb,
        label: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        position: fc.record({ x: fc.integer({ min: 0, max: 500 }), y: fc.integer({ min: 100, max: 500 }) }),
      }).map(n => ({ ...n, config: generateValidConfig(n.subType) })),
      { minLength: 0, maxLength: 3 }
    )
  ).map(([trigger, actions]) => {
    const nodes = [trigger, ...actions];
    // Create edges connecting nodes sequentially
    const edges = actions.map((_, i) => ({
      sourceNodeId: String(i),
      targetNodeId: String(i + 1),
    }));
    return { nodes, edges };
  });

  test.prop([automationNameArb, validWorkflowArb], { numRuns: 2, timeout: 60000 })(
    'duplicating automation creates copy with different ID and (Copy) suffix',
    async (name, workflow) => {
      const event = await createTestEvent();
      try {
        // Create original automation
        const original = await AutomationService.create(event.id, {
          name,
          nodes: workflow.nodes,
          edges: workflow.edges,
        });

        // Duplicate the automation
        const copy = await AutomationService.duplicate(original.id);

        // Verify different ID
        expect(copy.id).not.toBe(original.id);

        // Verify "(Copy)" suffix
        expect(copy.name).toBe(`${name} (Copy)`);

        // Verify Draft status
        expect(copy.status).toBe('Draft');

        // Verify same number of nodes and edges
        expect(copy.nodes.length).toBe(original.nodes.length);
        expect(copy.edges.length).toBe(original.edges.length);

        // Verify node IDs are different
        const originalNodeIds = new Set(original.nodes.map(n => n.id));
        const copyNodeIds = new Set(copy.nodes.map(n => n.id));
        for (const nodeId of copyNodeIds) {
          expect(originalNodeIds.has(nodeId)).toBe(false);
        }

        // Verify node content is the same (type, subType, label, config)
        for (let i = 0; i < original.nodes.length; i++) {
          expect(copy.nodes[i].type).toBe(original.nodes[i].type);
          expect(copy.nodes[i].subType).toBe(original.nodes[i].subType);
          expect(copy.nodes[i].label).toBe(original.nodes[i].label);
        }
      } finally {
        await cleanupTestEvent(event.id);
      }
    }
  );

  test.prop([automationNameArb, validWorkflowArb], { numRuns: 2 })(
    'changes to copy do not affect original',
    async (name, workflow) => {
      const event = await createTestEvent();
      try {
        // Create original automation
        const original = await AutomationService.create(event.id, {
          name,
          nodes: workflow.nodes,
          edges: workflow.edges,
        });

        // Duplicate the automation
        const copy = await AutomationService.duplicate(original.id);

        // Modify the copy
        const modifiedName = 'Modified Copy Name';
        await AutomationService.update(copy.id, { name: modifiedName });

        // Verify original is unchanged
        const refetchedOriginal = await AutomationService.getById(original.id);
        expect(refetchedOriginal).not.toBeNull();
        expect(refetchedOriginal!.name).toBe(name);

        // Verify copy was modified
        const refetchedCopy = await AutomationService.getById(copy.id);
        expect(refetchedCopy).not.toBeNull();
        expect(refetchedCopy!.name).toBe(modifiedName);
      } finally {
        await cleanupTestEvent(event.id);
      }
    }
  );
});
