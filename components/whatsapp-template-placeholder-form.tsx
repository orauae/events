"use client"

/**
 * WhatsApp Template Placeholder Form
 *
 * Displays a selected template's body as read-only text with placeholders
 * highlighted, renders labeled input fields for each placeholder, shows a
 * live preview that updates in real time, and validates that all placeholders
 * are filled before enabling the confirm action.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { useState, useMemo, useCallback, Fragment } from "react"
import { CheckCircle } from "lucide-react"
import { Button, Input, Label } from "@/components/ui"
import type { WhatsAppTemplate } from "@/db/schema"
import type { TemplateComponent } from "@/lib/utils/whatsapp-template-utils"
import {
  extractPlaceholders,
  replacePlaceholders,
  validatePlaceholderValues,
} from "@/lib/utils/whatsapp-template-utils"

// ============================================================================
// TYPES
// ============================================================================

interface WhatsAppTemplatePlaceholderFormProps {
  template: WhatsAppTemplate
  onConfirm: (values: Record<number, string>) => void
  onCancel?: () => void
}

// ============================================================================
// HELPERS
// ============================================================================

const PLACEHOLDER_REGEX = /(\{\{\d+\}\})/g

function getBodyText(components: unknown): string {
  if (!Array.isArray(components)) return ""
  const body = components.find(
    (c: TemplateComponent) => c.type === "BODY",
  ) as TemplateComponent | undefined
  return body?.text ?? ""
}

/**
 * Renders template text with `{{N}}` tokens highlighted using a
 * distinct background so the user can see where placeholders are.
 */
function HighlightedBody({ text }: { text: string }) {
  const parts = text.split(PLACEHOLDER_REGEX)

  return (
    <p className="text-sm leading-relaxed text-ora-charcoal whitespace-pre-wrap">
      {parts.map((part, i) =>
        PLACEHOLDER_REGEX.test(part) ? (
          <span
            key={i}
            className="bg-ora-gold/20 text-ora-charcoal font-medium px-0.5 rounded"
          >
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function WhatsAppTemplatePlaceholderForm({
  template,
  onConfirm,
  onCancel,
}: WhatsAppTemplatePlaceholderFormProps) {
  const placeholders = useMemo(
    () => extractPlaceholders(template.components as TemplateComponent[]),
    [template.components],
  )

  const [values, setValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(placeholders.map((p) => [p, ""])),
  )

  const bodyText = useMemo(
    () => getBodyText(template.components),
    [template.components],
  )

  const isValid = useMemo(
    () => validatePlaceholderValues(placeholders, values),
    [placeholders, values],
  )

  const previewText = useMemo(
    () => replacePlaceholders(bodyText, values),
    [bodyText, values],
  )

  const handleChange = useCallback((index: number, value: string) => {
    setValues((prev) => ({ ...prev, [index]: value }))
  }, [])

  const handleConfirm = () => {
    if (isValid) onConfirm(values)
  }

  // If the template has no placeholders, allow immediate confirmation
  if (placeholders.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-ora-graphite mb-1">Template body</p>
          <div className="rounded border border-ora-sand bg-ora-cream/40 p-3">
            <p className="text-sm text-ora-charcoal whitespace-pre-wrap">{bodyText || "(Empty)"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 justify-end">
          {onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={() => onConfirm({})}>
            <CheckCircle className="h-4 w-4" />
            Confirm
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Read-only template body with highlighted placeholders (Req 6.3) */}
      <div>
        <p className="text-xs font-medium text-ora-graphite mb-1">Template body</p>
        <div className="rounded border border-ora-sand bg-ora-cream/40 p-3">
          <HighlightedBody text={bodyText} />
        </div>
      </div>

      {/* Placeholder input fields (Req 6.1) */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-ora-graphite">Fill in placeholders</p>
        {placeholders.map((index) => {
          const isEmpty = !values[index]?.trim()
          return (
            <div key={index}>
              <Label htmlFor={`placeholder-${index}`}>
                {"{{" + index + "}}"}
              </Label>
              <Input
                id={`placeholder-${index}`}
                placeholder={`Value for {{${index}}}`}
                value={values[index] ?? ""}
                onChange={(e) => handleChange(index, e.target.value)}
                aria-invalid={isEmpty}
              />
              {/* Validation message for empty required placeholders (Req 6.5) */}
              {isEmpty && (
                <p className="text-xs text-red-500 mt-0.5">
                  Placeholder {"{{" + index + "}}"} is required
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Live preview (Req 6.2) */}
      <div>
        <p className="text-xs font-medium text-ora-graphite mb-1">Live preview</p>
        <div className="rounded border border-ora-sand bg-white p-3">
          <p className="text-sm text-ora-charcoal whitespace-pre-wrap">
            {previewText}
          </p>
        </div>
      </div>

      {/* Actions (Req 6.4) */}
      <div className="flex items-center gap-2 justify-end">
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button size="sm" disabled={!isValid} onClick={handleConfirm}>
          <CheckCircle className="h-4 w-4" />
          Confirm
        </Button>
      </div>
    </div>
  )
}
