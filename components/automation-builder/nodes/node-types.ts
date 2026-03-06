import { TriggerNode } from './trigger-node';
import { ConditionNode } from './condition-node';
import { ActionNode } from './action-node';
import type { NodeTypes } from 'reactflow';

// Re-export subtype definitions and helpers from the separate file
// to maintain backwards compatibility for existing imports
export {
  NODE_SUBTYPES,
  getNodeSubtype,
  getSubtypesByType,
  type NodeSubtype,
} from './node-subtypes';

// Register custom node types for React Flow
export const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
};
