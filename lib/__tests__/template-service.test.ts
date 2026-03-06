import { describe, expect, beforeEach, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { db } from '@/db';
import { events, automations, automationNodes, automationEdges } from '@/db/schema';
import { TemplateService } from '../services/template-service';
import { AutomationService } from '../services/automation-service';
import { automationTemplates, type AutomationTemplate } from '../automation-templates';
import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';

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

/**
 * Feature: event-automation-builder, Property 12: Template Import Creates Independent Automation
 * 
 * For any template import operation, the resulting automation should have:
 * - A new unique ID
 * - All nodes and edges from the template with new IDs
 * - The specified eventId
 * - Status "Draft"
 * The template itself should remain unchanged.
 * 
 * Validates: Requirements 5.3
 */
describe('Property 12: Template Import Creates Independent Automation', () => {
  // Arbitrary for selecting a template from the available templates
  const templateIdArb = fc.constantFrom(...automationTemplates.map(t => t.id));

  test.prop([templateIdArb], { numRuns: 3 })(
    'importing template creates automation with new unique ID',
    async (templateId) => {
      const event = await createTestEvent();
      try {
        const template = TemplateService.getById(templateId);
        expect(template).not.toBeNull();

        const automation = await TemplateService.importToEvent(templateId, event.id);

        // Verify new unique ID (not matching template ID)
        expect(automation.id).not.toBe(templateId);
        expect(automation.id.length).toBeGreaterThan(0);
      } finally {
        await cleanupTestEvent(event.id);
      }
    }
  );

  test.prop([templateIdArb], { numRuns: 3 })(
    'imported automation has all nodes from template with new IDs',
    async (templateId) => {
      const event = await createTestEvent();
      try {
        const template = TemplateService.getById(templateId)!;
        const automation = await TemplateService.importToEvent(templateId, event.id);

        // Verify same number of nodes
        expect(automation.nodes.length).toBe(template.nodes.length);

        // Verify node content matches template
        for (let i = 0; i < template.nodes.length; i++) {
          const templateNode = template.nodes[i];
          const automationNode = automation.nodes[i];

          expect(automationNode.type).toBe(templateNode.type);
          expect(automationNode.subType).toBe(templateNode.subType);
          expect(automationNode.label).toBe(templateNode.label);
          expect(Number(automationNode.positionX)).toBe(templateNode.position.x);
          expect(Number(automationNode.positionY)).toBe(templateNode.position.y);
        }

        // Verify all node IDs are unique (not template indices)
        const nodeIds = automation.nodes.map(n => n.id);
        const uniqueIds = new Set(nodeIds);
        expect(uniqueIds.size).toBe(nodeIds.length);
        
        // Node IDs should not be simple indices like '0', '1', '2'
        for (const nodeId of nodeIds) {
          expect(nodeId.length).toBeGreaterThan(1);
        }
      } finally {
        await cleanupTestEvent(event.id);
      }
    }
  );


  test.prop([templateIdArb], { numRuns: 3 })(
    'imported automation has all edges from template with mapped node IDs',
    async (templateId) => {
      const event = await createTestEvent();
      try {
        const template = TemplateService.getById(templateId)!;
        const automation = await TemplateService.importToEvent(templateId, event.id);

        // Verify same number of edges
        expect(automation.edges.length).toBe(template.edges.length);

        // Verify edge source handles match
        for (let i = 0; i < template.edges.length; i++) {
          const templateEdge = template.edges[i];
          const automationEdge = automation.edges[i];

          expect(automationEdge.sourceHandle).toBe(templateEdge.sourceHandle ?? null);
        }

        // Verify all edge node references point to valid automation nodes
        const nodeIds = new Set(automation.nodes.map(n => n.id));
        for (const edge of automation.edges) {
          expect(nodeIds.has(edge.sourceNodeId)).toBe(true);
          expect(nodeIds.has(edge.targetNodeId)).toBe(true);
        }
      } finally {
        await cleanupTestEvent(event.id);
      }
    }
  );

  test.prop([templateIdArb], { numRuns: 3 })(
    'imported automation has correct eventId and Draft status',
    async (templateId) => {
      const event = await createTestEvent();
      try {
        const automation = await TemplateService.importToEvent(templateId, event.id);

        expect(automation.eventId).toBe(event.id);
        expect(automation.status).toBe('Draft');
      } finally {
        await cleanupTestEvent(event.id);
      }
    }
  );

  test.prop([templateIdArb], { numRuns: 3 })(
    'template remains unchanged after import',
    async (templateId) => {
      const event = await createTestEvent();
      try {
        // Get template before import
        const templateBefore = TemplateService.getById(templateId)!;
        const nodesBefore = JSON.stringify(templateBefore.nodes);
        const edgesBefore = JSON.stringify(templateBefore.edges);

        // Import template
        await TemplateService.importToEvent(templateId, event.id);

        // Get template after import
        const templateAfter = TemplateService.getById(templateId)!;
        const nodesAfter = JSON.stringify(templateAfter.nodes);
        const edgesAfter = JSON.stringify(templateAfter.edges);

        // Verify template is unchanged
        expect(templateAfter.id).toBe(templateBefore.id);
        expect(templateAfter.name).toBe(templateBefore.name);
        expect(templateAfter.description).toBe(templateBefore.description);
        expect(templateAfter.category).toBe(templateBefore.category);
        expect(nodesAfter).toBe(nodesBefore);
        expect(edgesAfter).toBe(edgesBefore);
      } finally {
        await cleanupTestEvent(event.id);
      }
    }
  );

  test.prop([templateIdArb], { numRuns: 2 })(
    'multiple imports create independent automations',
    async (templateId) => {
      const event = await createTestEvent();
      try {
        const automation1 = await TemplateService.importToEvent(templateId, event.id);
        const automation2 = await TemplateService.importToEvent(templateId, event.id);

        // Verify different IDs
        expect(automation1.id).not.toBe(automation2.id);

        // Verify different node IDs
        const nodeIds1 = new Set(automation1.nodes.map(n => n.id));
        const nodeIds2 = new Set(automation2.nodes.map(n => n.id));
        for (const nodeId of nodeIds2) {
          expect(nodeIds1.has(nodeId)).toBe(false);
        }

        // Modify one automation and verify the other is unchanged
        await AutomationService.update(automation1.id, { name: 'Modified Name' });
        const refetched2 = await AutomationService.getById(automation2.id);
        expect(refetched2).not.toBeNull();
        expect(refetched2!.name).toBe(TemplateService.getById(templateId)!.name);
      } finally {
        await cleanupTestEvent(event.id);
      }
    }
  );
});


/**
 * Feature: event-automation-builder, Property 13: Templates Have Required Fields
 * 
 * For any automation template, it must have non-empty:
 * - id
 * - name
 * - description
 * - category
 * - at least one node
 * 
 * Validates: Requirements 5.4
 */
describe('Property 13: Templates Have Required Fields', () => {
  // Arbitrary for selecting a template from the available templates
  const templateArb = fc.constantFrom(...automationTemplates);

  test.prop([templateArb], { numRuns: 6 })(
    'every template has non-empty id',
    (template) => {
      expect(template.id).toBeDefined();
      expect(typeof template.id).toBe('string');
      expect(template.id.length).toBeGreaterThan(0);
    }
  );

  test.prop([templateArb], { numRuns: 6 })(
    'every template has non-empty name',
    (template) => {
      expect(template.name).toBeDefined();
      expect(typeof template.name).toBe('string');
      expect(template.name.length).toBeGreaterThan(0);
    }
  );

  test.prop([templateArb], { numRuns: 6 })(
    'every template has non-empty description',
    (template) => {
      expect(template.description).toBeDefined();
      expect(typeof template.description).toBe('string');
      expect(template.description.length).toBeGreaterThan(0);
    }
  );

  test.prop([templateArb], { numRuns: 6 })(
    'every template has valid category',
    (template) => {
      expect(template.category).toBeDefined();
      expect(['engagement', 'reminder', 'follow-up', 'vip']).toContain(template.category);
    }
  );

  test.prop([templateArb], { numRuns: 6 })(
    'every template has at least one node',
    (template) => {
      expect(template.nodes).toBeDefined();
      expect(Array.isArray(template.nodes)).toBe(true);
      expect(template.nodes.length).toBeGreaterThan(0);
    }
  );

  test.prop([templateArb], { numRuns: 6 })(
    'every template has exactly one trigger node',
    (template) => {
      const triggerNodes = template.nodes.filter(n => n.type === 'trigger');
      expect(triggerNodes.length).toBe(1);
    }
  );

  test.prop([templateArb], { numRuns: 6 })(
    'every template node has required fields',
    (template) => {
      for (const node of template.nodes) {
        expect(node.type).toBeDefined();
        expect(['trigger', 'condition', 'action']).toContain(node.type);
        expect(node.subType).toBeDefined();
        expect(typeof node.subType).toBe('string');
        expect(node.subType.length).toBeGreaterThan(0);
        expect(node.label).toBeDefined();
        expect(typeof node.label).toBe('string');
        expect(node.label.length).toBeGreaterThan(0);
        expect(node.position).toBeDefined();
        expect(typeof node.position.x).toBe('number');
        expect(typeof node.position.y).toBe('number');
        expect(node.config).toBeDefined();
      }
    }
  );
});

/**
 * Additional unit tests for TemplateService methods
 */
describe('TemplateService', () => {
  describe('getAll', () => {
    test('returns all templates', () => {
      const templates = TemplateService.getAll();
      expect(templates.length).toBe(6);
      expect(templates).toEqual(automationTemplates);
    });
  });

  describe('getById', () => {
    test('returns template when found', () => {
      const template = TemplateService.getById('welcome-series');
      expect(template).not.toBeNull();
      expect(template!.name).toBe('Welcome Series');
    });

    test('returns null when not found', () => {
      const template = TemplateService.getById('non-existent');
      expect(template).toBeNull();
    });
  });

  describe('getByCategory', () => {
    test('returns templates for engagement category', () => {
      const templates = TemplateService.getByCategory('engagement');
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every(t => t.category === 'engagement')).toBe(true);
    });

    test('returns templates for follow-up category', () => {
      const templates = TemplateService.getByCategory('follow-up');
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every(t => t.category === 'follow-up')).toBe(true);
    });

    test('returns empty array for non-existent category', () => {
      const templates = TemplateService.getByCategory('non-existent' as any);
      expect(templates).toEqual([]);
    });
  });

  describe('importToEvent', () => {
    test('throws error for non-existent template', async () => {
      const event = await createTestEvent();
      try {
        await expect(
          TemplateService.importToEvent('non-existent', event.id)
        ).rejects.toThrow('Template not found: non-existent');
      } finally {
        await cleanupTestEvent(event.id);
      }
    });
  });
});
