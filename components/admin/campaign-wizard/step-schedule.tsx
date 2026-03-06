"use client"

/**
 * @fileoverview Campaign Wizard Step 4 - Schedule
 * 
 * Allows users to configure when to send their campaign:
 * - Send now: Immediately start sending the campaign
 * - Schedule for later: Set a specific date/time with timezone
 * - Save as draft: Save without scheduling
 * 
 * Supports recurring campaigns with daily, weekly, or monthly patterns
 * and optional end dates.
 * 
 * @module components/admin/campaign-wizard/step-schedule
 * @requires react
 * @requires lucide-react
 * 
 * Requirements: 4 (Multi-Step Campaign Creation Wizard)
 * Requirements: 4.4 - Schedule (send now, schedule for later, or save as draft)
 * Requirements: 13 (Campaign Scheduling and Automation)
 * Requirements: 13.6 - Recurring campaigns (daily, weekly, monthly)
 */

import { useState, useCallback, useEffect, useMemo } from "react"
import {
  Send,
  Clock,
  FileText,
  Check,
  Calendar,
  Globe,
  AlertCircle,
  Info,
  ChevronDown,
  Repeat,
  CalendarRange,
} from "lucide-react"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Send type options
 */
export type SendType = "now" | "scheduled" | "draft"

/**
 * Recurrence pattern options
 */
export type RecurrencePattern = "daily" | "weekly" | "monthly"

/**
 * Step schedule data structure
 */
export interface StepScheduleData {
  sendType: SendType
  scheduledAt: Date | null
  timezone: string
  isRecurring: boolean
  recurrencePattern: RecurrencePattern | null
  recurrenceEndDate: Date | null
}

/**
 * Props for the StepSchedule component
 */
export interface StepScheduleProps {
  data: StepScheduleData
  onChange: (updates: Partial<StepScheduleData>) => void
  recipientCount?: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Send type options with descriptions
 */
const SEND_TYPE_OPTIONS = [
  {
    value: "now" as const,
    label: "Send Now",
    description: "Start sending the campaign immediately after creation",
    icon: Send,
    color: "#5C8A6B",
  },
  {
    value: "scheduled" as const,
    label: "Schedule for Later",
    description: "Choose a specific date and time to send the campaign",
    icon: Clock,
    color: "#C4A35A",
  },
  {
    value: "draft" as const,
    label: "Save as Draft",
    description: "Save the campaign without scheduling, send later manually",
    icon: FileText,
    color: "#6B6B6B",
  },
]

/**
 * Recurrence pattern options with descriptions
 */
const RECURRENCE_PATTERN_OPTIONS = [
  {
    value: "daily" as const,
    label: "Daily",
    description: "Send every day at the scheduled time",
  },
  {
    value: "weekly" as const,
    label: "Weekly",
    description: "Send every week on the same day",
  },
  {
    value: "monthly" as const,
    label: "Monthly",
    description: "Send every month on the same date",
  },
]

/**
 * Common timezone options
 * Organized by region for easier selection
 */
const TIMEZONE_OPTIONS = [
  // Americas
  { value: "America/New_York", label: "Eastern Time (ET)", region: "Americas" },
  { value: "America/Chicago", label: "Central Time (CT)", region: "Americas" },
  { value: "America/Denver", label: "Mountain Time (MT)", region: "Americas" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)", region: "Americas" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)", region: "Americas" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HST)", region: "Americas" },
  { value: "America/Toronto", label: "Toronto (ET)", region: "Americas" },
  { value: "America/Vancouver", label: "Vancouver (PT)", region: "Americas" },
  { value: "America/Mexico_City", label: "Mexico City (CST)", region: "Americas" },
  { value: "America/Sao_Paulo", label: "São Paulo (BRT)", region: "Americas" },
  // Europe
  { value: "Europe/London", label: "London (GMT/BST)", region: "Europe" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)", region: "Europe" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)", region: "Europe" },
  { value: "Europe/Amsterdam", label: "Amsterdam (CET/CEST)", region: "Europe" },
  { value: "Europe/Madrid", label: "Madrid (CET/CEST)", region: "Europe" },
  { value: "Europe/Rome", label: "Rome (CET/CEST)", region: "Europe" },
  { value: "Europe/Zurich", label: "Zurich (CET/CEST)", region: "Europe" },
  { value: "Europe/Moscow", label: "Moscow (MSK)", region: "Europe" },
  // Asia & Pacific
  { value: "Asia/Dubai", label: "Dubai (GST)", region: "Asia & Pacific" },
  { value: "Asia/Kolkata", label: "India (IST)", region: "Asia & Pacific" },
  { value: "Asia/Singapore", label: "Singapore (SGT)", region: "Asia & Pacific" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (HKT)", region: "Asia & Pacific" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)", region: "Asia & Pacific" },
  { value: "Asia/Seoul", label: "Seoul (KST)", region: "Asia & Pacific" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)", region: "Asia & Pacific" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)", region: "Asia & Pacific" },
  { value: "Australia/Melbourne", label: "Melbourne (AEST/AEDT)", region: "Asia & Pacific" },
  { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT)", region: "Asia & Pacific" },
  // Africa & Middle East
  { value: "Africa/Cairo", label: "Cairo (EET)", region: "Africa & Middle East" },
  { value: "Africa/Johannesburg", label: "Johannesburg (SAST)", region: "Africa & Middle East" },
  { value: "Asia/Jerusalem", label: "Jerusalem (IST)", region: "Africa & Middle East" },
  // UTC
  { value: "UTC", label: "UTC (Coordinated Universal Time)", region: "UTC" },
]

/**
 * Get the user's local timezone
 */
function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return "UTC"
  }
}

/**
 * Format a date for datetime-local input
 */
function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * Parse a datetime-local input value to Date
 */
function parseDateTimeLocal(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return isNaN(date.getTime()) ? null : date
}

/**
 * Get minimum schedulable date (now + 15 minutes)
 */
function getMinScheduleDate(): Date {
  const now = new Date()
  now.setMinutes(now.getMinutes() + 15)
  return now
}

/**
 * Format date for display
 */
function formatDisplayDate(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
      timeZoneName: "short",
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

/**
 * Format date for display (date only, no time)
 */
function formatDisplayDateOnly(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: timezone,
    }).format(date)
  } catch {
    return date.toLocaleDateString()
  }
}

/**
 * Format a date for date input (YYYY-MM-DD)
 */
function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Parse a date input value to Date
 */
function parseDateInput(value: string): Date | null {
  if (!value) return null
  const date = new Date(value + "T00:00:00")
  return isNaN(date.getTime()) ? null : date
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Send type selection card
 */
function SendTypeCard({
  option,
  isSelected,
  onClick,
}: {
  option: typeof SEND_TYPE_OPTIONS[number]
  isSelected: boolean
  onClick: () => void
}) {
  const Icon = option.icon

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "16px",
        padding: "20px",
        border: isSelected ? `2px solid ${option.color}` : "1px solid #E8E4DF",
        borderRadius: "12px",
        backgroundColor: isSelected ? `${option.color}08` : "#FAFAFA",
        cursor: "pointer",
        transition: "all 0.2s ease",
        textAlign: "left",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          backgroundColor: isSelected ? `${option.color}15` : "#F5F3F0",
          flexShrink: 0,
        }}
      >
        <Icon
          style={{
            width: "24px",
            height: "24px",
            color: isSelected ? option.color : "#6B6B6B",
          }}
        />
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "15px",
            fontWeight: 500,
            color: isSelected ? option.color : "#2C2C2C",
            marginBottom: "4px",
          }}
        >
          {option.label}
        </div>
        <div style={{ fontSize: "13px", color: "#6B6B6B" }}>
          {option.description}
        </div>
      </div>
      {isSelected && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            backgroundColor: option.color,
            flexShrink: 0,
          }}
        >
          <Check style={{ width: "14px", height: "14px", color: "#FAFAFA" }} />
        </div>
      )}
    </button>
  )
}

/**
 * Timezone selector dropdown
 */
function TimezoneSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (timezone: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const selectedTimezone = TIMEZONE_OPTIONS.find((tz) => tz.value === value)

  // Group timezones by region
  const groupedTimezones = useMemo(() => {
    const filtered = TIMEZONE_OPTIONS.filter(
      (tz) =>
        tz.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tz.value.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const groups: Record<string, typeof TIMEZONE_OPTIONS> = {}
    filtered.forEach((tz) => {
      if (!groups[tz.region]) {
        groups[tz.region] = []
      }
      groups[tz.region].push(tz)
    })

    return groups
  }, [searchQuery])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest("[data-timezone-selector]")) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  return (
    <div data-timezone-selector style={{ position: "relative" }}>
      <label
        style={{
          display: "block",
          fontSize: "13px",
          fontWeight: 500,
          color: "#2C2C2C",
          marginBottom: "8px",
        }}
      >
        Timezone
      </label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "12px 16px",
          border: "1px solid #E8E4DF",
          borderRadius: "8px",
          backgroundColor: "#FAFAFA",
          fontSize: "14px",
          color: "#2C2C2C",
          cursor: "pointer",
          transition: "border-color 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Globe style={{ width: "18px", height: "18px", color: "#6B6B6B" }} />
          <span>{selectedTimezone?.label || value}</span>
        </div>
        <ChevronDown
          style={{
            width: "18px",
            height: "18px",
            color: "#6B6B6B",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            backgroundColor: "#FAFAFA",
            border: "1px solid #E8E4DF",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
            zIndex: 50,
            maxHeight: "300px",
            overflow: "hidden",
          }}
        >
          {/* Search input */}
          <div style={{ padding: "12px", borderBottom: "1px solid #E8E4DF" }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search timezones..."
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #E8E4DF",
                borderRadius: "6px",
                fontSize: "14px",
                color: "#2C2C2C",
                backgroundColor: "#F5F3F0",
                outline: "none",
              }}
              autoFocus
            />
          </div>

          {/* Timezone list */}
          <div style={{ maxHeight: "220px", overflowY: "auto" }}>
            {Object.entries(groupedTimezones).map(([region, timezones]) => (
              <div key={region}>
                <div
                  style={{
                    padding: "8px 16px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#9A9A9A",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    backgroundColor: "#F5F3F0",
                  }}
                >
                  {region}
                </div>
                {timezones.map((tz) => (
                  <button
                    key={tz.value}
                    onClick={() => {
                      onChange(tz.value)
                      setIsOpen(false)
                      setSearchQuery("")
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      padding: "10px 16px",
                      border: "none",
                      backgroundColor: value === tz.value ? "#F5F3F0" : "transparent",
                      fontSize: "14px",
                      color: "#2C2C2C",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background-color 0.2s ease",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = "#F5F3F0")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        value === tz.value ? "#F5F3F0" : "transparent")
                    }
                  >
                    <span>{tz.label}</span>
                    {value === tz.value && (
                      <Check
                        style={{ width: "16px", height: "16px", color: "#5C8A6B" }}
                      />
                    )}
                  </button>
                ))}
              </div>
            ))}
            {Object.keys(groupedTimezones).length === 0 && (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  color: "#6B6B6B",
                  fontSize: "14px",
                }}
              >
                No timezones found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Date/time picker for scheduling
 */
function DateTimePicker({
  value,
  onChange,
  minDate,
}: {
  value: Date | null
  onChange: (date: Date | null) => void
  minDate: Date
}) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const date = parseDateTimeLocal(e.target.value)
      onChange(date)
    },
    [onChange]
  )

  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "13px",
          fontWeight: 500,
          color: "#2C2C2C",
          marginBottom: "8px",
        }}
      >
        Date & Time <span style={{ color: "#B85C5C" }}>*</span>
      </label>
      <div style={{ position: "relative" }}>
        <Calendar
          style={{
            position: "absolute",
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "18px",
            height: "18px",
            color: "#6B6B6B",
            pointerEvents: "none",
          }}
        />
        <input
          type="datetime-local"
          value={value ? formatDateTimeLocal(value) : ""}
          onChange={handleChange}
          min={formatDateTimeLocal(minDate)}
          style={{
            width: "100%",
            padding: "12px 16px 12px 40px",
            border: "1px solid #E8E4DF",
            borderRadius: "8px",
            fontSize: "14px",
            color: "#2C2C2C",
            backgroundColor: "#FAFAFA",
            outline: "none",
            cursor: "pointer",
          }}
        />
      </div>
      <p style={{ fontSize: "12px", color: "#9A9A9A", marginTop: "6px" }}>
        Must be at least 15 minutes in the future
      </p>
    </div>
  )
}

/**
 * Recurring campaign options component
 */
function RecurringOptions({
  isRecurring,
  recurrencePattern,
  recurrenceEndDate,
  scheduledAt,
  timezone,
  onIsRecurringChange,
  onRecurrencePatternChange,
  onRecurrenceEndDateChange,
}: {
  isRecurring: boolean
  recurrencePattern: RecurrencePattern | null
  recurrenceEndDate: Date | null
  scheduledAt: Date | null
  timezone: string
  onIsRecurringChange: (isRecurring: boolean) => void
  onRecurrencePatternChange: (pattern: RecurrencePattern | null) => void
  onRecurrenceEndDateChange: (date: Date | null) => void
}) {
  // Calculate minimum end date (at least 1 day after scheduled date)
  const minEndDate = useMemo(() => {
    if (!scheduledAt) return new Date()
    const minDate = new Date(scheduledAt)
    minDate.setDate(minDate.getDate() + 1)
    return minDate
  }, [scheduledAt])

  return (
    <div
      style={{
        marginTop: "20px",
        padding: "20px",
        backgroundColor: "#FAFAFA",
        borderRadius: "8px",
        border: "1px solid #E8E4DF",
      }}
    >
      {/* Toggle for recurring */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: isRecurring ? "20px" : "0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Repeat style={{ width: "18px", height: "18px", color: "#6B6B6B" }} />
          <div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 500,
                color: "#2C2C2C",
              }}
            >
              Recurring Campaign
            </div>
            <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
              Automatically send this campaign on a schedule
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            onIsRecurringChange(!isRecurring)
            if (!isRecurring) {
              // Default to weekly when enabling
              onRecurrencePatternChange("weekly")
            } else {
              // Clear pattern and end date when disabling
              onRecurrencePatternChange(null)
              onRecurrenceEndDateChange(null)
            }
          }}
          style={{
            position: "relative",
            width: "48px",
            height: "26px",
            borderRadius: "13px",
            border: "none",
            backgroundColor: isRecurring ? "#5C8A6B" : "#E8E4DF",
            cursor: "pointer",
            transition: "background-color 0.2s ease",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "3px",
              left: isRecurring ? "25px" : "3px",
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              backgroundColor: "#FAFAFA",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
              transition: "left 0.2s ease",
            }}
          />
        </button>
      </div>

      {/* Recurring options (shown when enabled) */}
      {isRecurring && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Recurrence pattern selection */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "#2C2C2C",
                marginBottom: "8px",
              }}
            >
              Repeat <span style={{ color: "#B85C5C" }}>*</span>
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              {RECURRENCE_PATTERN_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onRecurrencePatternChange(option.value)}
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    border:
                      recurrencePattern === option.value
                        ? "2px solid #5C8A6B"
                        : "1px solid #E8E4DF",
                    borderRadius: "8px",
                    backgroundColor:
                      recurrencePattern === option.value
                        ? "rgba(92, 138, 107, 0.08)"
                        : "#FAFAFA",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 500,
                      color:
                        recurrencePattern === option.value
                          ? "#5C8A6B"
                          : "#2C2C2C",
                      marginBottom: "2px",
                    }}
                  >
                    {option.label}
                  </div>
                  <div style={{ fontSize: "11px", color: "#6B6B6B" }}>
                    {option.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* End date picker */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "#2C2C2C",
                marginBottom: "8px",
              }}
            >
              End Date{" "}
              <span style={{ fontSize: "12px", color: "#6B6B6B", fontWeight: 400 }}>
                (optional)
              </span>
            </label>
            <div style={{ position: "relative" }}>
              <CalendarRange
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "18px",
                  height: "18px",
                  color: "#6B6B6B",
                  pointerEvents: "none",
                }}
              />
              <input
                type="date"
                value={recurrenceEndDate ? formatDateInput(recurrenceEndDate) : ""}
                onChange={(e) => {
                  const date = parseDateInput(e.target.value)
                  onRecurrenceEndDateChange(date)
                }}
                min={formatDateInput(minEndDate)}
                style={{
                  width: "100%",
                  padding: "12px 16px 12px 40px",
                  border: "1px solid #E8E4DF",
                  borderRadius: "8px",
                  fontSize: "14px",
                  color: "#2C2C2C",
                  backgroundColor: "#FAFAFA",
                  outline: "none",
                  cursor: "pointer",
                }}
              />
            </div>
            <p style={{ fontSize: "12px", color: "#9A9A9A", marginTop: "6px" }}>
              Leave empty to continue indefinitely
            </p>
          </div>

          {/* Recurring summary */}
          {scheduledAt && recurrencePattern && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "12px 16px",
                backgroundColor: "rgba(196, 163, 90, 0.08)",
                borderRadius: "8px",
                border: "1px solid rgba(196, 163, 90, 0.2)",
              }}
            >
              <Repeat
                style={{
                  width: "16px",
                  height: "16px",
                  color: "#C4A35A",
                  flexShrink: 0,
                  marginTop: "2px",
                }}
              />
              <div style={{ fontSize: "13px", color: "#2C2C2C" }}>
                <span style={{ fontWeight: 500 }}>
                  {recurrencePattern === "daily" && "Every day"}
                  {recurrencePattern === "weekly" && "Every week"}
                  {recurrencePattern === "monthly" && "Every month"}
                </span>{" "}
                starting{" "}
                <span style={{ fontWeight: 500 }}>
                  {formatDisplayDate(scheduledAt, timezone)}
                </span>
                {recurrenceEndDate && (
                  <>
                    {" "}
                    until{" "}
                    <span style={{ fontWeight: 500 }}>
                      {formatDisplayDateOnly(recurrenceEndDate, timezone)}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Step Schedule Component
 * 
 * Campaign wizard step for configuring when to send the campaign.
 * Provides three options: send now, schedule for later, or save as draft.
 * 
 * Features:
 * - Send type selection with clear descriptions
 * - Date/time picker for scheduled sends
 * - Timezone selector with search
 * - Preview of scheduled time
 * - Validation for minimum schedule time
 * - Recurring campaign options (daily, weekly, monthly)
 * - Optional end date for recurring campaigns
 * 
 * @example
 * ```tsx
 * <StepSchedule
 *   data={{
 *     sendType: "scheduled",
 *     scheduledAt: new Date(),
 *     timezone: "America/New_York",
 *     isRecurring: true,
 *     recurrencePattern: "weekly",
 *     recurrenceEndDate: null,
 *   }}
 *   onChange={(updates) => setData({ ...data, ...updates })}
 *   recipientCount={1500}
 * />
 * ```
 * 
 * Requirements: 4 (Multi-Step Campaign Creation Wizard)
 * Requirements: 4.4 - Schedule step
 * Requirements: 13 (Campaign Scheduling and Automation)
 * Requirements: 13.6 - Recurring campaigns (daily, weekly, monthly)
 */
export function StepSchedule({
  data,
  onChange,
  recipientCount = 0,
}: StepScheduleProps) {
  const minScheduleDate = useMemo(() => getMinScheduleDate(), [])

  // Initialize timezone to user's local timezone if not set
  useEffect(() => {
    if (!data.timezone) {
      onChange({ timezone: getLocalTimezone() })
    }
  }, [data.timezone, onChange])

  /**
   * Handle send type change
   */
  const handleSendTypeChange = useCallback(
    (sendType: SendType) => {
      onChange({ sendType })
      
      // Clear scheduled date and recurring options if switching away from scheduled
      if (sendType !== "scheduled") {
        onChange({ 
          sendType, 
          scheduledAt: null,
          isRecurring: false,
          recurrencePattern: null,
          recurrenceEndDate: null,
        })
      }
    },
    [onChange]
  )

  /**
   * Handle scheduled date change
   */
  const handleScheduledAtChange = useCallback(
    (scheduledAt: Date | null) => {
      onChange({ scheduledAt })
    },
    [onChange]
  )

  /**
   * Handle timezone change
   */
  const handleTimezoneChange = useCallback(
    (timezone: string) => {
      onChange({ timezone })
    },
    [onChange]
  )

  /**
   * Handle recurring toggle change
   */
  const handleIsRecurringChange = useCallback(
    (isRecurring: boolean) => {
      onChange({ isRecurring })
    },
    [onChange]
  )

  /**
   * Handle recurrence pattern change
   */
  const handleRecurrencePatternChange = useCallback(
    (recurrencePattern: RecurrencePattern | null) => {
      onChange({ recurrencePattern })
    },
    [onChange]
  )

  /**
   * Handle recurrence end date change
   */
  const handleRecurrenceEndDateChange = useCallback(
    (recurrenceEndDate: Date | null) => {
      onChange({ recurrenceEndDate })
    },
    [onChange]
  )

  /**
   * Check if scheduled date is valid
   */
  const isScheduledDateValid = useMemo(() => {
    if (data.sendType !== "scheduled") return true
    if (!data.scheduledAt) return false
    return data.scheduledAt > minScheduleDate
  }, [data.sendType, data.scheduledAt, minScheduleDate])

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 300,
            letterSpacing: "0.02em",
            color: "#2C2C2C",
            marginBottom: "8px",
          }}
        >
          When to Send
        </h2>
        <p style={{ color: "#6B6B6B", fontSize: "14px" }}>
          Choose when you want to send this campaign to{" "}
          {recipientCount > 0 ? (
            <span style={{ fontWeight: 500, color: "#2C2C2C" }}>
              {recipientCount.toLocaleString()} recipient{recipientCount !== 1 ? "s" : ""}
            </span>
          ) : (
            "your recipients"
          )}
        </p>
      </div>

      {/* Send type selection */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "32px" }}>
        {SEND_TYPE_OPTIONS.map((option) => (
          <SendTypeCard
            key={option.value}
            option={option}
            isSelected={data.sendType === option.value}
            onClick={() => handleSendTypeChange(option.value)}
          />
        ))}
      </div>

      {/* Schedule configuration (only shown when "scheduled" is selected) */}
      {data.sendType === "scheduled" && (
        <div
          style={{
            padding: "24px",
            backgroundColor: "#F5F3F0",
            borderRadius: "12px",
            border: "1px solid #E8E4DF",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "20px",
            }}
          >
            <Clock style={{ width: "18px", height: "18px", color: "#C4A35A" }} />
            <h3
              style={{
                fontSize: "15px",
                fontWeight: 500,
                color: "#2C2C2C",
              }}
            >
              Schedule Details
            </h3>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Date/time picker */}
            <DateTimePicker
              value={data.scheduledAt}
              onChange={handleScheduledAtChange}
              minDate={minScheduleDate}
            />

            {/* Timezone selector */}
            <TimezoneSelector
              value={data.timezone || getLocalTimezone()}
              onChange={handleTimezoneChange}
            />

            {/* Schedule preview */}
            {data.scheduledAt && isScheduledDateValid && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "16px",
                  backgroundColor: "rgba(92, 138, 107, 0.08)",
                  borderRadius: "8px",
                  border: "1px solid rgba(92, 138, 107, 0.2)",
                }}
              >
                <Check
                  style={{
                    width: "18px",
                    height: "18px",
                    color: "#5C8A6B",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                />
                <div>
                  <p
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#5C8A6B",
                      marginBottom: "4px",
                    }}
                  >
                    Campaign will be sent on:
                  </p>
                  <p style={{ fontSize: "14px", color: "#2C2C2C" }}>
                    {formatDisplayDate(data.scheduledAt, data.timezone || "UTC")}
                  </p>
                </div>
              </div>
            )}

            {/* Validation error */}
            {data.scheduledAt && !isScheduledDateValid && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "16px",
                  backgroundColor: "rgba(184, 92, 92, 0.08)",
                  borderRadius: "8px",
                  border: "1px solid rgba(184, 92, 92, 0.2)",
                }}
              >
                <AlertCircle
                  style={{
                    width: "18px",
                    height: "18px",
                    color: "#B85C5C",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                />
                <div>
                  <p
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#B85C5C",
                      marginBottom: "4px",
                    }}
                  >
                    Invalid schedule time
                  </p>
                  <p style={{ fontSize: "13px", color: "#6B6B6B" }}>
                    Please select a time at least 15 minutes in the future.
                  </p>
                </div>
              </div>
            )}

            {/* Recurring campaign options */}
            <RecurringOptions
              isRecurring={data.isRecurring || false}
              recurrencePattern={data.recurrencePattern || null}
              recurrenceEndDate={data.recurrenceEndDate || null}
              scheduledAt={data.scheduledAt}
              timezone={data.timezone || getLocalTimezone()}
              onIsRecurringChange={handleIsRecurringChange}
              onRecurrencePatternChange={handleRecurrencePatternChange}
              onRecurrenceEndDateChange={handleRecurrenceEndDateChange}
            />
          </div>
        </div>
      )}

      {/* Send now info */}
      {data.sendType === "now" && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            padding: "16px",
            backgroundColor: "rgba(92, 138, 107, 0.08)",
            borderRadius: "8px",
            border: "1px solid rgba(92, 138, 107, 0.2)",
          }}
        >
          <Info
            style={{
              width: "18px",
              height: "18px",
              color: "#5C8A6B",
              flexShrink: 0,
              marginTop: "2px",
            }}
          />
          <div>
            <p
              style={{
                fontSize: "13px",
                fontWeight: 500,
                color: "#5C8A6B",
                marginBottom: "4px",
              }}
            >
              Ready to send
            </p>
            <p style={{ fontSize: "13px", color: "#6B6B6B" }}>
              The campaign will start sending immediately after you click "Create Campaign" on the next step.
              {recipientCount > 0 && (
                <> Sending to {recipientCount.toLocaleString()} recipient{recipientCount !== 1 ? "s" : ""} may take a few minutes.</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Draft info */}
      {data.sendType === "draft" && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            padding: "16px",
            backgroundColor: "rgba(107, 107, 107, 0.08)",
            borderRadius: "8px",
            border: "1px solid rgba(107, 107, 107, 0.2)",
          }}
        >
          <Info
            style={{
              width: "18px",
              height: "18px",
              color: "#6B6B6B",
              flexShrink: 0,
              marginTop: "2px",
            }}
          />
          <div>
            <p
              style={{
                fontSize: "13px",
                fontWeight: 500,
                color: "#6B6B6B",
                marginBottom: "4px",
              }}
            >
              Save as draft
            </p>
            <p style={{ fontSize: "13px", color: "#6B6B6B" }}>
              The campaign will be saved but not sent. You can schedule or send it later from the campaign list.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default StepSchedule
