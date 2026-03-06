"use client";

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { GitBranch, AlertCircle } from 'lucide-react';
import { getNodeSubtype } from './node-subtypes';

export interface ConditionNodeData {
  label: string;
  subType: string;
  config: Record<string, unknown>;
}

export const ConditionNode = memo(function ConditionNode({
  data,
  selected,
}: NodeProps<ConditionNodeData>) {
  const subtype = getNodeSubtype(data.subType);
  const Icon = subtype?.icon || GitBranch;
  const hasConfig = Object.keys(data.config || {}).length > 0;
  const needsConfig = ['check_rsvp_status', 'check_guest_tag', 'check_guest_field',
    'check_time_window', 'check_guest_tier'].includes(data.subType);
  const showWarning = needsConfig && !hasConfig;

  return (
    <div className="relative pb-5">
      <div
        className={`
          px-4 py-3 shadow-md min-w-[180px]
          bg-ora-sand text-ora-charcoal border
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
              Condition
            </div>
            <div className="text-sm font-semibold truncate">
              {data.label}
            </div>
          </div>
          {showWarning && (
            <AlertCircle className="w-4 h-4 text-amber-500" />
          )}
        </div>
      </div>

      {/* True/False handles with labels below the node border */}
      <div className="absolute -bottom-0 left-0 right-0 flex justify-between px-4">
        <div className="flex flex-col items-center">
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!w-5 !h-2 !rounded-sm !bg-green-500 !border-0 !relative !left-auto !right-auto !translate-x-0 !translate-y-0"
            style={{ position: 'relative' }}
          />
          <span className="text-[10px] text-green-600 font-semibold mt-0.5 select-none">
            True
          </span>
        </div>
        <div className="flex flex-col items-center">
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!w-5 !h-2 !rounded-sm !bg-red-400 !border-0 !relative !left-auto !right-auto !translate-x-0 !translate-y-0"
            style={{ position: 'relative' }}
          />
          <span className="text-[10px] text-red-500 font-semibold mt-0.5 select-none">
            False
          </span>
        </div>
      </div>
    </div>
  );
});
