"use client";

import { useCallback, useState, useRef, useEffect } from 'react';
import {
  Mail,
  Send,
  Tag,
  Clock,
  Globe,
  FileText,
  Paperclip,
  Bold,
  Italic,
  List,
  Link as LinkIcon,
  Variable,
  Eye,
  ChevronDown,
  Search,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Bot,
} from 'lucide-react';
import {
  Label,
  Input,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
} from '@/components/ui';
import { useGuestTagsByEvent } from '@/hooks/use-guest-tags';
import { useCampaignsByEvent } from '@/hooks/use-campaigns';

interface AdvancedActionConfigProps {
  subType: string;
  config: Record<string, unknown>;
  eventId: string;
  onChange: (config: Record<string, unknown>) => void;
}

// Template variables for email content
const EMAIL_VARIABLES = [
  { key: '{firstName}', label: 'First Name', example: 'John' },
  { key: '{lastName}', label: 'Last Name', example: 'Doe' },
  { key: '{email}', label: 'Email', example: 'john@example.com' },
  { key: '{eventName}', label: 'Event Name', example: 'Annual Gala' },
  { key: '{eventDate}', label: 'Event Date', example: 'March 15, 2026' },
  { key: '{eventLocation}', label: 'Event Location', example: 'Grand Ballroom' },
  { key: '{rsvpLink}', label: 'RSVP Link', example: 'https://...' },
  { key: '{badgeLink}', label: 'Badge Link', example: 'https://...' },
  { key: '{companyName}', label: 'Company', example: 'Acme Corp' },
] as const;

// Delay unit options
const DELAY_UNITS = [
  { value: 'minutes', label: 'Minutes', max: 60 },
  { value: 'hours', label: 'Hours', max: 72 },
  { value: 'days', label: 'Days', max: 30 },
] as const;

// HTTP methods
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH'] as const;

// Guest fields that can be updated
const GUEST_FIELDS = [
  { value: 'company', label: 'Company' },
  { value: 'jobTitle', label: 'Job Title' },
  { value: 'phone', label: 'Phone Number' },
  { value: 'notes', label: 'Notes' },
] as const;

export function AdvancedActionConfig({
  subType,
  config,
  eventId,
  onChange,
}: AdvancedActionConfigProps) {
  switch (subType) {
    case 'send_email':
      return <SendEmailConfig config={config} eventId={eventId} onChange={onChange} />;
    case 'send_campaign':
      return <SendCampaignConfig config={config} eventId={eventId} onChange={onChange} />;
    case 'add_guest_tag':
    case 'remove_guest_tag':
      return <GuestTagConfig subType={subType} config={config} eventId={eventId} onChange={onChange} />;
    case 'update_guest_field':
      return <UpdateGuestFieldConfig config={config} onChange={onChange} />;
    case 'wait_delay':
      return <WaitDelayConfig config={config} onChange={onChange} />;
    case 'send_webhook':
      return <SendWebhookConfig config={config} onChange={onChange} />;
    case 'send_whatsapp_message':
      return <SendWhatsAppMessageConfig config={config} eventId={eventId} onChange={onChange} />;
    case 'start_concierge':
      return <StartConciergeConfig config={config} onChange={onChange} />;
    default:
      return (
        <div className="text-center py-8 text-ora-graphite">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 stroke-1" />
          <p>Unknown action type: {subType}</p>
        </div>
      );
  }
}

// Rich Email Editor Component
function SendEmailConfig({
  config,
  eventId,
  onChange,
}: {
  config: Record<string, unknown>;
  eventId: string;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const subject = (config.subject as string) || '';
  const content = (config.content as string) || '';
  const attachments = (config.attachments as string[]) || [];
  const [showPreview, setShowPreview] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const insertVariable = useCallback((variable: string) => {
    if (editorRef.current) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (editorRef.current.contains(range.commonAncestorContainer)) {
          range.deleteContents();
          range.insertNode(document.createTextNode(variable));
          range.collapse(false);
          // Trigger content update
          onChange({ ...config, content: editorRef.current.innerHTML });
          return;
        }
      }
      // Fallback: append to end
      editorRef.current.innerHTML += variable;
      onChange({ ...config, content: editorRef.current.innerHTML });
    }
  }, [config, onChange]);

  const handleContentChange = useCallback(() => {
    if (editorRef.current) {
      onChange({ ...config, content: editorRef.current.innerHTML });
    }
  }, [config, onChange]);

  const applyFormat = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    handleContentChange();
  }, [handleContentChange]);

  // Preview with replaced variables
  const previewContent = content.replace(/\{(\w+)\}/g, (match) => {
    const variable = EMAIL_VARIABLES.find(v => v.key === match);
    return variable ? `<span class="bg-ora-gold/20 text-ora-gold px-1 rounded">${variable.example}</span>` : match;
  });

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Mail className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">Email Configuration</h3>
      </div>

      {/* Subject Line */}
      <div className="space-y-2">
        <Label className="flex items-center justify-between">
          <span>Subject Line</span>
          <span className="text-xs text-ora-graphite">{subject.length}/100</span>
        </Label>
        <Input
          value={subject}
          onChange={(e) => onChange({ ...config, subject: e.target.value })}
          placeholder="Enter email subject..."
          maxLength={100}
          className="bg-white"
        />
        <p className="text-xs text-ora-graphite">
          Use variables like {'{firstName}'} for personalization
        </p>
      </div>

      {/* Rich Text Editor */}
      <div className="space-y-2">
        <Label>Email Content</Label>
        
        {/* Toolbar */}
        <div className="flex items-center gap-1 p-2 bg-ora-cream rounded-t-lg border border-b-0 border-ora-sand">
          <button
            type="button"
            onClick={() => applyFormat('bold')}
            className="p-2 rounded hover:bg-ora-sand transition-colors"
            title="Bold"
          >
            <Bold className="h-4 w-4 stroke-1" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('italic')}
            className="p-2 rounded hover:bg-ora-sand transition-colors"
            title="Italic"
          >
            <Italic className="h-4 w-4 stroke-1" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('insertUnorderedList')}
            className="p-2 rounded hover:bg-ora-sand transition-colors"
            title="Bullet List"
          >
            <List className="h-4 w-4 stroke-1" />
          </button>
          <button
            type="button"
            onClick={() => {
              const url = prompt('Enter URL:');
              if (url) applyFormat('createLink', url);
            }}
            className="p-2 rounded hover:bg-ora-sand transition-colors"
            title="Insert Link"
          >
            <LinkIcon className="h-4 w-4 stroke-1" />
          </button>
          
          <div className="w-px h-6 bg-ora-sand mx-1" />
          
          <button
            type="button"
            onClick={() => setShowVariables(!showVariables)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
              showVariables ? 'bg-ora-gold/10 text-ora-gold' : 'hover:bg-ora-sand'
            }`}
          >
            <Variable className="h-4 w-4 stroke-1" />
            Variables
            <ChevronDown className={`h-3 w-3 transition-transform ${showVariables ? 'rotate-180' : ''}`} />
          </button>
          
          <div className="flex-1" />
          
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
              showPreview ? 'bg-ora-gold/10 text-ora-gold' : 'hover:bg-ora-sand'
            }`}
          >
            <Eye className="h-4 w-4 stroke-1" />
            Preview
          </button>
        </div>

        {/* Variables Panel */}
        {showVariables && (
          <div className="p-3 bg-ora-cream/50 border-x border-ora-sand">
            <p className="text-xs text-ora-graphite mb-2">Click to insert at cursor position</p>
            <div className="flex flex-wrap gap-1">
              {EMAIL_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  className="px-2 py-1 rounded text-xs font-mono bg-white border border-ora-sand hover:border-ora-gold hover:bg-ora-gold/5 transition-colors"
                  title={`${v.label}: ${v.example}`}
                >
                  {v.key}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Editor / Preview */}
        {showPreview ? (
          <div 
            className="min-h-[200px] p-4 bg-white border border-ora-sand rounded-b-lg prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: previewContent || '<p class="text-ora-graphite italic">No content yet...</p>' }}
          />
        ) : (
          <div
            ref={editorRef}
            contentEditable
            onInput={handleContentChange}
            onBlur={handleContentChange}
            className="min-h-[200px] p-4 bg-white border border-ora-sand rounded-b-lg focus:outline-none focus:ring-2 focus:ring-ora-gold focus:border-transparent prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>

      {/* Attachments */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 stroke-1" />
          Attachments
        </Label>
        <div className="p-4 border border-dashed border-ora-sand rounded-lg bg-ora-cream/30 text-center">
          <p className="text-sm text-ora-graphite">
            Drag files here or click to upload
          </p>
          <p className="text-xs text-ora-stone mt-1">
            Max 5MB per file • PDF, DOC, DOCX, PNG, JPG
          </p>
          <input
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          />
        </div>
        {attachments.length > 0 && (
          <div className="space-y-1">
            {attachments.map((file, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-ora-cream rounded text-sm">
                <FileText className="h-4 w-4 stroke-1" />
                <span className="flex-1 truncate">{file}</span>
                <button
                  type="button"
                  onClick={() => {
                    const newAttachments = attachments.filter((_, idx) => idx !== i);
                    onChange({ ...config, attachments: newAttachments });
                  }}
                  className="text-ora-graphite hover:text-red-500"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Send Campaign Config - Select from existing campaigns
function SendCampaignConfig({
  config,
  eventId,
  onChange,
}: {
  config: Record<string, unknown>;
  eventId: string;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const campaignId = (config.campaignId as string) || '';
  const [searchQuery, setSearchQuery] = useState('');
  const { data: campaigns = [], isLoading } = useCampaignsByEvent(eventId);

  const filteredCampaigns = campaigns.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCampaign = campaigns.find(c => c.id === campaignId);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Send className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">Campaign Selection</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Select an existing campaign to send when this action triggers. The campaign's email design and content will be used.
      </p>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ora-graphite stroke-1" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search campaigns..."
          className="pl-10 bg-white"
        />
      </div>

      {/* Campaign List */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-8 text-ora-graphite">Loading campaigns...</div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="text-center py-8 text-ora-graphite">
            {searchQuery ? 'No campaigns match your search' : 'No campaigns available'}
          </div>
        ) : (
          filteredCampaigns.map((campaign) => (
            <button
              key={campaign.id}
              type="button"
              onClick={() => onChange({ ...config, campaignId: campaign.id })}
              className={`w-full p-4 rounded-lg border text-left transition-all ${
                campaignId === campaign.id
                  ? 'border-ora-gold bg-ora-gold/5 ring-2 ring-ora-gold/20'
                  : 'border-ora-sand hover:border-ora-gold/50 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ora-charcoal truncate">
                      {campaign.name}
                    </span>
                    <Badge variant={campaign.status === 'Sent' ? 'success' : 'secondary'} className="text-xs">
                      {campaign.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-ora-graphite mt-1 truncate">
                    Subject: {campaign.subject}
                  </p>
                </div>
                {campaignId === campaign.id && (
                  <CheckCircle2 className="h-5 w-5 text-ora-gold flex-shrink-0 stroke-1" />
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Selected Campaign Preview */}
      {selectedCampaign && (
        <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand">
          <h4 className="text-sm font-medium text-ora-charcoal mb-2">Selected Campaign</h4>
          <div className="space-y-1 text-sm">
            <p><span className="text-ora-graphite">Name:</span> {selectedCampaign.name}</p>
            <p><span className="text-ora-graphite">Subject:</span> {selectedCampaign.subject}</p>
            <p><span className="text-ora-graphite">Status:</span> {selectedCampaign.status}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Guest Tag Config
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

  const selectedTag = tags.find(t => t.id === tagId);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Tag className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">
          {isAddTag ? 'Add Tag' : 'Remove Tag'}
        </h3>
      </div>

      <p className="text-sm text-ora-graphite">
        {isAddTag
          ? 'Select a tag to add to the guest when this action runs.'
          : 'Select a tag to remove from the guest when this action runs.'}
      </p>

      {/* Tag Selection */}
      <div className="space-y-2">
        <Label>Select Tag</Label>
        {isLoading ? (
          <div className="text-center py-4 text-ora-graphite">Loading tags...</div>
        ) : tags.length === 0 ? (
          <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand text-center">
            <p className="text-sm text-ora-graphite">No tags available</p>
            <p className="text-xs text-ora-stone mt-1">Create tags in the event settings first</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
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
                  <span className="text-sm font-medium text-ora-charcoal truncate">
                    {tag.name}
                  </span>
                  {tagId === tag.id && (
                    <CheckCircle2 className="h-4 w-4 text-ora-gold ml-auto stroke-1" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Tag Info */}
      {selectedTag && (
        <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand">
          <div className="flex items-center gap-2">
            <span
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: selectedTag.color }}
            />
            <span className="font-medium text-ora-charcoal">{selectedTag.name}</span>
          </div>
          <p className="text-xs text-ora-graphite mt-2">
            {isAddTag
              ? 'This tag will be added to guests when the automation runs.'
              : 'This tag will be removed from guests when the automation runs.'}
          </p>
        </div>
      )}
    </div>
  );
}

// Update Guest Field Config
function UpdateGuestFieldConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const field = (config.field as string) || '';
  const value = (config.value as string) || '';

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <FileText className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">Update Guest Field</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Update a specific field on the guest's profile when this action runs.
      </p>

      {/* Field Selection */}
      <div className="space-y-2">
        <Label>Field to Update</Label>
        <Select value={field} onValueChange={(v) => onChange({ ...config, field: v })}>
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Select a field" />
          </SelectTrigger>
          <SelectContent>
            {GUEST_FIELDS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* New Value */}
      <div className="space-y-2">
        <Label>New Value</Label>
        <Input
          value={value}
          onChange={(e) => onChange({ ...config, value: e.target.value })}
          placeholder="Enter the new value"
          className="bg-white"
        />
        <p className="text-xs text-ora-graphite">
          You can use variables like {'{eventName}'} in the value
        </p>
      </div>

      {/* Preview */}
      {field && value && (
        <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand">
          <h4 className="text-sm font-medium text-ora-charcoal mb-2">Action Preview</h4>
          <p className="text-sm text-ora-graphite">
            Set <span className="font-medium text-ora-charcoal">{GUEST_FIELDS.find(f => f.value === field)?.label}</span> to{' '}
            <span className="font-medium text-ora-charcoal">"{value}"</span>
          </p>
        </div>
      )}
    </div>
  );
}

// Wait/Delay Config
function WaitDelayConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const duration = (config.duration as number) || 1;
  const unit = (config.unit as string) || 'hours';

  const selectedUnit = DELAY_UNITS.find(u => u.value === unit);

  // Calculate total time in a readable format
  const getTotalTime = () => {
    if (unit === 'minutes') {
      if (duration >= 60) return `${Math.floor(duration / 60)}h ${duration % 60}m`;
      return `${duration} minute${duration !== 1 ? 's' : ''}`;
    }
    if (unit === 'hours') {
      if (duration >= 24) return `${Math.floor(duration / 24)}d ${duration % 24}h`;
      return `${duration} hour${duration !== 1 ? 's' : ''}`;
    }
    return `${duration} day${duration !== 1 ? 's' : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Clock className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">Wait Duration</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Pause the workflow for a specified duration before continuing to the next action.
      </p>

      {/* Duration Input */}
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 space-y-2">
            <Label>Duration</Label>
            <Input
              type="number"
              value={duration}
              onChange={(e) => onChange({ ...config, duration: Math.max(1, parseInt(e.target.value) || 1) })}
              min={1}
              max={selectedUnit?.max || 100}
              className="bg-white"
            />
          </div>
          <div className="flex-1 space-y-2">
            <Label>Unit</Label>
            <Select value={unit} onValueChange={(v) => onChange({ ...config, unit: v })}>
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELAY_UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="space-y-2">
          <Label className="text-xs text-ora-graphite">Quick Presets</Label>
          <div className="flex flex-wrap gap-2">
            {[
              { d: 30, u: 'minutes', label: '30 min' },
              { d: 1, u: 'hours', label: '1 hour' },
              { d: 24, u: 'hours', label: '24 hours' },
              { d: 1, u: 'days', label: '1 day' },
              { d: 3, u: 'days', label: '3 days' },
              { d: 7, u: 'days', label: '1 week' },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => onChange({ ...config, duration: preset.d, unit: preset.u })}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  duration === preset.d && unit === preset.u
                    ? 'border-ora-gold bg-ora-gold/10 text-ora-gold'
                    : 'border-ora-sand hover:border-ora-gold/50 bg-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="p-4 bg-ora-cream/50 rounded-lg border border-ora-sand">
        <div className="flex items-center gap-3">
          <Clock className="h-8 w-8 text-ora-gold stroke-1" />
          <div>
            <p className="font-medium text-ora-charcoal">Wait for {getTotalTime()}</p>
            <p className="text-xs text-ora-graphite">
              The workflow will pause before continuing to the next step
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Webhook Config
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
  const headers = (config.headers as Record<string, string>) || {};
  const [showHeaders, setShowHeaders] = useState(Object.keys(headers).length > 0);

  const addHeader = () => {
    const newHeaders = { ...headers, '': '' };
    onChange({ ...config, headers: newHeaders });
    setShowHeaders(true);
  };

  const updateHeader = (oldKey: string, newKey: string, value: string) => {
    const newHeaders = { ...headers };
    if (oldKey !== newKey) delete newHeaders[oldKey];
    newHeaders[newKey] = value;
    onChange({ ...config, headers: newHeaders });
  };

  const removeHeader = (key: string) => {
    const newHeaders = { ...headers };
    delete newHeaders[key];
    onChange({ ...config, headers: newHeaders });
  };

  // Validate URL
  const isValidUrl = url.startsWith('http://') || url.startsWith('https://');

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Globe className="h-5 w-5 text-ora-gold stroke-1" />
        <h3 className="font-medium text-ora-charcoal">Webhook Configuration</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Send data to an external service when this action triggers.
      </p>

      {/* URL */}
      <div className="space-y-2">
        <Label>Webhook URL</Label>
        <Input
          value={url}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
          placeholder="https://api.example.com/webhook"
          className={`bg-white ${url && !isValidUrl ? 'border-red-300' : ''}`}
        />
        {url && !isValidUrl && (
          <p className="text-xs text-red-500">URL must start with http:// or https://</p>
        )}
      </div>

      {/* Method */}
      <div className="space-y-2">
        <Label>HTTP Method</Label>
        <div className="flex gap-2">
          {HTTP_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...config, method: m })}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                method === m
                  ? 'border-ora-gold bg-ora-gold/10 text-ora-gold'
                  : 'border-ora-sand hover:border-ora-gold/50 bg-white'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Headers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Headers</Label>
          <Button type="button" variant="outline" size="sm" onClick={addHeader}>
            Add Header
          </Button>
        </div>
        {showHeaders && Object.entries(headers).map(([key, value], i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={key}
              onChange={(e) => updateHeader(key, e.target.value, value)}
              placeholder="Header name"
              className="flex-1 bg-white"
            />
            <Input
              value={value}
              onChange={(e) => updateHeader(key, key, e.target.value)}
              placeholder="Value"
              className="flex-1 bg-white"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeHeader(key)}
              className="text-red-500 hover:text-red-600"
            >
              ×
            </Button>
          </div>
        ))}
      </div>

      {/* Payload */}
      <div className="space-y-2">
        <Label>Payload (JSON)</Label>
        <textarea
          value={payload}
          onChange={(e) => onChange({ ...config, payload: e.target.value })}
          placeholder={`{
  "guestId": "{guestId}",
  "eventName": "{eventName}",
  "action": "automation_triggered"
}`}
          className="w-full min-h-[150px] px-3 py-2 text-sm font-mono rounded-lg border border-ora-sand bg-white focus:outline-none focus:ring-2 focus:ring-ora-gold focus:border-transparent resize-y"
        />
        <p className="text-xs text-ora-graphite">
          Use template variables like {'{guestId}'}, {'{eventName}'}, etc.
        </p>
      </div>

      {/* Test Button */}
      <Button type="button" variant="outline" className="w-full" disabled={!isValidUrl}>
        <Globe className="h-4 w-4 stroke-1" />
        Test Webhook
      </Button>
    </div>
  );
}

// WhatsApp Message Config
function SendWhatsAppMessageConfig({
  config,
  eventId,
  onChange,
}: {
  config: Record<string, unknown>;
  eventId: string;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const messageType = (config.messageType as string) || 'text';
  const messageContent = (config.messageContent as string) || '';
  const templateName = (config.templateName as string) || '';

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <MessageSquare className="h-5 w-5 text-green-600 stroke-1" />
        <h3 className="font-medium text-ora-charcoal">WhatsApp Message</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Send a WhatsApp message to the guest. Requires an active WhatsApp channel configured for the event.
      </p>

      {/* Message Type */}
      <div className="space-y-2">
        <Label>Message Type</Label>
        <div className="flex gap-2">
          {[
            { value: 'text', label: 'Text Message' },
            { value: 'template', label: 'Template Message' },
          ].map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => onChange({ ...config, messageType: type.value })}
              className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                messageType === type.value
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-ora-sand hover:border-green-300 bg-white'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ora-graphite">
          {messageType === 'template'
            ? 'Template messages can be sent outside the 24-hour session window'
            : 'Text messages require an active session (guest messaged within 24 hours)'}
        </p>
      </div>

      {messageType === 'text' ? (
        <div className="space-y-2">
          <Label>Message Content</Label>
          <textarea
            value={messageContent}
            onChange={(e) => onChange({ ...config, messageContent: e.target.value })}
            placeholder="Hello {firstName}, thank you for attending {eventName}!"
            className="w-full min-h-[120px] px-3 py-2 text-sm rounded-lg border border-ora-sand bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y"
          />
          <p className="text-xs text-ora-graphite">
            Supports variables: {'{firstName}'}, {'{lastName}'}, {'{eventName}'}, {'{eventDate}'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Template Name</Label>
          <Input
            value={templateName}
            onChange={(e) => onChange({ ...config, templateName: e.target.value })}
            placeholder="e.g., event_reminder, welcome_message"
            className="bg-white"
          />
          <p className="text-xs text-ora-graphite">
            Enter the Meta-approved WhatsApp template name configured in your Business Account
          </p>
        </div>
      )}

      {/* Preview */}
      {(messageContent || templateName) && (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-4 w-4 text-green-600 stroke-1" />
            <span className="text-sm font-medium text-green-800">Message Preview</span>
          </div>
          <div className="bg-white rounded-lg p-3 text-sm text-ora-charcoal shadow-sm">
            {messageType === 'text'
              ? messageContent || 'No message content'
              : `Template: ${templateName || 'Not configured'}`}
          </div>
        </div>
      )}
    </div>
  );
}

// Start Concierge Config
function StartConciergeConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const greeting = (config.greeting as string) || '';
  const escalationThreshold = (config.escalationThreshold as number) || 0.5;
  const maxMessages = (config.maxMessages as number) || 20;

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-ora-sand">
        <Bot className="h-5 w-5 text-purple-600 stroke-1" />
        <h3 className="font-medium text-ora-charcoal">AI Concierge Configuration</h3>
      </div>

      <p className="text-sm text-ora-graphite">
        Start an AI-powered concierge conversation via WhatsApp. Uses Claude AI to answer guest questions about the event.
      </p>

      {/* Greeting Message */}
      <div className="space-y-2">
        <Label>Initial Greeting (optional)</Label>
        <textarea
          value={greeting}
          onChange={(e) => onChange({ ...config, greeting: e.target.value })}
          placeholder="Hello {firstName}! I'm your AI concierge for {eventName}. How can I help you?"
          className="w-full min-h-[100px] px-3 py-2 text-sm rounded-lg border border-ora-sand bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
        />
        <p className="text-xs text-ora-graphite">
          Sent to the guest when the concierge starts. Leave empty to skip the greeting.
        </p>
      </div>

      {/* Escalation Threshold */}
      <div className="space-y-2">
        <Label>Escalation Threshold</Label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.1"
            value={escalationThreshold}
            onChange={(e) => onChange({ ...config, escalationThreshold: parseFloat(e.target.value) })}
            className="flex-1 accent-purple-600"
          />
          <span className="text-sm font-medium w-12 text-center">{escalationThreshold}</span>
        </div>
        <p className="text-xs text-ora-graphite">
          Confidence below this level triggers escalation to a human. Lower = more escalations.
        </p>
      </div>

      {/* Max Messages */}
      <div className="space-y-2">
        <Label>Max Conversation Messages</Label>
        <Input
          type="number"
          value={maxMessages}
          onChange={(e) => onChange({ ...config, maxMessages: parseInt(e.target.value) || 20 })}
          min={5}
          max={100}
          className="bg-white"
        />
        <p className="text-xs text-ora-graphite">
          Maximum messages before automatically escalating to human support.
        </p>
      </div>

      {/* Info Box */}
      <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
        <div className="flex items-start gap-2">
          <Bot className="h-5 w-5 text-purple-600 mt-0.5 stroke-1" />
          <div>
            <p className="text-sm font-medium text-purple-800">AI Concierge Features</p>
            <ul className="text-xs text-purple-700 mt-1 space-y-1">
              <li>• Uses event knowledge base for accurate answers</li>
              <li>• Tier-aware tone (VIP, Premium, Standard)</li>
              <li>• Phase-aware responses (pre, during, post-event)</li>
              <li>• Automatic escalation on low confidence</li>
              <li>• Powered by Claude AI via Azure AI</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
