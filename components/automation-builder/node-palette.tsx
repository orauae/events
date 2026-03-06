"use client";

import { useCallback } from 'react';
import { Zap, GitBranch, Play } from 'lucide-react';
import { NODE_SUBTYPES, getSubtypesByType, type NodeSubtype } from './nodes/node-types';

interface DraggableNodeProps {
  subtype: NodeSubtype;
}

function DraggableNode({ subtype }: DraggableNodeProps) {
  const onDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData('application/reactflow-type', subtype.type);
      event.dataTransfer.setData('application/reactflow-subtype', subtype.subType);
      event.dataTransfer.setData('application/reactflow-label', subtype.label);
      event.dataTransfer.effectAllowed = 'move';
    },
    [subtype]
  );

  const Icon = subtype.icon;

  // Get background color based on type
  const getBgColor = () => {
    switch (subtype.type) {
      case 'trigger':
        return 'bg-ora-gold/10 border-ora-gold/30 hover:bg-ora-gold/20';
      case 'condition':
        return 'bg-ora-sand/50 border-ora-stone/30 hover:bg-ora-sand';
      case 'action':
        return 'bg-ora-cream border-ora-stone/30 hover:bg-ora-cream/80';
      default:
        return 'bg-white border-ora-stone/30';
    }
  };

  const getIconColor = () => {
    switch (subtype.type) {
      case 'trigger':
        return 'text-ora-gold';
      case 'condition':
        return 'text-ora-graphite';
      case 'action':
        return 'text-ora-graphite';
      default:
        return 'text-ora-graphite';
    }
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`
        flex items-center gap-2 p-2 rounded-md border cursor-grab
        transition-colors duration-150
        ${getBgColor()}
      `}
      title={subtype.description}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${getIconColor()}`} />
      <span className="text-xs font-medium text-ora-charcoal truncate">
        {subtype.label}
      </span>
    </div>
  );
}


interface NodeCategoryProps {
  title: string;
  icon: React.ReactNode;
  subtypes: NodeSubtype[];
  accentColor: string;
}

function NodeCategory({ title, icon, subtypes, accentColor }: NodeCategoryProps) {
  return (
    <div className="mb-4">
      <div className={`flex items-center gap-2 mb-2 pb-1 border-b ${accentColor}`}>
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide text-ora-graphite">
          {title}
        </span>
      </div>
      <div className="space-y-1.5">
        {subtypes.map((subtype) => (
          <DraggableNode key={subtype.subType} subtype={subtype} />
        ))}
      </div>
    </div>
  );
}

export function NodePalette() {
  const triggers = getSubtypesByType('trigger');
  const conditions = getSubtypesByType('condition');
  const actions = getSubtypesByType('action');

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3">
        <h3 className="text-sm font-semibold text-ora-charcoal mb-3">
          Drag nodes to canvas
        </h3>

        <NodeCategory
          title="Triggers"
          icon={<Zap className="w-3.5 h-3.5 text-ora-gold" />}
          subtypes={triggers}
          accentColor="border-ora-gold/30"
        />

        <NodeCategory
          title="Conditions"
          icon={<GitBranch className="w-3.5 h-3.5 text-ora-graphite" />}
          subtypes={conditions}
          accentColor="border-ora-stone/50"
        />

        <NodeCategory
          title="Actions"
          icon={<Play className="w-3.5 h-3.5 text-ora-graphite" />}
          subtypes={actions}
          accentColor="border-ora-stone/50"
        />
      </div>
    </div>
  );
}
