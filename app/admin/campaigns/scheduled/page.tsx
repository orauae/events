"use client"

/**
 * @fileoverview Admin Scheduled Campaigns Calendar Page
 * 
 * Displays scheduled campaigns in a calendar view for easy visualization
 * of upcoming campaign sends.
 * 
 * @module app/admin/campaigns/scheduled/page
 * 
 * Requirements: 13.3 - Display scheduled campaigns in a calendar view
 */

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Calendar, Clock, Mail, Repeat, AlertCircle } from "lucide-react"
import { ORAAccentLine } from "@/components/ui/ora-brand"
import { Skeleton } from "@/components/ui/skeleton"
import { ScheduledCampaignsCalendar } from "@/components/admin/scheduled-campaigns-calendar"
import { useScheduledCampaignsForMonth, useUpcomingScheduledCampaigns } from "@/hooks/use-scheduled-campaigns"

/**
 * Format date for display
 */
function formatDate(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

/**
 * Upcoming campaign card
 */
function UpcomingCampaignCard({
  campaign,
  onClick,
}: {
  campaign: {
    id: string
    campaignId: string
    campaignName: string
    scheduledAt: Date
    timezone: string
    isRecurring: boolean
    recurrencePattern: string | null
  }
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        width: "100%",
        padding: "16px",
        border: "1px solid transparent",
        
        backgroundColor: "#FFFFFF",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "#FFFFFF"
        e.currentTarget.style.borderColor = "#B8956B"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "#FFFFFF"
        e.currentTarget.style.borderColor = "transparent"
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "40px",
          height: "40px",
          
          backgroundColor: campaign.isRecurring
            ? "rgba(196, 163, 90, 0.1)"
            : "rgba(92, 138, 107, 0.1)",
          flexShrink: 0,
        }}
      >
        {campaign.isRecurring ? (
          <Repeat style={{ width: "20px", height: "20px", color: "#C4A35A" }} />
        ) : (
          <Mail style={{ width: "20px", height: "20px", color: "#5C8A6B" }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 500,
            color: "#2C2C2C",
            marginBottom: "4px",
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
            fontSize: "13px",
            color: "#6B6B6B",
          }}
        >
          <Clock style={{ width: "14px", height: "14px" }} />
          {formatDate(new Date(campaign.scheduledAt), campaign.timezone)}
        </div>
        {campaign.isRecurring && campaign.recurrencePattern && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              marginTop: "8px",
              padding: "4px 8px",
              borderRadius: "4px",
              backgroundColor: "rgba(196, 163, 90, 0.1)",
              fontSize: "11px",
              fontWeight: 500,
              color: "#C4A35A",
              textTransform: "capitalize",
            }}
          >
            <Repeat style={{ width: "10px", height: "10px" }} />
            {campaign.recurrencePattern}
          </div>
        )}
      </div>
    </button>
  )
}

/**
 * Loading skeleton for the page
 */
function PageSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Header */}
      <div>
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Content */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "24px" }}>
        <Skeleton className="h-[500px] rounded-xl" />
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

/**
 * Admin Scheduled Campaigns Page
 * 
 * Displays a calendar view of scheduled campaigns with an upcoming
 * campaigns sidebar.
 * 
 * Requirements: 13.3 - Display scheduled campaigns in a calendar view
 */
export default function AdminScheduledCampaignsPage() {
  const router = useRouter()
  const today = new Date()
  
  // Current month state for calendar
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())

  // Fetch scheduled campaigns for the current month
  const {
    data: monthCampaigns,
    isLoading: isLoadingMonth,
    error: monthError,
  } = useScheduledCampaignsForMonth(currentYear, currentMonth)

  // Fetch upcoming campaigns (next 7 days)
  const {
    data: upcomingCampaigns,
    isLoading: isLoadingUpcoming,
  } = useUpcomingScheduledCampaigns(7)

  // Handle campaign click
  const handleCampaignClick = (campaignId: string) => {
    router.push(`/admin/campaigns/${campaignId}`)
  }

  if (isLoadingMonth && isLoadingUpcoming) {
    return <PageSkeleton />
  }

  if (monthError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        {/* Header */}
        <div>
          <Link
            href="/admin/campaigns"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "14px",
              color: "#6B6B6B",
              textDecoration: "none",
              marginBottom: "16px",
              transition: "color 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#2C2C2C")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#6B6B6B")}
          >
            <ArrowLeft style={{ width: "16px", height: "16px" }} />
            Back to Campaigns
          </Link>
          <ORAAccentLine className="mb-4" />
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 300,
              letterSpacing: "0.02em",
              color: "#2C2C2C",
              marginBottom: "8px",
            }}
          >
            Scheduled Campaigns
          </h1>
        </div>

        {/* Error state */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "64px",
            backgroundColor: "#FFFFFF",
            border: "1px solid transparent",
            
          }}
        >
          <AlertCircle
            style={{ width: "48px", height: "48px", color: "#B85C5C", marginBottom: "16px" }}
          />
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 500,
              color: "#2C2C2C",
              marginBottom: "8px",
            }}
          >
            Error Loading Calendar
          </h2>
          <p style={{ color: "#6B6B6B", marginBottom: "20px" }}>
            {monthError instanceof Error ? monthError.message : "Failed to load scheduled campaigns"}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 20px",
              backgroundColor: "#2C2C2C",
              color: "#FAFAFA",
              border: "none",
              borderRadius: "9999px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Header */}
      <div>
        <Link
          href="/admin/campaigns"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
            color: "#6B6B6B",
            textDecoration: "none",
            marginBottom: "16px",
            transition: "color 0.2s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#2C2C2C")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#6B6B6B")}
        >
          <ArrowLeft style={{ width: "16px", height: "16px" }} />
          Back to Campaigns
        </Link>
        <ORAAccentLine className="mb-4" />
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 300,
            letterSpacing: "0.02em",
            color: "#2C2C2C",
            marginBottom: "8px",
          }}
        >
          Scheduled Campaigns
        </h1>
        <p style={{ color: "#6B6B6B", fontSize: "14px" }}>
          View and manage your scheduled campaign sends in a calendar view
        </p>
      </div>

      {/* Content */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: "24px",
        }}
      >
        {/* Calendar */}
        <ScheduledCampaignsCalendar
          campaigns={monthCampaigns || []}
          onCampaignClick={handleCampaignClick}
          isLoading={isLoadingMonth}
        />

        {/* Upcoming campaigns sidebar */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            <Calendar style={{ width: "18px", height: "18px", color: "#6B6B6B" }} />
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 500,
                color: "#2C2C2C",
              }}
            >
              Upcoming (Next 7 Days)
            </h2>
          </div>

          {isLoadingUpcoming ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          ) : upcomingCampaigns && upcomingCampaigns.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {upcomingCampaigns.map((campaign) => (
                <UpcomingCampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onClick={() => handleCampaignClick(campaign.campaignId)}
                />
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                backgroundColor: "#F5F3F0",
                
                border: "1px solid #E8E4DF",
              }}
            >
              <Calendar
                style={{
                  width: "32px",
                  height: "32px",
                  color: "#9A9A9A",
                  margin: "0 auto 12px",
                }}
              />
              <p style={{ fontSize: "14px", color: "#6B6B6B" }}>
                No campaigns scheduled for the next 7 days
              </p>
              <Link
                href="/admin/campaigns/new"
                style={{
                  display: "inline-block",
                  marginTop: "12px",
                  fontSize: "13px",
                  color: "#5C8A6B",
                  textDecoration: "none",
                }}
              >
                Create a campaign →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
