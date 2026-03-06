"use client";

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Play, AlertCircle } from 'lucide-react';
import { getNodeSubtype } from './node-subtypes';

export interface ActionNodeData {
  label: string;
  subType: string;
  config: Record<string, unknown>;
}

export const ActionNode = memo(function ActionNode({
  data,
  selected,
}: NodeProps<ActionNodeData>) {
  const subtype = getNodeSubtype(data.subType);
  const Icon = subtype?.icon || Play;
  const hasConfig = Object.keys(data.config || {}).length > 0;
  const needsConfig = ['send_email', 'send_campaign', 'add_guest_tag', 'remove_guest_tag',
    'update_guest_field', 'wait_delay', 'send_webhook', 'send_whatsapp_message'].includes(data.subType);
  const showWarning = needsConfig && !hasConfig;

  return (
    <div
      className={`
        px-4 py-3 shadow-md min-w-[180px] relative
        bg-ora-cream text-ora-charcoal border
        ${selected ? 'border-ora-gold ring-2 ring-ora-gold/50' : 'border-ora-stone'}
        transition-all duration-150
      `}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-5 !h-2 !rounded-sm !bg-ora-charcoal !border-0 !top-[-5px]"
      />

      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-ora-stone/30 rounded">
          <Icon className="w-4 h-4 text-ora-graphite" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-ora-graphite">
            Action
          </div>
          <div className="text-sm font-semibold truncate">
            {data.label}
          </div>
        </div>
        {showWarning && (
          <AlertCircle className="w-4 h-4 text-amber-500" />
        )}
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-5 !h-2 !rounded-sm !bg-ora-charcoal !border-0 !bottom-[-5px]"
      />
    </div>
  );
});
