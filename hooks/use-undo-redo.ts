import { useState, useCallback, useRef } from 'react';

/**
 * Represents a snapshot of the canvas state at a point in time.
 */
export interface CanvasState<N, E> {
  nodes: N[];
  edges: E[];
}

/**
 * Configuration options for the undo/redo hook.
 */
export interface UseUndoRedoOptions {
  /** Maximum number of states to keep in history. Default: 50 */
  maxHistorySize?: number;
}

/**
 * Return type for the useUndoRedo hook.
 */
export interface UseUndoRedoReturn<N, E> {
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Perform undo operation, returns the previous state or null if unavailable */
  undo: () => CanvasState<N, E> | null;
  /** Perform redo operation, returns the next state or null if unavailable */
  redo: () => CanvasState<N, E> | null;
  /** Push a new state onto the history stack */
  pushState: (state: CanvasState<N, E>) => void;
  /** Clear all history */
  clearHistory: () => void;
  /** Get current history length (for debugging/testing) */
  historyLength: number;
  /** Get current position in history (for debugging/testing) */
  currentIndex: number;
}

/**
 * Custom hook for managing undo/redo functionality for canvas operations.
 * 
 * This hook maintains a history stack of canvas states and provides
 * undo/redo operations that traverse this history.
 * 
 * @param initialState - The initial canvas state
 * @param options - Configuration options
 * @returns Undo/redo controls and state
 * 
 * @example
 * ```tsx
 * const { canUndo, canRedo, undo, redo, pushState } = useUndoRedo({
 *   nodes: initialNodes,
 *   edges: initialEdges,
 * });
 * 
 * // When user makes a change
 * pushState({ nodes: newNodes, edges: newEdges });
 * 
 * // When user presses Ctrl+Z
 * const previousState = undo();
 * if (previousState) {
 *   setNodes(previousState.nodes);
 *   setEdges(previousState.edges);
 * }
 * ```
 */
export function useUndoRedo<N, E>(
  initialState: CanvasState<N, E>,
  options: UseUndoRedoOptions = {}
): UseUndoRedoReturn<N, E> {
  const { maxHistorySize = 50 } = options;

  // History stack - stores all states
  const [history, setHistory] = useState<CanvasState<N, E>[]>([initialState]);
  
  // Current position in history (index of current state)
  const [currentIndex, setCurrentIndex] = useState(0);

  // Ref to track if we're in the middle of an undo/redo operation
  // This prevents pushState from being called during undo/redo
  const isUndoRedoOperation = useRef(false);

  /**
   * Push a new state onto the history stack.
   * This clears any "future" states (states after current index).
   */
  const pushState = useCallback((state: CanvasState<N, E>) => {
    // Don't push state if we're in the middle of an undo/redo operation
    if (isUndoRedoOperation.current) {
      return;
    }

    setHistory((prevHistory) => {
      // Remove any "future" states (everything after current index)
      const newHistory = prevHistory.slice(0, currentIndex + 1);
      
      // Add the new state
      newHistory.push(state);
      
      // Trim history if it exceeds max size
      if (newHistory.length > maxHistorySize) {
        return newHistory.slice(newHistory.length - maxHistorySize);
      }
      
      return newHistory;
    });

    setCurrentIndex((prevIndex) => {
      // Calculate new index after potential trimming
      const newIndex = Math.min(prevIndex + 1, maxHistorySize - 1);
      return newIndex;
    });
  }, [currentIndex, maxHistorySize]);

  /**
   * Undo the last operation.
   * Returns the previous state, or null if undo is not available.
   */
  const undo = useCallback((): CanvasState<N, E> | null => {
    if (currentIndex <= 0) {
      return null;
    }

    isUndoRedoOperation.current = true;
    const newIndex = currentIndex - 1;
    setCurrentIndex(newIndex);
    
    // Reset the flag after a microtask to allow state updates to complete
    Promise.resolve().then(() => {
      isUndoRedoOperation.current = false;
    });

    return history[newIndex];
  }, [currentIndex, history]);

  /**
   * Redo the last undone operation.
   * Returns the next state, or null if redo is not available.
   */
  const redo = useCallback((): CanvasState<N, E> | null => {
    if (currentIndex >= history.length - 1) {
      return null;
    }

    isUndoRedoOperation.current = true;
    const newIndex = currentIndex + 1;
    setCurrentIndex(newIndex);
    
    // Reset the flag after a microtask to allow state updates to complete
    Promise.resolve().then(() => {
      isUndoRedoOperation.current = false;
    });

    return history[newIndex];
  }, [currentIndex, history]);

  /**
   * Clear all history and reset to initial state.
   */
  const clearHistory = useCallback(() => {
    setHistory([initialState]);
    setCurrentIndex(0);
  }, [initialState]);

  return {
    canUndo: currentIndex > 0,
    canRedo: currentIndex < history.length - 1,
    undo,
    redo,
    pushState,
    clearHistory,
    historyLength: history.length,
    currentIndex,
  };
}

/**
 * Deep comparison utility for canvas states.
 * Used to determine if a state change is significant enough to record.
 */
export function areStatesEqual<N, E>(
  state1: CanvasState<N, E>,
  state2: CanvasState<N, E>
): boolean {
  return JSON.stringify(state1) === JSON.stringify(state2);
}
