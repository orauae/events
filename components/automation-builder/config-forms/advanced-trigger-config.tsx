"use client";

import { useCallback, useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Tag,
  UserCheck,
  Mail,
  UserPlus,
  Zap,
  Info,
  CheckCircle2,
  MessageSquare,
  Bot,
} from 'lucide-react';
import {
  Label,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
} from '@/components/ui';
import { useGuestTagsByEvent } from '@/hooks/use-guest-tags';
import { isValidCronExpression, getCronDescription } from '@/lib/utils/cron-validator';

interface AdvancedTriggerConfigProps {
  subType: string;
  config: Record<string, unknown>;
  eventId: string;
  onChange: (config: Record<string, unknown>) => void;
}

// RSVP status options
const RSVP_STATUSES = [
  { value: 'Attending', label: 'Attending', color: 'bg-green-100 text-green-700' },
  { value: 'Maybe', label: 'Maybe', color: 'bg-amber-100 text-amber-700' },
  { value: 'NotAttending', label: 'Not Attending', color: 'bg-red-100 text-red-700' },
] as const;

// Days before options
const DAYS_BEFORE_OPTIONS = [
  { value: 1, label: '1 day before', description: 'Last minute reminder' },
  { value: 3, label: '3 days before', description: 'Short notice' },
  { value: 7, label: '1 week before', description: 'Standard reminder' },
  { value: 14, label: '2 weeks before', description: 'Early reminder' },
  { value: 30, label: '1 month before', description: 'Advance notice' },
] as const;

// Cron presets
const CRON_PRESETS = [
  { value: '0 9 * * *', label: 'Daily at 9am', description: 'Every day at 9:00 AM' },
  { value: '0 9 * * 1', label: 'Weekly on Monday', description: 'Every Monday at 9:00 AM' },
  { value: '0 9 * * 1-5', label: 'Weekdays at 9am', description: 'Monday to Friday at 9:00 AM' },
  { value: '0 9 1 * *', label: 'First of month', description: '1st of every month at 9:00 AM' },
  { value: '0 9 1,15 * *', label: 'Twice monthly', description: '1st and 15th at 9:00 AM' },
] as const;

export function AdvancedTriggerConfig({
  subType,
  config,
  eventId,
  onChange,
}: AdvancedTriggerConfigProps) {
  switch (subType) {
    case 'guest_rsvp_received':
      return <GuestRsvpConfig config={config} onChange={onChange} />;
    case 'event_date_approaching':
      return <EventDateApproachingConfig config={config} onChange={onChange} />;
    case 'guest_tag_changed':
      return <GuestTagChangedConfig config={config} eventId={eventId} onChange={onChange} />;
    case 'scheduled':
      return <ScheduledConfig config={config} onChange={onChange} />;
    case 'guest_checked_in':
      return <NoConfigTrigger icon={UserCheck} title="Guest Check-In" description="Triggers when any guest checks in at the event venue." />;
    case 'campaign_sent':
      return <NoConfigTrigger icon={Mail} title="Campaign Sent" description="Triggers after any campaign is sent to event guests." />;
    case 'guest_added_to_event':
      return <NoConfigTrigger icon={UserPlus} title="Guest Added" description="Triggers when a new guest is added to this event." />;
    case 'whatsapp_message_received':
      return <NoConfigTrigger icon={MessageSquare} title="WhatsApp Message Received" description="Triggers when a guest sends a WhatsApp message to the event's concierge channel." />;
    case 'concierge_escalated':
      return <NoConfigTrigger icon={Bot} title="Concierge Escalated" description="Triggers when the AI concierge escalates a conversation to human support due to low confidence or complex queries." />;
    default:
      return (
        <div className="text-center py-8 text-ora-graphite">
          <Zap className="h-8 w-8 mx-auto mb-2 stroke-1" />
          <p>Unknown trigger type: {subType}</p>
        </div>
      );
  }
}

// No config required component
function NoConfigTrigger({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Icon className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">{title}</h3>
      </div>

      <div className="p-6 bg-ora-cream/50 rounded-lg border border-ora-sand text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3 stroke-1" />
        <h4 className="font-medium text-ora-charcoal mb-2">No Configuration Required</h4>
        <p className="text-sm text-ora-graphite max-w-md mx-auto">{description}</p>
      </div>

      <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0 stroke-1" />
        <p className="text-sm text-blue-700">
          This trigger will automatically fire when the event occurs. Add conditions after this trigger to filter which guests should continue through the workflow.
        </p>
      </div>
    </div>
  );
}

// Guest RSVP Received Config
function GuestRsvpConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const rsvpStatuses = (config.rsvpStatuses as string[]) || [];

  const toggleStatus = useCallback(
    (status: string) => {
      const newStatuses = rsvpStatuses.includes(status)
        ? rsvpStatuses.filter((s) => s !== status)
        : [...rsvpStatuses, status];
      onChange({ ...config, rsvpStatuses: newStatuses });
    },
    [config, rsvpStatuses, onChange]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <UserCheck className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">RSVP Trigger</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Trigger this automation when a guest submits their RSVP. Optionally filter by specific response types.
      </p>

      <div className="space-y-3">
        <Label>Filter by RSVP Status</Label>
        <p className="text-xs text-ora-graphite">
          Leave all unchecked to trigger for any RSVP response
        </p>
        
        <div className="space-y-2">
          {RSVP_STATUSES.map((status) => (
            <button
              key={status.value}
              type="button"
              onClick={() => toggleStatus(status.value)}
              className={`w-full p-4 rounded-lg border text-left transition-all ${
                rsvpStatuses.includes(status.value)
                  ? 'border-ora-gold bg-ora-gold/5 ring-2 ring-ora-gold/20'
                  : 'border-ora-sand hover:border-ora-gold/50 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    status.value === 'Attending' ? 'bg-green-500' :
                    status.value === 'Maybe' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <span className="font-medium text-ora-charcoal">{status.label}</span>
                </div>
                {rsvpStatuses.includes(status.value) && (
                  <CheckCircle2 className="h-5 w-5 text-ora-gold stroke-1" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand">
        <h4 className="text-sm font-medium text-ora-charcoal mb-2">Trigger Summary</h4>
        <p className="text-sm text-ora-graphite">
          {rsvpStatuses.length === 0
            ? 'Will trigger for any RSVP response'
            : `Will trigger when guest responds: ${rsvpStatuses.join(', ')}`}
        </p>
      </div>
    </div>
  );
}

// Event Date Approaching Config
function EventDateApproachingConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const daysBefore = (config.daysBefore as number) || 7;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Calendar className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">Event Date Trigger</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Trigger this automation a specified number of days before the event date.
      </p>

      <div className="space-y-3">
        <Label>Days Before Event</Label>
        
        <div className="grid grid-cols-1 gap-2">
          {DAYS_BEFORE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ ...config, daysBefore: option.value })}
              className={`p-4 rounded-lg border text-left transition-all ${
                daysBefore === option.value
                  ? 'border-ora-gold bg-ora-gold/5 ring-2 ring-ora-gold/20'
                  : 'border-ora-sand hover:border-ora-gold/50 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-ora-charcoal">{option.label}</span>
                  <p className="text-xs text-ora-graphite mt-0.5">{option.description}</p>
                </div>
                {daysBefore === option.value && (
                  <CheckCircle2 className="h-5 w-5 text-ora-gold stroke-1" />
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Custom input */}
        <div className="pt-2 border-t border-ora-sand">
          <Label className="text-xs text-ora-graphite">Or enter custom days</Label>
          <div className="flex items-center gap-2 mt-2">
            <Input
              type="number"
              value={daysBefore}
              onChange={(e) => onChange({ ...config, daysBefore: Math.max(1, parseInt(e.target.value) || 1) })}
              min={1}
              max={365}
              className="w-24 bg-white"
            />
            <span className="text-sm text-ora-graphite">days before event</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0 stroke-1" />
        <p className="text-sm text-blue-700">
          The trigger will fire at 9:00 AM on the specified day. All guests in the event will be processed.
        </p>
      </div>
    </div>
  );
}

// Guest Tag Changed Config
function GuestTagChangedConfig({
  config,
  eventId,
  onChange,
}: {
  config: Record<string, unknown>;
  eventId: string;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const { data: tags = [], isLoading } = useGuestTagsByEvent(eventId);
  const selectedTagIds = (config.tagIds as string[]) || [];

  const toggleTag = useCallback(
    (tagId: string) => {
      const newTagIds = selectedTagIds.includes(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId];
      onChange({ ...config, tagIds: newTagIds });
    },
    [config, selectedTagIds, onChange]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Tag className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">Tag Change Trigger</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Trigger when specific tags are added to or removed from a guest.
      </p>

      <div className="space-y-3">
        <Label>Monitor Tags</Label>
        <p className="text-xs text-ora-graphite">
          Select which tags to monitor. Leave empty to trigger for any tag change.
        </p>

        {isLoading ? (
          <div className="text-center py-4 text-ora-graphite">Loading tags...</div>
        ) : tags.length === 0 ? (
          <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand text-center">
            <p className="text-sm text-ora-graphite">No tags available</p>
            <p className="text-xs text-ora-stone mt-1">Create tags in the event settings first</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-[250px] overflow-y-auto p-1">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedTagIds.includes(tag.id)
                    ? 'border-ora-gold bg-ora-gold/5 ring-2 ring-ora-gold/20'
                    : 'border-ora-sand hover:border-ora-gold/50 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="text-sm font-medium text-ora-charcoal truncate flex-1">
                    {tag.name}
                  </span>
                  {selectedTagIds.includes(tag.id) && (
                    <CheckCircle2 className="h-4 w-4 text-ora-gold flex-shrink-0 stroke-1" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand">
        <h4 className="text-sm font-medium text-ora-charcoal mb-2">Trigger Summary</h4>
        <p className="text-sm text-ora-graphite">
          {selectedTagIds.length === 0
            ? 'Will trigger when any tag is added or removed'
            : `Monitoring ${selectedTagIds.length} tag${selectedTagIds.length > 1 ? 's' : ''} for changes`}
        </p>
      </div>
    </div>
  );
}

// Scheduled Trigger Config
function ScheduledConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const cronExpression = (config.cronExpression as string) || '';
  const [isCustom, setIsCustom] = useState(
    cronExpression && !CRON_PRESETS.some(p => p.value === cronExpression)
  );

  const isValid = cronExpression ? isValidCronExpression(cronExpression) : true;
  const description = cronExpression && isValid ? getCronDescription(cronExpression) : '';

  const handlePresetSelect = (value: string) => {
    setIsCustom(false);
    onChange({ ...config, cronExpression: value });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Clock className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">Schedule Trigger</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Run this automation on a recurring schedule using cron expressions.
      </p>

      {/* Presets */}
      <div className="space-y-3">
        <Label>Schedule Presets</Label>
        <div className="space-y-2">
          {CRON_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => handlePresetSelect(preset.value)}
              className={`w-full p-4 rounded-lg border text-left transition-all ${
                cronExpression === preset.value && !isCustom
                  ? 'border-ora-gold bg-ora-gold/5 ring-2 ring-ora-gold/20'
                  : 'border-ora-sand hover:border-ora-gold/50 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-ora-charcoal">{preset.label}</span>
                  <p className="text-xs text-ora-graphite mt-0.5">{preset.description}</p>
                </div>
                {cronExpression === preset.value && !isCustom && (
                  <CheckCircle2 className="h-5 w-5 text-ora-gold stroke-1" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Cron */}
      <div className="space-y-3 pt-2 border-t border-ora-sand">
        <div className="flex items-center justify-between">
          <Label>Custom Schedule</Label>
          <button
            type="button"
            onClick={() => setIsCustom(true)}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              isCustom ? 'bg-ora-gold/10 text-ora-gold' : 'text-ora-graphite hover:bg-ora-cream'
            }`}
          >
            Use Custom
          </button>
        </div>
        
        {isCustom && (
          <div className="space-y-2">
            <Input
              value={cronExpression}
              onChange={(e) => onChange({ ...config, cronExpression: e.target.value })}
              placeholder="0 9 * * *"
              className={`font-mono bg-white ${!isValid && cronExpression ? 'border-red-300' : ''}`}
            />
            <p className="text-xs text-ora-graphite">
              Format: minute hour day-of-month month day-of-week
            </p>
            {!isValid && cronExpression && (
              <p className="text-xs text-red-500">Invalid cron expression</p>
            )}
          </div>
        )}
      </div>

      {/* Schedule Preview */}
      {description && (
        <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand">
          <h4 className="text-sm font-medium text-ora-charcoal mb-2">Schedule Preview</h4>
          <p className="text-sm text-ora-graphite">{description}</p>
          <code className="block mt-2 text-xs font-mono text-ora-stone bg-white px-2 py-1 rounded">
            {cronExpression}
          </code>
        </div>
      )}

      {/* Help */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0 stroke-1" />
        <div className="text-sm text-blue-700">
          <p className="font-medium mb-1">Cron Format Guide</p>
          <ul className="text-xs space-y-0.5">
            <li>• <code>*</code> = any value</li>
            <li>• <code>0 9 * * *</code> = 9:00 AM daily</li>
            <li>• <code>0 9 * * 1</code> = 9:00 AM every Monday</li>
            <li>• <code>0 9 1 * *</code> = 9:00 AM on 1st of month</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
