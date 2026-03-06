"use client";

import { useCallback } from 'react';
import { Label, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { useGuestTagsByEvent } from '@/hooks/use-guest-tags';

interface ConditionConfigFormProps {
  subType: string;
  config: Record<string, unknown>;
  eventId: string;
  onChange: (config: Record<string, unknown>) => void;
}

// RSVP status options for condition
const RSVP_STATUS_OPTIONS = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Attending', label: 'Attending' },
  { value: 'Maybe', label: 'Maybe' },
  { value: 'NotAttending', label: 'Not Attending' },
] as const;

// Guest field options
const GUEST_FIELD_OPTIONS = [
  { value: 'company', label: 'Company' },
  { value: 'jobTitle', label: 'Job Title' },
] as const;

// Comparison operators
const OPERATOR_OPTIONS = [
  { value: 'equals', label: 'Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'isEmpty', label: 'Is Empty' },
] as const;

export function ConditionConfigForm({
  subType,
  config,
  eventId,
  onChange,
}: ConditionConfigFormProps) {
  switch (subType) {
    case 'check_rsvp_status':
      return (
        <CheckRsvpStatusConfig
          config={config}
          onChange={onChange}
        />
      );
    case 'check_guest_tag':
      return (
        <CheckGuestTagConfig
          config={config}
          eventId={eventId}
          onChange={onChange}
        />
      );
    case 'check_guest_field':
      return (
        <CheckGuestFieldConfig
          config={config}
          onChange={onChange}
        />
      );
    case 'check_time_window':
      return (
        <CheckTimeWindowConfig
          config={config}
          onChange={onChange}
        />
      );
    case 'whatsapp_opted_in':
      return (
        <div className="text-sm text-ora-graphite p-3 bg-green-50 rounded border border-green-200">
          <p className="font-medium text-green-800">WhatsApp Opted In</p>
          <p className="text-xs mt-1">Checks if guest has an active WhatsApp session. Configure in advanced panel.</p>
        </div>
      );
    case 'check_guest_tier':
      return (
        <div className="text-sm text-ora-graphite p-3 bg-amber-50 rounded border border-amber-200">
          <p className="font-medium text-amber-800">Guest Tier Check</p>
          <p className="text-xs mt-1">Checks guest tier (VIP, Premium, Standard). Configure in advanced panel.</p>
        </div>
      );
    default:
      return (
        <div className="text-sm text-ora-graphite">
          Unknown condition type: {subType}
        </div>
      );
  }
}

// Check RSVP Status configuration
// Requirements: 3.3
function CheckRsvpStatusConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const statuses = (config.statuses as string[]) || [];

  const toggleStatus = useCallback(
    (status: string) => {
      const newStatuses = statuses.includes(status)
        ? statuses.filter((s) => s !== status)
        : [...statuses, status];
      onChange({ ...config, statuses: newStatuses });
    },
    [config, statuses, onChange]
  );

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Condition Configuration</h4>
      
      <div className="space-y-2">
        <Label>Match RSVP Status</Label>
        <p className="text-xs text-ora-graphite mb-2">
          Condition is TRUE if guest has any of the selected statuses
        </p>
        <div className="space-y-2">
          {RSVP_STATUS_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={statuses.includes(option.value)}
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

// Check Guest Tag configuration
function CheckGuestTagConfig({
  config,
  eventId,
  onChange,
}: {
  config: Record<string, unknown>;
  eventId: string;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const { data: tags = [], isLoading } = useGuestTagsByEvent(eventId);
  const tagId = (config.tagId as string) || '';
  const hasTag = config.hasTag !== false; // Default to true

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-ora-charcoal">Condition Configuration</h4>
        <div className="text-sm text-ora-graphite">Loading tags...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Condition Configuration</h4>
      
      <div className="space-y-2">
        <Label>Select Tag</Label>
        {tags.length === 0 ? (
          <p className="text-sm text-ora-graphite italic">
            No tags created yet. Create tags in the event settings.
          </p>
        ) : (
          <Select
            value={tagId}
            onValueChange={(value) => onChange({ ...config, tagId: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a tag" />
            </SelectTrigger>
            <SelectContent>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-2">
        <Label>Condition</Label>
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ ...config, hasTag: true })}
            className={`
              flex-1 p-2 rounded border text-sm transition-colors
              ${hasTag
                ? 'border-ora-gold bg-ora-gold/10 text-ora-charcoal'
                : 'border-ora-sand hover:border-ora-gold text-ora-graphite'
              }
            `}
          >
            Has Tag
          </button>
          <button
            onClick={() => onChange({ ...config, hasTag: false })}
            className={`
              flex-1 p-2 rounded border text-sm transition-colors
              ${!hasTag
                ? 'border-ora-gold bg-ora-gold/10 text-ora-charcoal'
                : 'border-ora-sand hover:border-ora-gold text-ora-graphite'
              }
            `}
          >
            Does Not Have Tag
          </button>
        </div>
      </div>
    </div>
  );
}

// Check Guest Field configuration
// Requirements: 3.4
function CheckGuestFieldConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const field = (config.field as string) || 'company';
  const operator = (config.operator as string) || 'equals';
  const value = (config.value as string) || '';

  const showValueInput = operator !== 'isEmpty';

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Condition Configuration</h4>
      
      <div className="space-y-2">
        <Label>Guest Field</Label>
        <Select
          value={field}
          onValueChange={(value) => onChange({ ...config, field: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select field" />
          </SelectTrigger>
          <SelectContent>
            {GUEST_FIELD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Operator</Label>
        <Select
          value={operator}
          onValueChange={(value) => onChange({ ...config, operator: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select operator" />
          </SelectTrigger>
          <SelectContent>
            {OPERATOR_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showValueInput && (
        <div className="space-y-2">
          <Label>Value</Label>
          <Input
            value={value}
            onChange={(e) => onChange({ ...config, value: e.target.value })}
            placeholder="Enter value to compare"
          />
        </div>
      )}

      <p className="text-xs text-ora-graphite">
        Condition is TRUE if the guest's {field} {operator === 'isEmpty' ? 'is empty' : `${operator} "${value}"`}
      </p>
    </div>
  );
}

// Check Time Window configuration
// Requirements: 3.5
function CheckTimeWindowConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const startTime = (config.startTime as string) || '09:00';
  const endTime = (config.endTime as string) || '17:00';

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Condition Configuration</h4>
      
      <div className="space-y-2">
        <Label>Start Time</Label>
        <Input
          type="time"
          value={startTime}
          onChange={(e) => onChange({ ...config, startTime: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>End Time</Label>
        <Input
          type="time"
          value={endTime}
          onChange={(e) => onChange({ ...config, endTime: e.target.value })}
        />
      </div>

      <p className="text-xs text-ora-graphite">
        Condition is TRUE if current time is between {startTime} and {endTime}
      </p>
    </div>
  );
}
