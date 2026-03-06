"use client"

/**
 * @fileoverview Campaign Wizard Step 5 - Review and Confirm
 * 
 * Displays a comprehensive summary of all campaign settings before creation:
 * - Campaign details (name, type, description)
 * - Recipient count and selection method
 * - Email preview with subject line
 * - Schedule settings
 * 
 * @module components/admin/campaign-wizard/step-review
 * @requires react
 * @requires lucide-react
 * 
 * Requirements: 4 (Multi-Step Campaign Creation Wizard)
 * Requirements: 4.5 - Review and Confirm step
 */

import { useState } from "react"
import {
  FileText,
  Users,
  Mail,
  Clock,
  Calendar,
  Upload,
  Filter,
  Eye,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Globe,
  Repeat,
  Send,
  FlaskConical,
} from "lucide-react"
import type { EmailBuilderState } from "@/lib/types/email-builder"
import type { ABTestConfig } from "@/lib/types/ab-test"
import { AB_TEST_TYPE_LABELS, WINNER_METRIC_LABELS } from "@/lib/types/ab-test"
import type { RecipientFilters, FileParseResult } from "./step-recipients"
import type { CampaignType } from "@/db/schema"
import { MJMLGeneratorService } from "@/lib/services/mjml-generator-service"
import { PreviewModal } from "@/components/shared"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Campaign wizard data structure for review
 */
export interface CampaignReviewData {
  // Step 1: Details
  name: string
  type: CampaignType | ""
  description: string
  eventId: string
  eventName?: string
  abTestConfig?: ABTestConfig
  channel?: "email" | "whatsapp" | "sms"
  
  // Step 2: Recipients
  recipientType: "event" | "filter" | "upload" | ""
  filters: RecipientFilters
  uploadedFile: File | null
  recipientCount: number
  parsedFileData: FileParseResult | null
  
  // Step 3: Design
  subject: string
  templateId: string
  designJson: EmailBuilderState | null
  whatsappTemplateId?: string
  whatsappMessageBody?: string
  whatsappMediaUrl?: string
  whatsappMediaType?: "" | "image" | "document" | "video"
  smsBody?: string
  smsSenderId?: string
  smsOptOutFooter?: boolean
  
  // Step 4: Schedule
  sendType: "now" | "scheduled" | "draft"
  scheduledAt: Date | null
  timezone: string
  isRecurring: boolean
  recurrencePattern: "daily" | "weekly" | "monthly" | null
  recurrenceEndDate: Date | null
}

/**
 * Props for the StepReview component
 */
export interface StepReviewProps {
  data: CampaignReviewData
  onEditStep?: (step: number) => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Campaign type display labels
 */
const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  Invitation: "Invitation",
  Reminder: "Reminder",
  LastChance: "Last Chance",
  EventDayInfo: "Event Day Info",
  ThankYou: "Thank You",
  Feedback: "Feedback",
}

/**
 * Send type display labels and icons
 */
const SEND_TYPE_CONFIG = {
  now: {
    label: "Send Immediately",
    description: "Campaign will start sending right after creation",
    icon: Send,
    color: "#5C8A6B",
  },
  scheduled: {
    label: "Scheduled",
    description: "Campaign will be sent at the scheduled time",
    icon: Clock,
    color: "#C4A35A",
  },
  draft: {
    label: "Save as Draft",
    description: "Campaign will be saved without scheduling",
    icon: FileText,
    color: "#6B6B6B",
  },
}

/**
 * Recurrence pattern labels
 */
const RECURRENCE_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
}

/**
 * Sample data for email preview
 */
const SAMPLE_PREVIEW_DATA: Record<string, string> = {
  '{firstName}': 'John',
  '{lastName}': 'Doe',
  '{email}': 'john.doe@example.com',
  '{companyName}': 'Acme Corp',
  '{jobTitle}': 'Software Engineer',
  '{eventName}': 'Annual Conference 2026',
  '{eventDate}': 'Saturday, March 15, 2026',
  '{eventLocation}': 'Grand Ballroom, NYC',
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
 * Format date for display (date only)
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
 * Replace template strings with sample data for preview
 */
function replaceTemplateStrings(text: string, data: Record<string, string>): string {
  let result = text
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value)
  }
  return result
}

/**
 * Get recipient type display info
 */
function getRecipientTypeInfo(type: string) {
  switch (type) {
    case "event":
      return { label: "Event Guests", icon: Calendar, color: "#C4A35A" }
    case "filter":
      return { label: "Filtered Guests", icon: Filter, color: "#5C8A6B" }
    case "upload":
      return { label: "Uploaded List", icon: Upload, color: "#6B6B6B" }
    default:
      return { label: "Not Selected", icon: Users, color: "#9A9A9A" }
  }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Section card component for review sections
 */
function ReviewSection({
  title,
  icon: Icon,
  stepNumber,
  onEdit,
  children,
  isValid = true,
}: {
  title: string
  icon: React.ComponentType<{ style?: React.CSSProperties }>
  stepNumber: number
  onEdit?: (step: number) => void
  children: React.ReactNode
  isValid?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: "12px",
        border: `1px solid ${isValid ? "transparent" : "#B85C5C"}`,
        overflow: "hidden",
        transition: "border-color 0.2s ease",
      }}
      onMouseEnter={(e) => { if (isValid) e.currentTarget.style.borderColor = "#B8956B" }}
      onMouseLeave={(e) => { if (isValid) e.currentTarget.style.borderColor = "transparent" }}
    >
      {/* Section header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "16px 20px",
          border: "none",
          backgroundColor: isValid ? "#F5F3F0" : "rgba(184, 92, 92, 0.08)",
          cursor: "pointer",
          transition: "background-color 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              backgroundColor: isValid ? "rgba(196, 163, 90, 0.15)" : "rgba(184, 92, 92, 0.15)",
            }}
          >
            <Icon
              style={{
                width: "18px",
                height: "18px",
                color: isValid ? "#C4A35A" : "#B85C5C",
              }}
            />
          </div>
          <div style={{ textAlign: "left" }}>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 500,
                color: isValid ? "#2C2C2C" : "#B85C5C",
              }}
            >
              {title}
            </div>
            <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
              Step {stepNumber}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {!isValid && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 8px",
                backgroundColor: "rgba(184, 92, 92, 0.1)",
                borderRadius: "4px",
              }}
            >
              <AlertCircle style={{ width: "12px", height: "12px", color: "#B85C5C" }} />
              <span style={{ fontSize: "11px", color: "#B85C5C", fontWeight: 500 }}>
                Incomplete
              </span>
            </div>
          )}
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEdit(stepNumber)
              }}
              style={{
                padding: "6px 12px",
                border: "1px solid #E8E4DF",
                borderRadius: "6px",
                backgroundColor: "#FAFAFA",
                fontSize: "12px",
                fontWeight: 500,
                color: "#6B6B6B",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#C4A35A"
                e.currentTarget.style.color = "#C4A35A"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#E8E4DF"
                e.currentTarget.style.color = "#6B6B6B"
              }}
            >
              Edit
            </button>
          )}
          {isExpanded ? (
            <ChevronUp style={{ width: "18px", height: "18px", color: "#6B6B6B" }} />
          ) : (
            <ChevronDown style={{ width: "18px", height: "18px", color: "#6B6B6B" }} />
          )}
        </div>
      </button>

      {/* Section content */}
      {isExpanded && (
        <div style={{ padding: "20px" }}>
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * Detail row component for displaying key-value pairs
 */
function DetailRow({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ComponentType<{ style?: React.CSSProperties }>
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "12px 0",
        borderBottom: "1px solid #E8E4DF",
      }}
    >
      {Icon && (
        <Icon
          style={{
            width: "16px",
            height: "16px",
            color: "#9A9A9A",
            marginTop: "2px",
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "12px", color: "#6B6B6B", marginBottom: "4px" }}>
          {label}
        </div>
        <div style={{ fontSize: "14px", color: "#2C2C2C", fontWeight: 500 }}>
          {value || <span style={{ color: "#9A9A9A", fontStyle: "italic" }}>Not set</span>}
        </div>
      </div>
    </div>
  )
}

/**
 * Recipient preview table component
 * Shows a sample of recipients that will receive the campaign
 */
function RecipientPreviewTable({
  parsedFileData,
  recipientCount,
  recipientType,
}: {
  parsedFileData: FileParseResult | null
  recipientCount: number
  recipientType: "event" | "filter" | "upload" | ""
}) {
  // For uploaded files, show preview from parsed data
  if (recipientType === "upload" && parsedFileData && parsedFileData.recipients.length > 0) {
    const previewRecipients = parsedFileData.recipients.slice(0, 5)
    const hasFirstName = previewRecipients.some(r => r.firstName)
    const hasLastName = previewRecipients.some(r => r.lastName)
    const hasCompany = previewRecipients.some(r => r.company)
    
    return (
      <div style={{ marginTop: "16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "12px",
          }}
        >
          <Mail style={{ width: "16px", height: "16px", color: "#6B6B6B" }} />
          <span style={{ fontSize: "13px", fontWeight: 500, color: "#2C2C2C" }}>
            Recipient Preview (first {previewRecipients.length} of {recipientCount.toLocaleString()})
          </span>
        </div>
        <div
          style={{
            border: "1px solid #E8E4DF",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#F5F3F0" }}>
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "#2C2C2C",
                      borderBottom: "1px solid #E8E4DF",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Email
                  </th>
                  {hasFirstName && (
                    <th
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        fontWeight: 500,
                        color: "#2C2C2C",
                        borderBottom: "1px solid #E8E4DF",
                        whiteSpace: "nowrap",
                      }}
                    >
                      First Name
                    </th>
                  )}
                  {hasLastName && (
                    <th
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        fontWeight: 500,
                        color: "#2C2C2C",
                        borderBottom: "1px solid #E8E4DF",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Last Name
                    </th>
                  )}
                  {hasCompany && (
                    <th
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        fontWeight: 500,
                        color: "#2C2C2C",
                        borderBottom: "1px solid #E8E4DF",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Company
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {previewRecipients.map((recipient, index) => (
                  <tr
                    key={index}
                    style={{
                      backgroundColor: index % 2 === 0 ? "#FFFFFF" : "#FAFAFA",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 12px",
                        color: "#2C2C2C",
                        borderBottom:
                          index < previewRecipients.length - 1
                            ? "1px solid #E8E4DF"
                            : "none",
                      }}
                    >
                      {recipient.email}
                    </td>
                    {hasFirstName && (
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#6B6B6B",
                          borderBottom:
                            index < previewRecipients.length - 1
                              ? "1px solid #E8E4DF"
                              : "none",
                        }}
                      >
                        {recipient.firstName || "—"}
                      </td>
                    )}
                    {hasLastName && (
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#6B6B6B",
                          borderBottom:
                            index < previewRecipients.length - 1
                              ? "1px solid #E8E4DF"
                              : "none",
                        }}
                      >
                        {recipient.lastName || "—"}
                      </td>
                    )}
                    {hasCompany && (
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#6B6B6B",
                          borderBottom:
                            index < previewRecipients.length - 1
                              ? "1px solid #E8E4DF"
                              : "none",
                        }}
                      >
                        {recipient.company || "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recipientCount > 5 && (
            <div
              style={{
                padding: "10px 12px",
                backgroundColor: "#F5F3F0",
                borderTop: "1px solid #E8E4DF",
                textAlign: "center",
                fontSize: "12px",
                color: "#6B6B6B",
              }}
            >
              ...and {(recipientCount - 5).toLocaleString()} more recipients
            </div>
          )}
        </div>
      </div>
    )
  }
  
  // For event/filter selections, show a summary message
  if ((recipientType === "event" || recipientType === "filter") && recipientCount > 0) {
    return (
      <div
        style={{
          marginTop: "16px",
          padding: "16px",
          backgroundColor: "rgba(92, 138, 107, 0.05)",
          borderRadius: "8px",
          border: "1px solid rgba(92, 138, 107, 0.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Users style={{ width: "18px", height: "18px", color: "#5C8A6B" }} />
          <div>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "#5C8A6B" }}>
              {recipientCount.toLocaleString()} {recipientCount === 1 ? "guest" : "guests"} selected
            </div>
            <div style={{ fontSize: "12px", color: "#6B6B6B", marginTop: "2px" }}>
              Recipients will be loaded from the selected event based on your filters
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  return null
}

/**
 * Email preview thumbnail component
 */
function EmailPreviewThumbnail({
  designJson,
  subject,
  onPreview,
}: {
  designJson: EmailBuilderState | null
  subject: string
  onPreview: () => void
}) {
  const previewSubject = replaceTemplateStrings(subject, SAMPLE_PREVIEW_DATA)
  const blockCount = designJson?.blocks?.length || 0

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {/* Subject line preview */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 16px",
          backgroundColor: "#F5F3F0",
          borderRadius: "8px",
        }}
      >
        <Mail style={{ width: "16px", height: "16px", color: "#6B6B6B" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "11px", color: "#9A9A9A", marginBottom: "2px" }}>
            Subject Line
          </div>
          <div style={{ fontSize: "14px", color: "#2C2C2C", fontWeight: 500 }}>
            {previewSubject || <span style={{ color: "#9A9A9A", fontStyle: "italic" }}>No subject</span>}
          </div>
        </div>
      </div>

      {/* Email design preview */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px",
          backgroundColor: "#F5F3F0",
          borderRadius: "8px",
          border: "1px dashed #E8E4DF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "48px",
              height: "48px",
              backgroundColor: "#FAFAFA",
              borderRadius: "8px",
              border: "1px solid #E8E4DF",
            }}
          >
            <FileText style={{ width: "24px", height: "24px", color: "#C4A35A" }} />
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "#2C2C2C" }}>
              Email Design
            </div>
            <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
              {blockCount} {blockCount === 1 ? "block" : "blocks"}
            </div>
          </div>
        </div>
        <button
          onClick={onPreview}
          disabled={!designJson || blockCount === 0}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            border: "1px solid #C4A35A",
            borderRadius: "8px",
            backgroundColor: "transparent",
            fontSize: "13px",
            fontWeight: 500,
            color: "#C4A35A",
            cursor: designJson && blockCount > 0 ? "pointer" : "not-allowed",
            opacity: designJson && blockCount > 0 ? 1 : 0.5,
            transition: "all 0.2s ease",
          }}
        >
          <Eye style={{ width: "14px", height: "14px" }} />
          Preview Email
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Step Review Component
 * 
 * Campaign wizard step for reviewing all campaign settings before creation.
 * Displays a comprehensive summary with the ability to edit each section.
 * 
 * Features:
 * - Collapsible sections for each wizard step
 * - Edit buttons to navigate back to specific steps
 * - Email preview with sample data
 * - Validation status indicators
 * - Schedule summary with timezone
 * 
 * @example
 * ```tsx
 * <StepReview
 *   data={campaignWizardData}
 *   onEditStep={(step) => setCurrentStep(step)}
 * />
 * ```
 * 
 * Requirements: 4 (Multi-Step Campaign Creation Wizard)
 * Requirements: 4.5 - Review and Confirm step
 */
export function StepReview({
  data,
  onEditStep,
}: StepReviewProps) {
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewMjml, setPreviewMjml] = useState<string | null>(null)

  // Validation checks
  const isStep1Valid = data.name.trim() !== "" && data.type !== ""
  const isStep2Valid = data.recipientType !== "" && (
    data.recipientType === "upload" 
      ? !!(data.parsedFileData && data.parsedFileData.validRows > 0)
      : data.eventId !== ""
  )
  const isStep3Valid = data.channel === "whatsapp"
    ? data.subject.trim() !== "" && !!(data.whatsappMessageBody?.trim() || data.whatsappTemplateId?.trim())
    : data.channel === "sms"
      ? !!(data.smsBody?.trim())
      : data.templateId !== "" && data.subject.trim() !== ""
  const isStep4Valid = data.sendType !== "scheduled" || data.scheduledAt !== null

  // Get recipient type info
  const recipientInfo = getRecipientTypeInfo(data.recipientType)
  const RecipientIcon = recipientInfo.icon

  // Get send type config
  const sendTypeConfig = SEND_TYPE_CONFIG[data.sendType] || SEND_TYPE_CONFIG.draft
  const SendTypeIcon = sendTypeConfig.icon

  /**
   * Handle email preview
   */
  const handlePreview = () => {
    if (data.designJson) {
      const mjml = MJMLGeneratorService.generate(data.designJson)
      const sampleContext = MJMLGeneratorService.getSampleContext()
      const mjmlWithSamples = MJMLGeneratorService.substituteVariables(mjml, sampleContext)
      setPreviewMjml(mjmlWithSamples)
      setShowPreviewModal(true)
    }
  }

  /**
   * Get filter summary text
   */
  const getFilterSummary = () => {
    const parts: string[] = []
    
    if (data.filters.rsvpStatus && data.filters.rsvpStatus.length > 0) {
      parts.push(`RSVP: ${data.filters.rsvpStatus.join(", ")}`)
    }
    
    if (data.filters.checkInStatus && data.filters.checkInStatus.length > 0) {
      parts.push(`Check-in: ${data.filters.checkInStatus.join(", ")}`)
    }
    
    if (data.filters.tags && data.filters.tags.length > 0) {
      parts.push(`${data.filters.tags.length} tag(s)`)
    }
    
    if (data.filters.filterGroups && data.filters.filterGroups.length > 0) {
      const conditionCount = data.filters.filterGroups.reduce(
        (sum, group) => sum + group.conditions.length,
        0
      )
      parts.push(`${conditionCount} custom filter(s)`)
    }
    
    return parts.length > 0 ? parts.join(" • ") : "No filters applied"
  }

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
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
          Review Campaign
        </h2>
        <p style={{ color: "#6B6B6B", fontSize: "14px" }}>
          Review your campaign settings before creating. Click "Edit" to make changes.
        </p>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        {/* Recipients count */}
        <div
          style={{
            padding: "20px",
            backgroundColor: "#FFFFFF",
            borderRadius: "12px",
            border: "1px solid transparent",
            textAlign: "center",
            transition: "border-color 0.2s ease",
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "#B8956B"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "transparent"}
        >
          <Users style={{ width: "24px", height: "24px", color: "#C4A35A", margin: "0 auto 8px" }} />
          <div style={{ fontSize: "24px", fontWeight: 600, color: "#2C2C2C" }}>
            {data.recipientCount.toLocaleString()}
          </div>
          <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
            Recipients
          </div>
        </div>

        {/* Send type */}
        <div
          style={{
            padding: "20px",
            backgroundColor: "#FFFFFF",
            borderRadius: "12px",
            border: "1px solid transparent",
            textAlign: "center",
            transition: "border-color 0.2s ease",
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "#B8956B"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "transparent"}
        >
          <SendTypeIcon style={{ width: "24px", height: "24px", color: sendTypeConfig.color, margin: "0 auto 8px" }} />
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#2C2C2C" }}>
            {sendTypeConfig.label}
          </div>
          <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
            Delivery
          </div>
        </div>

        {/* Campaign type */}
        <div
          style={{
            padding: "20px",
            backgroundColor: "#FFFFFF",
            borderRadius: "12px",
            border: "1px solid transparent",
            textAlign: "center",
            transition: "border-color 0.2s ease",
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "#B8956B"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "transparent"}
        >
          <FileText style={{ width: "24px", height: "24px", color: "#5C8A6B", margin: "0 auto 8px" }} />
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#2C2C2C" }}>
            {data.type ? CAMPAIGN_TYPE_LABELS[data.type] : "Not set"}
          </div>
          <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
            Type
          </div>
        </div>
      </div>

      {/* Review sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Step 1: Campaign Details */}
        <ReviewSection
          title="Campaign Details"
          icon={FileText}
          stepNumber={1}
          onEdit={onEditStep}
          isValid={isStep1Valid}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <DetailRow label="Campaign Name" value={data.name} />
            <DetailRow 
              label="Channel" 
              value={data.channel === "whatsapp" ? "WhatsApp" : data.channel === "sms" ? "SMS" : "Email"} 
            />
            <DetailRow 
              label="Campaign Type" 
              value={data.type ? CAMPAIGN_TYPE_LABELS[data.type] : null} 
            />
            <DetailRow 
              label="Description" 
              value={data.description || <span style={{ color: "#9A9A9A", fontStyle: "italic" }}>No description</span>} 
            />
            {data.abTestConfig?.enabled && (
              <>
                <DetailRow 
                  label="A/B Testing" 
                  value={
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <FlaskConical style={{ width: "16px", height: "16px", color: "#C4A35A" }} />
                      <span style={{ color: "#5C8A6B", fontWeight: 500 }}>Enabled</span>
                    </div>
                  } 
                />
                <DetailRow 
                  label="Test Type" 
                  value={AB_TEST_TYPE_LABELS[data.abTestConfig.testType]?.label || data.abTestConfig.testType} 
                />
                <DetailRow 
                  label="Variants" 
                  value={`${data.abTestConfig.variants.length} variants (${data.abTestConfig.variants.map(v => v.name).join(", ")})`} 
                />
                <DetailRow 
                  label="Test Audience" 
                  value={`${data.abTestConfig.testAudiencePercentage}% of recipients`} 
                />
                <DetailRow 
                  label="Winner Metric" 
                  value={WINNER_METRIC_LABELS[data.abTestConfig.winnerMetric]?.label || data.abTestConfig.winnerMetric} 
                />
                <DetailRow 
                  label="Test Duration" 
                  value={`${data.abTestConfig.testDurationHours} hours`} 
                />
              </>
            )}
          </div>
        </ReviewSection>

        {/* Step 2: Recipients */}
        <ReviewSection
          title="Recipients"
          icon={Users}
          stepNumber={2}
          onEdit={onEditStep}
          isValid={isStep2Valid}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <DetailRow 
              label="Selection Method" 
              value={
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <RecipientIcon style={{ width: "16px", height: "16px", color: recipientInfo.color }} />
                  {recipientInfo.label}
                </div>
              } 
            />
            <DetailRow 
              label="Recipient Count" 
              value={`${data.recipientCount.toLocaleString()} ${data.recipientCount === 1 ? "recipient" : "recipients"}`} 
            />
            {data.recipientType === "upload" && data.uploadedFile && (
              <DetailRow 
                label="Uploaded File" 
                value={data.uploadedFile.name} 
                icon={Upload}
              />
            )}
            {(data.recipientType === "event" || data.recipientType === "filter") && (
              <>
                <DetailRow 
                  label="Event" 
                  value={data.eventName || data.eventId || "Not selected"} 
                  icon={Calendar}
                />
                <DetailRow 
                  label="Filters" 
                  value={getFilterSummary()} 
                  icon={Filter}
                />
              </>
            )}
          </div>
          
          {/* Recipient Preview */}
          <RecipientPreviewTable
            parsedFileData={data.parsedFileData}
            recipientCount={data.recipientCount}
            recipientType={data.recipientType}
          />
        </ReviewSection>

        {/* Step 3: Design */}
        <ReviewSection
          title={data.channel === "whatsapp" ? "WhatsApp Message" : data.channel === "sms" ? "SMS Message" : "Email Design"}
          icon={data.channel === "whatsapp" ? Send : data.channel === "sms" ? Send : Mail}
          stepNumber={3}
          onEdit={onEditStep}
          isValid={isStep3Valid}
        >
          {data.channel === "whatsapp" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <DetailRow label="Preview Text" value={data.subject || "—"} />
              {data.whatsappTemplateId && (
                <DetailRow label="Template" value={<code style={{ fontFamily: "monospace", fontSize: "13px" }}>{data.whatsappTemplateId}</code>} />
              )}
              {data.whatsappMessageBody && (
                <div style={{ padding: "12px", border: "1px solid #E8E4DF", borderRadius: "8px", backgroundColor: "#FAFAFA" }}>
                  <p style={{ fontSize: "12px", color: "#6B6B6B", marginBottom: "6px" }}>Message Body</p>
                  <p style={{ fontSize: "13px", color: "#2C2C2C", whiteSpace: "pre-wrap" }}>{data.whatsappMessageBody}</p>
                </div>
              )}
              {data.whatsappMediaUrl && (
                <DetailRow label="Media" value={`${(data.whatsappMediaType || "file").toUpperCase()}: ${data.whatsappMediaUrl}`} />
              )}
            </div>
          ) : data.channel === "sms" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {data.smsSenderId && (
                <DetailRow label="Sender ID" value={data.smsSenderId} />
              )}
              {data.smsBody && (
                <div style={{ padding: "12px", border: "1px solid #E8E4DF", borderRadius: "8px", backgroundColor: "#FAFAFA" }}>
                  <p style={{ fontSize: "12px", color: "#6B6B6B", marginBottom: "6px" }}>SMS Message</p>
                  <p style={{ fontSize: "13px", color: "#2C2C2C", whiteSpace: "pre-wrap" }}>{data.smsBody}</p>
                  {data.smsOptOutFooter && (
                    <p style={{ fontSize: "11px", color: "#9A9A9A", marginTop: "8px", fontStyle: "italic" }}>+ Reply STOP to opt out</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <EmailPreviewThumbnail
              designJson={data.designJson}
              subject={data.subject}
              onPreview={handlePreview}
            />
          )}
        </ReviewSection>

        {/* Step 4: Schedule */}
        <ReviewSection
          title="Schedule"
          icon={Clock}
          stepNumber={4}
          onEdit={onEditStep}
          isValid={isStep4Valid}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <DetailRow 
              label="Delivery Option" 
              value={
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <SendTypeIcon style={{ width: "16px", height: "16px", color: sendTypeConfig.color }} />
                  {sendTypeConfig.label}
                </div>
              } 
            />
            {data.sendType === "scheduled" && data.scheduledAt && (
              <>
                <DetailRow 
                  label="Scheduled Date & Time" 
                  value={formatDisplayDate(data.scheduledAt, data.timezone)} 
                  icon={Calendar}
                />
                <DetailRow 
                  label="Timezone" 
                  value={data.timezone} 
                  icon={Globe}
                />
              </>
            )}
            {data.isRecurring && data.recurrencePattern && (
              <>
                <DetailRow 
                  label="Recurring" 
                  value={
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Repeat style={{ width: "16px", height: "16px", color: "#5C8A6B" }} />
                      {RECURRENCE_LABELS[data.recurrencePattern]}
                    </div>
                  } 
                />
                {data.recurrenceEndDate && (
                  <DetailRow 
                    label="Recurrence End Date" 
                    value={formatDisplayDateOnly(data.recurrenceEndDate, data.timezone)} 
                  />
                )}
              </>
            )}
          </div>
        </ReviewSection>
      </div>

      {/* Validation summary */}
      {(!isStep1Valid || !isStep2Valid || !isStep3Valid || !isStep4Valid) && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            marginTop: "24px",
            padding: "16px 20px",
            backgroundColor: "rgba(184, 92, 92, 0.08)",
            borderRadius: "12px",
            border: "1px solid rgba(184, 92, 92, 0.2)",
          }}
        >
          <AlertCircle
            style={{
              width: "20px",
              height: "20px",
              color: "#B85C5C",
              flexShrink: 0,
              marginTop: "2px",
            }}
          />
          <div>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "#B85C5C", marginBottom: "4px" }}>
              Some sections need attention
            </div>
            <div style={{ fontSize: "13px", color: "#6B6B6B" }}>
              Please complete all required fields before creating the campaign.
              Click "Edit" on the incomplete sections above.
            </div>
          </div>
        </div>
      )}

      {/* Success message when all valid */}
      {isStep1Valid && isStep2Valid && isStep3Valid && isStep4Valid && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            marginTop: "24px",
            padding: "16px 20px",
            backgroundColor: "rgba(92, 138, 107, 0.08)",
            borderRadius: "12px",
            border: "1px solid rgba(92, 138, 107, 0.2)",
          }}
        >
          <CheckCircle
            style={{
              width: "20px",
              height: "20px",
              color: "#5C8A6B",
              flexShrink: 0,
              marginTop: "2px",
            }}
          />
          <div>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "#5C8A6B", marginBottom: "4px" }}>
              Ready to create campaign
            </div>
            <div style={{ fontSize: "13px", color: "#6B6B6B" }}>
              All required information has been provided. Click "Create Campaign" to proceed.
            </div>
          </div>
        </div>
      )}

      {/* Email Preview Modal */}
      {showPreviewModal && previewMjml && (
        <PreviewModal
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          mjml={previewMjml}
          plainText={null}
          subject={data.subject ? replaceTemplateStrings(data.subject, SAMPLE_PREVIEW_DATA) : null}
          isLoading={false}
          error={null}
        />
      )}
    </div>
  )
}

export default StepReview
