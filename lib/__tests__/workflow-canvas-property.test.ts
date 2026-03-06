import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';

/**
 * Utility functions for testing node deletion cascade behavior.
 * These mirror the logic in the WorkflowCanvas component.
 */

interface Node {
  id: string;
  type: 'trigger' | 'condition' | 'action';
  position: { x: number; y: number };
  data: {
    label: string;
    subType: string;
    config: Record<string, unknown>;
  };
}

interface Edge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

/**
 * Deletes a node and all connected edges.
 * This is the pure function version of the deleteNode logic in WorkflowCanvas.
 */
function deleteNodeWithCascade(
  nodes: Node[],
  edges: Edge[],
  nodeIdToDelete: string
): { nodes: Node[]; edges: Edge[] } {
  const newNodes = nodes.filter((n) => n.id !== nodeIdToDelete);
  const newEdges = edges.filter(
    (e) => e.source !== nodeIdToDelete && e.target !== nodeIdToDelete
  );
  return { nodes: newNodes, edges: newEdges };
}

// Arbitraries for generating test data
const nodeIdArb = fc.string({ minLength: 8, maxLength: 16 }).filter(s => /^[a-zA-Z0-9]+$/.test(s));
const nodeTypeArb = fc.constantFrom('trigger', 'condition', 'action') as fc.Arbitrary<'trigger' | 'condition' | 'action'>;
const subTypeArb = fc.constantFrom(
  'guest_rsvp_received',
  'check_rsvp_status',
  'send_email'
);

const nodeArb = fc.record({
  id: nodeIdArb,
  type: nodeTypeArb,
  position: fc.record({ x: fc.integer({ min: 0, max: 1000 }), y: fc.integer({ min: 0, max: 1000 }) }),
  data: fc.record({
    label: fc.string({ minLength: 1, maxLength: 30 }),
    subType: subTypeArb,
    config: fc.constant({} as Record<string, unknown>),
  }),
});

// Generate a list of nodes with unique IDs
const uniqueNodesArb = fc.array(nodeArb, { minLength: 1, maxLength: 10 })
  .map(nodes => {
    // Ensure unique IDs
    const seen = new Set<string>();
    return nodes.filter(n => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  })
  .filter(nodes => nodes.length >= 1);


// Generate edges that reference existing nodes
const edgesForNodesArb = (nodes: Node[]) => {
  if (nodes.length < 2) {
    return fc.constant([] as Edge[]);
  }
  
  const nodeIds = nodes.map(n => n.id);
  
  return fc.array(
    fc.record({
      id: nodeIdArb,
      source: fc.constantFrom(...nodeIds),
      target: fc.constantFrom(...nodeIds),
      sourceHandle: fc.option(fc.constantFrom('true', 'false'), { nil: undefined }),
    }).filter(e => e.source !== e.target), // No self-loops
    { minLength: 0, maxLength: Math.min(nodes.length * 2, 15) }
  ).map(edges => {
    // Ensure unique edge IDs
    const seen = new Set<string>();
    return edges.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  });
};

// Combined arbitrary for nodes and their edges
const workflowArb = uniqueNodesArb.chain(nodes => 
  edgesForNodesArb(nodes).map(edges => ({ nodes, edges }))
);

/**
 * Feature: event-automation-builder, Property 1: Node Deletion Cascades Edges
 * 
 * For any workflow with nodes and edges, deleting a node should remove that node
 * and all edges where the node is either the source or target, leaving no
 * orphaned edge references.
 * 
 * Validates: Requirements 1.5
 */
describe('Property 1: Node Deletion Cascades Edges', () => {
  test.prop([workflowArb], { numRuns: 100 })(
    'deleting a node removes all edges connected to it',
    ({ nodes, edges }) => {
      // Skip if no nodes to delete
      if (nodes.length === 0) return;

      // Pick a random node to delete
      const nodeToDelete = nodes[Math.floor(Math.random() * nodes.length)];
      
      // Count edges connected to this node before deletion
      const connectedEdgesBefore = edges.filter(
        e => e.source === nodeToDelete.id || e.target === nodeToDelete.id
      );

      // Perform deletion
      const result = deleteNodeWithCascade(nodes, edges, nodeToDelete.id);

      // Verify node is removed
      expect(result.nodes.find(n => n.id === nodeToDelete.id)).toBeUndefined();

      // Verify no edges reference the deleted node
      const orphanedEdges = result.edges.filter(
        e => e.source === nodeToDelete.id || e.target === nodeToDelete.id
      );
      expect(orphanedEdges).toHaveLength(0);

      // Verify other nodes are preserved
      const otherNodes = nodes.filter(n => n.id !== nodeToDelete.id);
      expect(result.nodes.length).toBe(otherNodes.length);
      for (const node of otherNodes) {
        expect(result.nodes.find(n => n.id === node.id)).toBeDefined();
      }

      // Verify unrelated edges are preserved
      const unrelatedEdges = edges.filter(
        e => e.source !== nodeToDelete.id && e.target !== nodeToDelete.id
      );
      expect(result.edges.length).toBe(unrelatedEdges.length);
    }
  );

  test.prop([workflowArb], { numRuns: 100 })(
    'after deletion, all remaining edges reference existing nodes',
    ({ nodes, edges }) => {
      if (nodes.length === 0) return;

      // Pick a random node to delete
      const nodeToDelete = nodes[Math.floor(Math.random() * nodes.length)];
      
      // Perform deletion
      const result = deleteNodeWithCascade(nodes, edges, nodeToDelete.id);

      // Get remaining node IDs
      const remainingNodeIds = new Set(result.nodes.map(n => n.id));

      // Verify all edges reference existing nodes
      for (const edge of result.edges) {
        expect(remainingNodeIds.has(edge.source)).toBe(true);
        expect(remainingNodeIds.has(edge.target)).toBe(true);
      }
    }
  );

  test.prop([workflowArb], { numRuns: 100 })(
    'deleting a node with no edges preserves all other edges',
    ({ nodes, edges }) => {
      if (nodes.length === 0) return;

      // Find a node with no connected edges (if any)
      const isolatedNode = nodes.find(n => 
        !edges.some(e => e.source === n.id || e.target === n.id)
      );

      if (!isolatedNode) return; // Skip if all nodes have edges

      // Perform deletion
      const result = deleteNodeWithCascade(nodes, edges, isolatedNode.id);

      // All edges should be preserved
      expect(result.edges.length).toBe(edges.length);
      
      // Node should be removed
      expect(result.nodes.length).toBe(nodes.length - 1);
    }
  );

  test.prop([uniqueNodesArb], { numRuns: 100 })(
    'deleting from workflow with no edges leaves no edges',
    (nodes) => {
      if (nodes.length === 0) return;

      const nodeToDelete = nodes[0];
      const result = deleteNodeWithCascade(nodes, [], nodeToDelete.id);

      expect(result.edges).toHaveLength(0);
      expect(result.nodes.length).toBe(nodes.length - 1);
    }
  );
});
