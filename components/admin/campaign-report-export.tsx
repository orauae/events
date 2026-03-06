"use client"

/**
 * @fileoverview Campaign Report Export Buttons Component
 * 
 * Provides export functionality for campaign reports in CSV and PDF formats.
 * Uses the ReportService for generating exports.
 * 
 * @module components/admin/campaign-report-export
 * @requires react
 * @requires lucide-react
 * 
 * Requirements: 7.6 (Export reports as CSV or PDF)
 */

import { useState } from "react"
import { Download, FileText, FileSpreadsheet, ChevronDown, Loader2 } from "lucide-react"
import { useExportCampaignReportWithFormat, type ExportFormat } from "@/hooks/use-admin-campaigns"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the CampaignReportExport component
 */
export interface CampaignReportExportProps {
  /** The campaign ID to export report for */
  campaignId: string
  /** Optional campaign name for display */
  campaignName?: string
  /** Whether to show as a dropdown or inline buttons */
  variant?: "dropdown" | "inline"
  /** Optional className for styling */
  className?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Campaign Report Export Component
 * 
 * Provides buttons to export campaign reports in CSV or PDF format.
 * Supports both dropdown and inline button variants.
 * 
 * @param props - Component props
 * @returns Export buttons component
 * 
 * Requirements: 7.6
 */
export function CampaignReportExport({
  campaignId,
  campaignName,
  variant = "dropdown",
  className = "",
}: CampaignReportExportProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { exportReport, isExporting } = useExportCampaignReportWithFormat()

  const handleExport = (format: ExportFormat) => {
    exportReport({ campaignId, format })
    setIsOpen(false)
  }

  if (variant === "inline") {
    return (
      <div className={className} style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={() => handleExport("csv")}
          disabled={isExporting}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 16px",
            border: "1px solid #E8E4DF",
            borderRadius: "8px",
            backgroundColor: "#FAFAFA",
            fontSize: "14px",
            fontWeight: 500,
            color: "#2C2C2C",
            cursor: isExporting ? "not-allowed" : "pointer",
            opacity: isExporting ? 0.6 : 1,
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            if (!isExporting) {
              e.currentTarget.style.backgroundColor = "#F5F3F0"
              e.currentTarget.style.borderColor = "#D4CFC8"
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#FAFAFA"
            e.currentTarget.style.borderColor = "#E8E4DF"
          }}
        >
          {isExporting ? (
            <Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} />
          ) : (
            <FileSpreadsheet style={{ width: "16px", height: "16px", color: "#5C8A6B" }} />
          )}
          Export CSV
        </button>
        <button
          onClick={() => handleExport("pdf")}
          disabled={isExporting}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 16px",
            border: "1px solid #E8E4DF",
            borderRadius: "8px",
            backgroundColor: "#FAFAFA",
            fontSize: "14px",
            fontWeight: 500,
            color: "#2C2C2C",
            cursor: isExporting ? "not-allowed" : "pointer",
            opacity: isExporting ? 0.6 : 1,
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            if (!isExporting) {
              e.currentTarget.style.backgroundColor = "#F5F3F0"
              e.currentTarget.style.borderColor = "#D4CFC8"
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#FAFAFA"
            e.currentTarget.style.borderColor = "#E8E4DF"
          }}
        >
          {isExporting ? (
            <Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} />
          ) : (
            <FileText style={{ width: "16px", height: "16px", color: "#B85C5C" }} />
          )}
          Export PDF
        </button>
      </div>
    )
  }

  // Dropdown variant
  return (
    <div className={className} style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          border: "1px solid #E8E4DF",
          borderRadius: "8px",
          backgroundColor: "#FAFAFA",
          fontSize: "14px",
          fontWeight: 500,
          color: "#2C2C2C",
          cursor: isExporting ? "not-allowed" : "pointer",
          opacity: isExporting ? 0.6 : 1,
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          if (!isExporting) {
            e.currentTarget.style.backgroundColor = "#F5F3F0"
            e.currentTarget.style.borderColor = "#D4CFC8"
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#FAFAFA"
          e.currentTarget.style.borderColor = "#E8E4DF"
        }}
      >
        {isExporting ? (
          <Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} />
        ) : (
          <Download style={{ width: "16px", height: "16px", color: "#6B6B6B" }} />
        )}
        Export Report
        <ChevronDown style={{ width: "14px", height: "14px", color: "#9A9A9A" }} />
      </button>

      {isOpen && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "4px",
              minWidth: "180px",
              backgroundColor: "#FAFAFA",
              border: "1px solid #E8E4DF",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
              zIndex: 50,
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => handleExport("csv")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "12px 16px",
                textAlign: "left",
                fontSize: "14px",
                color: "#2C2C2C",
                backgroundColor: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background-color 0.2s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F5F3F0")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <FileSpreadsheet style={{ width: "16px", height: "16px", color: "#5C8A6B" }} />
              <div>
                <div style={{ fontWeight: 500 }}>Export as CSV</div>
                <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
                  Spreadsheet format
                </div>
              </div>
            </button>
            <button
              onClick={() => handleExport("pdf")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "12px 16px",
                textAlign: "left",
                fontSize: "14px",
                color: "#2C2C2C",
                backgroundColor: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background-color 0.2s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F5F3F0")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <FileText style={{ width: "16px", height: "16px", color: "#B85C5C" }} />
              <div>
                <div style={{ fontWeight: 500 }}>Export as PDF</div>
                <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
                  Document format
                </div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default CampaignReportExport
