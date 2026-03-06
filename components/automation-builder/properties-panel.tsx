"use client";

import { useCallback } from 'react';
import { Trash2, Settings } from 'lucide-react';
import type { Node } from 'reactflow';
import { Button, Input, Label } from '@/components/ui';
import { getNodeSubtype } from './nodes/node-types';
import { TriggerConfigForm } from './config-forms/trigger-config';
import { ConditionConfigForm } from './config-forms/condition-config';
import { ActionConfigForm } from './config-forms/action-config';

export interface PropertiesPanelProps {
  node: Node | null;
  eventId: string;
  onUpdate: (nodeId: string, data: Partial<{ label: string; config: Record<string, unknown> }>) => void;
  onDelete: (nodeId: string) => void;
}

export function PropertiesPanel({
  node,
  eventId,
  onUpdate,
  onDelete,
}: PropertiesPanelProps) {
  // Handle label change
  const handleLabelChange = useCallback(
    (label: string) => {
      if (node) {
        onUpdate(node.id, { label });
      }
    },
    [node, onUpdate]
  );

  // Handle config change
  const handleConfigChange = useCallback(
    (config: Record<string, unknown>) => {
      if (node) {
        onUpdate(node.id, { config });
      }
    },
    [node, onUpdate]
  );

  // Handle delete
  const handleDelete = useCallback(() => {
    if (node) {
      onDelete(node.id);
    }
  }, [node, onDelete]);

  if (!node) {
    return (
      <div className="p-4 text-center text-ora-graphite">
        <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Select a node to edit its properties</p>
      </div>
    );
  }

  const subtype = getNodeSubtype(node.data.subType);
  const nodeType = node.type as 'trigger' | 'condition' | 'action';
  const config = node.data.config || {};

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {subtype && <subtype.icon className="h-4 w-4 text-ora-gold" />}
            <span className="text-sm font-medium text-ora-charcoal">
              {subtype?.label || node.data.subType}
            </span>
          </div>
          <Button
            size="sm"
            variant="danger"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Node label */}
        <div className="space-y-2">
          <Label>Node Label</Label>
          <Input
            value={node.data.label || ''}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="Enter node label"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-ora-sand" />

        {/* Node-specific configuration */}
        {nodeType === 'trigger' && (
          <TriggerConfigForm
            subType={node.data.subType}
            config={config}
            eventId={eventId}
            onChange={handleConfigChange}
          />
        )}

        {nodeType === 'condition' && (
          <ConditionConfigForm
            subType={node.data.subType}
            config={config}
            eventId={eventId}
            onChange={handleConfigChange}
          />
        )}

        {nodeType === 'action' && (
          <ActionConfigForm
            subType={node.data.subType}
            config={config}
            eventId={eventId}
            onChange={handleConfigChange}
          />
        )}
      </div>
    </div>
  );
}
