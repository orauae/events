/**
 * @fileoverview Workflow Canvas Component - Visual automation builder
 * 
 * This component provides a visual drag-and-drop interface for building
 * automation workflows using React Flow. Features include:
 * - Drag and drop node placement
 * - Visual node connections with animated edges
 * - Undo/redo support
 * - Node configuration
 * - Real-time workflow updates
 * 
 * @module components/automation-builder/workflow-canvas
 * @requires reactflow
 * 
 * @example
 * ```tsx
 * import { WorkflowCanvas } from '@/components/automation-builder';
 * 
 * function AutomationEditor() {
 *   return (
 *     <WorkflowCanvas
 *       initialNodes={automation.nodes}
 *       initialEdges={automation.edges}
 *       onNodesChange={handleNodesChange}
 *       onEdgesChange={handleEdgesChange}
 *     />
 *   );
 * }
 * ```
 */

"use client";

import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ReactFlowProvider,
  useReactFlow,
  NodeChange,
  EdgeChange,
  OnConnect,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { createId } from '@paralleldrive/cuid2';
import { nodeTypes, NODE_SUBTYPES } from './nodes/node-types';
import { NodePalette } from './node-palette';
import { useUndoRedo, areStatesEqual, type CanvasState } from '@/hooks/use-undo-redo';
import type { AutomationNode, AutomationEdge, NodeType } from '@/db/schema';

/**
 * Converts database automation nodes to React Flow format.
 * 
 * @param nodes - Array of database automation nodes
 * @returns Array of React Flow compatible nodes
 */
function toReactFlowNodes(nodes: AutomationNode[]): Node[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: { x: parseFloat(node.positionX), y: parseFloat(node.positionY) },
    data: {
      label: node.label,
      subType: node.subType,
      config: node.config,
    },
  }));
}

/**
 * Converts database automation edges to React Flow format.
 * 
 * @param edges - Array of database automation edges
 * @returns Array of React Flow compatible edges with ORA styling
 */
function toReactFlowEdges(edges: AutomationEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    sourceHandle: edge.sourceHandle || undefined,
    animated: true,
    style: { stroke: '#B8956B', strokeWidth: 2 },
  }));
}

/**
 * Converts React Flow nodes back to database format for persistence.
 * 
 * @param nodes - Array of React Flow nodes
 * @returns Array of automation nodes ready for database storage
 */
function toAutomationNodes(nodes: Node[]): (Omit<AutomationNode, 'id' | 'automationId' | 'createdAt'> & { clientId: string })[] {
  return nodes.map((node) => ({
    type: node.type as NodeType,
    subType: node.data.subType,
    label: node.data.label,
    positionX: String(node.position.x),
    positionY: String(node.position.y),
    config: node.data.config || {},
    clientId: node.id, // React Flow node ID for edge mapping
  }));
}

/**
 * Converts React Flow edges back to database format for persistence.
 * 
 * @param edges - Array of React Flow edges
 * @returns Array of automation edges ready for database storage
 */
function toAutomationEdges(edges: Edge[]): Omit<AutomationEdge, 'id' | 'automationId' | 'createdAt'>[] {
  return edges.map((edge) => ({
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    sourceHandle: edge.sourceHandle || null,
  }));
}

/**
 * Props for the WorkflowCanvas component
 * 
 * @interface WorkflowCanvasProps
 */
export interface WorkflowCanvasProps {
  /** Initial nodes to display (from database) */
  initialNodes?: AutomationNode[];
  /** Initial edges to display (from database) */
  initialEdges?: AutomationEdge[];
  /** Callback when nodes change */
  onNodesChange?: (nodes: Omit<AutomationNode, 'id' | 'automationId' | 'createdAt'>[]) => void;
  /** Callback when edges change */
  onEdgesChange?: (edges: Omit<AutomationEdge, 'id' | 'automationId' | 'createdAt'>[]) => void;
  /** Callback when a node is selected */
  onNodeSelect?: (node: Node | null) => void;
  onNodeDelete?: (nodeId: string) => void;
  onNodeUpdate?: (nodeId: string, data: Partial<{ label: string; config: Record<string, unknown> }>) => void;
  selectedNodeId?: string | null;
  readOnly?: boolean;
  /** Callback when undo/redo state changes */
  onUndoRedoChange?: (canUndo: boolean, canRedo: boolean) => void;
  /** External trigger for undo operation */
  undoTrigger?: number;
  /** External trigger for redo operation */
  redoTrigger?: number;
}

function WorkflowCanvasInner({
  initialNodes = [],
  initialEdges = [],
  onNodesChange: onNodesChangeCallback,
  onEdgesChange: onEdgesChangeCallback,
  onNodeSelect,
  onNodeDelete: onNodeDeleteCallback,
  onNodeUpdate: onNodeUpdateCallback,
  selectedNodeId,
  readOnly = false,
  onUndoRedoChange,
  undoTrigger,
  redoTrigger,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(
    toReactFlowNodes(initialNodes)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toReactFlowEdges(initialEdges)
  );

  // Initialize undo/redo with initial state
  const initialCanvasState: CanvasState<Node, Edge> = useMemo(() => ({
    nodes: toReactFlowNodes(initialNodes),
    edges: toReactFlowEdges(initialEdges),
  }), []);

  const {
    canUndo,
    canRedo,
    undo,
    redo,
    pushState,
  } = useUndoRedo(initialCanvasState, { maxHistorySize: 50 });

  // Track last state to avoid duplicate pushes
  const lastStateRef = useRef<string>(JSON.stringify(initialCanvasState));
  
  // Flag to prevent recording state during undo/redo
  const isUndoRedoRef = useRef(false);

  // Notify parent of undo/redo state changes
  useEffect(() => {
    onUndoRedoChange?.(canUndo, canRedo);
  }, [canUndo, canRedo, onUndoRedoChange]);

  // Handle external undo trigger
  useEffect(() => {
    if (undoTrigger !== undefined && undoTrigger > 0) {
      const previousState = undo();
      if (previousState) {
        isUndoRedoRef.current = true;
        setNodes(previousState.nodes);
        setEdges(previousState.edges);
        onNodesChangeCallback?.(toAutomationNodes(previousState.nodes));
        onEdgesChangeCallback?.(toAutomationEdges(previousState.edges));
        // Reset flag after state updates
        setTimeout(() => {
          isUndoRedoRef.current = false;
        }, 0);
      }
    }
  }, [undoTrigger]);

  // Handle external redo trigger
  useEffect(() => {
    if (redoTrigger !== undefined && redoTrigger > 0) {
      const nextState = redo();
      if (nextState) {
        isUndoRedoRef.current = true;
        setNodes(nextState.nodes);
        setEdges(nextState.edges);
        onNodesChangeCallback?.(toAutomationNodes(nextState.nodes));
        onEdgesChangeCallback?.(toAutomationEdges(nextState.edges));
        // Reset flag after state updates
        setTimeout(() => {
          isUndoRedoRef.current = false;
        }, 0);
      }
    }
  }, [redoTrigger]);

  // Record state change for undo/redo
  const recordStateChange = useCallback((newNodes: Node[], newEdges: Edge[]) => {
    if (isUndoRedoRef.current) return;
    
    const newState: CanvasState<Node, Edge> = { nodes: newNodes, edges: newEdges };
    const newStateStr = JSON.stringify(newState);
    
    // Only push if state actually changed
    if (newStateStr !== lastStateRef.current) {
      lastStateRef.current = newStateStr;
      pushState(newState);
    }
  }, [pushState]);

  // Handle node changes and notify parent
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      // Notify parent after state update
      setTimeout(() => {
        setNodes((currentNodes) => {
          onNodesChangeCallback?.(toAutomationNodes(currentNodes));
          // Record state for undo/redo (only for significant changes)
          const hasSignificantChange = changes.some(
            c => c.type === 'remove' || c.type === 'add'
          );
          if (hasSignificantChange) {
            setEdges((currentEdges) => {
              recordStateChange(currentNodes, currentEdges);
              return currentEdges;
            });
          }
          return currentNodes;
        });
      }, 0);
    },
    [onNodesChange, onNodesChangeCallback, setNodes, setEdges, recordStateChange]
  );

  // Handle edge changes and notify parent
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      // Notify parent after state update
      setTimeout(() => {
        setEdges((currentEdges) => {
          onEdgesChangeCallback?.(toAutomationEdges(currentEdges));
          // Record state for undo/redo (only for significant changes)
          const hasSignificantChange = changes.some(
            c => c.type === 'remove' || c.type === 'add'
          );
          if (hasSignificantChange) {
            setNodes((currentNodes) => {
              recordStateChange(currentNodes, currentEdges);
              return currentNodes;
            });
          }
          return currentEdges;
        });
      }, 0);
    },
    [onEdgesChange, onEdgesChangeCallback, setEdges, setNodes, recordStateChange]
  );

  // Validate if a connection is allowed
  const isValidConnection = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) return false;

      // Cannot connect to self
      if (connection.source === connection.target) return false;

      // Trigger nodes can only be sources, never targets
      if (targetNode.type === 'trigger') return false;

      // Trigger nodes cannot be targets
      if (sourceNode.type === 'trigger' && targetNode.type === 'trigger') return false;

      // Check for duplicate connections
      const existingEdge = edges.find(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          e.sourceHandle === connection.sourceHandle
      );
      if (existingEdge) return false;

      return true;
    },
    [nodes, edges]
  );

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) return;

      // Create edge with styling based on source handle
      const isConditionTrue = connection.sourceHandle === 'true';
      const isConditionFalse = connection.sourceHandle === 'false';

      const edgeColor = isConditionTrue
        ? '#22c55e' // green for true branch
        : isConditionFalse
        ? '#f87171' // red for false branch
        : '#B8956B'; // gold for normal connections

      const newEdge: Edge = {
        ...connection,
        id: createId(),
        animated: true,
        style: { stroke: edgeColor, strokeWidth: 2 },
      } as Edge;

      setEdges((eds) => {
        const newEdges = addEdge(newEdge, eds);
        onEdgesChangeCallback?.(toAutomationEdges(newEdges));
        // Record state for undo/redo
        setNodes((currentNodes) => {
          recordStateChange(currentNodes, newEdges);
          return currentNodes;
        });
        return newEdges;
      });
    },
    [isValidConnection, setEdges, onEdgesChangeCallback, setNodes, recordStateChange]
  );


  // Handle drag over for dropping new nodes
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle drop to create new nodes (with drop-on-edge support)
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (readOnly) return;

      const type = event.dataTransfer.getData('application/reactflow-type') as NodeType;
      const subType = event.dataTransfer.getData('application/reactflow-subtype');
      const label = event.dataTransfer.getData('application/reactflow-label');

      if (!type || !subType) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Snap to grid (20px)
      const snappedPosition = {
        x: Math.round(position.x / 20) * 20,
        y: Math.round(position.y / 20) * 20,
      };

      const newNode: Node = {
        id: createId(),
        type,
        position: snappedPosition,
        data: {
          label: label || `New ${type}`,
          subType,
          config: {},
        },
      };

      // Check if dropped on an existing edge (drop-on-edge auto-insert)
      // Only for action/condition nodes (triggers can't be inserted mid-flow)
      const dropOnEdgeThreshold = 40; // px proximity to edge line
      let edgeToSplit: Edge | null = null;

      if (type !== 'trigger') {
        edgeToSplit = edges.find((edge) => {
          const sourceNode = nodes.find((n) => n.id === edge.source);
          const targetNode = nodes.find((n) => n.id === edge.target);
          if (!sourceNode || !targetNode) return false;

          // Simple distance check from drop point to line segment between source and target
          const sx = sourceNode.position.x + 90; // approximate node center
          const sy = sourceNode.position.y + 40;
          const tx = targetNode.position.x + 90;
          const ty = targetNode.position.y + 40;
          const px = position.x;
          const py = position.y;

          // Point-to-line-segment distance
          const dx = tx - sx;
          const dy = ty - sy;
          const lenSq = dx * dx + dy * dy;
          if (lenSq === 0) return false;

          let t = ((px - sx) * dx + (py - sy) * dy) / lenSq;
          t = Math.max(0, Math.min(1, t));

          const closestX = sx + t * dx;
          const closestY = sy + t * dy;
          const dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);

          return dist < dropOnEdgeThreshold && t > 0.1 && t < 0.9;
        }) || null;
      }

      setNodes((nds) => {
        const newNodes = [...nds, newNode];
        
        if (edgeToSplit) {
          // Split the edge: remove old edge, create two new edges
          const sourceHandle = edgeToSplit.sourceHandle;
          const isConditionTrue = sourceHandle === 'true';
          const isConditionFalse = sourceHandle === 'false';
          const sourceEdgeColor = isConditionTrue ? '#22c55e' : isConditionFalse ? '#f87171' : '#B8956B';

          const newEdge1: Edge = {
            id: createId(),
            source: edgeToSplit.source,
            target: newNode.id,
            sourceHandle: edgeToSplit.sourceHandle || undefined,
            animated: true,
            style: { stroke: sourceEdgeColor, strokeWidth: 2 },
          };

          const newEdge2: Edge = {
            id: createId(),
            source: newNode.id,
            target: edgeToSplit.target,
            sourceHandle: type === 'condition' ? 'true' : undefined,
            animated: true,
            style: { stroke: type === 'condition' ? '#22c55e' : '#B8956B', strokeWidth: 2 },
          };

          setEdges((eds) => {
            const newEdges = eds.filter((e) => e.id !== edgeToSplit!.id).concat([newEdge1, newEdge2]);
            onEdgesChangeCallback?.(toAutomationEdges(newEdges));
            recordStateChange(newNodes, newEdges);
            return newEdges;
          });
        } else {
          // Normal drop - no edge splitting
          setEdges((currentEdges) => {
            recordStateChange(newNodes, currentEdges);
            return currentEdges;
          });
        }

        onNodesChangeCallback?.(toAutomationNodes(newNodes));
        return newNodes;
      });
    },
    [screenToFlowPosition, setNodes, setEdges, onNodesChangeCallback, onEdgesChangeCallback, readOnly, recordStateChange, nodes, edges]
  );

  // Handle node click for selection
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect?.(node);
    },
    [onNodeSelect]
  );

  // Handle pane click to deselect
  const onPaneClick = useCallback(() => {
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  // Delete selected nodes and their connected edges
  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const newNodes = nds.filter((n) => n.id !== nodeId);
        onNodesChangeCallback?.(toAutomationNodes(newNodes));
        // Record state for undo/redo
        setEdges((eds) => {
          const newEdges = eds.filter(
            (e) => e.source !== nodeId && e.target !== nodeId
          );
          onEdgesChangeCallback?.(toAutomationEdges(newEdges));
          recordStateChange(newNodes, newEdges);
          return newEdges;
        });
        return newNodes;
      });
      onNodeSelect?.(null);
      onNodeDeleteCallback?.(nodeId);
    },
    [setNodes, setEdges, onNodesChangeCallback, onEdgesChangeCallback, onNodeSelect, onNodeDeleteCallback, recordStateChange]
  );

  // Update node data (label, config)
  const updateNodeData = useCallback(
    (nodeId: string, data: Partial<{ label: string; config: Record<string, unknown> }>) => {
      setNodes((nds) => {
        const newNodes = nds.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              data: {
                ...n.data,
                ...data,
              },
            };
          }
          return n;
        });
        onNodesChangeCallback?.(toAutomationNodes(newNodes));
        // Record state for undo/redo
        setEdges((currentEdges) => {
          recordStateChange(newNodes, currentEdges);
          return currentEdges;
        });
        return newNodes;
      });
      onNodeUpdateCallback?.(nodeId, data);
    },
    [setNodes, onNodesChangeCallback, onNodeUpdateCallback, setEdges, recordStateChange]
  );

  // Expose deleteNode for external use
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Track connection start for onConnectEnd
  const connectStartRef = useRef<{ nodeId: string; handleId: string | null; handleType: string | null } | null>(null);

  const onConnectStart = useCallback((_: React.MouseEvent | React.TouchEvent, params: { nodeId: string | null; handleId: string | null; handleType: string | null }) => {
    if (params.nodeId) {
      connectStartRef.current = { nodeId: params.nodeId, handleId: params.handleId, handleType: params.handleType };
    }
  }, []);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (readOnly || !connectStartRef.current) return;

      // Check if the connection ended on the pane (not on a node)
      const target = event.target as HTMLElement;
      const isPane = target.classList.contains('react-flow__pane');

      if (isPane && connectStartRef.current.handleType === 'source') {
        const clientX = 'changedTouches' in event ? event.changedTouches[0].clientX : event.clientX;
        const clientY = 'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY;

        const position = screenToFlowPosition({ x: clientX, y: clientY });
        const snappedPosition = {
          x: Math.round(position.x / 20) * 20,
          y: Math.round(position.y / 20) * 20,
        };

        // Create a new action node at the drop position
        const newNode: Node = {
          id: createId(),
          type: 'action',
          position: snappedPosition,
          data: {
            label: 'New Action',
            subType: 'send_email',
            config: {},
          },
        };

        // Determine edge color based on source handle
        const sourceHandle = connectStartRef.current.handleId;
        const isConditionTrue = sourceHandle === 'true';
        const isConditionFalse = sourceHandle === 'false';
        const edgeColor = isConditionTrue ? '#22c55e' : isConditionFalse ? '#f87171' : '#B8956B';

        const newEdge: Edge = {
          id: createId(),
          source: connectStartRef.current.nodeId,
          target: newNode.id,
          sourceHandle: sourceHandle || undefined,
          animated: true,
          style: { stroke: edgeColor, strokeWidth: 2 },
        };

        setNodes((nds) => {
          const newNodes = [...nds, newNode];
          onNodesChangeCallback?.(toAutomationNodes(newNodes));
          setEdges((eds) => {
            const newEdges = [...eds, newEdge];
            onEdgesChangeCallback?.(toAutomationEdges(newEdges));
            recordStateChange(newNodes, newEdges);
            return newEdges;
          });
          return newNodes;
        });

        // Select the new node so user can configure it
        onNodeSelect?.(newNode);
      }

      connectStartRef.current = null;
    },
    [readOnly, screenToFlowPosition, setNodes, setEdges, onNodesChangeCallback, onEdgesChangeCallback, recordStateChange, onNodeSelect]
  );

  // MiniMap node color based on type
  const miniMapNodeColor = useCallback((node: Node) => {
    switch (node.type) {
      case 'trigger': return '#B8956B';  // ora-gold
      case 'action': return '#F5F0EB';   // ora-cream
      case 'condition': return '#E8E2D9'; // ora-sand
      default: return '#D4CFC8';
    }
  }, []);

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes.map((n) => ({
          ...n,
          selected: n.id === selectedNodeId,
        }))}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        connectionRadius={30}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        snapToGrid
        snapGrid={[20, 20]}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        onNodesDelete={(deletedNodes) => {
          deletedNodes.forEach((node) => deleteNode(node.id));
        }}
        connectionLineStyle={{ stroke: '#B8956B', strokeWidth: 2 }}
        className="bg-ora-cream/30"
      >
        <Controls className="bg-white border border-ora-sand rounded-lg shadow-sm" />
        <MiniMap
          nodeColor={miniMapNodeColor}
          nodeStrokeColor="#B8956B"
          maskColor="rgba(245, 240, 235, 0.7)"
          className="bg-white border border-ora-sand rounded-lg shadow-sm"
          pannable
          zoomable
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#D4CFC8"
        />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
