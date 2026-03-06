"use client"

/**
 * @fileoverview Campaign Wizard Step 1 - Campaign Details
 * 
 * Allows users to enter campaign details including:
 * - Campaign name (required)
 * - Campaign type (required)
 * - Description (optional)
 * - A/B test configuration (optional)
 * 
 * @module components/admin/campaign-wizard/step-details
 * @requires react
 * 
 * Requirements: 4 (Multi-Step Campaign Creation Wizard)
 * Requirements: 4.2 - Step 1: Campaign Details (name, type, description)
 * Requirements: 14 (A/B Testing for Campaigns)
 */

import type { CampaignType } from "@/db/schema"
import type { CampaignChannel } from "@/db/schema"
import type { ABTestConfig } from "@/lib/types/ab-test"
import { ABTestConfig as ABTestConfigComponent } from "./ab-test-config"
import { DEFAULT_AB_TEST_CONFIG } from "@/lib/types/ab-test"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Step details data structure
 */
export interface StepDetailsData {
  /** Campaign name (required) */
  name: string
  /** Campaign type (required) */
  type: CampaignType | ""
  /** Campaign channel (required) */
  channel: CampaignChannel
  /** Campaign description (optional) */
  description: string
  /** A/B test configuration (optional) */
  abTestConfig: ABTestConfig
}

/**
 * Props for the StepDetails component
 */
export interface StepDetailsProps {
  /** Current step data */
  data: StepDetailsData
  /** Callback when data changes */
  onChange: (updates: Partial<StepDetailsData>) => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Campaign type options with labels and descriptions
 */
const CAMPAIGN_TYPES: { value: CampaignType; label: string; description: string }[] = [
  { value: "Invitation", label: "Invitation", description: "Initial event invitation" },
  { value: "Reminder", label: "Reminder", description: "Event reminder for registered guests" },
  { value: "LastChance", label: "Last Chance", description: "Final reminder before event" },
  { value: "EventDayInfo", label: "Event Day Info", description: "Day-of event information" },
  { value: "ThankYou", label: "Thank You", description: "Post-event thank you message" },
  { value: "Feedback", label: "Feedback", description: "Request for event feedback" },
]

/**
 * Campaign channel options
 */
const CHANNEL_OPTIONS: { value: CampaignChannel; label: string; description: string; emoji: string; disabled?: boolean }[] = [
  { value: "email", label: "Email", description: "HTML email with visual builder", emoji: "✉️" },
  { value: "whatsapp", label: "WhatsApp", description: "WhatsApp Business message", emoji: "💬" },
  { value: "sms", label: "SMS", description: "Text message campaign", emoji: "📱" },
]

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validation result for step details
 */
export interface StepDetailsValidation {
  isValid: boolean
  errorMessage?: string
}

/**
 * Validate step details data
 * 
 * @param data - The step details data to validate
 * @returns Validation result with isValid flag and optional error message
 */
export function validateStepDetails(data: StepDetailsData): StepDetailsValidation {
  const nameValid = data.name.trim() !== ""
  const typeValid = data.type !== ""
  
  if (!nameValid && !typeValid) {
    return {
      isValid: false,
      errorMessage: "Please enter a campaign name and select a campaign type",
    }
  }
  if (!nameValid) {
    return {
      isValid: false,
      errorMessage: "Please enter a campaign name",
    }
  }
  if (!typeValid) {
    return {
      isValid: false,
      errorMessage: "Please select a campaign type",
    }
  }
  
  // Validate A/B test configuration if enabled
  if (data.abTestConfig?.enabled) {
    const { validateABTestConfig } = require("@/lib/types/ab-test")
    const abTestValidation = validateABTestConfig(data.abTestConfig)
    if (!abTestValidation.isValid && abTestValidation.errors.length > 0) {
      return {
        isValid: false,
        errorMessage: abTestValidation.errors[0],
      }
    }
  }
  
  return { isValid: true }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Step 1: Campaign Details
 * 
 * Form for entering campaign name, type, and description.
 * Follows the ORA design system for consistent styling.
 * 
 * Features:
 * - Campaign name input (required)
 * - Campaign type selection grid (required)
 * - Description textarea (optional)
 * - Visual feedback for selected type
 * - Focus states for accessibility
 * 
 * @example
 * ```tsx
 * <StepDetails
 *   data={{ name: "", type: "", description: "" }}
 *   onChange={(updates) => setData(prev => ({ ...prev, ...updates }))}
 * />
 * ```
 * 
 * Requirements: 4 (Multi-Step Campaign Creation Wizard)
 * Requirements: 4.2 - Step 1: Campaign Details (name, type, description)
 */
export function StepDetails({ data, onChange }: StepDetailsProps) {
  return (
    <div style={{ maxWidth: "600px", margin: "0 auto" }}>
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
          Campaign Details
        </h2>
        <p style={{ color: "#6B6B6B", fontSize: "14px" }}>
          Give your campaign a name and select its type
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Campaign Channel */}
        <div>
          <label
            id="campaign-channel-label"
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: "#2C2C2C",
              marginBottom: "8px",
            }}
          >
            Channel <span style={{ color: "#B85C5C" }}>*</span>
          </label>
          <div
            role="radiogroup"
            aria-labelledby="campaign-channel-label"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "12px",
            }}
          >
            {CHANNEL_OPTIONS.map((ch) => {
              const isSelected = data.channel === ch.value
              return (
                <button
                  key={ch.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={ch.disabled}
                  onClick={() => onChange({ channel: ch.value })}
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "16px 12px",
                    border: isSelected
                      ? "2px solid #C4A35A"
                      : "1px solid #E8E4DF",
                    borderRadius: "12px",
                    backgroundColor: isSelected
                      ? "rgba(196, 163, 90, 0.05)"
                      : "#FFFFFF",
                    cursor: ch.disabled ? "not-allowed" : "pointer",
                    opacity: ch.disabled ? 0.5 : 1,
                    transition: "all 0.2s ease",
                    textAlign: "center",
                    gap: "6px",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>{ch.emoji}</span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 500,
                      color: isSelected ? "#C4A35A" : "#2C2C2C",
                    }}
                  >
                    {ch.label}
                  </span>
                  <span style={{ fontSize: "11px", color: "#6B6B6B" }}>
                    {ch.description}
                  </span>
                  {ch.disabled && (
                    <span style={{
                      position: "absolute",
                      top: "6px",
                      right: "6px",
                      fontSize: "10px",
                      backgroundColor: "#E8E4DF",
                      color: "#6B6B6B",
                      padding: "1px 6px",
                      borderRadius: "9999px",
                    }}>
                      Soon
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Campaign Name */}
        <div>
          <label
            htmlFor="campaign-name"
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: "#2C2C2C",
              marginBottom: "8px",
            }}
          >
            Campaign Name <span style={{ color: "#B85C5C" }}>*</span>
          </label>
          <input
            id="campaign-name"
            type="text"
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g., Annual Conference Invitation"
            aria-required="true"
            aria-describedby="campaign-name-hint"
            style={{
              width: "100%",
              padding: "12px 16px",
              border: "1px solid #E8E4DF",
              borderRadius: "8px",
              fontSize: "14px",
              color: "#2C2C2C",
              backgroundColor: "#FFFFFF",
              outline: "none",
              transition: "border-color 0.2s ease",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#C4A35A")}
            onBlur={(e) => (e.target.style.borderColor = "#E8E4DF")}
          />
          <span id="campaign-name-hint" className="sr-only">
            Enter a descriptive name for your campaign
          </span>
        </div>

        {/* Campaign Type */}
        <div>
          <label
            id="campaign-type-label"
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: "#2C2C2C",
              marginBottom: "8px",
            }}
          >
            Campaign Type <span style={{ color: "#B85C5C" }}>*</span>
          </label>
          <div
            role="radiogroup"
            aria-labelledby="campaign-type-label"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "12px",
            }}
          >
            {CAMPAIGN_TYPES.map((type) => {
              const isSelected = data.type === type.value
              return (
                <button
                  key={type.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onChange({ type: type.value })}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    padding: "16px",
                    border: isSelected
                      ? "2px solid #C4A35A"
                      : "1px solid #E8E4DF",
                    borderRadius: "8px",
                    backgroundColor: isSelected
                      ? "rgba(196, 163, 90, 0.05)"
                      : "#FFFFFF",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 500,
                      color: isSelected ? "#C4A35A" : "#2C2C2C",
                      marginBottom: "4px",
                    }}
                  >
                    {type.label}
                  </span>
                  <span style={{ fontSize: "12px", color: "#6B6B6B" }}>
                    {type.description}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="campaign-description"
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: "#2C2C2C",
              marginBottom: "8px",
            }}
          >
            Description <span style={{ color: "#9A9A9A" }}>(optional)</span>
          </label>
          <textarea
            id="campaign-description"
            value={data.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Add a description for internal reference..."
            rows={3}
            aria-describedby="campaign-description-hint"
            style={{
              width: "100%",
              padding: "12px 16px",
              border: "1px solid #E8E4DF",
              borderRadius: "8px",
              fontSize: "14px",
              color: "#2C2C2C",
              backgroundColor: "#FFFFFF",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              transition: "border-color 0.2s ease",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#C4A35A")}
            onBlur={(e) => (e.target.style.borderColor = "#E8E4DF")}
          />
          <span id="campaign-description-hint" className="sr-only">
            Optional description for internal reference
          </span>
        </div>

        {/* A/B Test Configuration */}
        <ABTestConfigComponent
          config={data.abTestConfig || DEFAULT_AB_TEST_CONFIG}
          onChange={(abTestConfig) => onChange({ abTestConfig })}
        />
      </div>
    </div>
  )
}

export default StepDetails
