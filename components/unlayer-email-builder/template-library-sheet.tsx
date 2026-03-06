'use client';

import { useState } from 'react';
import { FileText, Rocket, Home, Mail, Clock, Gift, Star, MessageSquare, Sparkles, Check } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { UNLAYER_TEMPLATES, type UnlayerTemplate } from '@/lib/email-templates/unlayer-templates';
import type { UnlayerDesignJson } from './unlayer-email-builder';

/**
 * Props for the TemplateLibrarySheet component
 */
export interface TemplateLibrarySheetProps {
  /** Whether the sheet is open */
  isOpen: boolean;
  /** Callback when the sheet should close */
  onClose: () => void;
  /** Callback when a template is selected */
  onSelectTemplate: (design: UnlayerDesignJson) => void;
}

/**
 * Get icon for template based on ID
 */
function getTemplateIcon(id: string) {
  const iconClass = "h-6 w-6 stroke-1";
  switch (id) {
    case 'blank':
      return <FileText className={iconClass} />;
    case 'project-launch':
      return <Rocket className={iconClass} />;
    case 'open-house':
      return <Home className={iconClass} />;
    case 'invitation':
      return <Mail className={iconClass} />;
    case 'reminder':
      return <Clock className={iconClass} />;
    case 'thank-you':
      return <Gift className={iconClass} />;
    case 'last-chance':
      return <Star className={iconClass} />;
    case 'event-day':
      return <Sparkles className={iconClass} />;
    case 'feedback':
      return <MessageSquare className={iconClass} />;
    default:
      return <FileText className={iconClass} />;
  }
}

/**
 * Get category for template
 */
function getTemplateCategory(template: UnlayerTemplate): string {
  switch (template.campaignType) {
    case 'Invitation':
    case 'OpenHouse':
      return 'Invitations';
    case 'Reminder':
    case 'LastChance':
      return 'Reminders';
    case 'Announcement':
      return 'Announcements';
    case 'ThankYou':
    case 'Feedback':
      return 'Follow-ups';
    case 'EventDayInfo':
      return 'Event Day';
    default:
      return 'General';
  }
}

/**
 * TemplateLibrarySheet Component
 * 
 * A slide-over sheet that displays available email templates for the user to choose from.
 * Uses shadcn Sheet component with 70% screen width.
 */
export function TemplateLibrarySheet({
  isOpen,
  onClose,
  onSelectTemplate,
}: TemplateLibrarySheetProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null);

  // Group templates by category
  const templatesByCategory = UNLAYER_TEMPLATES.reduce((acc, template) => {
    // Blank template goes first in its own category
    if (template.id === 'blank') {
      acc['Start Fresh'] = [template];
    } else {
      const category = getTemplateCategory(template);
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(template);
    }
    return acc;
  }, {} as Record<string, UnlayerTemplate[]>);

  // Sort categories with "Start Fresh" first
  const sortedCategories = Object.keys(templatesByCategory).sort((a, b) => {
    if (a === 'Start Fresh') return -1;
    if (b === 'Start Fresh') return 1;
    return a.localeCompare(b);
  });

  const handleSelectTemplate = (template: UnlayerTemplate) => {
    setSelectedTemplateId(template.id);
    onSelectTemplate(template.design);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[70vw] sm:max-w-none p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b border-ora-sand">
          <SheetTitle>Email Templates</SheetTitle>
          <SheetDescription>
            Choose a template to get started with your email design
          </SheetDescription>
        </SheetHeader>

        {/* Template Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {sortedCategories.map((category) => (
            <div key={category} className="mb-8 last:mb-0">
              <h3 className="text-sm font-semibold text-ora-graphite uppercase tracking-wider mb-4">
                {category}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templatesByCategory[category].map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    onMouseEnter={() => setHoveredTemplateId(template.id)}
                    onMouseLeave={() => setHoveredTemplateId(null)}
                    className={`
                      flex flex-col items-center p-6 rounded-xl border transition-all text-center
                      ${selectedTemplateId === template.id
                        ? 'border-ora-gold bg-ora-gold/5 ring-2 ring-ora-gold/20'
                        : hoveredTemplateId === template.id
                          ? 'border-ora-gold/50 bg-ora-cream/50 shadow-md'
                          : 'border-ora-sand bg-white hover:bg-ora-cream/30 hover:shadow-sm'
                      }
                    `}
                  >
                    {/* Icon */}
                    <div className={`
                      w-14 h-14 rounded-xl flex items-center justify-center mb-4
                      ${template.id === 'blank'
                        ? 'bg-ora-sand text-ora-graphite'
                        : 'bg-ora-gold/10 text-ora-gold'
                      }
                    `}>
                      {getTemplateIcon(template.id)}
                    </div>

                    {/* Content */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-ora-charcoal">
                        {template.name}
                      </span>
                      {selectedTemplateId === template.id && (
                        <Check className="h-4 w-4 text-ora-gold stroke-2" />
                      )}
                    </div>
                    <p className="text-sm text-ora-graphite line-clamp-2">
                      {template.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ora-sand bg-ora-cream/50">
          <p className="text-xs text-ora-graphite text-center">
            Templates include merge tags for personalization. Customize your design after selecting.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default TemplateLibrarySheet;
