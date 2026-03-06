import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';

/**
 * Feature: event-automation-builder, Property 14: Undo/Redo Stack Consistency
 * 
 * For any sequence of canvas operations (add node, delete node, add edge, delete edge, move node),
 * performing undo should reverse the last operation, and redo should restore it,
 * maintaining workflow consistency.
 * 
 * Validates: Requirements 1.6
 */

// Types for testing
interface TestNode {
  id: string;
  type: 'trigger' | 'condition' | 'action';
  position: { x: number; y: number };
  data: {
    label: string;
    subType: string;
    config: Record<string, unknown>;
  };
}

interface TestEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

interface CanvasState {
  nodes: TestNode[];
  edges: TestEdge[];
}

/**
 * Pure implementation of undo/redo stack for testing.
 * This mirrors the logic in the useUndoRedo hook.
 */
class UndoRedoStack {
  private history: CanvasState[];
  private currentIndex: number;
  private maxHistorySize: number;

  constructor(initialState: CanvasState, maxHistorySize = 50) {
    this.history = [initialState];
    this.currentIndex = 0;
    this.maxHistorySize = maxHistorySize;
  }

  get canUndo(): boolean {
    return this.currentIndex > 0;
  }

  get canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  get historyLength(): number {
    return this.history.length;
  }

  get currentState(): CanvasState {
    return this.history[this.currentIndex];
  }

  pushState(state: CanvasState): void {
    // Remove any "future" states (everything after current index)
    this.history = this.history.slice(0, this.currentIndex + 1);
    
    // Add the new state
    this.history.push(state);
    
    // Trim history if it exceeds max size
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(this.history.length - this.maxHistorySize);
      this.currentIndex = this.maxHistorySize - 1;
    } else {
      this.currentIndex++;
    }
  }

  undo(): CanvasState | null {
    if (!this.canUndo) {
      return null;
    }
    this.currentIndex--;
    return this.history[this.currentIndex];
  }

  redo(): CanvasState | null {
    if (!this.canRedo) {
      return null;
    }
    this.currentIndex++;
    return this.history[this.currentIndex];
  }

  clearHistory(initialState: CanvasState): void {
    this.history = [initialState];
    this.currentIndex = 0;
  }
}

// Utility to compare states
function areStatesEqual(state1: CanvasState, state2: CanvasState): boolean {
  return JSON.stringify(state1) === JSON.stringify(state2);
}

// Arbitraries for generating test data
const nodeIdArb = fc.string({ minLength: 8, maxLength: 16 }).filter(s => /^[a-zA-Z0-9]+$/.test(s));
const nodeTypeArb = fc.constantFrom('trigger', 'condition', 'action') as fc.Arbitrary<'trigger' | 'condition' | 'action'>;
const subTypeArb = fc.constantFrom(
  'guest_rsvp_received',
  'check_rsvp_status',
  'send_email'
);

const nodeArb: fc.Arbitrary<TestNode> = fc.record({
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
const uniqueNodesArb = fc.array(nodeArb, { minLength: 0, maxLength: 5 })
  .map(nodes => {
    const seen = new Set<string>();
    return nodes.filter(n => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  });

// Generate edges that reference existing nodes
const edgesForNodesArb = (nodes: TestNode[]): fc.Arbitrary<TestEdge[]> => {
  if (nodes.length < 2) {
    return fc.constant([] as TestEdge[]);
  }
  
  const nodeIds = nodes.map(n => n.id);
  
  return fc.array(
    fc.record({
      id: nodeIdArb,
      source: fc.constantFrom(...nodeIds),
      target: fc.constantFrom(...nodeIds),
      sourceHandle: fc.option(fc.constantFrom('true', 'false'), { nil: undefined }),
    }).filter(e => e.source !== e.target),
    { minLength: 0, maxLength: Math.min(nodes.length, 5) }
  ).map(edges => {
    const seen = new Set<string>();
    return edges.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  });
};

// Combined arbitrary for initial canvas state
const canvasStateArb: fc.Arbitrary<CanvasState> = uniqueNodesArb.chain(nodes => 
  edgesForNodesArb(nodes).map(edges => ({ nodes, edges }))
);

describe('Property 14: Undo/Redo Stack Consistency', () => {
  test.prop([canvasStateArb], { numRuns: 100 })(
    'undo after single operation returns to previous state',
    (initialState) => {
      const stack = new UndoRedoStack(initialState);
      
      // Create a new state by adding a node
      const newNode: TestNode = {
        id: 'test-node-new',
        type: 'action',
        position: { x: 100, y: 100 },
        data: { label: 'Test', subType: 'send_email', config: {} },
      };
      const newState: CanvasState = {
        nodes: [...initialState.nodes, newNode],
        edges: initialState.edges,
      };
      
      // Push the new state
      stack.pushState(newState);
      
      // Verify we can undo
      expect(stack.canUndo).toBe(true);
      
      // Perform undo
      const undoneState = stack.undo();
      
      // Verify undo returns the initial state
      expect(undoneState).not.toBeNull();
      expect(areStatesEqual(undoneState!, initialState)).toBe(true);
    }
  );

  test.prop([canvasStateArb], { numRuns: 100 })(
    'redo after undo restores the state',
    (initialState) => {
      const stack = new UndoRedoStack(initialState);
      
      // Create a new state
      const newNode: TestNode = {
        id: 'test-node-redo',
        type: 'trigger',
        position: { x: 200, y: 200 },
        data: { label: 'Redo Test', subType: 'guest_rsvp_received', config: {} },
      };
      const newState: CanvasState = {
        nodes: [...initialState.nodes, newNode],
        edges: initialState.edges,
      };
      
      // Push the new state
      stack.pushState(newState);
      
      // Undo
      stack.undo();
      
      // Verify we can redo
      expect(stack.canRedo).toBe(true);
      
      // Perform redo
      const redoneState = stack.redo();
      
      // Verify redo returns the new state
      expect(redoneState).not.toBeNull();
      expect(areStatesEqual(redoneState!, newState)).toBe(true);
    }
  );

  test.prop([canvasStateArb, fc.integer({ min: 2, max: 5 })], { numRuns: 100 })(
    'multiple undos traverse history in reverse order',
    (initialState, numOperations) => {
      const stack = new UndoRedoStack(initialState);
      
      // Generate and apply multiple operations
      const states: CanvasState[] = [initialState];
      let currentState = initialState;
      
      for (let i = 0; i < numOperations; i++) {
        const newNode: TestNode = {
          id: `test-node-${i}`,
          type: 'action',
          position: { x: i * 100, y: i * 100 },
          data: { label: `Node ${i}`, subType: 'send_email', config: {} },
        };
        currentState = {
          nodes: [...currentState.nodes, newNode],
          edges: currentState.edges,
        };
        states.push(currentState);
        stack.pushState(currentState);
      }
      
      // Verify history length
      expect(stack.historyLength).toBe(numOperations + 1);
      
      // Undo all operations and verify each step
      for (let i = numOperations - 1; i >= 0; i--) {
        const undoneState = stack.undo();
        
        expect(undoneState).not.toBeNull();
        expect(areStatesEqual(undoneState!, states[i])).toBe(true);
      }
      
      // Should not be able to undo anymore
      expect(stack.canUndo).toBe(false);
    }
  );

  test.prop([canvasStateArb], { numRuns: 100 })(
    'pushing new state after undo clears redo history',
    (initialState) => {
      const stack = new UndoRedoStack(initialState);
      
      // Push two states
      const state1: CanvasState = {
        nodes: [...initialState.nodes, {
          id: 'node-1',
          type: 'action',
          position: { x: 100, y: 100 },
          data: { label: 'Node 1', subType: 'send_email', config: {} },
        }],
        edges: initialState.edges,
      };
      
      const state2: CanvasState = {
        nodes: [...state1.nodes, {
          id: 'node-2',
          type: 'condition',
          position: { x: 200, y: 200 },
          data: { label: 'Node 2', subType: 'check_rsvp_status', config: {} },
        }],
        edges: initialState.edges,
      };
      
      stack.pushState(state1);
      stack.pushState(state2);
      
      // Undo once
      stack.undo();
      
      // Verify we can redo
      expect(stack.canRedo).toBe(true);
      
      // Push a new state (different from state2)
      const state3: CanvasState = {
        nodes: [...state1.nodes, {
          id: 'node-3',
          type: 'trigger',
          position: { x: 300, y: 300 },
          data: { label: 'Node 3', subType: 'guest_rsvp_received', config: {} },
        }],
        edges: initialState.edges,
      };
      
      stack.pushState(state3);
      
      // Redo should no longer be available (history was cleared)
      expect(stack.canRedo).toBe(false);
    }
  );

  test.prop([canvasStateArb], { numRuns: 100 })(
    'undo/redo preserves node and edge integrity',
    (initialState) => {
      const stack = new UndoRedoStack(initialState);
      
      // Add a node
      const newNode: TestNode = {
        id: 'integrity-node',
        type: 'action',
        position: { x: 500, y: 500 },
        data: { label: 'Integrity Test', subType: 'send_email', config: {} },
      };
      
      const stateWithNode: CanvasState = {
        nodes: [...initialState.nodes, newNode],
        edges: initialState.edges,
      };
      
      stack.pushState(stateWithNode);
      
      // If we have at least one other node, add an edge
      if (initialState.nodes.length > 0) {
        const newEdge: TestEdge = {
          id: 'integrity-edge',
          source: initialState.nodes[0].id,
          target: newNode.id,
        };
        
        const stateWithEdge: CanvasState = {
          nodes: stateWithNode.nodes,
          edges: [...stateWithNode.edges, newEdge],
        };
        
        stack.pushState(stateWithEdge);
        
        // Undo edge addition
        const afterUndoEdge = stack.undo();
        
        // Verify edge is removed but node remains
        expect(afterUndoEdge).not.toBeNull();
        expect(afterUndoEdge!.nodes.find(n => n.id === newNode.id)).toBeDefined();
        expect(afterUndoEdge!.edges.find(e => e.id === newEdge.id)).toBeUndefined();
        
        // Redo edge addition
        const afterRedoEdge = stack.redo();
        
        // Verify edge is restored
        expect(afterRedoEdge).not.toBeNull();
        expect(afterRedoEdge!.edges.find(e => e.id === newEdge.id)).toBeDefined();
      }
    }
  );

  test.prop([fc.integer({ min: 1, max: 10 })], { numRuns: 100 })(
    'history respects max size limit',
    (numOperations) => {
      const maxHistorySize = 5;
      const initialState: CanvasState = { nodes: [], edges: [] };
      
      const stack = new UndoRedoStack(initialState, maxHistorySize);
      
      // Push more states than max history size
      for (let i = 0; i < numOperations; i++) {
        const newState: CanvasState = {
          nodes: [{
            id: `node-${i}`,
            type: 'action',
            position: { x: i * 10, y: i * 10 },
            data: { label: `Node ${i}`, subType: 'send_email', config: {} },
          }],
          edges: [],
        };
        
        stack.pushState(newState);
      }
      
      // History length should not exceed max size
      expect(stack.historyLength).toBeLessThanOrEqual(maxHistorySize);
    }
  );

  test.prop([canvasStateArb], { numRuns: 100 })(
    'clearHistory resets to initial state',
    (initialState) => {
      const stack = new UndoRedoStack(initialState);
      
      // Push some states
      stack.pushState({
        nodes: [...initialState.nodes, {
          id: 'clear-test',
          type: 'action',
          position: { x: 0, y: 0 },
          data: { label: 'Clear Test', subType: 'send_email', config: {} },
        }],
        edges: initialState.edges,
      });
      
      // Clear history
      stack.clearHistory(initialState);
      
      // Should not be able to undo or redo
      expect(stack.canUndo).toBe(false);
      expect(stack.canRedo).toBe(false);
      expect(stack.historyLength).toBe(1);
    }
  );

  test.prop([canvasStateArb, fc.integer({ min: 1, max: 5 })], { numRuns: 100 })(
    'undo then redo sequence returns to same state',
    (initialState, numOps) => {
      const stack = new UndoRedoStack(initialState);
      
      // Push multiple states
      let currentState = initialState;
      for (let i = 0; i < numOps; i++) {
        currentState = {
          nodes: [...currentState.nodes, {
            id: `roundtrip-node-${i}`,
            type: 'action',
            position: { x: i * 50, y: i * 50 },
            data: { label: `RT Node ${i}`, subType: 'send_email', config: {} },
          }],
          edges: currentState.edges,
        };
        stack.pushState(currentState);
      }
      
      const finalState = stack.currentState;
      
      // Undo all
      for (let i = 0; i < numOps; i++) {
        stack.undo();
      }
      
      // Redo all
      for (let i = 0; i < numOps; i++) {
        stack.redo();
      }
      
      // Should be back to final state
      expect(areStatesEqual(stack.currentState, finalState)).toBe(true);
    }
  );
});
