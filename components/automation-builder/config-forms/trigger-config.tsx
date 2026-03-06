"use client";

import { useCallback, useState, useMemo } from 'react';
import { Label, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { useGuestTagsByEvent } from '@/hooks/use-guest-tags';
import { isValidCronExpression, getCronDescription } from '@/lib/utils/cron-validator';

interface TriggerConfigFormProps {
  subType: string;
  config: Record<string, unknown>;
  eventId: string;
  onChange: (config: Record<string, unknown>) => void;
}

// RSVP status options
const RSVP_STATUS_OPTIONS = [
  { value: 'Attending', label: 'Attending' },
  { value: 'Maybe', label: 'Maybe' },
  { value: 'NotAttending', label: 'Not Attending' },
] as const;

// Days before event options
const DAYS_BEFORE_OPTIONS = [
  { value: 1, label: '1 day before' },
  { value: 3, label: '3 days before' },
  { value: 7, label: '7 days before' },
  { value: 14, label: '14 days before' },
  { value: 30, label: '30 days before' },
] as const;

export function TriggerConfigForm({
  subType,
  config,
  eventId,
  onChange,
}: TriggerConfigFormProps) {
  switch (subType) {
    case 'guest_rsvp_received':
      return (
        <GuestRsvpReceivedConfig
          config={config}
          onChange={onChange}
        />
      );
    case 'event_date_approaching':
      return (
        <EventDateApproachingConfig
          config={config}
          onChange={onChange}
        />
      );
    case 'guest_tag_changed':
      return (
        <GuestTagChangedConfig
          config={config}
          eventId={eventId}
          onChange={onChange}
        />
      );
    case 'scheduled':
      return (
        <ScheduledTriggerConfig
          config={config}
          onChange={onChange}
        />
      );
    case 'guest_checked_in':
    case 'campaign_sent':
    case 'guest_added_to_event':
    case 'whatsapp_message_received':
    case 'concierge_escalated':
      return (
        <NoConfigRequired subType={subType} />
      );
    default:
      return (
        <div className="text-sm text-ora-graphite">
          Unknown trigger type: {subType}
        </div>
      );
  }
}

// Guest RSVP Received configuration
// Requirements: 2.2
function GuestRsvpReceivedConfig({
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
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Trigger Configuration</h4>
      
      <div className="space-y-2">
        <Label>Filter by RSVP Status (optional)</Label>
        <p className="text-xs text-ora-graphite mb-2">
          Leave empty to trigger for all RSVP responses
        </p>
        <div className="space-y-2">
          {RSVP_STATUS_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={rsvpStatuses.includes(option.value)}
                onChange={() => toggleStatus(option.value)}
                className="rounded border-ora-sand text-ora-gold focus:ring-ora-gold"
              />
              <span className="text-sm text-ora-charcoal">{option.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// Event Date Approaching configuration
// Requirements: 2.3
function EventDateApproachingConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const daysBefore = (config.daysBefore as number) || 7;

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Trigger Configuration</h4>
      
      <div className="space-y-2">
        <Label>Days Before Event</Label>
        <Select
          value={String(daysBefore)}
          onValueChange={(value) => onChange({ ...config, daysBefore: parseInt(value) })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select days before" />
          </SelectTrigger>
          <SelectContent>
            {DAYS_BEFORE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-ora-graphite">
          Trigger will fire this many days before the event date
        </p>
      </div>
    </div>
  );
}

// Guest Tag Changed configuration
// Requirements: 2.4
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-ora-charcoal">Trigger Configuration</h4>
        <div className="text-sm text-ora-graphite">Loading tags...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Trigger Configuration</h4>
      
      <div className="space-y-2">
        <Label>Monitor Tags</Label>
        <p className="text-xs text-ora-graphite mb-2">
          Select which tags to monitor for changes
        </p>
        {tags.length === 0 ? (
          <p className="text-sm text-ora-graphite italic">
            No tags created yet. Create tags in the event settings.
          </p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {tags.map((tag) => (
              <label
                key={tag.id}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedTagIds.includes(tag.id)}
                  onChange={() => toggleTag(tag.id)}
                  className="rounded border-ora-sand text-ora-gold focus:ring-ora-gold"
                />
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
                  style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// No configuration required message
function NoConfigRequired({ subType }: { subType: string }) {
  const messages: Record<string, string> = {
    guest_checked_in: 'This trigger fires when any guest checks in. No additional configuration needed.',
    campaign_sent: 'This trigger fires when any campaign is sent. No additional configuration needed.',
    guest_added_to_event: 'This trigger fires when a new guest is added to the event. No additional configuration needed.',
  };

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Trigger Configuration</h4>
      <p className="text-sm text-ora-graphite">
        {messages[subType] || 'No configuration required for this trigger.'}
      </p>
    </div>
  );
}

// Cron preset options
// Requirements: 4.3, 8.3
const CRON_PRESETS = [
  { value: '0 9 * * *', label: 'Daily at 9am' },
  { value: '0 9 * * 1', label: 'Weekly on Monday' },
  { value: '0 9 1 * *', label: 'First of month' },
  { value: 'custom', label: 'Custom' },
] as const;

// Scheduled Trigger configuration
// Requirements: 4.2, 4.3, 8.2, 8.3, 8.4, 8.5, 8.6
function ScheduledTriggerConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const cronExpression = (config.cronExpression as string) || '';
  
  // Determine if current cron matches a preset
  const currentPreset = useMemo(() => {
    const preset = CRON_PRESETS.find(p => p.value === cronExpression);
    return preset ? preset.value : (cronExpression ? 'custom' : '');
  }, [cronExpression]);

  const [isCustom, setIsCustom] = useState(currentPreset === 'custom');

  const handlePresetChange = useCallback(
    (value: string) => {
      if (value === 'custom') {
        setIsCustom(true);
        // Keep existing cron if switching to custom
      } else {
        setIsCustom(false);
        onChange({ ...config, cronExpression: value });
      }
    },
    [config, onChange]
  );

  const handleCustomCronChange = useCallback(
    (value: string) => {
      onChange({ ...config, cronExpression: value });
    },
    [config, onChange]
  );

  const isValid = cronExpression ? isValidCronExpression(cronExpression) : true;
  const description = cronExpression && isValid ? getCronDescription(cronExpression) : '';

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Trigger Configuration</h4>
      
      <div className="space-y-2">
        <Label>Schedule</Label>
        <Select
          value={isCustom ? 'custom' : currentPreset}
          onValueChange={handlePresetChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a schedule" />
          </SelectTrigger>
          <SelectContent>
            {CRON_PRESETS.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isCustom && (
        <div className="space-y-2">
          <Label>Cron Expression</Label>
          <Input
            value={cronExpression}
            onChange={(e) => handleCustomCronChange(e.target.value)}
            placeholder="0 9 * * *"
            className={!isValid && cronExpression ? 'border-red-500' : ''}
          />
          <p className="text-xs text-ora-graphite">
            Format: minute hour day-of-month month day-of-week
          </p>
          {!isValid && cronExpression && (
            <p className="text-xs text-red-500">
              Invalid cron expression. Please check the format.
            </p>
          )}
        </div>
      )}

      {description && (
        <div className="p-3 bg-ora-sand/30 rounded-md">
          <p className="text-sm text-ora-charcoal">
            <span className="font-medium">Schedule: </span>
            {description}
          </p>
        </div>
      )}

      {!cronExpression && (
        <p className="text-xs text-ora-graphite">
          Select a preset or enter a custom cron expression to define when this automation runs.
        </p>
      )}
    </div>
  );
}
