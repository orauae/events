"use client";

import { useCallback } from 'react';
import { Label, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { useGuestTagsByEvent } from '@/hooks/use-guest-tags';

interface ActionConfigFormProps {
  subType: string;
  config: Record<string, unknown>;
  eventId: string;
  onChange: (config: Record<string, unknown>) => void;
}

// Wait delay unit options
const DELAY_UNIT_OPTIONS = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
] as const;

// HTTP method options
const HTTP_METHOD_OPTIONS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
] as const;

// Template variables for email content
const EMAIL_VARIABLES = [
  { name: '{guestFirstName}', description: 'Guest first name' },
  { name: '{guestLastName}', description: 'Guest last name' },
  { name: '{guestEmail}', description: 'Guest email' },
  { name: '{eventName}', description: 'Event name' },
  { name: '{eventDate}', description: 'Event date' },
  { name: '{eventLocation}', description: 'Event location' },
  { name: '{rsvpLink}', description: 'RSVP link' },
  { name: '{badgeLink}', description: 'Badge download link' },
] as const;

export function ActionConfigForm({
  subType,
  config,
  eventId,
  onChange,
}: ActionConfigFormProps) {
  switch (subType) {
    case 'send_email':
      return (
        <SendEmailConfig
          config={config}
          onChange={onChange}
        />
      );
    case 'send_campaign':
      return (
        <SendCampaignConfig
          config={config}
          onChange={onChange}
        />
      );
    case 'add_guest_tag':
    case 'remove_guest_tag':
      return (
        <GuestTagConfig
          subType={subType}
          config={config}
          eventId={eventId}
          onChange={onChange}
        />
      );
    case 'update_guest_field':
      return (
        <UpdateGuestFieldConfig
          config={config}
          onChange={onChange}
        />
      );
    case 'wait_delay':
      return (
        <WaitDelayConfig
          config={config}
          onChange={onChange}
        />
      );
    case 'send_webhook':
      return (
        <SendWebhookConfig
          config={config}
          onChange={onChange}
        />
      );
    case 'send_whatsapp_message':
      return (
        <div className="text-sm text-ora-graphite p-3 bg-green-50 rounded border border-green-200">
          <p className="font-medium text-green-800">WhatsApp Message</p>
          <p className="text-xs mt-1">Use the advanced config panel to configure WhatsApp messaging.</p>
        </div>
      );
    case 'start_concierge':
      return (
        <div className="text-sm text-ora-graphite p-3 bg-purple-50 rounded border border-purple-200">
          <p className="font-medium text-purple-800">AI Concierge</p>
          <p className="text-xs mt-1">Use the advanced config panel to configure the AI concierge.</p>
        </div>
      );
    default:
      return (
        <div className="text-sm text-ora-graphite">
          Unknown action type: {subType}
        </div>
      );
  }
}

// Send Email configuration
// Requirements: 4.2
function SendEmailConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const subject = (config.subject as string) || '';
  const content = (config.content as string) || '';

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Action Configuration</h4>
      
      <div className="space-y-2">
        <Label>Email Subject</Label>
        <Input
          value={subject}
          onChange={(e) => onChange({ ...config, subject: e.target.value })}
          placeholder="Enter email subject"
        />
      </div>

      <div className="space-y-2">
        <Label>Email Content</Label>
        <textarea
          value={content}
          onChange={(e) => onChange({ ...config, content: e.target.value })}
          placeholder="Enter email content..."
          className="w-full min-h-[120px] px-3 py-2 text-sm rounded-md border border-ora-sand bg-white focus:outline-none focus:ring-2 focus:ring-ora-gold focus:border-transparent resize-y"
        />
      </div>

      {/* Template variables */}
      <div className="space-y-2">
        <Label>Available Variables</Label>
        <p className="text-xs text-ora-graphite mb-2">
          Click to copy, then paste into subject or content
        </p>
        <div className="flex flex-wrap gap-1">
          {EMAIL_VARIABLES.map((v) => (
            <button
              key={v.name}
              onClick={() => navigator.clipboard.writeText(v.name)}
              className="px-2 py-1 rounded text-xs font-mono bg-ora-cream text-ora-charcoal hover:bg-ora-sand transition-colors"
              title={v.description}
            >
              {v.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Send Campaign configuration
function SendCampaignConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const campaignId = (config.campaignId as string) || '';

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Action Configuration</h4>
      
      <div className="space-y-2">
        <Label>Campaign ID</Label>
        <Input
          value={campaignId}
          onChange={(e) => onChange({ ...config, campaignId: e.target.value })}
          placeholder="Enter campaign ID"
        />
        <p className="text-xs text-ora-graphite">
          Enter the ID of an existing campaign to send
        </p>
      </div>
    </div>
  );
}

// Add/Remove Guest Tag configuration
// Requirements: 4.4
function GuestTagConfig({
  subType,
  config,
  eventId,
  onChange,
}: {
  subType: string;
  config: Record<string, unknown>;
  eventId: string;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const { data: tags = [], isLoading } = useGuestTagsByEvent(eventId);
  const tagId = (config.tagId as string) || '';

  const isAddTag = subType === 'add_guest_tag';

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-ora-charcoal">Action Configuration</h4>
        <div className="text-sm text-ora-graphite">Loading tags...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Action Configuration</h4>
      
      <div className="space-y-2">
        <Label>{isAddTag ? 'Tag to Add' : 'Tag to Remove'}</Label>
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
        <p className="text-xs text-ora-graphite">
          {isAddTag
            ? 'This tag will be added to the guest when this action runs'
            : 'This tag will be removed from the guest when this action runs'}
        </p>
      </div>
    </div>
  );
}

// Update Guest Field configuration
function UpdateGuestFieldConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const field = (config.field as string) || '';
  const value = (config.value as string) || '';

  const FIELD_OPTIONS = [
    { value: 'company', label: 'Company' },
    { value: 'jobTitle', label: 'Job Title' },
  ];

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Action Configuration</h4>
      
      <div className="space-y-2">
        <Label>Field to Update</Label>
        <Select
          value={field}
          onValueChange={(value) => onChange({ ...config, field: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select field" />
          </SelectTrigger>
          <SelectContent>
            {FIELD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>New Value</Label>
        <Input
          value={value}
          onChange={(e) => onChange({ ...config, value: e.target.value })}
          placeholder="Enter new value"
        />
      </div>
    </div>
  );
}

// Wait/Delay configuration
// Requirements: 4.3
function WaitDelayConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const duration = (config.duration as number) || 1;
  const unit = (config.unit as string) || 'hours';

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Action Configuration</h4>
      
      <div className="space-y-2">
        <Label>Wait Duration</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            value={duration}
            onChange={(e) => onChange({ ...config, duration: parseInt(e.target.value) || 1 })}
            min={1}
            className="w-24"
          />
          <Select
            value={unit}
            onValueChange={(value) => onChange({ ...config, unit: value })}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              {DELAY_UNIT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-ora-graphite">
          Workflow will pause for {duration} {unit} before continuing
        </p>
      </div>
    </div>
  );
}

// Send Webhook configuration
// Requirements: 4.5
function SendWebhookConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const url = (config.url as string) || '';
  const method = (config.method as string) || 'POST';
  const payload = (config.payload as string) || '';

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-ora-charcoal">Action Configuration</h4>
      
      <div className="space-y-2">
        <Label>Webhook URL</Label>
        <Input
          value={url}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
          placeholder="https://example.com/webhook"
        />
      </div>

      <div className="space-y-2">
        <Label>HTTP Method</Label>
        <Select
          value={method}
          onValueChange={(value) => onChange({ ...config, method: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select method" />
          </SelectTrigger>
          <SelectContent>
            {HTTP_METHOD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Payload Template (JSON)</Label>
        <textarea
          value={payload}
          onChange={(e) => onChange({ ...config, payload: e.target.value })}
          placeholder='{"guestId": "{guestId}", "event": "{eventName}"}'
          className="w-full min-h-[80px] px-3 py-2 text-sm font-mono rounded-md border border-ora-sand bg-white focus:outline-none focus:ring-2 focus:ring-ora-gold focus:border-transparent resize-y"
        />
        <p className="text-xs text-ora-graphite">
          Use template variables like {'{guestId}'}, {'{eventName}'}, etc.
        </p>
      </div>
    </div>
  );
}
