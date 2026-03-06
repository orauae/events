"use client"

/**
 * @fileoverview Step Options Component - Import options step for import wizard
 * 
 * Allows users to configure import options like duplicate handling
 * and event assignment.
 * 
 * @module components/guests/import-wizard/step-options
 * @requires react
 * 
 * Requirements: 8 (Full-Page Guest Import Wizard)
 */

import { AlertCircle, Users, RefreshCw, Plus, SkipForward } from "lucide-react"
import type { Event } from "@/db/schema"
import type { ImportOptions } from "@/lib/services/import-parser"

// ============================================================================
// TYPES
// ============================================================================

export interface StepOptionsProps {
  options: ImportOptions
  onOptionsChange: (options: ImportOptions) => void
  events: Event[]
  isLoadingEvents: boolean
  validRowCount: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DUPLICATE_OPTIONS = [
  {
    value: "update" as const,
    label: "Update existing guests",
    description: "If a guest with the same email exists, update their information",
    icon: RefreshCw,
  },
  {
    value: "skip" as const,
    label: "Skip duplicates",
    description: "If a guest with the same email exists, skip the row",
    icon: SkipForward,
  },
  {
    value: "create_new" as const,
    label: "Create new entries",
    description: "Create new guest entries even if email exists (not recommended)",
    icon: Plus,
  },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function StepOptions({
  options,
  onOptionsChange,
  events,
  isLoadingEvents,
  validRowCount,
}: StepOptionsProps) {
  const handleDuplicateChange = (value: ImportOptions["duplicateHandling"]) => {
    onOptionsChange({ ...options, duplicateHandling: value })
  }

  const handleEventChange = (eventId: string) => {
    onOptionsChange({ ...options, eventId: eventId || undefined })
  }

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 300, color: "#2C2C2C", marginBottom: "8px" }}>
          Import Options
        </h2>
        <p style={{ fontSize: "14px", color: "#6B6B6B" }}>
          Configure how the import should handle duplicates and event assignment
        </p>
      </div>

      {/* Summary */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "16px",
          marginBottom: "24px",
          backgroundColor: "rgba(92, 138, 107, 0.1)",
          borderRadius: "8px",
        }}
      >
        <Users style={{ width: "24px", height: "24px", color: "#5C8A6B" }} />
        <div>
          <div style={{ fontSize: "16px", fontWeight: 500, color: "#5C8A6B" }}>
            {validRowCount.toLocaleString()} guests ready to import
          </div>
          <div style={{ fontSize: "13px", color: "#6B6B6B" }}>
            Configure the options below before starting the import
          </div>
        </div>
      </div>

      {/* Duplicate Handling */}
      <div style={{ marginBottom: "32px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 500, color: "#2C2C2C", marginBottom: "12px" }}>
          Duplicate Handling
        </h3>
        <p style={{ fontSize: "13px", color: "#6B6B6B", marginBottom: "16px" }}>
          Choose how to handle guests that already exist in the system (matched by email)
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {DUPLICATE_OPTIONS.map((option) => {
            const Icon = option.icon
            const isSelected = options.duplicateHandling === option.value
            return (
              <button
                key={option.value}
                onClick={() => handleDuplicateChange(option.value)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "16px",
                  border: `2px solid ${isSelected ? "#C4A35A" : "#E8E4DF"}`,
                  borderRadius: "8px",
                  backgroundColor: isSelected ? "rgba(196, 163, 90, 0.05)" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "40px",
                    height: "40px",
                    borderRadius: "8px",
                    backgroundColor: isSelected ? "rgba(196, 163, 90, 0.1)" : "#F5F3F0",
                    flexShrink: 0,
                  }}
                >
                  <Icon
                    style={{
                      width: "20px",
                      height: "20px",
                      color: isSelected ? "#C4A35A" : "#6B6B6B",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 500,
                      color: isSelected ? "#C4A35A" : "#2C2C2C",
                      marginBottom: "4px",
                    }}
                  >
                    {option.label}
                  </div>
                  <div style={{ fontSize: "13px", color: "#6B6B6B" }}>
                    {option.description}
                  </div>
                </div>
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    border: `2px solid ${isSelected ? "#C4A35A" : "#E8E4DF"}`,
                    backgroundColor: isSelected ? "#C4A35A" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {isSelected && (
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: "#FAFAFA",
                      }}
                    />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Event Assignment */}
      <div style={{ marginBottom: "32px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 500, color: "#2C2C2C", marginBottom: "12px" }}>
          Event Assignment (Optional)
        </h3>
        <p style={{ fontSize: "13px", color: "#6B6B6B", marginBottom: "16px" }}>
          Optionally assign all imported guests to an event
        </p>
        <select
          value={options.eventId || ""}
          onChange={(e) => handleEventChange(e.target.value)}
          disabled={isLoadingEvents}
          style={{
            width: "100%",
            padding: "12px 16px",
            border: "1px solid #E8E4DF",
            borderRadius: "8px",
            backgroundColor: "#FAFAFA",
            fontSize: "14px",
            color: "#2C2C2C",
            cursor: isLoadingEvents ? "not-allowed" : "pointer",
          }}
        >
          <option value="">-- No event assignment --</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
        {isLoadingEvents && (
          <p style={{ fontSize: "12px", color: "#9A9A9A", marginTop: "8px" }}>
            Loading events...
          </p>
        )}
      </div>

      {/* Info Box */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          padding: "16px",
          backgroundColor: "#F5F3F0",
          borderRadius: "8px",
        }}
      >
        <AlertCircle style={{ width: "20px", height: "20px", color: "#C4A35A", flexShrink: 0 }} />
        <div style={{ fontSize: "13px", color: "#6B6B6B" }}>
          <strong style={{ color: "#2C2C2C" }}>Note:</strong> The import process will run in the background.
          You can track progress on the next step. Large imports may take several minutes to complete.
        </div>
      </div>
    </div>
  )
}

export default StepOptions
