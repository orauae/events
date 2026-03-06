"use client"

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Variable, Copy, Check, Info, Eye } from 'lucide-react';
import { Button } from '@/components/ui';

// Extended template variables with categories, examples, and detailed descriptions
export const TEMPLATE_STRINGS = [
  { 
    key: '{firstName}', 
    label: 'First Name', 
    description: "Recipient's first name",
    detailedDescription: "Inserts the first name of the email recipient. Falls back to 'Guest' if not available.",
    example: 'John',
    category: 'recipient'
  },
  { 
    key: '{lastName}', 
    label: 'Last Name', 
    description: "Recipient's last name",
    detailedDescription: "Inserts the last name of the email recipient. May be empty if not provided.",
    example: 'Doe',
    category: 'recipient'
  },
  { 
    key: '{email}', 
    label: 'Email', 
    description: "Recipient's email address",
    detailedDescription: "Inserts the email address of the recipient. Useful for account-related communications.",
    example: 'john.doe@example.com',
    category: 'recipient'
  },
  { 
    key: '{companyName}', 
    label: 'Company', 
    description: "Recipient's company",
    detailedDescription: "Inserts the company or organization name associated with the recipient.",
    example: 'Acme Corp',
    category: 'recipient'
  },
  { 
    key: '{jobTitle}', 
    label: 'Job Title', 
    description: "Recipient's job title",
    detailedDescription: "Inserts the professional title or role of the recipient.",
    example: 'Software Engineer',
    category: 'recipient'
  },
  { 
    key: '{eventName}', 
    label: 'Event Name', 
    description: 'Name of the event',
    detailedDescription: "Inserts the full name of the event this campaign is associated with.",
    example: 'Annual Conference 2026',
    category: 'event'
  },
  { 
    key: '{eventDate}', 
    label: 'Event Date', 
    description: 'Date of the event',
    detailedDescription: "Inserts the formatted date of the event. Automatically formatted for readability.",
    example: 'Saturday, March 15, 2026',
    category: 'event'
  },
  { 
    key: '{eventLocation}', 
    label: 'Event Location', 
    description: 'Location of the event',
    detailedDescription: "Inserts the venue or location where the event will take place.",
    example: 'Grand Ballroom, NYC',
    category: 'event'
  },
  { 
    key: '{rsvpLink}', 
    label: 'RSVP Link', 
    description: 'Personalized RSVP link',
    detailedDescription: "Generates a unique, trackable RSVP link for each recipient. Clicking this link will be tracked for analytics.",
    example: 'https://example.com/rsvp/abc123',
    category: 'links'
  },
  { 
    key: '{badgeLink}', 
    label: 'Badge Link', 
    description: 'Link to download badge',
    detailedDescription: "Generates a unique link for the recipient to download their event badge or ticket.",
    example: 'https://example.com/badge/abc123',
    category: 'links'
  },
  { 
    key: '{unsubscribeLink}', 
    label: 'Unsubscribe Link', 
    description: 'Unsubscribe link',
    detailedDescription: "Required for compliance. Allows recipients to opt-out of future emails. Always include this in your emails.",
    example: 'https://example.com/unsubscribe/abc123',
    category: 'links'
  },
] as const;

export type TemplateString = typeof TEMPLATE_STRINGS[number];

const CATEGORIES = [
  { id: 'recipient', label: 'Recipient' },
  { id: 'event', label: 'Event' },
  { id: 'links', label: 'Links' },
] as const;

interface TemplateStringPickerProps {
  onInsert: (variable: string) => void;
  position?: 'dropdown' | 'popover';
  triggerClassName?: string;
  disabled?: boolean;
}

export function TemplateStringPicker({
  onInsert,
  position = 'dropdown',
  triggerClassName = '',
  disabled = false,
}: TemplateStringPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [hoveredVariable, setHoveredVariable] = useState<TemplateString | null>(null);
  const [showPreviewPanel, setShowPreviewPanel] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleInsert = (variable: string) => {
    onInsert(variable);
    setCopiedKey(variable);
    setTimeout(() => setCopiedKey(null), 1500);
    // Keep dropdown open for multiple insertions
  };

  const filteredVariables = selectedCategory
    ? TEMPLATE_STRINGS.filter(v => v.category === selectedCategory)
    : TEMPLATE_STRINGS;

  return (
    <div ref={containerRef} className="relative inline-block">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`gap-1 ${triggerClassName}`}
      >
        <Variable className="h-4 w-4" />
        <span>Insert Variable</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div
          className={`
            absolute z-50 mt-1 rounded-lg border border-ora-sand bg-ora-white shadow-lg
            ${position === 'popover' ? 'right-0' : 'left-0'}
            ${showPreviewPanel ? 'w-[480px]' : 'w-80'}
          `}
        >
          {/* Header with preview toggle */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-ora-sand bg-ora-cream/50">
            <span className="text-xs font-medium text-ora-charcoal">Template Variables</span>
            <button
              onClick={() => setShowPreviewPanel(!showPreviewPanel)}
              className={`
                flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors
                ${showPreviewPanel 
                  ? 'bg-ora-gold/10 text-ora-gold' 
                  : 'text-ora-graphite hover:bg-ora-cream'
                }
              `}
              title={showPreviewPanel ? 'Hide preview panel' : 'Show preview panel'}
            >
              <Eye className="h-3 w-3" />
              Preview
            </button>
          </div>

          {/* Category tabs */}
          <div className="flex border-b border-ora-sand p-1 gap-1">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`
                px-3 py-1.5 text-xs font-medium rounded transition-colors
                ${selectedCategory === null
                  ? 'bg-ora-gold/10 text-ora-gold'
                  : 'text-ora-graphite hover:bg-ora-cream'
                }
              `}
            >
              All
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`
                  px-3 py-1.5 text-xs font-medium rounded transition-colors
                  ${selectedCategory === cat.id
                    ? 'bg-ora-gold/10 text-ora-gold'
                    : 'text-ora-graphite hover:bg-ora-cream'
                  }
                `}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex">
            {/* Variables list */}
            <div className={`max-h-72 overflow-y-auto p-2 ${showPreviewPanel ? 'w-1/2 border-r border-ora-sand' : 'w-full'}`}>
              <div className="space-y-1">
                {filteredVariables.map((variable) => (
                  <button
                    key={variable.key}
                    onClick={() => handleInsert(variable.key)}
                    onMouseEnter={() => setHoveredVariable(variable)}
                    onMouseLeave={() => setHoveredVariable(null)}
                    className={`
                      w-full flex items-start gap-2 p-2 rounded-md text-left
                      hover:bg-ora-cream transition-colors group
                      ${hoveredVariable?.key === variable.key ? 'bg-ora-cream' : ''}
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-ora-charcoal bg-ora-sand/50 px-1.5 py-0.5 rounded">
                          {variable.key}
                        </code>
                        {copiedKey === variable.key && (
                          <span className="text-xs text-green-600 flex items-center gap-0.5">
                            <Check className="h-3 w-3" />
                            Inserted
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ora-graphite mt-1 line-clamp-1">
                        {variable.description}
                      </p>
                    </div>
                    <Copy className="h-3 w-3 text-ora-stone opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
                  </button>
                ))}
              </div>
            </div>

            {/* Preview panel */}
            {showPreviewPanel && (
              <div className="w-1/2 p-3 bg-ora-cream/30">
                {hoveredVariable ? (
                  <div className="space-y-3">
                    {/* Variable name and label */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-sm font-mono font-semibold text-ora-charcoal bg-ora-sand px-2 py-1 rounded">
                          {hoveredVariable.key}
                        </code>
                      </div>
                      <p className="text-sm font-medium text-ora-charcoal">
                        {hoveredVariable.label}
                      </p>
                    </div>

                    {/* Detailed description */}
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <Info className="h-3 w-3 text-ora-graphite" />
                        <span className="text-xs font-medium text-ora-graphite uppercase">Description</span>
                      </div>
                      <p className="text-xs text-ora-charcoal leading-relaxed">
                        {hoveredVariable.detailedDescription}
                      </p>
                    </div>

                    {/* Preview example */}
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <Eye className="h-3 w-3 text-ora-graphite" />
                        <span className="text-xs font-medium text-ora-graphite uppercase">Preview</span>
                      </div>
                      <div className="bg-ora-white border border-ora-sand rounded p-2">
                        <p className="text-sm text-ora-charcoal">
                          <span className="text-ora-stone">When sent: </span>
                          <span className="font-medium text-ora-gold">{hoveredVariable.example}</span>
                        </p>
                      </div>
                    </div>

                    {/* Usage example */}
                    <div>
                      <span className="text-xs font-medium text-ora-graphite uppercase">Example Usage</span>
                      <div className="bg-ora-charcoal rounded p-2 mt-1">
                        <code className="text-xs text-ora-cream">
                          Hello {hoveredVariable.key}!
                        </code>
                      </div>
                      <div className="text-xs text-ora-graphite mt-1 flex items-center gap-1">
                        <span>→</span>
                        <span>Hello <span className="text-ora-gold font-medium">{hoveredVariable.example}</span>!</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-8">
                    <Variable className="h-8 w-8 text-ora-stone mb-2" />
                    <p className="text-sm text-ora-graphite">
                      Hover over a variable to see its description and preview
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t border-ora-sand px-3 py-2 bg-ora-cream/30">
            <p className="text-xs text-ora-graphite">
              Click a variable to insert it • Variables are replaced with real data when sending
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact inline picker for use in toolbars
interface InlineTemplatePickerProps {
  onInsert: (variable: string) => void;
  className?: string;
}

export function InlineTemplatePicker({ onInsert, className = '' }: InlineTemplatePickerProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [hoveredVar, setHoveredVar] = useState<TemplateString | null>(null);

  const handleClick = (variable: string) => {
    onInsert(variable);
    setCopied(variable);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex flex-wrap gap-1">
        {TEMPLATE_STRINGS.map((v) => (
          <button
            key={v.key}
            onClick={() => handleClick(v.key)}
            onMouseEnter={() => setHoveredVar(v)}
            onMouseLeave={() => setHoveredVar(null)}
            className={`
              px-2 py-1 rounded text-xs font-mono transition-colors relative
              ${copied === v.key
                ? 'bg-green-100 text-green-700'
                : 'bg-ora-cream text-ora-charcoal hover:bg-ora-sand'
              }
            `}
          >
            {copied === v.key ? '✓' : v.key}
          </button>
        ))}
      </div>
      
      {/* Hover tooltip with description and preview */}
      {hoveredVar && (
        <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-ora-charcoal text-ora-cream rounded-lg shadow-lg z-50">
          <div className="space-y-2">
            <div>
              <code className="text-sm font-mono text-ora-gold">{hoveredVar.key}</code>
              <p className="text-xs text-ora-cream/80 mt-1">{hoveredVar.description}</p>
            </div>
            <div className="border-t border-ora-cream/20 pt-2">
              <p className="text-xs text-ora-cream/60 mb-1">Preview:</p>
              <p className="text-sm text-ora-gold">{hoveredVar.example}</p>
            </div>
          </div>
          {/* Tooltip arrow */}
          <div className="absolute top-full left-4 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-ora-charcoal" />
        </div>
      )}
    </div>
  );
}


// Helper function to replace template strings with sample data for preview
export function replaceTemplateStrings(content: string, sampleData?: Partial<Record<string, string>>): string {
  const defaults: Record<string, string> = {};
  TEMPLATE_STRINGS.forEach(v => {
    defaults[v.key] = v.example;
  });

  const data = { ...defaults, ...sampleData };
  
  let result = content;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      // Simple string replacement - escape curly braces for regex
      const pattern = key.replace('{', '\\{').replace('}', '\\}');
      result = result.replace(new RegExp(pattern, 'g'), value);
    }
  }
  
  return result;
}

// Helper to highlight template strings in content
export function highlightTemplateStrings(content: string): string {
  const templateRegex = /\{[a-zA-Z]+\}/g;
  return content.replace(
    templateRegex,
    (match) => `<span class="bg-ora-gold/20 text-ora-gold px-0.5 rounded font-mono text-sm">${match}</span>`
  );
}
