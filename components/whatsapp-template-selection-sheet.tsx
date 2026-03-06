"use client"

/**
 * WhatsApp Template Selection Sheet
 *
 * A side-drawer (80% viewport width) for browsing, searching, filtering,
 * and selecting cached WhatsApp message templates. The left panel shows
 * a filterable list with favorites pinned at the top; the right panel
 * renders a live WhatsApp-style preview of the highlighted template.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

import { useState, useMemo } from "react"
import {
  Search,
  Star,
  MessageCircle,
  ChevronLeft,
  Phone,
  Video,
  MoreVertical,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Input,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui"
import {
  useWhatsAppTemplates,
  useToggleTemplateFavorite,
  useWhatsAppTemplateFavorites,
} from "@/hooks/use-whatsapp-templates"
import type { WhatsAppTemplate } from "@/db/schema"
import type { TemplateComponent } from "@/lib/utils/whatsapp-template-utils"
import { replacePlaceholders } from "@/lib/utils/whatsapp-template-utils"

// ============================================================================
// TYPES
// ============================================================================

interface WhatsAppTemplateSelectionSheetProps {
  channelId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (template: WhatsAppTemplate) => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_BADGE_MAP: Record<string, { variant: "success" | "warning" | "danger" | "outline" | "info"; label: string }> = {
  APPROVED: { variant: "success", label: "Approved" },
  PENDING: { variant: "warning", label: "Pending" },
  REJECTED: { variant: "danger", label: "Rejected" },
  PAUSED: { variant: "info", label: "Paused" },
  DISABLED: { variant: "outline", label: "Disabled" },
}

const CATEGORY_LABELS: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utility",
  AUTHENTICATION: "Authentication",
}

const SAMPLE_VALUES: Record<number, string> = {
  1: "Sarah",
  2: "Annual Gala 2026",
  3: "March 15, 2026",
  4: "Grand Ballroom",
}

// ============================================================================
// HELPER: Get body text from template components
// ============================================================================

function getTemplateBodyText(components: unknown): string {
  if (!Array.isArray(components)) return ""
  const body = components.find(
    (c: TemplateComponent) => c.type === "BODY",
  ) as TemplateComponent | undefined
  return body?.text ?? ""
}

function getTemplateHeaderText(components: unknown): string {
  if (!Array.isArray(components)) return ""
  const header = components.find(
    (c: TemplateComponent) => c.type === "HEADER",
  ) as TemplateComponent | undefined
  return header?.text ?? ""
}

function getTemplateFooterText(components: unknown): string {
  if (!Array.isArray(components)) return ""
  const footer = components.find(
    (c: TemplateComponent) => c.type === "FOOTER",
  ) as TemplateComponent | undefined
  return footer?.text ?? ""
}

// ============================================================================
// PREVIEW COMPONENTS (reusing patterns from whatsapp-preview.tsx)
// ============================================================================

function PreviewPhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto" style={{ width: 320, maxWidth: "100%" }}>
      <div className="rounded-[2rem] border-[3px] border-gray-800 bg-gray-800 overflow-hidden shadow-2xl">
        <div className="flex justify-center bg-gray-800 pt-2 pb-1">
          <div className="w-20 h-5 bg-gray-900 rounded-full" />
        </div>
        <div className="bg-[#efeae2]" style={{ height: 480 }}>
          {children}
        </div>
        <div className="flex justify-center bg-gray-800 py-2">
          <div className="w-28 h-1 bg-gray-600 rounded-full" />
        </div>
      </div>
    </div>
  )
}

function PreviewHeader() {
  return (
    <div className="flex items-center gap-2 px-2 py-2 bg-[#075e54]">
      <ChevronLeft className="h-5 w-5 text-white stroke-1" />
      <div className="w-8 h-8 rounded-full bg-[#25d366] flex items-center justify-center flex-shrink-0">
        <MessageCircle className="h-4 w-4 text-white stroke-1" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">ORA Events</p>
        <p className="text-green-200 text-[11px]">online</p>
      </div>
      <div className="flex items-center gap-3 text-white">
        <Video className="h-4 w-4 stroke-1" />
        <Phone className="h-4 w-4 stroke-1" />
        <MoreVertical className="h-4 w-4 stroke-1" />
      </div>
    </div>
  )
}

function PreviewBubble({ text }: { text: string }) {
  const now = new Date()
  const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`

  return (
    <div className="flex justify-start px-3">
      <div className="relative max-w-[85%] bg-white rounded-lg rounded-tl-none shadow-sm">
        <div
          className="absolute -left-2 top-0 w-0 h-0"
          style={{
            borderTop: "8px solid white",
            borderLeft: "8px solid transparent",
          }}
        />
        <div className="px-2 pt-1.5 pb-1">
          <div className="text-[14px] leading-[19px] text-gray-900 whitespace-pre-wrap">
            {text}
          </div>
          <div className="flex justify-end mt-0.5">
            <span className="text-[11px] text-gray-500">{time}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TEMPLATE LIST ITEM
// ============================================================================

function TemplateListItem({
  template,
  isFavorite,
  isSelected,
  onToggleFavorite,
  onHover,
  onClick,
}: {
  template: WhatsAppTemplate
  isFavorite: boolean
  isSelected: boolean
  onToggleFavorite: () => void
  onHover: () => void
  onClick: () => void
}) {
  const statusInfo = STATUS_BADGE_MAP[template.status] ?? {
    variant: "outline" as const,
    label: template.status,
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      className={`w-full text-left px-3 py-3 border-b border-ora-sand transition-colors hover:bg-ora-cream/50 ${
        isSelected ? "bg-ora-cream" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite()
          }}
          className="mt-0.5 flex-shrink-0"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star
            className={`h-4 w-4 stroke-1 ${
              isFavorite
                ? "fill-ora-gold text-ora-gold"
                : "text-ora-stone hover:text-ora-gold"
            }`}
          />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ora-charcoal truncate">
            {template.name}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {CATEGORY_LABELS[template.category] ?? template.category}
            </Badge>
            <Badge variant={statusInfo.variant} className="text-[10px] px-1.5 py-0">
              {statusInfo.label}
            </Badge>
            <span className="text-[10px] text-ora-graphite">
              {template.language}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ============================================================================
// TEMPLATE PREVIEW PANEL
// ============================================================================

function TemplatePreviewPanel({ template }: { template: WhatsAppTemplate | null }) {
  if (!template) {
    return (
      <div className="flex items-center justify-center h-full text-ora-graphite text-sm">
        Select a template to preview
      </div>
    )
  }

  const bodyText = getTemplateBodyText(template.components)
  const headerText = getTemplateHeaderText(template.components)
  const footerText = getTemplateFooterText(template.components)

  const previewBody = replacePlaceholders(bodyText, SAMPLE_VALUES)
  const previewHeader = replacePlaceholders(headerText, SAMPLE_VALUES)
  const previewFooter = replacePlaceholders(footerText, SAMPLE_VALUES)

  const fullPreview = [previewHeader, previewBody, previewFooter]
    .filter(Boolean)
    .join("\n\n")

  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
      <div className="mb-3 text-center">
        <p className="text-sm font-medium text-ora-charcoal">{template.name}</p>
        <p className="text-xs text-ora-graphite">{template.language}</p>
      </div>
      <PreviewPhoneFrame>
        <PreviewHeader />
        <div
          className="overflow-auto p-3 space-y-2"
          style={{
            height: 480 - 52,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8c4be' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        >
          <div className="flex justify-center mb-2">
            <span className="bg-white/80 text-gray-600 text-[11px] px-3 py-1 rounded-lg shadow-sm">
              Today
            </span>
          </div>
          <PreviewBubble text={fullPreview || "(Empty template)"} />
        </div>
      </PreviewPhoneFrame>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function WhatsAppTemplateSelectionSheet({
  channelId,
  open,
  onOpenChange,
  onSelect,
}: WhatsAppTemplateSelectionSheetProps) {
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null)

  const { data: templates = [], isLoading } = useWhatsAppTemplates(channelId)
  const { data: favoriteIds = [] } = useWhatsAppTemplateFavorites()
  const toggleFavorite = useToggleTemplateFavorite()

  // Client-side filtering for responsiveness (Req 5.3, 5.4)
  const filteredTemplates = useMemo(() => {
    const favoriteSet = new Set(favoriteIds)

    let result = templates.filter((t) => !t.isDeleted)

    // Search filter (case-insensitive name match)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((t) => t.name.toLowerCase().includes(q))
    }

    // Category filter
    if (categoryFilter !== "all") {
      result = result.filter((t) => t.category === categoryFilter)
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((t) => t.status === statusFilter)
    }

    // Sort: favorites first, then alphabetical within each group (Req 5.7)
    result.sort((a, b) => {
      const aFav = favoriteSet.has(a.id) ? 0 : 1
      const bFav = favoriteSet.has(b.id) ? 0 : 1
      if (aFav !== bFav) return aFav - bFav
      return a.name.localeCompare(b.name)
    })

    return result
  }, [templates, favoriteIds, search, categoryFilter, statusFilter])

  const handleSelect = (template: WhatsAppTemplate) => {
    onSelect(template)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        width="80%"
        className="p-0 flex flex-col max-w-[1200px]"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-ora-stone">
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 stroke-1 text-[#25d366]" />
            Select Template
          </SheetTitle>
          <SheetDescription>
            Choose a WhatsApp message template to use
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left panel: filters + template list */}
          <div className="w-[45%] border-r border-ora-stone flex flex-col">
            {/* Search */}
            <div className="p-3 space-y-2 border-b border-ora-sand">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ora-stone stroke-1" />
                <Input
                  placeholder="Search templates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-9 text-xs flex-1">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="UTILITY">Utility</SelectItem>
                    <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 text-xs flex-1">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                    <SelectItem value="PAUSED">Paused</SelectItem>
                    <SelectItem value="DISABLED">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Template list */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="p-4 text-center text-sm text-ora-graphite">
                  Loading templates...
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="p-4 text-center text-sm text-ora-graphite">
                  No templates found
                </div>
              ) : (
                filteredTemplates.map((template) => (
                  <TemplateListItem
                    key={template.id}
                    template={template}
                    isFavorite={favoriteIds.includes(template.id)}
                    isSelected={selectedTemplate?.id === template.id}
                    onToggleFavorite={() => toggleFavorite.mutate(template.id)}
                    onHover={() => setSelectedTemplate(template)}
                    onClick={() => handleSelect(template)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right panel: live preview */}
          <div className="w-[55%] bg-ora-cream/30 overflow-y-auto">
            <TemplatePreviewPanel template={selectedTemplate} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
