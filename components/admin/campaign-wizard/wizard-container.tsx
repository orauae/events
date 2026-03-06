"use client"

import { useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Save,
  Loader2,
} from "lucide-react"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import { Button } from "@/components/ui/button"

// ============================================================================
// TYPES
// ============================================================================

export interface WizardStep {
  id: number
  name: string
  description: string
  icon: React.ComponentType<{ style?: React.CSSProperties; className?: string }>
}

export interface StepValidation {
  isValid: boolean
  errorMessage?: string
}

export interface WizardContainerProps {
  steps: WizardStep[]
  currentStep: number
  onStepChange: (step: number) => void
  validateStep: (step: number) => StepValidation | boolean
  onSaveDraft?: () => Promise<void>
  onSubmit: () => Promise<void>
  isSubmitting?: boolean
  isSavingDraft?: boolean
  backLinkUrl?: string
  backLinkText?: string
  title?: string
  submitButtonText?: string
  children: ReactNode
  autoSaveInterval?: number
  onAutoSave?: () => Promise<void>
  /** Breadcrumb items (if not provided, defaults to Campaigns > title) */
  breadcrumbItems?: { label: string; href?: string }[]
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ProgressBar({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  const progressPercentage = Math.round(((currentStep - 1) / totalSteps) * 100)

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex-1 h-1 bg-ora-sand rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={progressPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Campaign creation progress: ${progressPercentage}% complete`}
      >
        <div
          className="h-full bg-green-600 rounded-full transition-all duration-300"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      <span className="text-xs font-medium text-ora-graphite min-w-[40px] text-right">
        {progressPercentage}%
      </span>
    </div>
  )
}

function WizardProgress({
  steps,
  currentStep,
  onStepClick,
}: {
  steps: WizardStep[]
  currentStep: number
  onStepClick: (step: number) => void
}) {
  return (
    <div className="w-full space-y-3">
      <ProgressBar currentStep={currentStep} totalSteps={steps.length} />
      <div className="flex items-center justify-center gap-1 overflow-x-auto">
        {steps.map((step, index) => {
          const isCompleted = step.id < currentStep
          const isCurrent = step.id === currentStep
          const isClickable = step.id < currentStep
          const StepIcon = step.icon

          return (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => isClickable && onStepClick(step.id)}
                disabled={!isClickable}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`${step.name}: ${step.description}${isCompleted ? " (completed)" : isCurrent ? " (current)" : ""}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border-none transition-colors ${
                  isCurrent
                    ? "bg-ora-gold/10"
                    : isCompleted
                    ? "bg-green-50"
                    : "bg-transparent"
                } ${isClickable ? "cursor-pointer hover:bg-ora-gold/5" : "cursor-default"}`}
              >
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                    isCurrent
                      ? "bg-ora-gold text-white"
                      : isCompleted
                      ? "bg-green-600 text-white"
                      : "bg-ora-sand text-ora-graphite"
                  }`}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : isCurrent ? (
                    <StepIcon className="h-3.5 w-3.5" />
                  ) : (
                    step.id
                  )}
                </div>
                <div className="text-left hidden sm:block">
                  <div
                    className={`text-xs font-medium ${
                      isCurrent ? "text-ora-gold" : isCompleted ? "text-green-600" : "text-ora-graphite"
                    }`}
                  >
                    {step.name}
                  </div>
                  <div className="text-[10px] text-ora-stone">{step.description}</div>
                </div>
              </button>
              {index < steps.length - 1 && (
                <div
                  className={`w-5 h-0.5 mx-1 transition-colors ${
                    isCompleted ? "bg-green-600" : "bg-ora-sand"
                  }`}
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

export function WizardContainer({
  steps,
  currentStep,
  onStepChange,
  validateStep,
  onSaveDraft,
  onSubmit,
  isSubmitting = false,
  isSavingDraft = false,
  backLinkUrl = "/admin/campaigns",
  title = "Create Campaign",
  submitButtonText = "Create Campaign",
  children,
  autoSaveInterval = 30000,
  onAutoSave,
  breadcrumbItems,
}: WizardContainerProps) {
  const [validationError, setValidationError] = useState<string | null>(null)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  const normalizeValidation = useCallback(
    (result: StepValidation | boolean): StepValidation => {
      if (typeof result === "boolean") return { isValid: result }
      return result
    },
    []
  )

  const checkStepValidity = useCallback((): StepValidation => {
    return normalizeValidation(validateStep(currentStep))
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

  const handleStepClick = useCallback(
    (step: number) => {
      if (step < currentStep) {
        setValidationError(null)
        onStepChange(step)
      }
    },
    [currentStep, onStepChange]
  )

  const handleSubmit = useCallback(async () => {
    const validation = checkStepValidity()
    if (validation.isValid) {
      setValidationError(null)
      await onSubmit()
    } else if (validation.errorMessage) {
      setValidationError(validation.errorMessage)
    }
  }, [checkStepValidity, onSubmit])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return
      if (e.key === "ArrowRight" && e.altKey) {
        e.preventDefault()
        handleNext()
      } else if (e.key === "ArrowLeft" && e.altKey) {
        e.preventDefault()
        handleBack()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleNext, handleBack])

  // Auto-save
  useEffect(() => {
    if (autoSaveInterval > 0 && onAutoSave) {
      autoSaveTimerRef.current = setInterval(() => {
        onAutoSave().catch(console.error)
      }, autoSaveInterval)
      return () => {
        if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current)
      }
    }
  }, [autoSaveInterval, onAutoSave])

  const validation = checkStepValidity()
  const canProceed = validation.isValid
  const isLastStep = currentStep === steps.length

  const defaultBreadcrumb = [
    { label: "Campaigns", href: backLinkUrl },
    { label: title },
  ]
  const crumbs = breadcrumbItems || defaultBreadcrumb

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* Breadcrumb + Title + Save Draft */}
      <div className="mb-4">
        <AdminBreadcrumb items={crumbs} />
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-lg font-semibold text-ora-charcoal">{title}</h1>
          {onSaveDraft && (
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={isSavingDraft}
              aria-label={isSavingDraft ? "Saving draft..." : "Save draft"}
            >
              {isSavingDraft ? (
                <Loader2 className="h-4 w-4 stroke-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 stroke-1" />
              )}
              {isSavingDraft ? "Saving..." : "Save Draft"}
            </Button>
          )}
        </div>
      </div>

      {/* Step Progress */}
      <nav aria-label="Wizard progress" className="pb-4">
        <WizardProgress steps={steps} currentStep={currentStep} onStepClick={handleStepClick} />
      </nav>

      {/* Validation Error */}
      {validationError && (
        <div role="alert" className="mb-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm text-center">{validationError}</p>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto">{children}</main>

      {/* Footer Navigation */}
      <footer className="flex items-center justify-between pt-4 mt-4 border-t border-ora-sand">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 1}
          aria-label="Go to previous step"
        >
          <ArrowLeft className="h-4 w-4 stroke-1" />
          Back
        </Button>

        <div className="flex items-center gap-3">
          {isLastStep ? (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !canProceed}
              isLoading={isSubmitting}
              aria-label={isSubmitting ? "Creating campaign..." : submitButtonText}
            >
              {submitButtonText}
              <Check className="h-4 w-4 stroke-1" />
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canProceed}
              aria-label="Go to next step"
            >
              Continue
              <ArrowRight className="h-4 w-4 stroke-1" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}

export default WizardContainer
