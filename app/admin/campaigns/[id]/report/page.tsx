"use client"

/**
 * @fileoverview Campaign Report Page - Detailed analytics for a specific campaign
 * 
 * Displays comprehensive campaign metrics including:
 * - Delivery metrics (sent, delivered, bounced, delivery rate)
 * - Engagement metrics (opens, clicks, CTR, unsubscribes)
 * - Timeline chart showing opens/clicks over time
 * - Link performance table
 * - Recipient list with individual status
 * - Export buttons (CSV, PDF)
 * 
 * @module app/admin/campaigns/[id]/report/page
 * @requires react
 * @requires next/navigation
 * 
 * Requirements: 7 (Campaign Analytics and Reports)
 */

import { use } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ORAAccentLine } from "@/components/ui/ora-brand"
import { CampaignReport } from "@/components/admin/campaign-report"

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Campaign Report Page
 * 
 * Displays detailed analytics and metrics for a specific campaign.
 * 
 * Requirements: 7.1 (Campaign report page at /admin/campaigns/[id]/report)
 */
export default function CampaignReportPage({ params }: PageProps) {
  const { id: campaignId } = use(params)

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
            color: "#6B6B6B",
            fontSize: "14px",
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
          Campaign Report
        </h1>
        <p style={{ color: "#6B6B6B", fontSize: "14px" }}>
          View detailed analytics and performance metrics
        </p>
      </div>

      {/* Campaign Report Component */}
      <CampaignReport campaignId={campaignId} />
    </div>
  )
}
