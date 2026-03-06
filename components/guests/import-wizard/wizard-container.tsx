"use client"

/**
 * @fileoverview Import Wizard Container Component
 * 
 * A multi-step wizard for importing guests from CSV/Excel files.
 * Provides step navigation, progress indicator, and validation.
 * Follows the ORA design system for consistent styling.
 * 
 * @module components/guests/import-wizard/wizard-container
 * @requires react
 * 
 * Requirements: 8 (Full-Page Guest Import Wizard)
 */

import { useState, useCallback, useEffect, type ReactNode } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  TableProperties,
  CheckCircle2,
  Settings,
  Loader2,
  ListTree,
  Columns,
} from "lucide-react"
import { ORAAccentLine } from "@/components/ui/ora-brand"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Wizard step configuration
 */
export interface ImportWizardStep {
  id: number
  name: string
  description: string
  icon: React.ComponentType<{ style?: React.CSSProperties }>
}

/**
 * Step validation result
 */
export interface StepValidation {
  isValid: boolean
  errorMessage?: string
}

/**
 * Wizard container props
 */
export interface ImportWizardContainerProps {
  steps: ImportWizardStep[]
  currentStep: number
  onStepChange: (step: number) => void
  validateStep: (step: number) => StepValidation | boolean
  onSubmit: () => Promise<void>
  isSubmitting?: boolean
  backLinkUrl?: string
  backLinkText?: string
  title?: string
  submitButtonText?: string
  children: ReactNode
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const IMPORT_WIZARD_STEPS: ImportWizardStep[] = [
  {
    id: 1,
    name: "Upload",
    description: "Select file",
    icon: Upload,
  },
  {
    id: 2,
    name: "Headers",
    description: "Select header row",
    icon: ListTree,
  },
  {
    id: 3,
    name: "Mapping",
    description: "Map columns",
    icon: Columns,
  },
  {
    id: 4,
    name: "Validation",
    description: "Review data",
    icon: CheckCircle2,
  },
  {
    id: 5,
    name: "Options",
    description: "Configure",
    icon: Settings,
  },
  {
    id: 6,
    name: "Import",
    description: "Progress",
    icon: Loader2,
  },
]

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ProgressBar({
  currentStep,
  totalSteps,
}: {
  currentStep: number
  totalSteps: number
}) {
  const completedSteps = currentStep - 1
  const progressPercentage = Math.round((completedSteps / totalSteps) * 100)
  
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
      <div
        style={{
          flex: 1,
          height: "4px",
          backgroundColor: "#E8E4DF",
          borderRadius: "2px",
          overflow: "hidden",
        }}
        role="progressbar"
        aria-valuenow={progressPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          style={{
            width: `${progressPercentage}%`,
            height: "100%",
            backgroundColor: "#5C8A6B",
            borderRadius: "2px",
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span style={{ fontSize: "12px", fontWeight: 500, color: "#6B6B6B", minWidth: "45px", textAlign: "right" }}>
        {progressPercentage}%
      </span>
    </div>
  )
}

function MobileStepIndicator({
  steps,
  currentStep,
}: {
  steps: ImportWizardStep[]
  currentStep: number
}) {
  const currentStepData = steps.find((s) => s.id === currentStep)
  const StepIcon = currentStepData?.icon
  
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        padding: "8px 16px",
        backgroundColor: "rgba(196, 163, 90, 0.1)",
        borderRadius: "8px",
      }}
    >
      {StepIcon && (
        <StepIcon style={{ width: "20px", height: "20px", color: "#C4A35A" }} />
      )}
      <div>
        <div style={{ fontSize: "14px", fontWeight: 500, color: "#C4A35A" }}>
          Step {currentStep} of {steps.length}
        </div>
        <div style={{ fontSize: "12px", color: "#6B6B6B" }}>
          {currentStepData?.name}
        </div>
      </div>
    </div>
  )
}

function WizardProgress({
  steps,
  currentStep,
  onStepClick,
  isMobile = false,
}: {
  steps: ImportWizardStep[]
  currentStep: number
  onStepClick: (step: number) => void
  isMobile?: boolean
}) {
  if (isMobile) {
    return (
      <div style={{ width: "100%" }}>
        <ProgressBar currentStep={currentStep} totalSteps={steps.length} />
        <MobileStepIndicator steps={steps} currentStep={currentStep} />
      </div>
    )
  }

  return (
    <div style={{ width: "100%" }}>
      <ProgressBar currentStep={currentStep} totalSteps={steps.length} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
        {steps.map((step, index) => {
          const isCompleted = step.id < currentStep
          const isCurrent = step.id === currentStep
          const isClickable = step.id < currentStep
          const StepIcon = step.icon

          return (
            <div key={step.id} style={{ display: "flex", alignItems: "center" }}>
              <button
                onClick={() => isClickable && onStepClick(step.id)}
                disabled={!isClickable}
                aria-current={isCurrent ? "step" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: isCurrent
                    ? "rgba(196, 163, 90, 0.1)"
                    : isCompleted
                    ? "rgba(92, 138, 107, 0.1)"
                    : "transparent",
                  cursor: isClickable ? "pointer" : "default",
                  transition: "all 0.2s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    backgroundColor: isCurrent
                      ? "#C4A35A"
                      : isCompleted
                      ? "#5C8A6B"
                      : "#E8E4DF",
                    color: isCurrent || isCompleted ? "#FAFAFA" : "#6B6B6B",
                    fontSize: "12px",
                    fontWeight: 500,
                    transition: "all 0.2s ease",
                  }}
                >
                  {isCompleted ? (
                    <Check style={{ width: "16px", height: "16px" }} />
                  ) : (
                    <StepIcon style={{ width: "16px", height: "16px" }} />
                  )}
                </div>
                <div style={{ textAlign: "left" }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      color: isCurrent ? "#C4A35A" : isCompleted ? "#5C8A6B" : "#6B6B6B",
                    }}
                  >
                    {step.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "#9A9A9A" }}>
                    {step.description}
                  </div>
                </div>
              </button>
              {index < steps.length - 1 && (
                <div
                  style={{
                    width: "24px",
                    height: "2px",
                    backgroundColor: isCompleted ? "#5C8A6B" : "#E8E4DF",
                    margin: "0 4px",
                    transition: "background-color 0.3s ease",
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ImportWizardContainer({
  steps,
  currentStep,
  onStepChange,
  validateStep,
  onSubmit,
  isSubmitting = false,
  backLinkUrl = "/guests",
  backLinkText = "Back to Guests",
  title = "Import Guests",
  submitButtonText = "Start Import",
  children,
}: ImportWizardContainerProps) {
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  const normalizeValidation = useCallback((result: StepValidation | boolean): StepValidation => {
    if (typeof result === "boolean") {
      return { isValid: result }
    }
    return result
  }, [])

  const checkStepValidity = useCallback((): StepValidation => {
    const result = validateStep(currentStep)
    return normalizeValidation(result)
  }, [currentStep, validateStep, normalizeValidation])

  const handleNext = useCallback(() => {
    const validation = checkStepValidity()
    if (validation.isValid && currentStep < steps.length) {
      setValidationError(null)
      onStepChange(currentStep + 1)
    } else if (!validation.isValid && validation.errorMessage) {
      setValidationError(validation.errorMessage)
    }
  }, [currentStep, steps.length, checkStepValidity, onStepChange])

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setValidationError(null)
      onStepChange(currentStep - 1)
    }
  }, [currentStep, onStepChange])

  const handleStepClick = useCallback((step: number) => {
    if (step < currentStep) {
      setValidationError(null)
      onStepChange(step)
    }
  }, [currentStep, onStepChange])

  const handleSubmit = useCallback(async () => {
    const validation = checkStepValidity()
    if (validation.isValid) {
      setValidationError(null)
      await onSubmit()
    } else if (validation.errorMessage) {
      setValidationError(validation.errorMessage)
    }
  }, [checkStepValidity, onSubmit])

  const validation = checkStepValidity()
  const canProceed = validation.isValid
  const totalSteps = steps.length
  const isProgressStep = currentStep === totalSteps  // Progress is the last step (step 6)
  const isOptionsStep = currentStep === totalSteps - 1  // Options is second to last (step 5)

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 64px)", backgroundColor: "#FAFAFA" }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid #E8E4DF",
          backgroundColor: "#FAFAFA",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link
            href={backLinkUrl}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px",
              color: "#6B6B6B",
              fontSize: "14px",
              textDecoration: "none",
              borderRadius: "6px",
              transition: "all 0.2s ease",
            }}
          >
            <ArrowLeft style={{ width: "16px", height: "16px" }} />
            {backLinkText}
          </Link>
          <div style={{ width: "1px", height: "24px", backgroundColor: "#E8E4DF" }} aria-hidden="true" />
          <div>
            <ORAAccentLine width="sm" className="mb-1" />
            <h1 style={{ fontSize: "18px", fontWeight: 300, letterSpacing: "0.02em", color: "#2C2C2C" }}>
              {title}
            </h1>
          </div>
        </div>
      </header>

      {/* Progress */}
      <nav
        aria-label="Import wizard progress"
        style={{
          display: "flex",
          justifyContent: "center",
          padding: isMobile ? "16px" : "24px",
          borderBottom: "1px solid #E8E4DF",
          backgroundColor: "#FAFAFA",
          overflowX: "auto",
        }}
      >
        <WizardProgress
          steps={steps}
          currentStep={currentStep}
          onStepClick={handleStepClick}
          isMobile={isMobile}
        />
      </nav>

      {/* Validation Error */}
      {validationError && (
        <div
          role="alert"
          style={{
            padding: "12px 24px",
            backgroundColor: "rgba(184, 92, 92, 0.1)",
            borderBottom: "1px solid rgba(184, 92, 92, 0.2)",
          }}
        >
          <p style={{ color: "#B85C5C", fontSize: "14px", textAlign: "center" }}>
            {validationError}
          </p>
        </div>
      )}

      {/* Content */}
      <main style={{ flex: 1, padding: "48px 24px", overflowY: "auto" }}>
        {children}
      </main>

      {/* Footer - Hide during progress step */}
      {!isProgressStep && (
        <footer
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderTop: "1px solid #E8E4DF",
            backgroundColor: "#FAFAFA",
          }}
        >
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 20px",
              border: "1px solid #E8E4DF",
              borderRadius: "9999px",
              backgroundColor: "transparent",
              fontSize: "14px",
              fontWeight: 500,
              color: currentStep === 1 ? "#9A9A9A" : "#2C2C2C",
              cursor: currentStep === 1 ? "not-allowed" : "pointer",
              opacity: currentStep === 1 ? 0.6 : 1,
              transition: "all 0.2s ease",
            }}
          >
            <ArrowLeft style={{ width: "16px", height: "16px" }} />
            Back
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {isOptionsStep ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !canProceed}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 24px",
                  border: "none",
                  borderRadius: "9999px",
                  backgroundColor: isSubmitting || !canProceed ? "#9A9A9A" : "#2C2C2C",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#FAFAFA",
                  cursor: isSubmitting || !canProceed ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} />
                    Importing...
                  </>
                ) : (
                  <>
                    {submitButtonText}
                    <Check style={{ width: "16px", height: "16px" }} />
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!canProceed}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 24px",
                  border: "none",
                  borderRadius: "9999px",
                  backgroundColor: canProceed ? "#2C2C2C" : "#9A9A9A",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#FAFAFA",
                  cursor: canProceed ? "pointer" : "not-allowed",
                  transition: "all 0.2s ease",
                }}
              >
                Continue
                <ArrowRight style={{ width: "16px", height: "16px" }} />
              </button>
            )}
          </div>
        </footer>
      )}

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default ImportWizardContainer
