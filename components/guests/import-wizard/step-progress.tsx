"use client"

/**
 * @fileoverview Step Progress Component - Import progress step for import wizard
 * 
 * Shows real-time import progress with estimated time remaining.
 * Displays final results when import completes.
 * 
 * @module components/guests/import-wizard/step-progress
 * @requires react
 * 
 * Requirements: 8 (Full-Page Guest Import Wizard)
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  Users,
  AlertTriangle,
  ArrowRight,
} from "lucide-react"
import type { ImportProgress, ImportJobResult } from "@/lib/services/import-parser"

// ============================================================================
// TYPES
// ============================================================================

export interface StepProgressProps {
  progress: ImportProgress | null
  result: ImportJobResult | null
  onCancel?: () => void
  isCancelling?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepProgress({
  progress,
  result,
  onCancel,
  isCancelling = false,
}: StepProgressProps) {
  const [elapsedTime, setElapsedTime] = useState(0)

  // Track elapsed time
  useEffect(() => {
    if (progress?.status === "processing" && progress.startedAt) {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - new Date(progress.startedAt!).getTime()) / 1000))
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [progress?.status, progress?.startedAt])

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  // Show completed state
  if (result) {
    const isSuccess = result.status === "completed"
    const isCancelled = result.status === "cancelled"

    return (
      <div style={{ maxWidth: "640px", margin: "0 auto", textAlign: "center" }}>
        {/* Status Icon */}
        <div
          style={{
            width: "80px",
            height: "80px",
            margin: "0 auto 24px",
            borderRadius: "50%",
            backgroundColor: isSuccess
              ? "rgba(92, 138, 107, 0.1)"
              : isCancelled
              ? "rgba(196, 163, 90, 0.1)"
              : "rgba(184, 92, 92, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isSuccess ? (
            <CheckCircle2 style={{ width: "40px", height: "40px", color: "#5C8A6B" }} />
          ) : isCancelled ? (
            <AlertTriangle style={{ width: "40px", height: "40px", color: "#C4A35A" }} />
          ) : (
            <XCircle style={{ width: "40px", height: "40px", color: "#B85C5C" }} />
          )}
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 300,
            color: "#2C2C2C",
            marginBottom: "8px",
          }}
        >
          {isSuccess
            ? "Import Complete!"
            : isCancelled
            ? "Import Cancelled"
            : "Import Failed"}
        </h2>
        <p style={{ fontSize: "14px", color: "#6B6B6B", marginBottom: "32px" }}>
          {isSuccess
            ? "Your guests have been successfully imported"
            : isCancelled
            ? "The import was cancelled before completion"
            : "An error occurred during the import process"}
        </p>

        {/* Results Summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              padding: "20px",
              backgroundColor: "#F5F3F0",
              borderRadius: "8px",
            }}
          >
            <div style={{ fontSize: "28px", fontWeight: 300, color: "#2C2C2C", marginBottom: "4px" }}>
              {result.totalRows.toLocaleString()}
            </div>
            <div style={{ fontSize: "13px", color: "#6B6B6B" }}>Total Rows</div>
          </div>
          <div
            style={{
              padding: "20px",
              backgroundColor: "rgba(92, 138, 107, 0.1)",
              borderRadius: "8px",
            }}
          >
            <div style={{ fontSize: "28px", fontWeight: 300, color: "#5C8A6B", marginBottom: "4px" }}>
              {result.successCount.toLocaleString()}
            </div>
            <div style={{ fontSize: "13px", color: "#5C8A6B" }}>Imported</div>
          </div>
          <div
            style={{
              padding: "20px",
              backgroundColor: result.errorCount > 0 ? "rgba(184, 92, 92, 0.1)" : "rgba(92, 138, 107, 0.1)",
              borderRadius: "8px",
            }}
          >
            <div
              style={{
                fontSize: "28px",
                fontWeight: 300,
                color: result.errorCount > 0 ? "#B85C5C" : "#5C8A6B",
                marginBottom: "4px",
              }}
            >
              {result.errorCount.toLocaleString()}
            </div>
            <div style={{ fontSize: "13px", color: result.errorCount > 0 ? "#B85C5C" : "#5C8A6B" }}>
              Failed
            </div>
          </div>
        </div>

        {/* Error Report Download */}
        {result.errorReportUrl && result.errorCount > 0 && (
          <div
            style={{
              padding: "16px",
              marginBottom: "24px",
              backgroundColor: "rgba(184, 92, 92, 0.05)",
              border: "1px solid rgba(184, 92, 92, 0.2)",
              borderRadius: "8px",
            }}
          >
            <p style={{ fontSize: "14px", color: "#6B6B6B", marginBottom: "12px" }}>
              {result.errorCount} rows failed to import. Download the error report for details.
            </p>
            <a
              href={result.errorReportUrl}
              download={`import-errors-${result.jobId}.csv`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                backgroundColor: "#FAFAFA",
                border: "1px solid #E8E4DF",
                borderRadius: "6px",
                fontSize: "14px",
                color: "#2C2C2C",
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <Download style={{ width: "16px", height: "16px" }} />
              Download Error Report
            </a>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
          <Link
            href="/guests"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
              backgroundColor: "#2C2C2C",
              borderRadius: "9999px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#FAFAFA",
              textDecoration: "none",
            }}
          >
            <Users style={{ width: "16px", height: "16px" }} />
            View Guests
          </Link>
          <Link
            href="/guests/import"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
              border: "1px solid #E8E4DF",
              borderRadius: "9999px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#2C2C2C",
              textDecoration: "none",
            }}
          >
            Import Another File
            <ArrowRight style={{ width: "16px", height: "16px" }} />
          </Link>
        </div>
      </div>
    )
  }

  // Show progress state
  if (progress) {
    const isProcessing = progress.status === "processing"
    const isPending = progress.status === "pending"

    return (
      <div style={{ maxWidth: "640px", margin: "0 auto", textAlign: "center" }}>
        {/* Spinner */}
        <div
          style={{
            width: "80px",
            height: "80px",
            margin: "0 auto 24px",
            borderRadius: "50%",
            backgroundColor: "rgba(196, 163, 90, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Loader2
            style={{
              width: "40px",
              height: "40px",
              color: "#C4A35A",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>

        {/* Title */}
        <h2 style={{ fontSize: "24px", fontWeight: 300, color: "#2C2C2C", marginBottom: "8px" }}>
          {isPending ? "Preparing Import..." : "Importing Guests..."}
        </h2>
        <p style={{ fontSize: "14px", color: "#6B6B6B", marginBottom: "32px" }}>
          {isPending
            ? "Setting up the import process"
            : "Please wait while we import your guests"}
        </p>

        {/* Progress Bar */}
        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              height: "8px",
              backgroundColor: "#E8E4DF",
              borderRadius: "4px",
              overflow: "hidden",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                width: `${progress.percentComplete}%`,
                height: "100%",
                backgroundColor: "#C4A35A",
                borderRadius: "4px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
            <span style={{ color: "#6B6B6B" }}>
              {progress.processedRows.toLocaleString()} / {progress.totalRows.toLocaleString()} rows
            </span>
            <span style={{ fontWeight: 500, color: "#C4A35A" }}>
              {progress.percentComplete}%
            </span>
          </div>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div style={{ padding: "16px", backgroundColor: "#F5F3F0", borderRadius: "8px" }}>
            <div style={{ fontSize: "20px", fontWeight: 300, color: "#5C8A6B", marginBottom: "4px" }}>
              {progress.successCount.toLocaleString()}
            </div>
            <div style={{ fontSize: "12px", color: "#6B6B6B" }}>Imported</div>
          </div>
          <div style={{ padding: "16px", backgroundColor: "#F5F3F0", borderRadius: "8px" }}>
            <div style={{ fontSize: "20px", fontWeight: 300, color: "#B85C5C", marginBottom: "4px" }}>
              {progress.errorCount.toLocaleString()}
            </div>
            <div style={{ fontSize: "12px", color: "#6B6B6B" }}>Failed</div>
          </div>
          <div style={{ padding: "16px", backgroundColor: "#F5F3F0", borderRadius: "8px" }}>
            <div style={{ fontSize: "20px", fontWeight: 300, color: "#2C2C2C", marginBottom: "4px" }}>
              {formatTime(elapsedTime)}
            </div>
            <div style={{ fontSize: "12px", color: "#6B6B6B" }}>Elapsed</div>
          </div>
        </div>

        {/* Estimated Time */}
        {isProcessing && progress.estimatedTimeRemaining !== undefined && (
          <p style={{ fontSize: "13px", color: "#9A9A9A", marginBottom: "24px" }}>
            Estimated time remaining: {formatTime(progress.estimatedTimeRemaining)}
          </p>
        )}

        {/* Cancel Button */}
        {isProcessing && onCancel && (
          <button
            onClick={onCancel}
            disabled={isCancelling}
            style={{
              padding: "10px 20px",
              border: "1px solid #E8E4DF",
              borderRadius: "6px",
              backgroundColor: "transparent",
              fontSize: "14px",
              color: "#6B6B6B",
              cursor: isCancelling ? "not-allowed" : "pointer",
              opacity: isCancelling ? 0.6 : 1,
            }}
          >
            {isCancelling ? "Cancelling..." : "Cancel Import"}
          </button>
        )}

        <style jsx>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // No progress data yet
  return (
    <div style={{ textAlign: "center", padding: "48px" }}>
      <Loader2
        style={{
          width: "48px",
          height: "48px",
          color: "#C4A35A",
          margin: "0 auto 16px",
          animation: "spin 1s linear infinite",
        }}
      />
      <p style={{ fontSize: "16px", color: "#2C2C2C" }}>Starting import...</p>
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default StepProgress
