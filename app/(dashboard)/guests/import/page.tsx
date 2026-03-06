"use client"

/**
 * @fileoverview Full-Page Guest Import Wizard
 * 
 * A multi-step wizard for importing guests from CSV/Excel files.
 * Supports file upload, column mapping, validation, and progress tracking.
 * 
 * @module app/(dashboard)/guests/import/page
 * @requires react
 * 
 * Requirements: 8 (Full-Page Guest Import Wizard)
 */

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useEvents } from "@/hooks/use-events"
import { guestKeys } from "@/hooks/use-guests"
import { eventGuestKeys } from "@/hooks/use-event-guests"
import {
  ImportWizardContainer,
  IMPORT_WIZARD_STEPS,
  StepUpload,
  StepHeaderSelection,
  StepMapping,
  StepValidation,
  StepOptions,
  StepProgress,
} from "@/components/guests/import-wizard"
import { ImportParser } from "@/lib/services/import-parser"
import type {
  ColumnMapping,
  FileParseResult,
  ValidationResult,
  ImportOptions,
  ImportProgress,
  ImportJobResult,
} from "@/lib/services/import-parser"

// ============================================================================
// TYPES
// ============================================================================

interface WizardState {
  file: File | null
  fileContent: Buffer | string | null
  parseResult: FileParseResult | null
  headerRowIndex: number
  autoDetectedMapping: ColumnMapping | null
  mapping: ColumnMapping
  validationResult: ValidationResult | null
  options: ImportOptions
  jobId: string | null
  progress: ImportProgress | null
  result: ImportJobResult | null
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: WizardState = {
  file: null,
  fileContent: null,
  parseResult: null,
  headerRowIndex: 0,
  autoDetectedMapping: null,
  mapping: {},
  validationResult: null,
  options: {
    duplicateHandling: "update",
    batchSize: 100,
  },
  jobId: null,
  progress: null,
  result: null,
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function ImportGuestsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: events = [], isLoading: isLoadingEvents } = useEvents()
  
  const [currentStep, setCurrentStep] = useState(1)
  const [state, setState] = useState<WizardState>(initialState)
  const [isValidating, setIsValidating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  // ============================================================================
  // FILE HANDLING
  // ============================================================================

  const handleFileSelect = useCallback(async (file: File | null) => {
    if (!file) {
      setState(prev => ({
        ...prev,
        file: null,
        fileContent: null,
        parseResult: null,
        headerRowIndex: 0,
        autoDetectedMapping: null,
        mapping: {},
        validationResult: null,
      }))
      return
    }

    try {
      // Read file content
      const content = await readFileContent(file)
      
      // Parse file with default header row (row 0)
      const parseResult = await ImportParser.parseFile(content, file.name, 0)
      
      // Auto-detect column mapping from headers
      const autoDetectedMapping = ImportParser.autoDetectColumnMapping(parseResult.headers)
      
      setState(prev => ({
        ...prev,
        file,
        fileContent: content,
        parseResult,
        headerRowIndex: 0,
        autoDetectedMapping,
        mapping: autoDetectedMapping,
        validationResult: null,
      }))
    } catch (error) {
      console.error("Error parsing file:", error)
      toast.error("Failed to parse file. Please check the file format.")
    }
  }, [])

  const readFileContent = (file: File): Promise<Buffer | string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      const ext = file.name.toLowerCase().split(".").pop()
      
      if (ext === "csv") {
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.onerror = reject
        reader.readAsText(file)
      } else {
        reader.onload = (e) => {
          const arrayBuffer = e.target?.result as ArrayBuffer
          resolve(Buffer.from(arrayBuffer))
        }
        reader.onerror = reject
        reader.readAsArrayBuffer(file)
      }
    })
  }

  // ============================================================================
  // HEADER ROW SELECTION
  // ============================================================================

  const handleHeaderRowChange = useCallback(async (headerRowIndex: number) => {
    if (!state.fileContent || !state.file) return

    try {
      // Re-parse file with new header row index
      const parseResult = await ImportParser.parseFile(
        state.fileContent, 
        state.file.name, 
        headerRowIndex
      )
      
      // Re-run auto-detection with new headers
      const autoDetectedMapping = ImportParser.autoDetectColumnMapping(parseResult.headers)
      
      setState(prev => ({
        ...prev,
        parseResult,
        headerRowIndex,
        autoDetectedMapping,
        mapping: autoDetectedMapping,
        validationResult: null, // Reset validation when header changes
      }))
    } catch (error) {
      console.error("Error re-parsing file:", error)
      toast.error("Failed to re-parse file with new header row.")
    }
  }, [state.fileContent, state.file])

  // ============================================================================
  // MAPPING HANDLING
  // ============================================================================

  const handleMappingChange = useCallback((mapping: ColumnMapping) => {
    setState(prev => ({
      ...prev,
      mapping,
      validationResult: null, // Reset validation when mapping changes
    }))
  }, [])

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const runValidation = useCallback(async () => {
    if (!state.parseResult) return

    setIsValidating(true)
    try {
      // Validate rows with current mapping
      const validationResult = ImportParser.validateRows(state.parseResult, state.mapping)
      setState(prev => ({ ...prev, validationResult }))
    } catch (error) {
      console.error("Validation error:", error)
      toast.error("Failed to validate data")
    } finally {
      setIsValidating(false)
    }
  }, [state.parseResult, state.mapping])

  // Run validation when entering step 4 (Validation step)
  useEffect(() => {
    if (currentStep === 4 && !state.validationResult && state.parseResult) {
      runValidation()
    }
  }, [currentStep, state.validationResult, state.parseResult, runValidation])

  // ============================================================================
  // OPTIONS HANDLING
  // ============================================================================

  const handleOptionsChange = useCallback((options: ImportOptions) => {
    setState(prev => ({ ...prev, options }))
  }, [])

  // ============================================================================
  // IMPORT EXECUTION
  // ============================================================================

  const handleSubmit = useCallback(async () => {
    if (!state.parseResult || !state.validationResult) return

    setIsSubmitting(true)
    setCurrentStep(6) // Move to progress step

    const jobId = `import-${Date.now()}`
    const totalRows = state.validationResult.validRows

    try {
      setState(prev => ({
        ...prev,
        jobId,
        progress: {
          jobId,
          status: "processing",
          totalRows,
          processedRows: 0,
          successCount: 0,
          errorCount: 0,
          percentComplete: 0,
          startedAt: new Date(),
        },
      }))

      // Prepare guest data from validated rows
      const guestsToImport = state.validationResult.preview
        .filter(row => row.isValid)
        .map(row => ({
          firstName: row.data.firstName,
          lastName: row.data.lastName,
          email: row.data.email,
          mobile: row.data.mobile || undefined,
          company: row.data.company || undefined,
          jobTitle: row.data.jobTitle || undefined,
          photoUrl: row.data.photoUrl || undefined,
        }))

      // If we have more valid rows than preview (preview limited to 100),
      // we need to map all valid rows from parseResult
      if (totalRows > guestsToImport.length) {
        guestsToImport.length = 0 // Clear array
        for (const row of state.parseResult.rows) {
          const mappedRow = ImportParser.mapRow(row, state.mapping)
          // Basic validation - has required fields
          if (mappedRow.firstName && mappedRow.lastName && mappedRow.email) {
            guestsToImport.push({
              firstName: mappedRow.firstName,
              lastName: mappedRow.lastName,
              email: mappedRow.email,
              mobile: mappedRow.mobile || undefined,
              company: mappedRow.company || undefined,
              jobTitle: mappedRow.jobTitle || undefined,
              photoUrl: mappedRow.photoUrl || undefined,
            })
          }
        }
      }

      // Show progress animation
      setState(prev => ({
        ...prev,
        progress: {
          ...prev.progress!,
          processedRows: Math.round(totalRows * 0.2),
          percentComplete: 20,
        },
      }))

      // Call API to import guests
      const response = await fetch('/api/guests/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guests: guestsToImport,
          options: {
            duplicateHandling: state.options.duplicateHandling,
            eventId: state.options.eventId || undefined,
          },
        }),
      })

      setState(prev => ({
        ...prev,
        progress: {
          ...prev.progress!,
          processedRows: Math.round(totalRows * 0.8),
          percentComplete: 80,
        },
      }))

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Import failed')
      }

      const result = await response.json()
      
      const successCount = result.created + result.updated
      const errorCount = result.failed?.length || 0

      // Complete
      setState(prev => ({
        ...prev,
        progress: {
          ...prev.progress!,
          processedRows: totalRows,
          successCount,
          errorCount,
          percentComplete: 100,
        },
        result: {
          jobId,
          status: "completed",
          totalRows,
          successCount,
          errorCount,
          errors: result.failed || [],
        },
      }))

      // Invalidate guests cache so the list refreshes automatically
      await queryClient.invalidateQueries({ queryKey: guestKeys.all })
      
      // If an event was assigned, also invalidate event guests cache
      if (state.options.eventId) {
        await queryClient.invalidateQueries({ 
          queryKey: eventGuestKeys.listByEvent(state.options.eventId) 
        })
      }

      toast.success(`Successfully imported ${successCount} guests`)
    } catch (error) {
      console.error("Import error:", error)
      toast.error(error instanceof Error ? error.message : "Import failed. Please try again.")
      
      setState(prev => ({
        ...prev,
        result: {
          jobId,
          status: "failed",
          totalRows,
          successCount: prev.progress?.successCount || 0,
          errorCount: prev.progress?.errorCount || 0,
          errors: [],
        },
      }))
    } finally {
      setIsSubmitting(false)
    }
  }, [state.parseResult, state.validationResult, state.mapping, state.options])

  // ============================================================================
  // CANCEL HANDLING
  // ============================================================================

  const handleCancel = useCallback(() => {
    setIsCancelling(true)
  }, [])

  // ============================================================================
  // STEP VALIDATION
  // ============================================================================

  const validateStep = useCallback((step: number) => {
    switch (step) {
      case 1: // Upload
        if (!state.file) {
          return { isValid: false, errorMessage: "Please upload a file to continue" }
        }
        if (!state.parseResult) {
          return { isValid: false, errorMessage: "File could not be parsed" }
        }
        return { isValid: true }

      case 2: // Header Selection
        if (!state.parseResult) {
          return { isValid: false, errorMessage: "Please upload a file first" }
        }
        return { isValid: true }

      case 3: // Mapping
        const mappingValidation = ImportParser.validateColumnMapping(state.mapping)
        if (!mappingValidation.isValid) {
          return { isValid: false, errorMessage: mappingValidation.errors.join(", ") }
        }
        return { isValid: true }

      case 4: // Validation
        if (isValidating) {
          return { isValid: false, errorMessage: "Validation in progress..." }
        }
        if (!state.validationResult) {
          return { isValid: false, errorMessage: "Please wait for validation to complete" }
        }
        if (state.validationResult.validRows === 0) {
          return { isValid: false, errorMessage: "No valid rows to import" }
        }
        return { isValid: true }

      case 5: // Options
        return { isValid: true }

      case 6: // Progress
        return { isValid: true }

      default:
        return { isValid: true }
    }
  }, [state.file, state.parseResult, state.mapping, state.validationResult, isValidating])

  // ============================================================================
  // RENDER
  // ============================================================================

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <StepUpload
            file={state.file}
            onFileSelect={handleFileSelect}
          />
        )

      case 2:
        return (
          <StepHeaderSelection
            parseResult={state.parseResult}
            headerRowIndex={state.headerRowIndex}
            onHeaderRowChange={handleHeaderRowChange}
          />
        )

      case 3:
        return (
          <StepMapping
            parseResult={state.parseResult}
            mapping={state.mapping}
            onMappingChange={handleMappingChange}
            autoDetectedMapping={state.autoDetectedMapping}
          />
        )

      case 4:
        return (
          <StepValidation
            validationResult={state.validationResult}
            isValidating={isValidating}
          />
        )

      case 5:
        return (
          <StepOptions
            options={state.options}
            onOptionsChange={handleOptionsChange}
            events={events}
            isLoadingEvents={isLoadingEvents}
            validRowCount={state.validationResult?.validRows || 0}
          />
        )

      case 6:
        return (
          <StepProgress
            progress={state.progress}
            result={state.result}
            onCancel={handleCancel}
            isCancelling={isCancelling}
          />
        )

      default:
        return null
    }
  }

  return (
    <ImportWizardContainer
      steps={IMPORT_WIZARD_STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      validateStep={validateStep}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      backLinkUrl="/guests"
      backLinkText="Back to Guests"
      title="Import Guests"
      submitButtonText="Start Import"
    >
      {renderStepContent()}
    </ImportWizardContainer>
  )
}
