"use client";

import { useCallback } from 'react';
import {
  GitBranch,
  UserCheck,
  Tag,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Info,
  Phone,
  Crown,
} from 'lucide-react';
import {
  Label,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { useGuestTagsByEvent } from '@/hooks/use-guest-tags';

interface AdvancedConditionConfigProps {
  subType: string;
  config: Record<string, unknown>;
  eventId: string;
  onChange: (config: Record<string, unknown>) => void;
}

// RSVP status options
const RSVP_STATUSES = [
  { value: 'Pending', label: 'Pending', color: 'bg-gray-100 text-gray-700', description: 'Has not responded yet' },
  { value: 'Attending', label: 'Attending', color: 'bg-green-100 text-green-700', description: 'Confirmed attendance' },
  { value: 'Maybe', label: 'Maybe', color: 'bg-amber-100 text-amber-700', description: 'Tentative response' },
  { value: 'NotAttending', label: 'Not Attending', color: 'bg-red-100 text-red-700', description: 'Declined invitation' },
] as const;

// Guest field options
const GUEST_FIELDS = [
  { value: 'company', label: 'Company', description: 'Organization or company name' },
  { value: 'jobTitle', label: 'Job Title', description: 'Professional title or role' },
  { value: 'email', label: 'Email', description: 'Email address' },
  { value: 'phone', label: 'Phone', description: 'Phone number' },
] as const;

// Comparison operators
const OPERATORS = [
  { value: 'equals', label: 'Equals', description: 'Exact match' },
  { value: 'notEquals', label: 'Does Not Equal', description: 'Not an exact match' },
  { value: 'contains', label: 'Contains', description: 'Includes the text' },
  { value: 'startsWith', label: 'Starts With', description: 'Begins with the text' },
  { value: 'endsWith', label: 'Ends With', description: 'Ends with the text' },
  { value: 'isEmpty', label: 'Is Empty', description: 'Field has no value' },
  { value: 'isNotEmpty', label: 'Is Not Empty', description: 'Field has a value' },
] as const;

export function AdvancedConditionConfig({
  subType,
  config,
  eventId,
  onChange,
}: AdvancedConditionConfigProps) {
  switch (subType) {
    case 'check_rsvp_status':
      return <CheckRsvpStatusConfig config={config} onChange={onChange} />;
    case 'check_guest_tag':
      return <CheckGuestTagConfig config={config} eventId={eventId} onChange={onChange} />;
    case 'check_guest_field':
      return <CheckGuestFieldConfig config={config} onChange={onChange} />;
    case 'check_time_window':
      return <CheckTimeWindowConfig config={config} onChange={onChange} />;
    case 'whatsapp_opted_in':
      return <WhatsAppOptedInConfig config={config} onChange={onChange} />;
    case 'check_guest_tier':
      return <CheckGuestTierConfig config={config} onChange={onChange} />;
    default:
      return (
        <div className="text-center py-8 text-ora-graphite">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 stroke-1" />
          <p>Unknown condition type: {subType}</p>
        </div>
      );
  }
}

// Check RSVP Status Config
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
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <UserCheck className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">Check RSVP Status</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Continue the workflow only if the guest has one of the selected RSVP statuses.
      </p>

      <div className="space-y-3">
        <Label>Match Any of These Statuses</Label>
        
        <div className="space-y-2">
          {RSVP_STATUSES.map((status) => (
            <button
              key={status.value}
              type="button"
              onClick={() => toggleStatus(status.value)}
              className={`w-full p-4 rounded-lg border text-left transition-all ${
                statuses.includes(status.value)
                  ? 'border-ora-gold bg-ora-gold/5 ring-2 ring-ora-gold/20'
                  : 'border-ora-sand hover:border-ora-gold/50 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    status.value === 'Pending' ? 'bg-gray-400' :
                    status.value === 'Attending' ? 'bg-green-500' :
                    status.value === 'Maybe' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <div>
                    <span className="font-medium text-ora-charcoal">{status.label}</span>
                    <p className="text-xs text-ora-graphite">{status.description}</p>
                  </div>
                </div>
                {statuses.includes(status.value) && (
                  <CheckCircle2 className="h-5 w-5 text-ora-gold stroke-1" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Logic Preview */}
      <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand">
        <h4 className="text-sm font-medium text-ora-charcoal mb-2">Condition Logic</h4>
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-ora-graphite stroke-1" />
          <p className="text-sm text-ora-graphite">
            {statuses.length === 0
              ? 'Select at least one status'
              : statuses.length === 1
              ? `TRUE if guest status is "${statuses[0]}"`
              : `TRUE if guest status is any of: ${statuses.join(', ')}`}
          </p>
        </div>
      </div>
    </div>
  );
}

// Check Guest Tag Config
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
  const hasTag = config.hasTag !== false;

  const selectedTag = tags.find(t => t.id === tagId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Tag className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">Check Guest Tag</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Check if a guest has or doesn't have a specific tag.
      </p>

      {/* Condition Type */}
      <div className="space-y-3">
        <Label>Condition Type</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...config, hasTag: true })}
            className={`p-4 rounded-lg border text-center transition-all ${
              hasTag
                ? 'border-ora-gold bg-ora-gold/5 ring-2 ring-ora-gold/20'
                : 'border-ora-sand hover:border-ora-gold/50 bg-white'
            }`}
          >
            <CheckCircle2 className={`h-6 w-6 mx-auto mb-2 stroke-1 ${hasTag ? 'text-ora-gold' : 'text-ora-graphite'}`} />
            <span className="font-medium text-ora-charcoal">Has Tag</span>
            <p className="text-xs text-ora-graphite mt-1">Guest must have the tag</p>
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...config, hasTag: false })}
            className={`p-4 rounded-lg border text-center transition-all ${
              !hasTag
                ? 'border-ora-gold bg-ora-gold/5 ring-2 ring-ora-gold/20'
                : 'border-ora-sand hover:border-ora-gold/50 bg-white'
            }`}
          >
            <AlertCircle className={`h-6 w-6 mx-auto mb-2 stroke-1 ${!hasTag ? 'text-ora-gold' : 'text-ora-graphite'}`} />
            <span className="font-medium text-ora-charcoal">Does Not Have Tag</span>
            <p className="text-xs text-ora-graphite mt-1">Guest must not have the tag</p>
          </button>
        </div>
      </div>

      {/* Tag Selection */}
      <div className="space-y-3">
        <Label>Select Tag</Label>
        {isLoading ? (
          <div className="text-center py-4 text-ora-graphite">Loading tags...</div>
        ) : tags.length === 0 ? (
          <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand text-center">
            <p className="text-sm text-ora-graphite">No tags available</p>
            <p className="text-xs text-ora-stone mt-1">Create tags in the event settings first</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto p-1">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => onChange({ ...config, tagId: tag.id })}
                className={`p-3 rounded-lg border text-left transition-all ${
                  tagId === tag.id
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
                  {tagId === tag.id && (
                    <CheckCircle2 className="h-4 w-4 text-ora-gold flex-shrink-0 stroke-1" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Logic Preview */}
      {selectedTag && (
        <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand">
          <h4 className="text-sm font-medium text-ora-charcoal mb-2">Condition Logic</h4>
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-ora-graphite stroke-1" />
            <p className="text-sm text-ora-graphite">
              TRUE if guest {hasTag ? 'has' : 'does not have'} tag{' '}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: `${selectedTag.color}20`, color: selectedTag.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedTag.color }} />
                {selectedTag.name}
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Check Guest Field Config
function CheckGuestFieldConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const field = (config.field as string) || '';
  const operator = (config.operator as string) || 'equals';
  const value = (config.value as string) || '';

  const selectedField = GUEST_FIELDS.find(f => f.value === field);
  const selectedOperator = OPERATORS.find(o => o.value === operator);
  const showValueInput = !['isEmpty', 'isNotEmpty'].includes(operator);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <FileText className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">Check Guest Field</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Check a guest's profile field against a specific value or condition.
      </p>

      {/* Field Selection */}
      <div className="space-y-3">
        <Label>Guest Field</Label>
        <Select value={field} onValueChange={(v) => onChange({ ...config, field: v })}>
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Select a field to check" />
          </SelectTrigger>
          <SelectContent>
            {GUEST_FIELDS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                <div>
                  <span>{f.label}</span>
                  <span className="text-xs text-ora-graphite ml-2">({f.description})</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Operator Selection */}
      <div className="space-y-3">
        <Label>Comparison</Label>
        <div className="grid grid-cols-2 gap-2">
          {OPERATORS.map((op) => (
            <button
              key={op.value}
              type="button"
              onClick={() => onChange({ ...config, operator: op.value })}
              className={`p-3 rounded-lg border text-left transition-all ${
                operator === op.value
                  ? 'border-ora-gold bg-ora-gold/5 ring-2 ring-ora-gold/20'
                  : 'border-ora-sand hover:border-ora-gold/50 bg-white'
              }`}
            >
              <span className="text-sm font-medium text-ora-charcoal">{op.label}</span>
              <p className="text-xs text-ora-graphite mt-0.5">{op.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Value Input */}
      {showValueInput && (
        <div className="space-y-3">
          <Label>Value to Compare</Label>
          <Input
            value={value}
            onChange={(e) => onChange({ ...config, value: e.target.value })}
            placeholder={`Enter ${selectedField?.label.toLowerCase() || 'value'} to compare`}
            className="bg-white"
          />
        </div>
      )}

      {/* Logic Preview */}
      {field && (
        <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand">
          <h4 className="text-sm font-medium text-ora-charcoal mb-2">Condition Logic</h4>
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-ora-graphite stroke-1" />
            <p className="text-sm text-ora-graphite">
              TRUE if <span className="font-medium text-ora-charcoal">{selectedField?.label}</span>{' '}
              <span className="text-ora-gold">{selectedOperator?.label.toLowerCase()}</span>
              {showValueInput && value && (
                <> "<span className="font-medium text-ora-charcoal">{value}</span>"</>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Check Time Window Config
function CheckTimeWindowConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const startTime = (config.startTime as string) || '09:00';
  const endTime = (config.endTime as string) || '17:00';

  // Parse times for display
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  // Quick presets
  const presets = [
    { start: '09:00', end: '17:00', label: 'Business Hours (9-5)' },
    { start: '08:00', end: '20:00', label: 'Extended Hours (8-8)' },
    { start: '00:00', end: '12:00', label: 'Morning (12am-12pm)' },
    { start: '12:00', end: '23:59', label: 'Afternoon/Evening (12pm-12am)' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Clock className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">Check Time Window</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Only continue the workflow if the current time falls within the specified window.
      </p>

      {/* Quick Presets */}
      <div className="space-y-3">
        <Label>Quick Presets</Label>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange({ ...config, startTime: preset.start, endTime: preset.end })}
              className={`p-3 rounded-lg border text-left transition-all ${
                startTime === preset.start && endTime === preset.end
                  ? 'border-ora-gold bg-ora-gold/5 ring-2 ring-ora-gold/20'
                  : 'border-ora-sand hover:border-ora-gold/50 bg-white'
              }`}
            >
              <span className="text-sm font-medium text-ora-charcoal">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Time Range */}
      <div className="space-y-3">
        <Label>Custom Time Range</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-ora-graphite">Start Time</Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => onChange({ ...config, startTime: e.target.value })}
              className="bg-white"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-ora-graphite">End Time</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => onChange({ ...config, endTime: e.target.value })}
              className="bg-white"
            />
          </div>
        </div>
      </div>

      {/* Visual Timeline */}
      <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand">
        <h4 className="text-sm font-medium text-ora-charcoal mb-3">Time Window</h4>
        <div className="relative h-8 bg-white rounded-full border border-ora-sand overflow-hidden">
          {/* Active window */}
          <div
            className="absolute h-full bg-ora-gold/30"
            style={{
              left: `${(parseInt(startTime.split(':')[0]) / 24) * 100}%`,
              width: `${((parseInt(endTime.split(':')[0]) - parseInt(startTime.split(':')[0])) / 24) * 100}%`,
            }}
          />
          {/* Time markers */}
          <div className="absolute inset-0 flex justify-between px-2 items-center text-xs text-ora-graphite">
            <span>12am</span>
            <span>6am</span>
            <span>12pm</span>
            <span>6pm</span>
            <span>12am</span>
          </div>
        </div>
        <p className="text-sm text-ora-graphite mt-3 text-center">
          Active from <span className="font-medium text-ora-charcoal">{formatTime(startTime)}</span> to{' '}
          <span className="font-medium text-ora-charcoal">{formatTime(endTime)}</span>
        </p>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0 stroke-1" />
        <p className="text-sm text-blue-700">
          The condition will be TRUE if the automation runs during the specified time window. Times are based on your server's timezone.
        </p>
      </div>
    </div>
  );
}

// WhatsApp Opted-In Config
function WhatsAppOptedInConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const requireActiveSession = config.requireActiveSession !== false;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Phone className="h-5 w-5 text-green-600 stroke-1" />
        <h3 className="font-medium text-ora-charcoal">WhatsApp Opted In</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Check if the guest has an active WhatsApp conversation and can receive messages.
      </p>

      {/* Session Requirement */}
      <div className="space-y-3">
        <Label>Session Window</Label>
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...config, requireActiveSession: true })}
            className={`p-4 rounded-lg border text-left transition-all ${
              requireActiveSession
                ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                : 'border-ora-sand hover:border-green-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-ora-charcoal">Active Session Required</span>
                <p className="text-xs text-ora-graphite mt-1">
                  Guest must have messaged within the last 24 hours (free-form messages allowed)
                </p>
              </div>
              {requireActiveSession && <CheckCircle2 className="h-5 w-5 text-green-600 stroke-1" />}
            </div>
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...config, requireActiveSession: false })}
            className={`p-4 rounded-lg border text-left transition-all ${
              !requireActiveSession
                ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                : 'border-ora-sand hover:border-green-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-ora-charcoal">Any Conversation</span>
                <p className="text-xs text-ora-graphite mt-1">
                  Guest has any conversation record (may require template messages)
                </p>
              </div>
              {!requireActiveSession && <CheckCircle2 className="h-5 w-5 text-green-600 stroke-1" />}
            </div>
          </button>
        </div>
      </div>

      {/* Logic Preview */}
      <div className="p-4 bg-green-50 rounded-lg border border-green-200">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-green-700 stroke-1" />
          <p className="text-sm text-green-800">
            TRUE if guest {requireActiveSession ? 'has an active WhatsApp session (24h window)' : 'has any WhatsApp conversation'}
          </p>
        </div>
      </div>
    </div>
  );
}

// Check Guest Tier Config
const GUEST_TIERS = [
  { value: 'vip', label: 'VIP', color: 'bg-amber-100 text-amber-700 border-amber-200', description: 'Top-tier guests with premium treatment' },
  { value: 'premium', label: 'Premium', color: 'bg-purple-100 text-purple-700 border-purple-200', description: 'Elevated guest experience' },
  { value: 'standard', label: 'Standard', color: 'bg-gray-100 text-gray-700 border-gray-200', description: 'Regular guest tier' },
] as const;

function CheckGuestTierConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const tiers = (config.tiers as string[]) || [];

  const toggleTier = (tier: string) => {
    const newTiers = tiers.includes(tier)
      ? tiers.filter((t) => t !== tier)
      : [...tiers, tier];
    onChange({ ...config, tiers: newTiers });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Crown className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">Check Guest Tier</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Branch based on the guest's assigned tier level.
      </p>

      {/* Tier Selection */}
      <div className="space-y-3">
        <Label>Match Any of These Tiers</Label>
        <div className="space-y-2">
          {GUEST_TIERS.map((tier) => (
            <button
              key={tier.value}
              type="button"
              onClick={() => toggleTier(tier.value)}
              className={`w-full p-4 rounded-lg border text-left transition-all ${
                tiers.includes(tier.value)
                  ? 'border-ora-gold bg-ora-gold/5 ring-2 ring-ora-gold/20'
                  : 'border-ora-sand hover:border-ora-gold/50 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${tier.color}`}>
                    {tier.label}
                  </span>
                  <span className="text-sm text-ora-graphite">{tier.description}</span>
                </div>
                {tiers.includes(tier.value) && (
                  <CheckCircle2 className="h-5 w-5 text-ora-gold stroke-1" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Logic Preview */}
      <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-ora-graphite stroke-1" />
          <p className="text-sm text-ora-graphite">
            {tiers.length === 0
              ? 'Select at least one tier'
              : `TRUE if guest tier is ${tiers.join(' or ')}`}
          </p>
        </div>
      </div>
    </div>
  );
}
