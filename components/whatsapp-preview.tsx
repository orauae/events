"use client"

import { sanitizeHtml } from "@/lib/utils/sanitize"

/**
 * WhatsApp Message Preview Component
 * 
 * Renders a phone-frame preview showing how WhatsApp messages will look
 * to recipients. Supports text with basic markdown (bold, italic),
 * images, and media attachments.
 */

import { useState } from "react"
import { MessageCircle, X, Eye, ChevronLeft, Phone, Video, MoreVertical } from "lucide-react"
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui"

interface WhatsAppPreviewProps {
  messageBody: string
  mediaUrl?: string
  mediaType?: "image" | "document" | "video" | ""
  templateName?: string
  senderName?: string
}

/**
 * Parses WhatsApp-style markdown:
 * *bold* → <strong>
 * _italic_ → <em>
 * ~strikethrough~ → <del>
 * ```monospace``` → <code>
 */
function parseWhatsAppMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Bold: *text*
    .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")
    // Italic: _text_
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "<em>$1</em>")
    // Strikethrough: ~text~
    .replace(/~([^~]+)~/g, "<del>$1</del>")
    // Monospace: ```text```
    .replace(/```([^`]+)```/g, '<code class="bg-black/5 px-1 rounded text-[13px] font-mono">$1</code>')
    // Newlines
    .replace(/\n/g, "<br />")

  return html
}

/**
 * Replaces {{1}}, {{2}} etc. with sample values for preview
 */
function replacePlaceholders(text: string): string {
  const samples: Record<string, string> = {
    "{{1}}": "Sarah",
    "{{2}}": "Annual Gala 2026",
    "{{3}}": "March 15, 2026",
    "{{4}}": "Grand Ballroom, Hotel Marítimo",
  }
  let result = text
  for (const [key, value] of Object.entries(samples)) {
    result = result.replaceAll(key, value)
  }
  return result
}

function WhatsAppPhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto" style={{ width: 360, maxWidth: "100%" }}>
      {/* Phone frame */}
      <div className="rounded-[2rem] border-[3px] border-gray-800 bg-gray-800 overflow-hidden shadow-2xl">
        {/* Notch */}
        <div className="flex justify-center bg-gray-800 pt-2 pb-1">
          <div className="w-20 h-5 bg-gray-900 rounded-full" />
        </div>
        {/* Screen */}
        <div className="bg-[#efeae2]" style={{ height: 580 }}>
          {children}
        </div>
        {/* Bottom bar */}
        <div className="flex justify-center bg-gray-800 py-2">
          <div className="w-28 h-1 bg-gray-600 rounded-full" />
        </div>
      </div>
    </div>
  )
}

function WhatsAppHeader({ senderName }: { senderName: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-2 bg-[#075e54]">
      <ChevronLeft className="h-5 w-5 text-white stroke-1" />
      <div className="w-8 h-8 rounded-full bg-[#25d366] flex items-center justify-center flex-shrink-0">
        <MessageCircle className="h-4 w-4 text-white stroke-1" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{senderName}</p>
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

function ChatBubble({ html, mediaUrl, mediaType }: { html: string; mediaUrl?: string; mediaType?: string }) {
  const now = new Date()
  const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`

  return (
    <div className="flex justify-start px-3">
      <div className="relative max-w-[85%] bg-white rounded-lg rounded-tl-none shadow-sm">
        {/* Tail */}
        <div
          className="absolute -left-2 top-0 w-0 h-0"
          style={{
            borderTop: "8px solid white",
            borderLeft: "8px solid transparent",
          }}
        />

        {/* Media */}
        {mediaUrl && mediaType === "image" && (
          <div className="rounded-t-lg overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl}
              alt="Attachment"
              className="w-full max-h-48 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none"
              }}
            />
          </div>
        )}
        {mediaUrl && mediaType === "document" && (
          <div className="mx-1 mt-1 p-3 bg-[#d9fdd3] rounded-lg flex items-center gap-2">
            <div className="w-8 h-10 bg-red-500 rounded flex items-center justify-center text-white text-[10px] font-bold">
              PDF
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-800 truncate">document.pdf</p>
              <p className="text-[10px] text-gray-500">PDF • Download</p>
            </div>
          </div>
        )}
        {mediaUrl && mediaType === "video" && (
          <div className="mx-1 mt-1 p-3 bg-gray-100 rounded-lg flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-black/30 flex items-center justify-center">
              <div className="w-0 h-0 ml-1 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[14px] border-l-white" />
            </div>
          </div>
        )}

        {/* Text */}
        <div className="px-2 pt-1.5 pb-1">
          <div
            className="text-[14.5px] leading-[19px] text-gray-900"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
          />
          <div className="flex justify-end mt-0.5">
            <span className="text-[11px] text-gray-500">{time}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function WhatsAppPreviewSheet({
  open,
  onOpenChange,
  messageBody,
  mediaUrl,
  mediaType,
  templateName,
  senderName = "ORA Events",
}: WhatsAppPreviewProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const previewText = replacePlaceholders(messageBody || `[Template: ${templateName || "—"}]`)
  const html = parseWhatsAppMarkdown(previewText)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-ora-sand">
          <SheetTitle className="flex items-center gap-2 text-ora-charcoal">
            <MessageCircle className="h-5 w-5 stroke-1 text-[#25d366]" />
            WhatsApp Preview
          </SheetTitle>
          <SheetDescription>
            Preview how your message will appear to recipients
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto p-6 flex items-start justify-center bg-ora-cream/30">
          <WhatsAppPhoneFrame>
            <WhatsAppHeader senderName={senderName} />

            {/* Chat area with wallpaper pattern */}
            <div
              className="flex-1 overflow-auto p-3 space-y-2"
              style={{
                height: 580 - 52, // subtract header height
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8c4be' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            >
              {/* Date chip */}
              <div className="flex justify-center mb-2">
                <span className="bg-white/80 text-gray-600 text-[11px] px-3 py-1 rounded-lg shadow-sm">
                  Today
                </span>
              </div>

              <ChatBubble
                html={html}
                mediaUrl={mediaUrl || undefined}
                mediaType={mediaType || undefined}
              />
            </div>
          </WhatsAppPhoneFrame>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Inline preview button that opens the WhatsApp preview sheet
 */
export function WhatsAppPreviewButton(props: WhatsAppPreviewProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!props.messageBody && !props.templateName}
      >
        <Eye className="h-4 w-4 stroke-1" />
        Preview
      </Button>
      <WhatsAppPreviewSheet open={open} onOpenChange={setOpen} {...props} />
    </>
  )
}
