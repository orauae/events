"use client"

/**
 * WhatsApp Campaign Composer
 *
 * Full-featured WhatsApp message composer with:
 * - Meta template selection via WhatsAppTemplateSelectionSheet
 * - Placeholder filling via WhatsAppTemplatePlaceholderForm
 * - Template status badge display
 * - "Save as Template" action
 * - Markdown formatting toolbar (bold, italic, strikethrough, mono)
 * - Image dropzone upload (stored to public/uploads/whatsapp)
 * - Character counter
 * - Placeholder guide
 * - Live preview via WhatsAppPreviewSheet
 *
 * Requirements: 8.4, 8.5, 7.1
 */

import { useState, useRef, useCallback } from "react"
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Image as ImageIcon,
  X,
  Upload,
  Loader2,
  Info,
  LayoutTemplate,
  Plus,
  FileText,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import { Button, Badge } from "@/components/ui"
import { WhatsAppPreviewButton } from "@/components/whatsapp-preview"
import { WhatsAppTemplateSelectionSheet } from "@/components/whatsapp-template-selection-sheet"
import { WhatsAppTemplatePlaceholderForm } from "@/components/whatsapp-template-placeholder-form"
import { WhatsAppTemplateCreateForm } from "@/components/whatsapp-template-create-form"
import { WhatsAppTemplateLibrarySheet } from "@/components/whatsapp-template-library-sheet"
import { replacePlaceholders } from "@/lib/utils/whatsapp-template-utils"
import type { WhatsAppTemplate } from "@/db/schema"
import type { WhatsAppTemplate as LocalWhatsAppTemplate } from "@/lib/whatsapp-templates"
import type { TemplateComponent } from "@/lib/utils/whatsapp-template-utils"

// ============================================================================
// TYPES
// ============================================================================

export interface WhatsAppComposerData {
  subject: string
  whatsappTemplateId?: string
  whatsappTemplateName?: string
  whatsappMessageBody?: string
  whatsappMediaUrl?: string
  whatsappMediaType?: "" | "image" | "document" | "video"
}

export interface WhatsAppComposerProps {
  data: WhatsAppComposerData
  onChange: (updates: Partial<WhatsAppComposerData>) => void
  /** WhatsApp channel ID — required for Meta template features */
  channelId?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const WA_PLACEHOLDERS = [
  { tag: "{{1}}", description: "Guest first name" },
  { tag: "{{2}}", description: "Event name" },
  { tag: "{{3}}", description: "Event date" },
  { tag: "{{4}}", description: "Event venue" },
  { tag: "{{5}}", description: "RSVP link" },
  { tag: "{{6}}", description: "Badge link" },
]

const STATUS_BADGE_MAP: Record<string, { variant: "success" | "warning" | "danger" | "outline" | "info"; label: string }> = {
  APPROVED: { variant: "success", label: "Approved" },
  PENDING: { variant: "warning", label: "Pending" },
  REJECTED: { variant: "danger", label: "Rejected" },
  PAUSED: { variant: "info", label: "Paused" },
  DISABLED: { variant: "outline", label: "Disabled" },
}

// ============================================================================
// MARKDOWN TOOLBAR
// ============================================================================

function MarkdownToolbar({
  textareaRef,
  value,
  onValueChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onValueChange: (v: string) => void
}) {
  const wrapSelection = useCallback(
    (prefix: string, suffix: string) => {
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const selected = value.substring(start, end)

      if (selected) {
        // Wrap selection
        const newText =
          value.substring(0, start) +
          prefix +
          selected +
          suffix +
          value.substring(end)
        onValueChange(newText)
        // Restore cursor after the wrapped text
        requestAnimationFrame(() => {
          ta.focus()
          ta.setSelectionRange(
            start + prefix.length,
            end + prefix.length
          )
        })
      } else {
        // Insert placeholder
        const placeholder = "text"
        const newText =
          value.substring(0, start) +
          prefix +
          placeholder +
          suffix +
          value.substring(end)
        onValueChange(newText)
        requestAnimationFrame(() => {
          ta.focus()
          ta.setSelectionRange(
            start + prefix.length,
            start + prefix.length + placeholder.length
          )
        })
      }
    },
    [textareaRef, value, onValueChange]
  )

  const buttons = [
    { icon: Bold, label: "Bold", prefix: "*", suffix: "*", shortcut: "⌘B" },
    { icon: Italic, label: "Italic", prefix: "_", suffix: "_", shortcut: "⌘I" },
    { icon: Strikethrough, label: "Strikethrough", prefix: "~", suffix: "~", shortcut: "" },
    { icon: Code, label: "Monospace", prefix: "```", suffix: "```", shortcut: "" },
  ]

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border border-ora-sand border-b-0 rounded-t-lg bg-ora-cream/50">
      {buttons.map((btn) => (
        <button
          key={btn.label}
          type="button"
          title={`${btn.label}${btn.shortcut ? ` (${btn.shortcut})` : ""}`}
          onClick={() => wrapSelection(btn.prefix, btn.suffix)}
          className="flex items-center justify-center w-8 h-8 rounded-md text-ora-graphite hover:text-ora-charcoal hover:bg-white transition-colors"
        >
          <btn.icon className="h-4 w-4 stroke-1" />
        </button>
      ))}
      <div className="h-5 w-px bg-ora-sand mx-1" />
      <span className="text-[11px] text-ora-graphite select-none">
        *bold* &nbsp; _italic_ &nbsp; ~strike~ &nbsp; ```mono```
      </span>
    </div>
  )
}

// ============================================================================
// IMAGE DROPZONE
// ============================================================================

function ImageDropzone({
  imageUrl,
  onUpload,
  onRemove,
}: {
  imageUrl: string | undefined
  onUpload: (url: string) => void
  onRemove: () => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File) => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast.error("Only JPG, PNG, and WebP images are allowed")
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be under 5MB")
        return
      }

      setIsUploading(true)
      try {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch("/api/whatsapp-media", {
          method: "POST",
          body: formData,
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || "Upload failed")
        }
        const { url } = await res.json()
        onUpload(url)
        toast.success("Image uploaded")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed")
      } finally {
        setIsUploading(false)
      }
    },
    [onUpload]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      // Reset input so same file can be re-selected
      e.target.value = ""
    },
    [handleFile]
  )

  if (imageUrl) {
    return (
      <div className="relative rounded-lg border border-ora-sand overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Header image"
          className="w-full max-h-48 object-cover"
        />
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
        >
          <X className="h-4 w-4 stroke-1" />
        </button>
        <div className="px-3 py-2 bg-ora-cream/80 text-xs text-ora-graphite">
          Header image — shown above the message
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors
        ${isDragging ? "border-ora-gold bg-ora-cream/50" : "border-ora-sand hover:border-ora-stone bg-white"}
        ${isUploading ? "pointer-events-none opacity-60" : ""}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleInputChange}
      />
      {isUploading ? (
        <>
          <Loader2 className="h-6 w-6 text-ora-gold animate-spin stroke-1" />
          <span className="text-sm text-ora-graphite">Uploading…</span>
        </>
      ) : (
        <>
          <Upload className="h-6 w-6 text-ora-graphite stroke-1" />
          <span className="text-sm text-ora-graphite">
            Drop an image here or click to browse
          </span>
          <span className="text-xs text-ora-graphite/60">
            JPG, PNG, or WebP — max 5MB — shown as message header
          </span>
        </>
      )}
    </div>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

/** Extract body text from template components JSON */
function getBodyText(components: unknown): string {
  if (!Array.isArray(components)) return ""
  const body = components.find(
    (c: TemplateComponent) => c.type === "BODY",
  ) as TemplateComponent | undefined
  return body?.text ?? ""
}

// ============================================================================
// MAIN COMPOSER COMPONENT
// ============================================================================

export function WhatsAppComposer({ data, onChange, channelId }: WhatsAppComposerProps) {
  const [isTemplateSheetOpen, setIsTemplateSheetOpen] = useState(false)
  const [isStarterSheetOpen, setIsStarterSheetOpen] = useState(false)
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null)
  const [showPlaceholderForm, setShowPlaceholderForm] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const hasChannelId = !!channelId

  // Handle starter template selection (local templates)
  const handleStarterSelect = useCallback(
    (template: LocalWhatsAppTemplate) => {
      onChange({
        whatsappMessageBody: template.body,
        whatsappTemplateName: "",
        whatsappTemplateId: "",
      })
      setSelectedTemplate(null)
      toast.success(`Starter template "${template.name}" applied`)
    },
    [onChange]
  )

  // Handle template selection from the Template Selection Sheet
  const handleTemplateSelect = useCallback(
    (template: WhatsAppTemplate) => {
      setSelectedTemplate(template)
      setIsTemplateSheetOpen(false)

      // Check if template has placeholders — if so, show placeholder form
      const bodyText = getBodyText(template.components)
      const hasPlaceholders = /\{\{\d+\}\}/.test(bodyText)

      if (hasPlaceholders) {
        setShowPlaceholderForm(true)
      } else {
        // No placeholders — apply template directly
        onChange({
          whatsappTemplateId: template.metaTemplateId,
          whatsappTemplateName: template.name,
          whatsappMessageBody: bodyText,
        })
        toast.success(`Template "${template.name}" selected`)
      }
    },
    [onChange]
  )

  // Handle placeholder form confirmation
  const handlePlaceholderConfirm = useCallback(
    (values: Record<number, string>) => {
      if (!selectedTemplate) return

      const bodyText = getBodyText(selectedTemplate.components)
      const filledBody = replacePlaceholders(bodyText, values)

      onChange({
        whatsappTemplateId: selectedTemplate.metaTemplateId,
        whatsappTemplateName: selectedTemplate.name,
        whatsappMessageBody: filledBody,
      })

      setShowPlaceholderForm(false)
      toast.success(`Template "${selectedTemplate.name}" applied with placeholder values`)
    },
    [selectedTemplate, onChange]
  )

  // Handle placeholder form cancel
  const handlePlaceholderCancel = useCallback(() => {
    setShowPlaceholderForm(false)
    setSelectedTemplate(null)
  }, [])

  // Handle "Save as Template" success
  const handleCreateTemplateSuccess = useCallback(
    (template: WhatsAppTemplate) => {
      setIsCreateFormOpen(false)
      onChange({
        whatsappTemplateId: template.metaTemplateId,
        whatsappTemplateName: template.name,
      })
      toast.success(`Template "${template.name}" created and submitted for review`)
    },
    [onChange]
  )

  const handleImageUpload = useCallback(
    (url: string) => {
      onChange({ whatsappMediaUrl: url, whatsappMediaType: "image" })
    },
    [onChange]
  )

  const handleImageRemove = useCallback(() => {
    onChange({ whatsappMediaUrl: "", whatsappMediaType: "" })
  }, [onChange])

  const handleBodyChange = useCallback(
    (v: string) => onChange({ whatsappMessageBody: v }),
    [onChange]
  )

  // Clear selected template
  const handleClearTemplate = useCallback(() => {
    setSelectedTemplate(null)
    onChange({
      whatsappTemplateId: "",
      whatsappTemplateName: "",
    })
  }, [onChange])

  // If showing the placeholder form, render it
  if (showPlaceholderForm && selectedTemplate) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-ora-gold stroke-1" />
          <h3 className="text-sm font-medium text-ora-charcoal">
            Fill Placeholders for &ldquo;{selectedTemplate.name}&rdquo;
          </h3>
          {selectedTemplate.status && (
            <Badge variant={STATUS_BADGE_MAP[selectedTemplate.status]?.variant ?? "outline"}>
              {STATUS_BADGE_MAP[selectedTemplate.status]?.label ?? selectedTemplate.status}
            </Badge>
          )}
        </div>
        <WhatsAppTemplatePlaceholderForm
          template={selectedTemplate}
          onConfirm={handlePlaceholderConfirm}
          onCancel={handlePlaceholderCancel}
        />
      </div>
    )
  }

  // If showing the create form, render it
  if (isCreateFormOpen && channelId) {
    return (
      <WhatsAppTemplateCreateForm
        channelId={channelId}
        onSuccess={handleCreateTemplateSuccess}
        onCancel={() => setIsCreateFormOpen(false)}
      />
    )
  }

  const bodyLen = (data.whatsappMessageBody || "").length
  const templateStatus = selectedTemplate?.status

  return (
    <div className="space-y-6">
      {/* Header with Template actions */}
      <div className="flex items-center justify-between">
        {/* Selected template info with status badge (Req 8.5) */}
        {selectedTemplate ? (
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-ora-gold stroke-1" />
            <span className="text-sm font-medium text-ora-charcoal">
              {selectedTemplate.name}
            </span>
            {templateStatus && STATUS_BADGE_MAP[templateStatus] && (
              <Badge variant={STATUS_BADGE_MAP[templateStatus].variant}>
                {STATUS_BADGE_MAP[templateStatus].label}
              </Badge>
            )}
            <button
              type="button"
              onClick={handleClearTemplate}
              className="ml-1 text-ora-graphite hover:text-ora-charcoal transition-colors"
              title="Clear template"
            >
              <X className="h-3.5 w-3.5 stroke-1" />
            </button>
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          {/* Starter Templates — always available */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsStarterSheetOpen(true)}
          >
            <Sparkles className="h-4 w-4" />
            Starters
          </Button>

          {/* "Save as Template" button (Req 7.1) */}
          {hasChannelId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateFormOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Save as Template
            </Button>
          )}

          {/* Meta Template selection button */}
          {hasChannelId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTemplateSheetOpen(true)}
            >
              <LayoutTemplate className="h-4 w-4" />
              Templates
            </Button>
          ) : (
            <span className="text-xs text-ora-graphite">
              Configure a WhatsApp channel to use Meta templates
            </span>
          )}
        </div>
      </div>

      {/* Template Name (Req 8.4 — stores template reference) */}
      <div>
        <label className="block text-[13px] font-medium text-ora-charcoal mb-2">
          Template Name <span className="text-ora-graphite font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={data.whatsappTemplateName || data.whatsappTemplateId || ""}
          readOnly={!!selectedTemplate}
          onChange={(e) => {
            if (!selectedTemplate) {
              onChange({ whatsappTemplateId: e.target.value })
            }
          }}
          placeholder="e.g., event_invitation_v1"
          className="w-full px-4 py-3 border border-ora-sand rounded-lg text-sm text-ora-charcoal bg-white outline-none focus:border-ora-gold transition-colors read-only:bg-ora-cream/40 read-only:cursor-default"
        />
        <p className="text-xs text-ora-graphite mt-1">
          {selectedTemplate
            ? "Selected from Meta-approved templates"
            : "Meta-approved template name. Required outside the 24h session window."}
        </p>
      </div>

      {/* Message Body with Markdown Toolbar */}
      <div>
        <label className="block text-[13px] font-medium text-ora-charcoal mb-2">
          Message Body
        </label>
        <MarkdownToolbar
          textareaRef={textareaRef}
          value={data.whatsappMessageBody || ""}
          onValueChange={handleBodyChange}
        />
        <textarea
          ref={textareaRef}
          value={data.whatsappMessageBody || ""}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder={"Hello {{1}}! You're invited to {{2}} on {{3}} at {{4}}.\n\nWe look forward to seeing you!"}
          rows={6}
          className="w-full px-4 py-3 border border-ora-sand rounded-b-lg text-sm text-ora-charcoal bg-white outline-none focus:border-ora-gold transition-colors resize-vertical font-[inherit]"
        />
        <p className="text-xs text-ora-graphite mt-1">
          {bodyLen}/1024 characters
          {bodyLen > 1024 && (
            <span className="text-red-600 ml-1">(exceeds WhatsApp limit)</span>
          )}
        </p>
      </div>

      {/* Header Image Dropzone */}
      <div>
        <label className="block text-[13px] font-medium text-ora-charcoal mb-2">
          Header Image <span className="text-ora-graphite font-normal">(optional)</span>
        </label>
        <ImageDropzone
          imageUrl={data.whatsappMediaUrl || undefined}
          onUpload={handleImageUpload}
          onRemove={handleImageRemove}
        />
      </div>

      {/* Placeholders Guide */}
      <div className="rounded-lg border border-ora-sand p-4 bg-ora-cream/30">
        <div className="flex items-start gap-2 mb-3">
          <Info className="h-4 w-4 stroke-1 text-ora-gold mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[13px] font-medium text-ora-charcoal">
              Template Placeholders
            </p>
            <p className="text-xs text-ora-graphite mt-0.5">
              Numbered placeholders are mapped to guest and event data when sent. Use {"{{5}}"} or {"{{6}}"} in a URL button to add an RSVP or badge link.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {WA_PLACEHOLDERS.map((p) => (
            <div key={p.tag + p.description} className="flex items-center gap-2 text-xs">
              <code className="bg-white px-1.5 py-0.5 rounded border border-ora-sand text-ora-charcoal font-mono">
                {p.tag}
              </code>
              <span className="text-ora-graphite">{p.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Preview Button */}
      <div className="flex justify-end">
        <WhatsAppPreviewButton
          messageBody={data.whatsappMessageBody || ""}
          templateName={data.whatsappTemplateName || data.whatsappTemplateId}
          mediaUrl={data.whatsappMediaUrl}
          mediaType={data.whatsappMediaType}
        />
      </div>

      {/* Starter Template Library (local templates — no channel needed) */}
      <WhatsAppTemplateLibrarySheet
        isOpen={isStarterSheetOpen}
        onClose={() => setIsStarterSheetOpen(false)}
        onSelectTemplate={handleStarterSelect}
      />

      {/* Meta Template Selection Sheet (Req 8.4) */}
      {channelId && (
        <WhatsAppTemplateSelectionSheet
          channelId={channelId}
          open={isTemplateSheetOpen}
          onOpenChange={setIsTemplateSheetOpen}
          onSelect={handleTemplateSelect}
        />
      )}
    </div>
  )
}
