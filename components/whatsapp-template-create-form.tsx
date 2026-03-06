"use client"

/**
 * WhatsApp Template Create Form
 *
 * Form for composing new WhatsApp message templates and submitting
 * them to Meta for approval. Includes fields for name, category,
 * language, and component editors (header, body, footer, buttons).
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import { useState } from "react"
import { Loader2, Plus, Trash2, CheckCircle, AlertCircle, Link } from "lucide-react"
import {
  Button,
  Input,
  Label,
  Textarea,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui"
import { useCreateWhatsAppTemplate } from "@/hooks/use-whatsapp-templates"
import type { WhatsAppTemplate } from "@/db/schema"
import type { CreateTemplateInput } from "@/lib/services/whatsapp-template-management-service"

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORIES = [
  { value: "MARKETING", label: "Marketing" },
  { value: "UTILITY", label: "Utility" },
  { value: "AUTHENTICATION", label: "Authentication" },
] as const

const LANGUAGES = [
  { value: "en_US", label: "English (US)" },
  { value: "ar", label: "Arabic" },
  { value: "fr_FR", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "de", label: "German" },
  { value: "pt_BR", label: "Portuguese (BR)" },
  { value: "hi", label: "Hindi" },
  { value: "zh_CN", label: "Chinese (Simplified)" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
] as const

const HEADER_FORMATS = [
  { value: "NONE", label: "None" },
  { value: "TEXT", label: "Text" },
] as const

const BUTTON_TYPES = [
  { value: "QUICK_REPLY", label: "Quick Reply" },
  { value: "URL", label: "URL" },
  { value: "PHONE_NUMBER", label: "Phone Number" },
] as const

// ============================================================================
// TYPES
// ============================================================================

interface WhatsAppTemplateCreateFormProps {
  channelId: string
  onSuccess?: (template: WhatsAppTemplate) => void
  onCancel?: () => void
}

interface ButtonField {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"
  text: string
  url?: string
  phone_number?: string
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function WhatsAppTemplateCreateForm({
  channelId,
  onSuccess,
  onCancel,
}: WhatsAppTemplateCreateFormProps) {
  const createMutation = useCreateWhatsAppTemplate(channelId)

  // Form state
  const [name, setName] = useState("")
  const [category, setCategory] = useState<CreateTemplateInput["category"]>("MARKETING")
  const [language, setLanguage] = useState("en_US")
  const [headerFormat, setHeaderFormat] = useState("NONE")
  const [headerText, setHeaderText] = useState("")
  const [bodyText, setBodyText] = useState("")
  const [footerText, setFooterText] = useState("")
  const [buttons, setButtons] = useState<ButtonField[]>([])

  // Success state — show PENDING feedback after creation (Req 7.3)
  const [createdTemplate, setCreatedTemplate] = useState<WhatsAppTemplate | null>(null)

  const isValid = name.trim().length > 0 && bodyText.trim().length > 0

  // Build components array from form state
  function buildComponents(): CreateTemplateInput["components"] {
    const components: CreateTemplateInput["components"] = []

    if (headerFormat === "TEXT" && headerText.trim()) {
      components.push({ type: "HEADER", format: "TEXT", text: headerText.trim() })
    }

    components.push({ type: "BODY", text: bodyText.trim() })

    if (footerText.trim()) {
      components.push({ type: "FOOTER", text: footerText.trim() })
    }

    if (buttons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: buttons.map((b) => ({
          type: b.type,
          text: b.text,
          ...(b.type === "URL" && b.url ? { url: b.url } : {}),
          ...(b.type === "PHONE_NUMBER" && b.phone_number ? { phone_number: b.phone_number } : {}),
        })),
      })
    }

    return components
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid || createMutation.isPending) return

    const input: CreateTemplateInput = {
      name: name.trim(),
      category,
      language,
      components: buildComponents(),
    }

    createMutation.mutate(input, {
      onSuccess: (template) => {
        setCreatedTemplate(template)
        onSuccess?.(template)
      },
    })
  }

  function addButton() {
    setButtons((prev) => [...prev, { type: "QUICK_REPLY", text: "" }])
  }

  function removeButton(index: number) {
    setButtons((prev) => prev.filter((_, i) => i !== index))
  }

  function updateButton(index: number, field: Partial<ButtonField>) {
    setButtons((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...field } : b)),
    )
  }

  // ---- Success state (Req 7.3) ----
  if (createdTemplate) {
    return (
      <div className="space-y-4 text-center py-6">
        <CheckCircle className="h-10 w-10 stroke-1 text-green-600 mx-auto" />
        <div>
          <p className="text-sm font-medium text-ora-charcoal">
            Template &ldquo;{createdTemplate.name}&rdquo; submitted
          </p>
          <div className="mt-2 flex justify-center">
            <Badge variant="warning">PENDING</Badge>
          </div>
          <p className="text-xs text-ora-graphite mt-2">
            Your template is awaiting Meta review. This usually takes a few minutes.
          </p>
        </div>
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            Close
          </Button>
        )}
      </div>
    )
  }

  // ---- Form ----
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Template name */}
      <div className="space-y-1.5">
        <Label htmlFor="template-name">Template name</Label>
        <Input
          id="template-name"
          placeholder="e.g. order_confirmation"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-xs text-ora-graphite">
          Lowercase letters, numbers, and underscores only.
        </p>
      </div>

      {/* Category & Language row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as CreateTemplateInput["category"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Language</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Header */}
      <div className="space-y-1.5">
        <Label>Header</Label>
        <Select value={headerFormat} onValueChange={setHeaderFormat}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HEADER_FORMATS.map((h) => (
              <SelectItem key={h.value} value={h.value}>
                {h.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {headerFormat === "TEXT" && (
          <Input
            placeholder="Header text"
            value={headerText}
            onChange={(e) => setHeaderText(e.target.value)}
            className="mt-1.5"
          />
        )}
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <Label htmlFor="template-body">
          Body <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="template-body"
          placeholder="Enter your message body. Use {{1}}, {{2}} for placeholders."
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={4}
        />
      </div>

      {/* Footer */}
      <div className="space-y-1.5">
        <Label htmlFor="template-footer">Footer</Label>
        <Input
          id="template-footer"
          placeholder="Optional footer text"
          value={footerText}
          onChange={(e) => setFooterText(e.target.value)}
        />
      </div>

      {/* Buttons */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Buttons</Label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setButtons((prev) => [...prev, { type: "URL", text: "RSVP Now", url: "https://yourdomain.com/rsvp/{{1}}" }])
              }}
              disabled={buttons.length >= 3}
            >
              <Link className="h-4 w-4 stroke-1" />
              RSVP Link
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setButtons((prev) => [...prev, { type: "URL", text: "View Badge", url: "https://yourdomain.com/badge/{{1}}" }])
              }}
              disabled={buttons.length >= 3}
            >
              <Link className="h-4 w-4 stroke-1" />
              Badge Link
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addButton}
              disabled={buttons.length >= 3}
            >
              <Plus className="h-4 w-4 stroke-1" />
              Custom
            </Button>
          </div>
        </div>

        {buttons.map((btn, i) => (
          <div key={i} className="flex items-start gap-2 rounded border border-ora-sand p-3">
            <div className="flex-1 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={btn.type}
                  onValueChange={(v) => updateButton(i, { type: v as ButtonField["type"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BUTTON_TYPES.map((bt) => (
                      <SelectItem key={bt.value} value={bt.value}>
                        {bt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Button text"
                  value={btn.text}
                  onChange={(e) => updateButton(i, { text: e.target.value })}
                />
              </div>
              {btn.type === "URL" && (
                <Input
                  placeholder="https://example.com/{{1}}"
                  value={btn.url ?? ""}
                  onChange={(e) => updateButton(i, { url: e.target.value })}
                />
              )}
              {btn.type === "PHONE_NUMBER" && (
                <Input
                  placeholder="+1234567890"
                  value={btn.phone_number ?? ""}
                  onChange={(e) => updateButton(i, { phone_number: e.target.value })}
                />
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeButton(i)}
            >
              <Trash2 className="h-4 w-4 stroke-1 text-red-500" />
            </Button>
          </div>
        ))}
      </div>

      {/* Error feedback (Req 7.4) */}
      {createMutation.isError && (
        <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-3">
          <AlertCircle className="h-4 w-4 stroke-1 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{createMutation.error.message}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end pt-2">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!isValid || createMutation.isPending}>
          {createMutation.isPending && <Loader2 className="h-4 w-4 stroke-1 animate-spin" />}
          Submit for review
        </Button>
      </div>
    </form>
  )
}
