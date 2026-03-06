"use client"

/**
 * SMS Campaign Composer
 *
 * Full-featured SMS message composer with:
 * - Text message body editor
 * - Character counter with GSM-7 vs UCS-2 detection
 * - Message segment counter for credit consumption estimation
 * - Placeholder guide for personalization
 * - Live phone-frame preview
 * - Sender ID configuration
 * - Opt-out footer toggle
 *
 * SMS Encoding Rules:
 * - GSM-7: 160 chars per segment (single), 153 chars per segment (multipart)
 * - UCS-2 (non-Latin/emoji): 70 chars per segment (single), 67 chars per segment (multipart)
 */

import { useState, useRef, useCallback, useMemo } from "react"
import { Info, AlertTriangle } from "lucide-react"
import { SmsPreviewButton } from "@/components/sms-preview"

// ============================================================================
// TYPES
// ============================================================================

export interface SmsComposerData {
  subject: string
  smsBody?: string
  smsSenderId?: string
  smsOptOutFooter?: boolean
}

export interface SmsComposerProps {
  data: SmsComposerData
  onChange: (updates: Partial<SmsComposerData>) => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SMS_PLACEHOLDERS = [
  { tag: "{{firstName}}", description: "Guest first name" },
  { tag: "{{lastName}}", description: "Guest last name" },
  { tag: "{{eventName}}", description: "Event name" },
  { tag: "{{eventDate}}", description: "Event date" },
  { tag: "{{eventLocation}}", description: "Event venue" },
  { tag: "{{rsvpLink}}", description: "RSVP link" },
]

/**
 * GSM 7-bit default alphabet characters.
 * Characters outside this set trigger UCS-2 encoding.
 */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ" +
  " !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
  "ÄÖÑÜabcdefghijklmnopqrstuvwxyz" +
  "äöñüà§"

/** GSM 7-bit extension table characters (each costs 2 chars) */
const GSM7_EXTENDED = "^{}\\[~]|€"

// ============================================================================
// SMS ENCODING UTILITIES
// ============================================================================

interface SmsEncodingInfo {
  /** "GSM-7" for Latin/basic, "UCS-2" for Unicode/emoji */
  encoding: "GSM-7" | "UCS-2"
  /** Total character count (GSM-7 extended chars count as 2) */
  charCount: number
  /** Max chars per single segment */
  singleSegmentLimit: number
  /** Max chars per segment in multipart */
  multipartSegmentLimit: number
  /** Number of SMS segments needed */
  segmentCount: number
  /** Characters remaining in current segment */
  charsRemaining: number
  /** Whether the message contains non-GSM characters */
  hasUnicode: boolean
}

function isGsm7Char(char: string): boolean {
  return GSM7_BASIC.includes(char) || GSM7_EXTENDED.includes(char)
}

function isGsm7Extended(char: string): boolean {
  return GSM7_EXTENDED.includes(char)
}

export function analyzeSmsEncoding(text: string): SmsEncodingInfo {
  if (!text) {
    return {
      encoding: "GSM-7",
      charCount: 0,
      singleSegmentLimit: 160,
      multipartSegmentLimit: 153,
      segmentCount: 0,
      charsRemaining: 160,
      hasUnicode: false,
    }
  }

  // Check if all characters are GSM-7 compatible
  let hasUnicode = false
  for (const char of text) {
    if (!isGsm7Char(char)) {
      hasUnicode = true
      break
    }
  }

  if (hasUnicode) {
    // UCS-2 encoding: each character = 2 bytes
    const charCount = text.length
    const singleLimit = 70
    const multiLimit = 67

    let segmentCount: number
    let charsRemaining: number

    if (charCount <= singleLimit) {
      segmentCount = charCount === 0 ? 0 : 1
      charsRemaining = singleLimit - charCount
    } else {
      segmentCount = Math.ceil(charCount / multiLimit)
      charsRemaining = segmentCount * multiLimit - charCount
    }

    return {
      encoding: "UCS-2",
      charCount,
      singleSegmentLimit: singleLimit,
      multipartSegmentLimit: multiLimit,
      segmentCount,
      charsRemaining,
      hasUnicode: true,
    }
  }

  // GSM-7 encoding: extended chars count as 2
  let charCount = 0
  for (const char of text) {
    charCount += isGsm7Extended(char) ? 2 : 1
  }

  const singleLimit = 160
  const multiLimit = 153

  let segmentCount: number
  let charsRemaining: number

  if (charCount <= singleLimit) {
    segmentCount = charCount === 0 ? 0 : 1
    charsRemaining = singleLimit - charCount
  } else {
    segmentCount = Math.ceil(charCount / multiLimit)
    charsRemaining = segmentCount * multiLimit - charCount
  }

  return {
    encoding: "GSM-7",
    charCount,
    singleSegmentLimit: singleLimit,
    multipartSegmentLimit: multiLimit,
    segmentCount,
    charsRemaining,
    hasUnicode: false,
  }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function EncodingBadge({ encoding }: { encoding: "GSM-7" | "UCS-2" }) {
  const isUnicode = encoding === "UCS-2"
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
        isUnicode
          ? "bg-amber-50 text-amber-700 border border-amber-200"
          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
      }`}
    >
      {encoding}
    </span>
  )
}

function SegmentIndicator({ info }: { info: SmsEncodingInfo }) {
  const segmentLabel = info.segmentCount === 1 ? "message" : "messages"
  const creditNote =
    info.segmentCount > 1
      ? `(${info.segmentCount} credits per recipient)`
      : info.segmentCount === 1
        ? "(1 credit per recipient)"
        : ""

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Segment count */}
      <div className="flex items-center gap-1.5">
        <div
          className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
            info.segmentCount > 3
              ? "bg-red-100 text-red-700"
              : info.segmentCount > 1
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {info.segmentCount}
        </div>
        <span className="text-xs text-ora-graphite">
          {segmentLabel} {creditNote}
        </span>
      </div>

      {/* Encoding badge */}
      <EncodingBadge encoding={info.encoding} />

      {/* Chars remaining */}
      <span className="text-xs text-ora-graphite">
        {info.charCount} chars · {info.charsRemaining} remaining
      </span>
    </div>
  )
}

// ============================================================================
// MAIN COMPOSER COMPONENT
// ============================================================================

export function SmsComposer({ data, onChange }: SmsComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showOptOut, setShowOptOut] = useState(data.smsOptOutFooter ?? true)

  const bodyWithFooter = useMemo(() => {
    const body = data.smsBody || ""
    if (showOptOut) {
      return body + (body ? "\n\n" : "") + "Reply STOP to opt out"
    }
    return body
  }, [data.smsBody, showOptOut])

  const encodingInfo = useMemo(() => analyzeSmsEncoding(bodyWithFooter), [bodyWithFooter])

  const handleBodyChange = useCallback(
    (value: string) => onChange({ smsBody: value }),
    [onChange],
  )

  const handleOptOutToggle = useCallback(() => {
    const next = !showOptOut
    setShowOptOut(next)
    onChange({ smsOptOutFooter: next })
  }, [showOptOut, onChange])

  const insertPlaceholder = useCallback(
    (tag: string) => {
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const current = data.smsBody || ""
      const newText = current.substring(0, start) + tag + current.substring(end)
      onChange({ smsBody: newText })
      requestAnimationFrame(() => {
        ta.focus()
        const pos = start + tag.length
        ta.setSelectionRange(pos, pos)
      })
    },
    [data.smsBody, onChange],
  )

  return (
    <div className="space-y-6">
      {/* Sender ID */}
      <div>
        <label className="block text-[13px] font-medium text-ora-charcoal mb-2">
          Sender ID <span className="text-ora-graphite font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={data.smsSenderId || ""}
          onChange={(e) => onChange({ smsSenderId: e.target.value })}
          placeholder="e.g., ORA Events"
          maxLength={11}
          className="w-full px-4 py-3 border border-ora-sand rounded-lg text-sm text-ora-charcoal bg-white outline-none focus:border-ora-gold transition-colors"
        />
        <p className="text-xs text-ora-graphite mt-1">
          Alphanumeric sender ID (max 11 chars). Availability varies by country.
        </p>
      </div>

      {/* Message Body */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[13px] font-medium text-ora-charcoal">
            Message Body
          </label>
          <div className="flex items-center gap-2">
            {/* Quick-insert placeholder buttons */}
            {SMS_PLACEHOLDERS.slice(0, 3).map((p) => (
              <button
                key={p.tag}
                type="button"
                onClick={() => insertPlaceholder(p.tag)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-ora-sand text-ora-graphite hover:border-ora-gold hover:text-ora-gold transition-colors"
              >
                + {p.tag.replace(/\{\{|\}\}/g, "")}
              </button>
            ))}
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={data.smsBody || ""}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder={
            "Hi {{firstName}}! You're invited to {{eventName}} on {{eventDate}} at {{eventLocation}}. RSVP: {{rsvpLink}}"
          }
          rows={5}
          className="w-full px-4 py-3 border border-ora-sand rounded-lg text-sm text-ora-charcoal bg-white outline-none focus:border-ora-gold transition-colors resize-vertical font-[inherit]"
        />

        {/* Encoding & segment info */}
        <div className="mt-2">
          <SegmentIndicator info={encodingInfo} />
        </div>

        {/* Unicode warning */}
        {encodingInfo.hasUnicode && (
          <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0 stroke-1" />
            <div>
              <p className="text-xs font-medium text-amber-800">
                Unicode characters detected (UCS-2 encoding)
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Non-Latin characters, accented letters, or emoji reduce the per-segment
                limit from 160 to 70 characters. This increases the number of message
                segments and credit consumption.
              </p>
            </div>
          </div>
        )}

        {/* High segment warning */}
        {encodingInfo.segmentCount > 3 && (
          <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0 stroke-1" />
            <div>
              <p className="text-xs font-medium text-red-800">
                High credit consumption ({encodingInfo.segmentCount} segments)
              </p>
              <p className="text-xs text-red-700 mt-0.5">
                Each recipient will consume {encodingInfo.segmentCount} SMS credits.
                Consider shortening your message to reduce costs.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Opt-out footer toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-ora-sand bg-ora-cream/30">
        <div>
          <p className="text-[13px] font-medium text-ora-charcoal">
            Opt-out footer
          </p>
          <p className="text-xs text-ora-graphite mt-0.5">
            Appends &quot;Reply STOP to opt out&quot; — required in many regions
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showOptOut}
          onClick={handleOptOutToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            showOptOut ? "bg-ora-gold" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              showOptOut ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Placeholders Guide */}
      <div className="rounded-lg border border-ora-sand p-4 bg-ora-cream/30">
        <div className="flex items-start gap-2 mb-3">
          <Info className="h-4 w-4 stroke-1 text-ora-gold mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[13px] font-medium text-ora-charcoal">
              Personalization Placeholders
            </p>
            <p className="text-xs text-ora-graphite mt-0.5">
              Placeholders are replaced with guest and event data when sent.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SMS_PLACEHOLDERS.map((p) => (
            <button
              key={p.tag}
              type="button"
              onClick={() => insertPlaceholder(p.tag)}
              className="flex items-center gap-2 text-xs text-left hover:bg-white rounded px-1.5 py-1 transition-colors"
            >
              <code className="bg-white px-1.5 py-0.5 rounded border border-ora-sand text-ora-charcoal font-mono">
                {p.tag}
              </code>
              <span className="text-ora-graphite">{p.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Preview Button */}
      <div className="flex justify-end">
        <SmsPreviewButton
          messageBody={bodyWithFooter}
          senderName={data.smsSenderId || "ORA Events"}
        />
      </div>
    </div>
  )
}
