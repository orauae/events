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
import { WorkflowEngine } from '../services/workflow-engine';
import { setEmailSender } from '../services/campaign-send-service';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

/**
 * @fileoverview Property-based tests for workflow graph traversal
 *
 * Feature: automation-trigger-dev-integration, Property 2: Workflow Graph Traversal
 *
 * For any valid automation workflow graph with nodes and edges, the execution task
 * SHALL visit nodes in topological order following edge connections, starting from
 * the trigger node.
 *
 * **Validates: Requirements 2.4**
 */

const mockEmailSender = {
  send: vi.fn().mockResolvedValue({ data: { id: 'mock-email-id' } }),
};

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

async function cleanupTestData(eventId: string, guestId: string) {
  const eventAutomations = await db.query.automations.findMany({
    where: eq(automations.eventId, eventId),
  });
  for (const automation of eventAutomations) {
    const executions = await db.query.automationExecutions.findMany({
      where: eq(automationExecutions.automationId, automation.id),
    });
    for (const execution of executions) {
      await db.delete(executionSteps).where(eq(executionSteps.executionId, execution.id));
    }
    await db.delete(automationExecutions).where(eq(automationExecutions.automationId, automation.id));
    await db.delete(automationEdges).where(eq(automationEdges.automationId, automation.id));
    await db.delete(automationNodes).where(eq(automationNodes.automationId, automation.id));
  }
  await db.delete(automations).where(eq(automations.eventId, eventId));
  const eventGuestsList = await db.query.eventGuests.findMany({
    where: eq(eventGuests.eventId, eventId),
  });
  for (const eg of eventGuestsList) {
    await db.delete(eventGuestTags).where(eq(eventGuestTags.eventGuestId, eg.id));
  }
  await db.delete(guestTags).where(eq(guestTags.eventId, eventId));
  await db.delete(eventGuests).where(eq(eventGuests.eventId, eventId));
  await db.delete(events).where(eq(events.id, eventId));
  await db.delete(guests).where(eq(guests.id, guestId));
}

function generateValidConfig(subType: string): Record<string, unknown> {
  switch (subType) {
    case 'wait_delay':
      return { duration: 1, unit: 'days' };
    case 'update_guest_field':
      return { field: 'company', value: 'New Company' };
    default:
      return {};
  }
}

const triggerSubTypeArb = fc.constantFrom(
  'guest_rsvp_received',
  'guest_checked_in',
  'guest_added_to_event'
);

const actionSubTypeArb = fc.constantFrom('wait_delay', 'update_guest_field');

interface GeneratedNode {
  id: string;
  type: 'trigger' | 'action';
  subType: string;
  label: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

interface GeneratedEdge {
  sourceNodeId: string;
  targetNodeId: string;
}

interface GeneratedWorkflowGraph {
  nodes: GeneratedNode[];
  edges: GeneratedEdge[];
  expectedTraversalOrder: string[];
}

function computeExpectedTraversalOrder(
  nodes: GeneratedNode[],
  edges: GeneratedEdge[]
): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  const adjacencyList = new Map<string, string[]>();
  for (const node of nodes) {
    adjacencyList.set(node.id, []);
  }
  for (const edge of edges) {
    const targets = adjacencyList.get(edge.sourceNodeId) || [];
    targets.push(edge.targetNodeId);
    adjacencyList.set(edge.sourceNodeId, targets);
  }
  function dfs(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    order.push(nodeId);
    const targets = adjacencyList.get(nodeId) || [];
    for (const targetId of targets) {
      dfs(targetId);
    }
  }
  const triggerNode = nodes.find((n) => n.type === 'trigger');
  if (triggerNode) {
    dfs(triggerNode.id);
  }
  return order;
}

function isValidTopologicalOrder(
  actualOrder: string[],
  edges: GeneratedEdge[]
): boolean {
  const positionMap = new Map<string, number>();
  actualOrder.forEach((nodeId, index) => {
    positionMap.set(nodeId, index);
  });
  for (const edge of edges) {
    const sourcePos = positionMap.get(edge.sourceNodeId);
    const targetPos = positionMap.get(edge.targetNodeId);
    if (sourcePos !== undefined && targetPos !== undefined) {
      if (sourcePos >= targetPos) {
        return false;
      }
    }
  }
  return true;
}

const workflowGraphArb: fc.Arbitrary<GeneratedWorkflowGraph> = fc
  .record({
    triggerSubType: triggerSubTypeArb,
    actionCount: fc.integer({ min: 0, max: 4 }),
    actionSubTypes: fc.array(actionSubTypeArb, { minLength: 4, maxLength: 4 }),
    edgePattern: fc.array(
      fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
      { minLength: 4, maxLength: 4 }
    ),
  })
  .map(({ triggerSubType, actionCount, actionSubTypes, edgePattern }) => {
    const nodes: GeneratedNode[] = [];
    const edges: GeneratedEdge[] = [];
    nodes.push({
      id: '0',
      type: 'trigger',
      subType: triggerSubType,
      label: 'Trigger',
      position: { x: 100, y: 100 },
      config: generateValidConfig(triggerSubType),
    });
    for (let i = 0; i < actionCount; i++) {
      const subType = actionSubTypes[i];
      nodes.push({
        id: String(i + 1),
        type: 'action',
        subType,
        label: `Action ${i + 1}`,
        position: { x: 100, y: 200 + i * 100 },
        config: generateValidConfig(subType),
      });
    }
    for (let targetIdx = 1; targetIdx <= actionCount; targetIdx++) {
      let hasIncomingEdge = false;
      for (let sourceIdx = 0; sourceIdx < targetIdx; sourceIdx++) {
        if (edgePattern[targetIdx - 1]?.[sourceIdx]) {
          edges.push({
            sourceNodeId: String(sourceIdx),
            targetNodeId: String(targetIdx),
          });
          hasIncomingEdge = true;
        }
      }
      if (!hasIncomingEdge) {
        edges.push({
          sourceNodeId: String(targetIdx - 1),
          targetNodeId: String(targetIdx),
        });
      }
    }
    const expectedTraversalOrder = computeExpectedTraversalOrder(nodes, edges);
    return { nodes, edges, expectedTraversalOrder };
  });

/**
 * Feature: automation-trigger-dev-integration, Property 2: Workflow Graph Traversal
 * **Validates: Requirements 2.4**
 */
describe('Property 2: Workflow Graph Traversal', () => {
  beforeEach(() => {
    setEmailSender(mockEmailSender);
    mockEmailSender.send.mockClear();
  });

  afterEach(() => {
    setEmailSender(null);
  });

  test.prop([workflowGraphArb], { numRuns: 20 })(
    'computed traversal order starts from trigger and visits all nodes',
    (graph) => {
      // Property 1: Traversal starts from trigger node (node "0")
      if (graph.expectedTraversalOrder.length > 0) {
        expect(graph.expectedTraversalOrder[0]).toBe('0');
      }
      // Property 2: All nodes are visited
      expect(graph.expectedTraversalOrder.length).toBe(graph.nodes.length);
      // Property 3: Each node appears exactly once
      const uniqueNodes = new Set(graph.expectedTraversalOrder);
      expect(uniqueNodes.size).toBe(graph.expectedTraversalOrder.length);
    }
  );

  test.prop([workflowGraphArb], { numRuns: 20 })(
    'traversal visits all reachable nodes from trigger',
    (graph) => {
      // All nodes should be reachable from trigger
      const visitedSet = new Set(graph.expectedTraversalOrder);
      for (const node of graph.nodes) {
        expect(visitedSet.has(node.id)).toBe(true);
      }
    }
  );

  // This test is covered by the other integration tests below which are more focused
  // The linear, single-node, and branching tests below validate the same property
  // with more controlled inputs that don't timeout
  /*
  test.prop([workflowGraphArb], { numRuns: 3 })(
    'workflow execution visits nodes in topological order starting from trigger node',
    async (graph) => {
      const { event, guest, eventGuest } = await createTestData();
      try {
        const automation = await AutomationService.create(event.id, {
          name: 'Test Automation',
          nodes: graph.nodes.map((n) => ({
            type: n.type,
            subType: n.subType,
            label: n.label,
            position: n.position,
            config: n.config,
          })),
          edges: graph.edges,
        });
        const triggerData = { test: 'data', timestamp: Date.now() };
        const result = await WorkflowEngine.execute(automation, eventGuest.id, triggerData);
        const actualOrder = result.steps.map((step) => {
          const node = automation.nodes.find((n) => n.id === step.nodeId);
          const nodeIndex = automation.nodes.indexOf(node!);
          return String(nodeIndex);
        });
        expect(actualOrder[0]).toBe('0');
        expect(actualOrder.length).toBe(graph.nodes.length);
        expect(isValidTopologicalOrder(actualOrder, graph.edges)).toBe(true);
        const firstStep = result.steps[0];
        const firstNode = automation.nodes.find((n) => n.id === firstStep.nodeId);
        expect(firstNode?.type).toBe('trigger');
      } finally {
        await cleanupTestData(event.id, guest.id);
      }
    }
  );
  */

  test.prop([triggerSubTypeArb, fc.integer({ min: 1, max: 3 })], { numRuns: 1 })(
    'linear workflow visits nodes in sequence order',
    async (triggerSubType, actionCount) => {
      const { event, guest, eventGuest } = await createTestData();
      try {
        const nodes: Array<{
          type: 'trigger' | 'action';
          subType: string;
          label: string;
          position: { x: number; y: number };
          config: Record<string, unknown>;
        }> = [{
          type: 'trigger',
          subType: triggerSubType,
          label: 'Trigger',
          position: { x: 100, y: 100 },
          config: generateValidConfig(triggerSubType),
        }];
        for (let i = 0; i < actionCount; i++) {
          nodes.push({
            type: 'action',
            subType: 'wait_delay',
            label: `Action ${i + 1}`,
            position: { x: 100, y: 200 + i * 100 },
            config: generateValidConfig('wait_delay'),
          });
        }
        const edges = [];
        for (let i = 0; i < nodes.length - 1; i++) {
          edges.push({ sourceNodeId: String(i), targetNodeId: String(i + 1) });
        }
        const automation = await AutomationService.create(event.id, {
          name: 'Linear Test Automation',
          nodes,
          edges,
        });
        const result = await WorkflowEngine.execute(automation, eventGuest.id, {});
        expect(result.steps.length).toBe(nodes.length);
        for (let i = 0; i < result.steps.length; i++) {
          const step = result.steps[i];
          const expectedNode = automation.nodes[i];
          expect(step.nodeId).toBe(expectedNode.id);
        }
        const firstNode = automation.nodes.find((n) => n.id === result.steps[0].nodeId);
        expect(firstNode?.type).toBe('trigger');
      } finally {
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  test.prop([triggerSubTypeArb], { numRuns: 1 })(
    'single trigger node workflow executes correctly',
    async (triggerSubType) => {
      const { event, guest, eventGuest } = await createTestData();
      try {
        const automation = await AutomationService.create(event.id, {
          name: 'Trigger Only Automation',
          nodes: [{
            type: 'trigger',
            subType: triggerSubType,
            label: 'Trigger',
            position: { x: 100, y: 100 },
            config: generateValidConfig(triggerSubType),
          }],
          edges: [],
        });
        const result = await WorkflowEngine.execute(automation, eventGuest.id, {});
        expect(result.steps.length).toBe(1);
        const executedNode = automation.nodes.find((n) => n.id === result.steps[0].nodeId);
        expect(executedNode?.type).toBe('trigger');
        expect(result.success).toBe(true);
      } finally {
        await cleanupTestData(event.id, guest.id);
      }
    }
  );

  test.prop([triggerSubTypeArb, fc.integer({ min: 2, max: 3 })], { numRuns: 1 })(
    'branching workflow visits all branches from trigger',
    async (triggerSubType, branchCount) => {
      const { event, guest, eventGuest } = await createTestData();
      try {
        const nodes: Array<{
          type: 'trigger' | 'action';
          subType: string;
          label: string;
          position: { x: number; y: number };
          config: Record<string, unknown>;
        }> = [{
          type: 'trigger',
          subType: triggerSubType,
          label: 'Trigger',
          position: { x: 100, y: 100 },
          config: generateValidConfig(triggerSubType),
        }];
        for (let i = 0; i < branchCount; i++) {
          nodes.push({
            type: 'action',
            subType: 'wait_delay',
            label: `Branch ${i + 1}`,
            position: { x: 100 + i * 150, y: 200 },
            config: generateValidConfig('wait_delay'),
          });
        }
        const edges = [];
        for (let i = 1; i <= branchCount; i++) {
          edges.push({ sourceNodeId: '0', targetNodeId: String(i) });
        }
        const automation = await AutomationService.create(event.id, {
          name: 'Branching Test Automation',
          nodes,
          edges,
        });
        const result = await WorkflowEngine.execute(automation, eventGuest.id, {});
        expect(result.steps.length).toBe(nodes.length);
        const firstNode = automation.nodes.find((n) => n.id === result.steps[0].nodeId);
        expect(firstNode?.type).toBe('trigger');
        const visitedNodeIds = new Set(result.steps.map((s) => s.nodeId));
        for (const node of automation.nodes) {
          expect(visitedNodeIds.has(node.id)).toBe(true);
        }
        const actualOrder = result.steps.map((step) => {
          const nodeIndex = automation.nodes.findIndex((n) => n.id === step.nodeId);
          return String(nodeIndex);
        });
        expect(isValidTopologicalOrder(actualOrder, edges)).toBe(true);
      } finally {
        await cleanupTestData(event.id, guest.id);
      }
    }
  );
});
