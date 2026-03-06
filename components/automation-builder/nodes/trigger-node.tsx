"use client";

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Zap, AlertCircle } from 'lucide-react';
import { getNodeSubtype } from './node-subtypes';

export interface TriggerNodeData {
  label: string;
  subType: string;
  config: Record<string, unknown>;
}

export const TriggerNode = memo(function TriggerNode({
  data,
  selected,
}: NodeProps<TriggerNodeData>) {
  const subtype = getNodeSubtype(data.subType);
  const Icon = subtype?.icon || Zap;
  const hasConfig = Object.keys(data.config || {}).length > 0;
  const needsConfig = ['event_date_approaching', 'scheduled'].includes(data.subType);
  const showWarning = needsConfig && !hasConfig;

  return (
    <div
      className={`
        px-4 py-3 shadow-md min-w-[180px] relative
        bg-ora-gold text-white border
        ${selected ? 'border-ora-charcoal ring-2 ring-ora-gold/50' : 'border-ora-gold/60'}
        transition-all duration-150
      `}
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-white/20 rounded">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide opacity-80">
            Trigger
          </div>
          <div className="text-sm font-semibold truncate">
            {data.label}
          </div>
        </div>
        {showWarning && (
          <AlertCircle className="w-4 h-4 text-white/80 animate-pulse" />
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
