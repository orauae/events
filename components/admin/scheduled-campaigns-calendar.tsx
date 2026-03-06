"use client"

/**
 * @fileoverview Scheduled Campaigns Calendar View
 * 
 * A calendar component that displays scheduled campaigns in a monthly view.
 * Allows users to see at a glance when campaigns are scheduled to be sent.
 * 
 * Features:
 * - Monthly calendar view with navigation
 * - Campaign indicators on scheduled dates
 * - Click to view campaign details
 * - Recurring campaign indicators
 * - Today highlight
 * 
 * @module components/admin/scheduled-campaigns-calendar
 * @requires react
 * @requires lucide-react
 * 
 * Requirements: 13.3 - Display scheduled campaigns in a calendar view
 */

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Repeat,
  Mail,
  Eye,
} from "lucide-react"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Scheduled campaign data for calendar display
 */
export interface ScheduledCampaign {
  id: string
  campaignId: string
  campaignName: string
  scheduledAt: Date
  timezone: string
  isRecurring: boolean
  recurrencePattern: "daily" | "weekly" | "monthly" | null
  eventName?: string
  status: string
}

/**
 * Props for the ScheduledCampaignsCalendar component
 */
export interface ScheduledCampaignsCalendarProps {
  campaigns: ScheduledCampaign[]
  onCampaignClick?: (campaignId: string) => void
  isLoading?: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the first day of the month
 */
function getFirstDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1)
}

/**
 * Get the last day of the month
 */
function getLastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0)
}

/**
 * Get all days to display in the calendar grid (including padding days)
 */
function getCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = getFirstDayOfMonth(year, month)
  const lastDay = getLastDayOfMonth(year, month)
  const days: (Date | null)[] = []
  
  // Add padding days from previous month
  const startPadding = firstDay.getDay()
  for (let i = 0; i < startPadding; i++) {
    days.push(null)
  }
  
  // Add days of the month
  for (let day = 1; day <= lastDay.getDate(); day++) {
    days.push(new Date(year, month, day))
  }
  
  // Add padding days for next month to complete the grid
  const endPadding = 7 - (days.length % 7)
  if (endPadding < 7) {
    for (let i = 0; i < endPadding; i++) {
      days.push(null)
    }
  }
  
  return days
}

/**
 * Check if two dates are the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/**
 * Format time for display
 */
function formatTime(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(date)
  } catch {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Campaign indicator dot
 */
function CampaignDot({ campaign, onClick }: { campaign: ScheduledCampaign; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={`${campaign.campaignName} - ${formatTime(new Date(campaign.scheduledAt), campaign.timezone)}`}
      style={{
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        backgroundColor: campaign.isRecurring ? "#C4A35A" : "#5C8A6B",
        border: "none",
        cursor: "pointer",
        transition: "transform 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.3)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)"
      }}
    />
  )
}

/**
 * Campaign popup for a day
 */
function DayCampaignsPopup({
  campaigns,
  date,
  onCampaignClick,
  onClose,
}: {
  campaigns: ScheduledCampaign[]
  date: Date
  onCampaignClick: (campaignId: string) => void
  onClose: () => void
}) {
  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: "absolute",
          top: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          marginTop: "8px",
          minWidth: "280px",
          backgroundColor: "#FAFAFA",
          border: "1px solid #E8E4DF",
          borderRadius: "12px",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
          zIndex: 50,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #E8E4DF",
            backgroundColor: "#F5F3F0",
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: 500, color: "#2C2C2C" }}>
            {date.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </div>
          <div style={{ fontSize: "12px", color: "#6B6B6B", marginTop: "2px" }}>
            {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""} scheduled
          </div>
        </div>

        {/* Campaign list */}
        <div style={{ maxHeight: "240px", overflowY: "auto" }}>
          {campaigns.map((campaign) => (
            <button
              key={campaign.id}
              onClick={() => onCampaignClick(campaign.campaignId)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                width: "100%",
                padding: "12px 16px",
                border: "none",
                borderBottom: "1px solid #E8E4DF",
                backgroundColor: "transparent",
                cursor: "pointer",
                textAlign: "left",
                transition: "background-color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F5F3F0"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  backgroundColor: campaign.isRecurring
                    ? "rgba(196, 163, 90, 0.1)"
                    : "rgba(92, 138, 107, 0.1)",
                  flexShrink: 0,
                }}
              >
                {campaign.isRecurring ? (
                  <Repeat
                    style={{
                      width: "16px",
                      height: "16px",
                      color: "#C4A35A",
                    }}
                  />
                ) : (
                  <Mail
                    style={{
                      width: "16px",
                      height: "16px",
                      color: "#5C8A6B",
                    }}
                  />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#2C2C2C",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {campaign.campaignName}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "4px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "12px",
                      color: "#6B6B6B",
                    }}
                  >
                    <Clock style={{ width: "12px", height: "12px" }} />
                    {formatTime(new Date(campaign.scheduledAt), campaign.timezone)}
                  </div>
                  {campaign.isRecurring && campaign.recurrencePattern && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 500,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor: "rgba(196, 163, 90, 0.1)",
                        color: "#C4A35A",
                        textTransform: "capitalize",
                      }}
                    >
                      {campaign.recurrencePattern}
                    </span>
                  )}
                </div>
                {campaign.eventName && (
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#9A9A9A",
                      marginTop: "4px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {campaign.eventName}
                  </div>
                )}
              </div>
              <Eye
                style={{
                  width: "14px",
                  height: "14px",
                  color: "#9A9A9A",
                  flexShrink: 0,
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/**
 * Calendar day cell
 */
function CalendarDay({
  date,
  campaigns,
  isToday,
  onCampaignClick,
}: {
  date: Date | null
  campaigns: ScheduledCampaign[]
  isToday: boolean
  onCampaignClick: (campaignId: string) => void
}) {
  const [showPopup, setShowPopup] = useState(false)

  if (!date) {
    return (
      <div
        style={{
          minHeight: "80px",
          backgroundColor: "#F5F3F0",
          borderRadius: "4px",
        }}
      />
    )
  }

  const hasCampaigns = campaigns.length > 0

  return (
    <div
      style={{
        position: "relative",
        minHeight: "80px",
        padding: "8px",
        backgroundColor: isToday ? "rgba(92, 138, 107, 0.05)" : "#FAFAFA",
        border: isToday ? "2px solid #5C8A6B" : "1px solid #E8E4DF",
        borderRadius: "8px",
        cursor: hasCampaigns ? "pointer" : "default",
        transition: "all 0.2s ease",
      }}
      onClick={() => hasCampaigns && setShowPopup(true)}
      onMouseEnter={(e) => {
        if (hasCampaigns) {
          e.currentTarget.style.backgroundColor = isToday
            ? "rgba(92, 138, 107, 0.1)"
            : "#F5F3F0"
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isToday
          ? "rgba(92, 138, 107, 0.05)"
          : "#FAFAFA"
      }}
    >
      {/* Day number */}
      <div
        style={{
          fontSize: "13px",
          fontWeight: isToday ? 600 : 400,
          color: isToday ? "#5C8A6B" : "#2C2C2C",
          marginBottom: "8px",
        }}
      >
        {date.getDate()}
      </div>

      {/* Campaign indicators */}
      {hasCampaigns && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
          }}
        >
          {campaigns.slice(0, 4).map((campaign) => (
            <CampaignDot
              key={campaign.id}
              campaign={campaign}
              onClick={() => onCampaignClick(campaign.campaignId)}
            />
          ))}
          {campaigns.length > 4 && (
            <span
              style={{
                fontSize: "10px",
                color: "#6B6B6B",
                fontWeight: 500,
              }}
            >
              +{campaigns.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Popup */}
      {showPopup && (
        <DayCampaignsPopup
          campaigns={campaigns}
          date={date}
          onCampaignClick={onCampaignClick}
          onClose={() => setShowPopup(false)}
        />
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * ScheduledCampaignsCalendar Component
 * 
 * Displays scheduled campaigns in a monthly calendar view.
 * 
 * Features:
 * - Monthly navigation
 * - Campaign indicators on scheduled dates
 * - Click to view campaign details
 * - Recurring campaign indicators
 * - Today highlight
 * 
 * @example
 * ```tsx
 * <ScheduledCampaignsCalendar
 *   campaigns={scheduledCampaigns}
 *   onCampaignClick={(id) => router.push(`/admin/campaigns/${id}`)}
 * />
 * ```
 * 
 * Requirements: 13.3 - Display scheduled campaigns in a calendar view
 */
export function ScheduledCampaignsCalendar({
  campaigns,
  onCampaignClick,
  isLoading = false,
}: ScheduledCampaignsCalendarProps) {
  const router = useRouter()
  const today = new Date()
  
  // Current month state
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())

  // Get calendar days for current month
  const calendarDays = useMemo(
    () => getCalendarDays(currentYear, currentMonth),
    [currentYear, currentMonth]
  )

  // Group campaigns by date
  const campaignsByDate = useMemo(() => {
    const map = new Map<string, ScheduledCampaign[]>()
    
    campaigns.forEach((campaign) => {
      const date = new Date(campaign.scheduledAt)
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(campaign)
    })
    
    return map
  }, [campaigns])

  // Get campaigns for a specific date
  const getCampaignsForDate = useCallback(
    (date: Date | null): ScheduledCampaign[] => {
      if (!date) return []
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      return campaignsByDate.get(key) || []
    },
    [campaignsByDate]
  )

  // Navigation handlers
  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(currentYear - 1)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(currentYear + 1)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }

  const goToToday = () => {
    setCurrentYear(today.getFullYear())
    setCurrentMonth(today.getMonth())
  }

  // Handle campaign click
  const handleCampaignClick = (campaignId: string) => {
    if (onCampaignClick) {
      onCampaignClick(campaignId)
    } else {
      router.push(`/admin/campaigns/${campaignId}`)
    }
  }

  // Count campaigns in current month
  const campaignsInMonth = useMemo(() => {
    return campaigns.filter((c) => {
      const date = new Date(c.scheduledAt)
      return date.getFullYear() === currentYear && date.getMonth() === currentMonth
    }).length
  }, [campaigns, currentYear, currentMonth])

  if (isLoading) {
    return (
      <div
        style={{
          backgroundColor: "#FAFAFA",
          border: "1px solid #E8E4DF",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "400px",
            color: "#6B6B6B",
          }}
        >
          Loading calendar...
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        backgroundColor: "#FAFAFA",
        border: "1px solid #E8E4DF",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 24px",
          borderBottom: "1px solid #E8E4DF",
          backgroundColor: "#F5F3F0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Calendar style={{ width: "20px", height: "20px", color: "#6B6B6B" }} />
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 500,
                color: "#2C2C2C",
                margin: 0,
              }}
            >
              {MONTHS[currentMonth]} {currentYear}
            </h3>
          </div>
          {campaignsInMonth > 0 && (
            <span
              style={{
                fontSize: "12px",
                fontWeight: 500,
                padding: "4px 10px",
                borderRadius: "9999px",
                backgroundColor: "rgba(92, 138, 107, 0.1)",
                color: "#5C8A6B",
              }}
            >
              {campaignsInMonth} scheduled
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={goToToday}
            style={{
              padding: "8px 16px",
              border: "1px solid #E8E4DF",
              borderRadius: "6px",
              backgroundColor: "#FAFAFA",
              fontSize: "13px",
              fontWeight: 500,
              color: "#2C2C2C",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F5F3F0"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#FAFAFA"
            }}
          >
            Today
          </button>
          <button
            onClick={goToPreviousMonth}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              border: "1px solid #E8E4DF",
              borderRadius: "6px",
              backgroundColor: "#FAFAFA",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F5F3F0"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#FAFAFA"
            }}
          >
            <ChevronLeft style={{ width: "18px", height: "18px", color: "#6B6B6B" }} />
          </button>
          <button
            onClick={goToNextMonth}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              border: "1px solid #E8E4DF",
              borderRadius: "6px",
              backgroundColor: "#FAFAFA",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F5F3F0"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#FAFAFA"
            }}
          >
            <ChevronRight style={{ width: "18px", height: "18px", color: "#6B6B6B" }} />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div style={{ padding: "16px" }}>
        {/* Day headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          {DAYS_OF_WEEK.map((day) => (
            <div
              key={day}
              style={{
                textAlign: "center",
                fontSize: "12px",
                fontWeight: 500,
                color: "#6B6B6B",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "8px 0",
              }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "8px",
          }}
        >
          {calendarDays.map((date, index) => (
            <CalendarDay
              key={index}
              date={date}
              campaigns={getCampaignsForDate(date)}
              isToday={date ? isSameDay(date, today) : false}
              onCampaignClick={handleCampaignClick}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "24px",
          padding: "16px 24px",
          borderTop: "1px solid #E8E4DF",
          backgroundColor: "#F5F3F0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: "#5C8A6B",
            }}
          />
          <span style={{ fontSize: "12px", color: "#6B6B6B" }}>One-time campaign</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: "#C4A35A",
            }}
          />
          <span style={{ fontSize: "12px", color: "#6B6B6B" }}>Recurring campaign</span>
        </div>
      </div>
    </div>
  )
}

export default ScheduledCampaignsCalendar
