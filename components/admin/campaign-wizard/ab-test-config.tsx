"use client"

/**
 * @fileoverview A/B Test Configuration Component
 * 
 * Allows users to configure A/B testing for email campaigns.
 * Supports testing subject lines, sender names, email content, and send times.
 * 
 * @module components/admin/campaign-wizard/ab-test-config
 * @requires react
 * 
 * Requirements: 14 (A/B Testing for Campaigns)
 */

import { useState, useCallback } from "react"
import {
  FlaskConical,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react"
import type {
  ABTestConfig,
  ABTestType,
  ABTestWinnerMetric,
  ABTestVariant,
  SubjectVariant,
  SenderVariant,
} from "@/lib/types/ab-test"
import {
  AB_TEST_TYPE_LABELS,
  WINNER_METRIC_LABELS,
  AB_TEST_LIMITS,
  DEFAULT_AB_TEST_CONFIG,
  createSubjectVariant,
  createSenderVariant,
} from "@/lib/types/ab-test"
import { createId } from "@paralleldrive/cuid2"

// ============================================================================
// TYPES
// ============================================================================

export interface ABTestConfigProps {
  /** Current A/B test configuration */
  config: ABTestConfig
  /** Callback when configuration changes */
  onChange: (config: ABTestConfig) => void
  /** Default subject line from campaign */
  defaultSubject?: string
  /** Default sender name from SMTP settings */
  defaultSenderName?: string
  /** Default sender email from SMTP settings */
  defaultSenderEmail?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const VARIANT_NAMES = ["A", "B", "C", "D"]

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Toggle switch component
 */
function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}) {
  // Compact mode when no label is provided
  if (!label) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Toggle"
        onClick={() => onChange(!checked)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: 0,
          border: "none",
          backgroundColor: "transparent",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "40px",
            height: "22px",
            borderRadius: "11px",
            backgroundColor: checked ? "#C4A35A" : "#E8E4DF",
            position: "relative",
            transition: "background-color 0.2s ease",
          }}
        >
          <div
            style={{
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              backgroundColor: "#FFFFFF",
              position: "absolute",
              top: "2px",
              left: checked ? "20px" : "2px",
              transition: "left 0.2s ease",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          />
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "16px",
        border: checked ? "2px solid #C4A35A" : "1px solid #E8E4DF",
        borderRadius: "8px",
        backgroundColor: checked ? "rgba(196, 163, 90, 0.05)" : "#FFFFFF",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        transition: "all 0.2s ease",
      }}
    >
      <div
        style={{
          width: "44px",
          height: "24px",
          borderRadius: "12px",
          backgroundColor: checked ? "#C4A35A" : "#E8E4DF",
          position: "relative",
          flexShrink: 0,
          transition: "background-color 0.2s ease",
        }}
      >
        <div
          style={{
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            backgroundColor: "#FFFFFF",
            position: "absolute",
            top: "2px",
            left: checked ? "22px" : "2px",
            transition: "left 0.2s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        />
      </div>
      <div>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 500,
            color: checked ? "#C4A35A" : "#2C2C2C",
          }}
        >
          {label}
        </div>
        {description && (
          <div style={{ fontSize: "12px", color: "#6B6B6B", marginTop: "4px" }}>
            {description}
          </div>
        )}
      </div>
    </button>
  )
}

/**
 * Test type selector
 */
function TestTypeSelector({
  value,
  onChange,
}: {
  value: ABTestType
  onChange: (type: ABTestType) => void
}) {
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
        What do you want to test?
      </label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "8px",
        }}
      >
        {(Object.keys(AB_TEST_TYPE_LABELS) as ABTestType[]).map((type) => {
          const isSelected = value === type
          const { label, description } = AB_TEST_TYPE_LABELS[type]
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange(type)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "12px",
                border: isSelected ? "2px solid #C4A35A" : "1px solid #E8E4DF",
                borderRadius: "8px",
                backgroundColor: isSelected ? "rgba(196, 163, 90, 0.05)" : "#FFFFFF",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s ease",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: isSelected ? "#C4A35A" : "#2C2C2C",
                }}
              >
                {label}
              </span>
              <span style={{ fontSize: "11px", color: "#6B6B6B", marginTop: "2px" }}>
                {description}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Subject variant editor
 */
function SubjectVariantEditor({
  variant,
  onChange,
  onRemove,
  canRemove,
}: {
  variant: SubjectVariant
  onChange: (variant: SubjectVariant) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px",
        backgroundColor: "#FFFFFF",
        borderRadius: "8px",
        border: "1px solid #E8E4DF",
      }}
    >
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          backgroundColor: "#C4A35A",
          color: "#FAFAFA",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "14px",
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {variant.name}
      </div>
      <input
        type="text"
        value={variant.subject}
        onChange={(e) => onChange({ ...variant, subject: e.target.value })}
        placeholder="Enter subject line..."
        style={{
          flex: 1,
          padding: "8px 12px",
          border: "1px solid #E8E4DF",
          borderRadius: "6px",
          fontSize: "14px",
          color: "#2C2C2C",
          backgroundColor: "#FFFFFF",
          outline: "none",
        }}
      />
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove variant ${variant.name}`}
          style={{
            padding: "8px",
            border: "none",
            borderRadius: "6px",
            backgroundColor: "transparent",
            color: "#B85C5C",
            cursor: "pointer",
          }}
        >
          <Trash2 style={{ width: "16px", height: "16px" }} />
        </button>
      )}
    </div>
  )
}

/**
 * Sender variant editor
 */
function SenderVariantEditor({
  variant,
  onChange,
  onRemove,
  canRemove,
}: {
  variant: SenderVariant
  onChange: (variant: SenderVariant) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <div
      style={{
        padding: "12px",
        backgroundColor: "#FFFFFF",
        borderRadius: "8px",
        border: "1px solid #E8E4DF",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            backgroundColor: "#C4A35A",
            color: "#FAFAFA",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {variant.name}
        </div>
        <span style={{ fontSize: "14px", fontWeight: 500, color: "#2C2C2C" }}>
          Variant {variant.name}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove variant ${variant.name}`}
            style={{
              marginLeft: "auto",
              padding: "8px",
              border: "none",
              borderRadius: "6px",
              backgroundColor: "transparent",
              color: "#B85C5C",
              cursor: "pointer",
            }}
          >
            <Trash2 style={{ width: "16px", height: "16px" }} />
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          value={variant.senderName}
          onChange={(e) => onChange({ ...variant, senderName: e.target.value })}
          placeholder="Sender name..."
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "1px solid #E8E4DF",
            borderRadius: "6px",
            fontSize: "14px",
            color: "#2C2C2C",
            backgroundColor: "#FFFFFF",
            outline: "none",
          }}
        />
        <input
          type="email"
          value={variant.senderEmail}
          onChange={(e) => onChange({ ...variant, senderEmail: e.target.value })}
          placeholder="sender@example.com"
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "1px solid #E8E4DF",
            borderRadius: "6px",
            fontSize: "14px",
            color: "#2C2C2C",
            backgroundColor: "#FFFFFF",
            outline: "none",
          }}
        />
      </div>
    </div>
  )
}

/**
 * Winner metric selector
 */
function WinnerMetricSelector({
  value,
  onChange,
}: {
  value: ABTestWinnerMetric
  onChange: (metric: ABTestWinnerMetric) => void
}) {
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
        How should the winner be determined?
      </label>
      <div style={{ display: "flex", gap: "8px" }}>
        {(Object.keys(WINNER_METRIC_LABELS) as ABTestWinnerMetric[]).map((metric) => {
          const isSelected = value === metric
          const { label } = WINNER_METRIC_LABELS[metric]
          return (
            <button
              key={metric}
              type="button"
              onClick={() => onChange(metric)}
              style={{
                flex: 1,
                padding: "10px 12px",
                border: isSelected ? "2px solid #C4A35A" : "1px solid #E8E4DF",
                borderRadius: "8px",
                backgroundColor: isSelected ? "rgba(196, 163, 90, 0.05)" : "#FFFFFF",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500,
                color: isSelected ? "#C4A35A" : "#2C2C2C",
                transition: "all 0.2s ease",
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Slider input for percentage/duration
 */
function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  description,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  unit: string
  description?: string
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <label style={{ fontSize: "13px", fontWeight: 500, color: "#2C2C2C" }}>
          {label}
        </label>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "#C4A35A" }}>
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%",
          height: "6px",
          borderRadius: "3px",
          appearance: "none",
          backgroundColor: "#E8E4DF",
          cursor: "pointer",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
        <span style={{ fontSize: "11px", color: "#9A9A9A" }}>{min}{unit}</span>
        <span style={{ fontSize: "11px", color: "#9A9A9A" }}>{max}{unit}</span>
      </div>
      {description && (
        <p style={{ fontSize: "12px", color: "#6B6B6B", marginTop: "8px" }}>
          {description}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * A/B Test Configuration Component
 * 
 * Allows users to configure A/B testing for email campaigns.
 * 
 * Features:
 * - Toggle A/B testing on/off
 * - Select test type (subject, sender, content, send time)
 * - Configure 2-4 variants
 * - Set test audience percentage (10-50%)
 * - Choose winner metric (open rate, click rate, conversion rate)
 * - Set test duration
 * 
 * Requirements: 14 (A/B Testing for Campaigns)
 */
export function ABTestConfig({
  config,
  onChange,
  defaultSubject = "",
  defaultSenderName = "",
  defaultSenderEmail = "",
}: ABTestConfigProps) {
  const [isExpanded, setIsExpanded] = useState(config.enabled)

  /**
   * Handle enabling/disabling A/B testing
   */
  const handleToggle = useCallback((enabled: boolean) => {
    if (enabled && config.variants.length === 0) {
      // Initialize with default variants based on test type
      const initialVariants = createInitialVariants(
        config.testType,
        defaultSubject,
        defaultSenderName,
        defaultSenderEmail
      )
      onChange({ ...config, enabled, variants: initialVariants })
    } else {
      onChange({ ...config, enabled })
    }
    setIsExpanded(enabled)
  }, [config, onChange, defaultSubject, defaultSenderName, defaultSenderEmail])

  /**
   * Handle test type change
   */
  const handleTestTypeChange = useCallback((testType: ABTestType) => {
    const newVariants = createInitialVariants(
      testType,
      defaultSubject,
      defaultSenderName,
      defaultSenderEmail
    )
    onChange({ ...config, testType, variants: newVariants })
  }, [config, onChange, defaultSubject, defaultSenderName, defaultSenderEmail])

  /**
   * Add a new variant
   */
  const handleAddVariant = useCallback(() => {
    if (config.variants.length >= AB_TEST_LIMITS.maxVariants) return

    const nextName = VARIANT_NAMES[config.variants.length]
    const newVariant = createVariantForType(
      config.testType,
      createId(),
      nextName,
      defaultSubject,
      defaultSenderName,
      defaultSenderEmail
    )
    onChange({ ...config, variants: [...config.variants, newVariant] })
  }, [config, onChange, defaultSubject, defaultSenderName, defaultSenderEmail])

  /**
   * Remove a variant
   */
  const handleRemoveVariant = useCallback((index: number) => {
    if (config.variants.length <= AB_TEST_LIMITS.minVariants) return

    const newVariants = config.variants.filter((_, i) => i !== index)
    // Rename remaining variants
    const renamedVariants = newVariants.map((v, i) => ({
      ...v,
      name: VARIANT_NAMES[i],
    }))
    onChange({ ...config, variants: renamedVariants })
  }, [config, onChange])

  /**
   * Update a variant
   */
  const handleUpdateVariant = useCallback((index: number, variant: ABTestVariant) => {
    const newVariants = [...config.variants]
    newVariants[index] = variant
    onChange({ ...config, variants: newVariants })
  }, [config, onChange])

  const canAddVariant = config.variants.length < AB_TEST_LIMITS.maxVariants
  const canRemoveVariant = config.variants.length > AB_TEST_LIMITS.minVariants

  return (
    <div
      style={{
        border: "1px solid #E8E4DF",
        borderRadius: "12px",
        overflow: "hidden",
        backgroundColor: "#FFFFFF",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "16px",
          backgroundColor: config.enabled ? "rgba(196, 163, 90, 0.05)" : "#FFFFFF",
          borderBottom: isExpanded ? "1px solid #E8E4DF" : "none",
        }}
      >
        <FlaskConical
          style={{
            width: "20px",
            height: "20px",
            flexShrink: 0,
            color: config.enabled ? "#C4A35A" : "#6B6B6B",
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "#2C2C2C",
              margin: 0,
            }}
          >
            A/B Testing
          </h3>
          <p style={{ fontSize: "12px", color: "#6B6B6B", margin: "2px 0 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Test different versions to optimize your campaign
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <Toggle
            checked={config.enabled}
            onChange={handleToggle}
            label=""
          />
          {config.enabled && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? "Collapse settings" : "Expand settings"}
              style={{
                padding: "4px",
                border: "none",
                borderRadius: "6px",
                backgroundColor: "transparent",
                color: "#6B6B6B",
                cursor: "pointer",
              }}
            >
              {isExpanded ? (
                <ChevronUp style={{ width: "18px", height: "18px" }} />
              ) : (
                <ChevronDown style={{ width: "18px", height: "18px" }} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {config.enabled && isExpanded && (
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Test Type Selection */}
          <TestTypeSelector
            value={config.testType}
            onChange={handleTestTypeChange}
          />

          {/* Variants */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <label style={{ fontSize: "13px", fontWeight: 500, color: "#2C2C2C" }}>
                Test Variants ({config.variants.length}/{AB_TEST_LIMITS.maxVariants})
              </label>
              {canAddVariant && (
                <button
                  type="button"
                  onClick={handleAddVariant}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "6px 12px",
                    border: "1px solid #C4A35A",
                    borderRadius: "6px",
                    backgroundColor: "transparent",
                    color: "#C4A35A",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <Plus style={{ width: "14px", height: "14px" }} />
                  Add Variant
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {config.testType === "subject" &&
                config.variants.map((variant, index) => (
                  <SubjectVariantEditor
                    key={variant.id}
                    variant={variant as SubjectVariant}
                    onChange={(v) => handleUpdateVariant(index, v)}
                    onRemove={() => handleRemoveVariant(index)}
                    canRemove={canRemoveVariant}
                  />
                ))}
              {config.testType === "sender" &&
                config.variants.map((variant, index) => (
                  <SenderVariantEditor
                    key={variant.id}
                    variant={variant as SenderVariant}
                    onChange={(v) => handleUpdateVariant(index, v)}
                    onRemove={() => handleRemoveVariant(index)}
                    canRemove={canRemoveVariant}
                  />
                ))}
              {(config.testType === "content" || config.testType === "sendTime") && (
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: "rgba(196, 163, 90, 0.1)",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <Info style={{ width: "20px", height: "20px", color: "#C4A35A", flexShrink: 0 }} />
                  <p style={{ fontSize: "13px", color: "#6B6B6B", margin: 0 }}>
                    {config.testType === "content"
                      ? "Content variants will be configured in the Email Design step. Each variant will have its own email design."
                      : "Send time variants will be configured in the Schedule step. Each variant will be sent at a different time."}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Test Audience Percentage */}
          <SliderInput
            label="Test Audience"
            value={config.testAudiencePercentage}
            onChange={(value) => onChange({ ...config, testAudiencePercentage: value })}
            min={AB_TEST_LIMITS.minAudiencePercentage}
            max={AB_TEST_LIMITS.maxAudiencePercentage}
            step={5}
            unit="%"
            description={`${config.testAudiencePercentage}% of recipients will receive test variants. The remaining ${100 - config.testAudiencePercentage}% will receive the winning variant.`}
          />

          {/* Winner Metric */}
          <WinnerMetricSelector
            value={config.winnerMetric}
            onChange={(metric) => onChange({ ...config, winnerMetric: metric })}
          />

          {/* Test Duration */}
          <SliderInput
            label="Test Duration"
            value={config.testDurationHours}
            onChange={(value) => onChange({ ...config, testDurationHours: value })}
            min={AB_TEST_LIMITS.minTestDurationHours}
            max={AB_TEST_LIMITS.maxTestDurationHours}
            step={1}
            unit="h"
            description={`After ${config.testDurationHours} hours, the winning variant will be determined and sent to remaining recipients.`}
          />

          {/* Auto-send Winner Toggle */}
          <Toggle
            checked={config.autoSendWinner}
            onChange={(checked) => onChange({ ...config, autoSendWinner: checked })}
            label="Automatically send winner"
            description="When enabled, the winning variant will be automatically sent to remaining recipients after the test period ends."
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create initial variants for a test type
 */
function createInitialVariants(
  testType: ABTestType,
  defaultSubject: string,
  defaultSenderName: string,
  defaultSenderEmail: string
): ABTestVariant[] {
  return [
    createVariantForType(testType, createId(), "A", defaultSubject, defaultSenderName, defaultSenderEmail),
    createVariantForType(testType, createId(), "B", defaultSubject, defaultSenderName, defaultSenderEmail),
  ]
}

/**
 * Create a variant for a specific test type
 */
function createVariantForType(
  testType: ABTestType,
  id: string,
  name: string,
  defaultSubject: string,
  defaultSenderName: string,
  defaultSenderEmail: string
): ABTestVariant {
  switch (testType) {
    case "subject":
      return createSubjectVariant(id, name, name === "A" ? defaultSubject : "")
    case "sender":
      return createSenderVariant(
        id,
        name,
        name === "A" ? defaultSenderName : "",
        name === "A" ? defaultSenderEmail : ""
      )
    case "content":
      return { id, name, designJson: null }
    case "sendTime":
      return { id, name, sendTime: new Date() }
  }
}

export default ABTestConfig
