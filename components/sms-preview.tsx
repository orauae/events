"use client"

/**
 * SMS Message Preview Component
 *
 * Renders a phone-frame preview showing how SMS messages will look
 * to recipients. Shows message bubble with sender info.
 */

import { useState } from "react"
import { Eye, X, Signal, Wifi, Battery } from "lucide-react"
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui"

interface SmsPreviewProps {
  messageBody: string
  senderName?: string
}

/**
 * Replaces {{name}}, {{eventName}} etc. with sample values for preview
 */
function replacePlaceholders(text: string): string {
  const samples: Record<string, string> = {
    "{{firstName}}": "Sarah",
    "{{lastName}}": "Johnson",
    "{{eventName}}": "Annual Gala 2026",
    "{{eventDate}}": "March 15, 2026",
    "{{eventLocation}}": "Grand Ballroom",
    "{{rsvpLink}}": "https://ora.app/rsvp/abc123",
  }
  let result = text
  for (const [key, value] of Object.entries(samples)) {
    result = result.replaceAll(key, value)
  }
  return result
}

function SmsPhoneFrame({ messageBody, senderName = "ORA Events" }: SmsPreviewProps) {
  const previewText = replacePlaceholders(messageBody || "Your SMS message will appear here...")
  const now = new Date()
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

  return (
    <div className="flex justify-center">
      <div
        className="relative bg-black rounded-[40px] p-3 shadow-xl"
        style={{ width: 300, height: 560 }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-b-2xl z-10" />

        {/* Screen */}
        <div className="w-full h-full bg-white rounded-[32px] overflow-hidden flex flex-col">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[10px] text-gray-800">
            <span className="font-semibold">{timeStr}</span>
            <div className="flex items-center gap-1">
              <Signal className="h-3 w-3" />
              <Wifi className="h-3 w-3" />
              <Battery className="h-3 w-3" />
            </div>
          </div>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <button className="text-blue-500 text-sm">&lt;</button>
            <div className="flex-1 text-center">
              <p className="text-sm font-semibold text-gray-900">{senderName}</p>
              <p className="text-[10px] text-gray-500">SMS</p>
            </div>
            <div className="w-6" />
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-auto px-4 py-4 bg-white">
            {/* Date chip */}
            <div className="flex justify-center mb-4">
              <span className="text-[10px] text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                Today {timeStr}
              </span>
            </div>

            {/* SMS bubble */}
            <div className="flex justify-start mb-2">
              <div
                className="max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-gray-100"
              >
                <p className="text-[13px] text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
                  {previewText}
                </p>
                <p className="text-[9px] text-gray-400 text-right mt-1">{timeStr}</p>
              </div>
            </div>
          </div>

          {/* Input bar */}
          <div className="px-3 pb-3 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-100 rounded-full px-4 py-2">
                <span className="text-xs text-gray-400">Text Message</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                <span className="text-white text-xs">↑</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SmsPreviewButton({ messageBody, senderName }: SmsPreviewProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Eye className="h-4 w-4" />
        Preview SMS
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[440px]">
          <SheetHeader>
            <SheetTitle>SMS Preview</SheetTitle>
            <SheetDescription>
              How your message will appear on a recipient&apos;s phone
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <SmsPhoneFrame messageBody={messageBody} senderName={senderName} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

export { SmsPhoneFrame }
