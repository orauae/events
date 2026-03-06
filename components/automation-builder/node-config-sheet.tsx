"use client";

import { useCallback, useState } from 'react';
import { X, Settings, Zap, GitBranch, Play, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Node } from 'reactflow';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Button,
  Input,
  Label,
  Badge,
} from '@/components/ui';
import { getNodeSubtype } from './nodes/node-types';
import { AdvancedTriggerConfig } from './config-forms/advanced-trigger-config';
import { AdvancedConditionConfig } from './config-forms/advanced-condition-config';
import { AdvancedActionConfig } from './config-forms/advanced-action-config';

export interface NodeConfigSheetProps {
  node: Node | null;
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (nodeId: string, data: Partial<{ label: string; config: Record<string, unknown> }>) => void;
  onDelete: (nodeId: string) => void;
}

const NODE_TYPE_ICONS = {
  trigger: Zap,
  condition: GitBranch,
  action: Play,
};

const NODE_TYPE_COLORS = {
  trigger: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  condition: 'bg-amber-100 text-amber-700 border-amber-200',
  action: 'bg-blue-100 text-blue-700 border-blue-200',
};

export function NodeConfigSheet({
  node,
  eventId,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
}: NodeConfigSheetProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleLabelChange = useCallback(
    (label: string) => {
      if (node) {
        onUpdate(node.id, { label });
      }
    },
    [node, onUpdate]
  );

  const handleConfigChange = useCallback(
    (config: Record<string, unknown>) => {
      if (node) {
        onUpdate(node.id, { config });
      }
    },
    [node, onUpdate]
  );

  const handleDelete = useCallback(() => {
    if (node) {
      onDelete(node.id);
      onOpenChange(false);
      setShowDeleteConfirm(false);
    }
  }, [node, onDelete, onOpenChange]);

  if (!node) return null;

  const subtype = getNodeSubtype(node.data.subType);
  const nodeType = node.type as 'trigger' | 'condition' | 'action';
  const config = node.data.config || {};
  const TypeIcon = NODE_TYPE_ICONS[nodeType];

  // Check if configuration is complete
  const isConfigComplete = checkConfigComplete(nodeType, node.data.subType, config);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="w-full sm:w-[50vw] sm:max-w-none p-0 flex flex-col"
      >
        {/* Header */}
        <div className="border-b border-ora-sand bg-ora-cream/50 p-6">
          <SheetHeader className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg border ${NODE_TYPE_COLORS[nodeType]}`}>
                  <TypeIcon className="h-5 w-5 stroke-1" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <SheetTitle className="text-lg">
                      {subtype?.label || node.data.subType}
                    </SheetTitle>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {nodeType}
                    </Badge>
                  </div>
                  <SheetDescription className="text-sm mt-1">
                    {getNodeDescription(nodeType, node.data.subType)}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isConfigComplete ? (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="warning" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Needs Setup
                  </Badge>
                )}
              </div>
            </div>

            {/* Node Label */}
            <div className="space-y-2">
              <Label htmlFor="node-label">Node Label</Label>
              <Input
                id="node-label"
                value={node.data.label || ''}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder="Enter a descriptive label for this node"
                className="bg-white"
              />
              <p className="text-xs text-ora-graphite">
                A clear label helps identify this node in your workflow
              </p>
            </div>
          </SheetHeader>
        </div>

        {/* Configuration Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {nodeType === 'trigger' && (
            <AdvancedTriggerConfig
              subType={node.data.subType}
              config={config}
              eventId={eventId}
              onChange={handleConfigChange}
            />
          )}

          {nodeType === 'condition' && (
            <AdvancedConditionConfig
              subType={node.data.subType}
              config={config}
              eventId={eventId}
              onChange={handleConfigChange}
            />
          )}

          {nodeType === 'action' && (
            <AdvancedActionConfig
              subType={node.data.subType}
              config={config}
              eventId={eventId}
              onChange={handleConfigChange}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-ora-sand bg-ora-cream/30 p-4">
          {showDeleteConfirm ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-ora-graphite">
                Are you sure you want to delete this node?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                >
                  Delete Node
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Delete Node
              </Button>
              <Button
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Done
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Helper to get node description
function getNodeDescription(nodeType: string, subType: string): string {
  const descriptions: Record<string, Record<string, string>> = {
    trigger: {
      guest_rsvp_received: 'Triggers when a guest submits their RSVP response',
      event_date_approaching: 'Triggers a specified number of days before the event',
      guest_tag_changed: 'Triggers when tags are added or removed from a guest',
      scheduled: 'Triggers on a recurring schedule using cron expressions',
      guest_checked_in: 'Triggers when a guest checks in at the event',
      campaign_sent: 'Triggers after a campaign is sent to guests',
      guest_added_to_event: 'Triggers when a new guest is added to the event',
      whatsapp_message_received: 'Triggers when a guest sends a WhatsApp message',
      concierge_escalated: 'Triggers when AI concierge escalates to human support',
    },
    condition: {
      check_rsvp_status: 'Check if guest has a specific RSVP status',
      check_guest_tag: 'Check if guest has or doesn\'t have a specific tag',
      check_guest_field: 'Check guest field values with various operators',
      check_time_window: 'Check if current time is within a specified window',
      whatsapp_opted_in: 'Check if guest has an active WhatsApp conversation',
      check_guest_tier: 'Check guest tier level (VIP, Premium, Standard)',
    },
    action: {
      send_email: 'Send a custom email to the guest',
      send_campaign: 'Send an existing campaign to the guest',
      add_guest_tag: 'Add a tag to the guest',
      remove_guest_tag: 'Remove a tag from the guest',
      update_guest_field: 'Update a guest\'s profile field',
      wait_delay: 'Wait for a specified duration before continuing',
      send_webhook: 'Send data to an external webhook URL',
      send_whatsapp_message: 'Send a WhatsApp message to the guest',
      start_concierge: 'Start an AI concierge conversation via WhatsApp',
    },
  };

  return descriptions[nodeType]?.[subType] || 'Configure this node';
}

// Helper to check if configuration is complete
function checkConfigComplete(nodeType: string, subType: string, config: Record<string, unknown>): boolean {
  switch (nodeType) {
    case 'trigger':
      switch (subType) {
        case 'event_date_approaching':
          return typeof config.daysBefore === 'number';
        case 'scheduled':
          return typeof config.cronExpression === 'string' && config.cronExpression.length > 0;
        default:
          return true; // Most triggers don't require config
      }
    case 'condition':
      switch (subType) {
        case 'check_rsvp_status':
          return Array.isArray(config.statuses) && config.statuses.length > 0;
        case 'check_guest_tag':
          return typeof config.tagId === 'string' && config.tagId.length > 0;
        case 'check_guest_field':
          return typeof config.field === 'string' && config.field.length > 0;
        case 'check_time_window':
          return typeof config.startTime === 'string' && typeof config.endTime === 'string';
        case 'whatsapp_opted_in':
          return true; // Works with defaults
        case 'check_guest_tier':
          return Array.isArray(config.tiers) && config.tiers.length > 0;
        default:
          return true;
      }
    case 'action':
      switch (subType) {
        case 'send_email':
          return typeof config.subject === 'string' && config.subject.length > 0;
        case 'send_campaign':
          return typeof config.campaignId === 'string' && config.campaignId.length > 0;
        case 'add_guest_tag':
        case 'remove_guest_tag':
          return typeof config.tagId === 'string' && config.tagId.length > 0;
        case 'update_guest_field':
          return typeof config.field === 'string' && config.field.length > 0;
        case 'wait_delay':
          return typeof config.duration === 'number' && config.duration > 0;
        case 'send_webhook':
          return typeof config.url === 'string' && config.url.length > 0;
        case 'send_whatsapp_message':
          return (typeof config.messageContent === 'string' && config.messageContent.length > 0) ||
            (typeof config.templateName === 'string' && config.templateName.length > 0);
        case 'start_concierge':
          return true; // Concierge works with defaults
        default:
          return true;
      }
    default:
      return true;
  }
}
