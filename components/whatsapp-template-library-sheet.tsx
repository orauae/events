'use client'

/**
 * WhatsApp Starter Template Library Sheet
 *
 * Browsable gallery of local starter templates that pre-fill the WhatsApp
 * composer body. Works WITHOUT a Meta channel — these are local-only starters,
 * not Meta-synced templates.
 *
 * Pattern mirrors components/unlayer-email-builder/template-library-sheet.tsx.
 */

import { useState } from 'react'
import {
  Mail,
  Clock,
  Gift,
  Star,
  MessageSquare,
  Sparkles,
  Info,
  Check,
  ImageIcon,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  WHATSAPP_TEMPLATES,
  type WhatsAppTemplate,
} from '@/lib/whatsapp-templates'

// ============================================================================
// TYPES
// ============================================================================

export interface WhatsAppTemplateLibrarySheetProps {
  /** Whether the sheet is open */
  isOpen: boolean
  /** Callback when the sheet should close */
  onClose: () => void
  /** Callback when a starter template is selected — receives the body text */
  onSelectTemplate: (template: WhatsAppTemplate) => void
}

// ============================================================================
// HELPERS
// ============================================================================

const CATEGORY_LABELS: Record<string, string> = {
  invitation: 'Invitations',
  reminder: 'Reminders',
  lastchance: 'Last Chance',
  thankyou: 'Follow-ups',
  feedback: 'Follow-ups',
  info: 'Event Day',
}

const CATEGORY_ORDER = [
  'Invitations',
  'Reminders',
  'Last Chance',
  'Follow-ups',
  'Event Day',
]

function getTemplateIcon(category: string) {
  const cls = 'h-6 w-6 stroke-1'
  switch (category) {
    case 'invitation':
      return <Mail className={cls} />
    case 'reminder':
      return <Clock className={cls} />
    case 'lastchance':
      return <Star className={cls} />
    case 'thankyou':
      return <Gift className={cls} />
    case 'feedback':
      return <MessageSquare className={cls} />
    case 'info':
      return <Sparkles className={cls} />
    default:
      return <Mail className={cls} />
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function WhatsAppTemplateLibrarySheet({
  isOpen,
  onClose,
  onSelectTemplate,
}: WhatsAppTemplateLibrarySheetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Group templates by display category
  const grouped = WHATSAPP_TEMPLATES.reduce(
    (acc, t) => {
      const label = CATEGORY_LABELS[t.category] ?? 'General'
      if (!acc[label]) acc[label] = []
      acc[label].push(t)
      return acc
    },
    {} as Record<string, WhatsAppTemplate[]>,
  )

  // Sort categories in defined order
  const sortedCategories = CATEGORY_ORDER.filter((c) => grouped[c])

  const handleSelect = (template: WhatsAppTemplate) => {
    setSelectedId(template.id)
    onSelectTemplate(template)
    onClose()
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-[70vw] sm:max-w-none p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b border-ora-sand">
          <SheetTitle>Starter Templates</SheetTitle>
          <SheetDescription>
            Choose a template to pre-fill your WhatsApp message. You can
            customise the text after selecting.
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
                {grouped[category].map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleSelect(template)}
                    onMouseEnter={() => setHoveredId(template.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`
                      flex flex-col items-center p-6 rounded-xl border transition-all text-center
                      ${
                        selectedId === template.id
                          ? 'border-ora-gold bg-ora-gold/5 ring-2 ring-ora-gold/20'
                          : hoveredId === template.id
                            ? 'border-ora-gold/50 bg-ora-cream/50 shadow-md'
                            : 'border-ora-sand bg-white hover:bg-ora-cream/30 hover:shadow-sm'
                      }
                    `}
                  >
                    {/* Icon */}
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 bg-ora-gold/10 text-ora-gold">
                      {getTemplateIcon(template.category)}
                    </div>

                    {/* Name + badges */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-ora-charcoal">
                        {template.name}
                      </span>
                      {selectedId === template.id && (
                        <Check className="h-4 w-4 text-ora-gold stroke-2" />
                      )}
                      {template.hasImage && (
                        <ImageIcon className="h-3.5 w-3.5 text-ora-graphite/50 stroke-1" />
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-sm text-ora-graphite line-clamp-2">
                      {template.description}
                    </p>

                    {/* Body preview (first 80 chars) */}
                    <p className="mt-3 text-xs text-ora-graphite/70 line-clamp-2 font-mono leading-relaxed">
                      {template.body.slice(0, 80)}
                      {template.body.length > 80 ? '…' : ''}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ora-sand bg-ora-cream/50">
          <div className="flex items-center justify-center gap-2 text-xs text-ora-graphite">
            <Info className="h-3.5 w-3.5 stroke-1" />
            <span>
              Placeholders {'{{1}}'}-{'{{4}}'} are auto-filled with guest & event data when sent.
            </span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default WhatsAppTemplateLibrarySheet
