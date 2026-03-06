"use client"

/**
 * @fileoverview Campaign Wizard Step 3 - Email Design
 * 
 * Allows users to design their campaign email through:
 * - Template selection from the library (database + static templates)
 * - Unlayer email editor for professional email design
 * - Subject line input with template string support
 * - Preview functionality
 * 
 * @module components/admin/campaign-wizard/step-design
 * @requires react
 * @requires lucide-react
 * 
 * Requirements: 4 (Multi-Step Campaign Creation Wizard)
 * Requirements: 4.3 - Email Design (drag-and-drop builder or template selection)
 * Requirements: 6 (Unlayer Email Editor Integration)
 * Requirements: 10.5 - Template selection from library
 */

import { useState, useCallback, useEffect, useRef } from "react"
import {
  Layout,
  Eye,
  ChevronLeft,
  Check,
  Loader2,
  Mail,
  Sparkles,
  Database,
  FileText,
} from "lucide-react"
import { toast } from "sonner"
import { EMAIL_TEMPLATES } from "@/lib/email-templates"
import { createBlankTemplate } from "@/lib/email-templates"
import type { EmailBuilderState } from "@/lib/types/email-builder"
import { 
  TemplateStringPicker, 
  replaceTemplateStrings,
} from "@/components/shared"
import { 
  UnlayerEmailBuilder, 
  TemplateLibrarySheet,
  type UnlayerEmailBuilderRef,
  type UnlayerDesignJson,
} from "@/components/unlayer-email-builder"
import { EmailGenerationService } from "@/lib/services/email-generation-service"
import { useEmailTemplatesForWizard } from "@/hooks/use-email-templates"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Step design data structure
 * Updated to support both legacy EmailBuilderState and Unlayer design JSON
 */
export interface StepDesignData {
  subject: string
  templateId: string
  /** Legacy design JSON format (EmailBuilderState) */
  designJson: EmailBuilderState | null
  /** Unlayer design JSON format */
  unlayerDesignJson?: UnlayerDesignJson | null
  /** Exported HTML content from Unlayer */
  htmlContent?: string | null
  /** Whether the template is from the database library */
  isLibraryTemplate?: boolean
  /** WhatsApp template name */
  whatsappTemplateId?: string
  /** WhatsApp message body */
  whatsappMessageBody?: string
  /** WhatsApp media URL */
  whatsappMediaUrl?: string
  /** WhatsApp media type */
  whatsappMediaType?: "" | "image" | "document" | "video"
  /** SMS message body */
  smsBody?: string
  /** SMS sender ID */
  smsSenderId?: string
  /** SMS opt-out footer toggle */
  smsOptOutFooter?: boolean
}

/**
 * Props for the StepDesign component
 */
export interface StepDesignProps {
  data: StepDesignData
  onChange: (updates: Partial<StepDesignData>) => void
  campaignType?: string
  /** Campaign ID for image uploads (optional, will use placeholder if not provided) */
  campaignId?: string
  /** Campaign channel - determines which builder to show */
  channel?: "email" | "whatsapp" | "sms"
  /** WhatsApp channel ID — required for Meta template features */
  whatsappChannelId?: string
}

/**
 * Design mode - template selection or email builder
 */
type DesignMode = "template-selection" | "email-builder"

/**
 * Template source - static (built-in) or library (database)
 */
type TemplateSource = "static" | "library"

/**
 * Unified template type for display
 */
interface UnifiedTemplate {
  id: string
  name: string
  description: string | null
  category: string
  subject?: string
  state?: EmailBuilderState
  designJson?: unknown
  unlayerDesignJson?: UnlayerDesignJson
  isDefault?: boolean
  source: TemplateSource
  thumbnailUrl?: string | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Sample data for subject line preview
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

/**
 * Category to emoji mapping for template cards
 */
const CATEGORY_EMOJI: Record<string, string> = {
  'Invitation': '✉️',
  'Reminder': '⏰',
  'LastChance': '⚡',
  'EventDay': '🎊',
  'ThankYou': '🙏',
  'Feedback': '📝',
  'Custom': '🎨',
}

/**
 * Auto-save debounce delay in milliseconds
 */
const AUTO_SAVE_DEBOUNCE_MS = 2000

/**
 * Auto-save retry delay in milliseconds
 */
const AUTO_SAVE_RETRY_DELAY_MS = 2000

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Template card component for the template selection grid
 * Supports both static and library templates
 * 
 * Requirements: 10.5 - Template selection from library
 */
function TemplateCard({
  template,
  isSelected,
  onSelect,
  isRecommended,
}: {
  template: UnifiedTemplate
  isSelected: boolean
  onSelect: () => void
  isRecommended: boolean
}) {
  const emoji = CATEGORY_EMOJI[template.category] || '📄'
  const isLibrary = template.source === 'library'
  
  return (
    <button
      onClick={onSelect}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "16px",
        border: isSelected ? "2px solid #C4A35A" : "1px solid #E8E4DF",
        borderRadius: "12px",
        backgroundColor: isSelected ? "rgba(196, 163, 90, 0.05)" : "#FAFAFA",
        cursor: "pointer",
        transition: "all 0.2s ease",
        textAlign: "left",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Badges container */}
      <div
        style={{
          position: "absolute",
          top: "8px",
          right: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          alignItems: "flex-end",
        }}
      >
        {/* Recommended badge */}
        {isRecommended && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              backgroundColor: "#5C8A6B",
              borderRadius: "9999px",
              fontSize: "10px",
              fontWeight: 500,
              color: "#FAFAFA",
            }}
          >
            <Sparkles style={{ width: "10px", height: "10px" }} />
            Recommended
          </div>
        )}
        
        {/* Library badge */}
        {isLibrary && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              backgroundColor: "rgba(196, 163, 90, 0.15)",
              borderRadius: "9999px",
              fontSize: "10px",
              fontWeight: 500,
              color: "#C4A35A",
            }}
          >
            <Database style={{ width: "10px", height: "10px" }} />
            Library
          </div>
        )}
        
        {/* Default badge for library templates */}
        {isLibrary && template.isDefault && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              backgroundColor: "rgba(92, 138, 107, 0.15)",
              borderRadius: "9999px",
              fontSize: "10px",
              fontWeight: 500,
              color: "#5C8A6B",
            }}
          >
            <Check style={{ width: "10px", height: "10px" }} />
            Default
          </div>
        )}
      </div>

      {/* Template preview thumbnail */}
      <div
        style={{
          width: "100%",
          height: "100px",
          backgroundColor: "#F5F3F0",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "12px",
        }}
      >
        {template.thumbnailUrl ? (
          <img 
            src={template.thumbnailUrl} 
            alt={template.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "8px",
            }}
          />
        ) : (
          <span style={{ fontSize: "32px" }}>{emoji}</span>
        )}
      </div>

      {/* Template info */}
      <div style={{ width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "4px",
          }}
        >
          <span
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: isSelected ? "#C4A35A" : "#2C2C2C",
            }}
          >
            {template.name}
          </span>
          {isSelected && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                backgroundColor: "#C4A35A",
              }}
            >
              <Check style={{ width: "12px", height: "12px", color: "#FAFAFA" }} />
            </div>
          )}
        </div>
        <p
          style={{
            fontSize: "12px",
            color: "#6B6B6B",
            lineHeight: 1.4,
          }}
        >
          {template.description || 'No description'}
        </p>
        
        {/* Category badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            marginTop: "8px",
            padding: "2px 8px",
            backgroundColor: "#F5F3F0",
            borderRadius: "4px",
            fontSize: "10px",
            color: "#6B6B6B",
          }}
        >
          <FileText style={{ width: "10px", height: "10px" }} />
          {template.category}
        </div>
      </div>
    </button>
  )
}

/**
 * Blank template card for starting from scratch
 */
function BlankTemplateCard({
  isSelected,
  onSelect,
}: {
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        border: isSelected ? "2px solid #C4A35A" : "2px dashed #E8E4DF",
        borderRadius: "12px",
        backgroundColor: isSelected ? "rgba(196, 163, 90, 0.05)" : "transparent",
        cursor: "pointer",
        transition: "all 0.2s ease",
        minHeight: "180px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          backgroundColor: isSelected ? "rgba(196, 163, 90, 0.1)" : "#F5F3F0",
          marginBottom: "12px",
        }}
      >
        <Layout
          style={{
            width: "24px",
            height: "24px",
            color: isSelected ? "#C4A35A" : "#6B6B6B",
          }}
        />
      </div>
      <span
        style={{
          fontSize: "14px",
          fontWeight: 500,
          color: isSelected ? "#C4A35A" : "#2C2C2C",
          marginBottom: "4px",
        }}
      >
        Start Blank
      </span>
      <span style={{ fontSize: "12px", color: "#6B6B6B" }}>
        Build from scratch
      </span>
      {isSelected && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            backgroundColor: "#C4A35A",
            marginTop: "8px",
          }}
        >
          <Check style={{ width: "12px", height: "12px", color: "#FAFAFA" }} />
        </div>
      )}
    </button>
  )
}

/**
 * Subject line input with template string support
 * 
 * Requirements: 4.3 - Subject line input with template string support
 */
function SubjectLineInput({
  value,
  onChange,
  showPreview,
}: {
  value: string
  onChange: (value: string) => void
  showPreview: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [cursorPosition, setCursorPosition] = useState<number | null>(null)

  // Handle template string insertion at cursor position
  const handleInsertVariable = useCallback((variable: string) => {
    if (inputRef.current) {
      const input = inputRef.current
      const start = input.selectionStart || 0
      const end = input.selectionEnd || 0
      const newValue = value.slice(0, start) + variable + value.slice(end)
      onChange(newValue)
      
      // Set cursor position after the inserted variable
      const newCursorPos = start + variable.length
      setCursorPosition(newCursorPos)
    } else {
      // Fallback: append to end
      onChange(value + variable)
    }
  }, [value, onChange])

  // Restore cursor position after value change
  useEffect(() => {
    if (cursorPosition !== null && inputRef.current) {
      inputRef.current.setSelectionRange(cursorPosition, cursorPosition)
      setCursorPosition(null)
    }
  }, [cursorPosition, value])

  // Preview the subject line with sample data
  const previewSubject = replaceTemplateStrings(value, SAMPLE_PREVIEW_DATA)

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
        Email Subject <span style={{ color: "#B85C5C" }}>*</span>
      </label>
      
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Mail
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "18px",
                height: "18px",
                color: "#9A9A9A",
              }}
            />
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="e.g., You're invited to {eventName}!"
              style={{
                width: "100%",
                padding: "12px 16px 12px 40px",
                border: "1px solid #E8E4DF",
                borderRadius: "8px",
                fontSize: "14px",
                color: "#2C2C2C",
                backgroundColor: "#FAFAFA",
                outline: "none",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#C4A35A")}
              onBlur={(e) => (e.target.style.borderColor = "#E8E4DF")}
            />
          </div>
          <TemplateStringPicker
            onInsert={handleInsertVariable}
            position="dropdown"
          />
        </div>

        {/* Subject line preview */}
        {showPreview && value && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 12px",
              backgroundColor: "rgba(196, 163, 90, 0.08)",
              borderRadius: "6px",
              border: "1px solid rgba(196, 163, 90, 0.2)",
            }}
          >
            <Eye style={{ width: "14px", height: "14px", color: "#C4A35A", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: "11px", color: "#9A9A9A", display: "block", marginBottom: "2px" }}>
                Preview with sample data:
              </span>
              <span
                style={{
                  fontSize: "13px",
                  color: "#2C2C2C",
                  fontWeight: 500,
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {previewSubject}
              </span>
            </div>
          </div>
        )}
      </div>

      <p style={{ fontSize: "12px", color: "#9A9A9A", marginTop: "6px" }}>
        Use template variables like {"{firstName}"} or {"{eventName}"} for personalization
      </p>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Step Design Component
 * 
 * Campaign wizard step for designing the email content.
 * Uses the Unlayer email editor for professional email design.
 * 
 * Features:
 * - Template library with database templates and built-in designs
 * - Blank template option for custom designs
 * - Subject line input with template string support
 * - Real-time subject line preview
 * - Unlayer email editor integration
 * - Auto-save with retry logic
 * 
 * @example
 * ```tsx
 * <StepDesign
 *   data={{
 *     subject: "",
 *     templateId: "",
 *     designJson: null,
 *   }}
 *   onChange={(updates) => setData({ ...data, ...updates })}
 *   campaignType="Invitation"
 *   campaignId="campaign-123"
 * />
 * ```
 * 
 * Requirements: 4 (Multi-Step Campaign Creation Wizard)
 * Requirements: 4.3 - Email Design step
 * Requirements: 6 (Unlayer Email Editor Integration)
 * Requirements: 6.5 - Auto-save on design change
 * Requirements: 10.2 - Auto-save retry on failure
 * Requirements: 10.5 - Template selection from library
 */

import { WhatsAppComposer } from "@/components/whatsapp-composer"
import { SmsComposer } from "@/components/sms-composer"

export function StepDesign({
  data,
  onChange,
  campaignType,
  campaignId = "draft",
  channel = "email",
  whatsappChannelId,
}: StepDesignProps) {
  const [designMode, setDesignMode] = useState<DesignMode>(
    data.templateId ? "email-builder" : "template-selection"
  )
  const [showSubjectPreview] = useState(true)
  const [templateSource, setTemplateSource] = useState<'all' | 'library' | 'builtin'>('all')
  const [isEditorReady, setIsEditorReady] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false)
  
  // Refs for auto-save
  const editorRef = useRef<UnlayerEmailBuilderRef>(null)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingSaveRef = useRef<boolean>(false)
  
  // Fetch templates from the database library
  const { data: libraryTemplates, isLoading: isLoadingLibrary } = useEmailTemplatesForWizard()

  // Convert static templates to unified format
  const staticTemplates: UnifiedTemplate[] = EMAIL_TEMPLATES.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.campaignType,
    state: t.state,
    source: 'static' as TemplateSource,
    thumbnailUrl: null,
  }))

  // Convert library templates to unified format
  // Note: designJson can be either legacy EmailBuilderState or Unlayer format
  // We detect the format by checking for Unlayer-specific properties
  const dbTemplates: UnifiedTemplate[] = (libraryTemplates || []).map(t => {
    const designJson = t.designJson as Record<string, unknown> | null
    // Check if this is an Unlayer design (has 'body' and 'counters' properties)
    const isUnlayerFormat = designJson && 
      typeof designJson === 'object' && 
      'body' in designJson && 
      'counters' in designJson
    
    return {
      id: `lib-${t.id}`,
      name: t.name,
      description: t.description,
      category: t.category,
      subject: t.subject,
      designJson: isUnlayerFormat ? undefined : designJson,
      unlayerDesignJson: isUnlayerFormat ? designJson as unknown as UnlayerDesignJson : undefined,
      isDefault: t.isDefault,
      source: 'library' as TemplateSource,
      thumbnailUrl: t.thumbnailUrl,
    }
  })

  // Combine and filter templates based on source selection
  const allTemplates = [...dbTemplates, ...staticTemplates]
  const filteredTemplates = templateSource === 'all' 
    ? allTemplates 
    : templateSource === 'library' 
      ? dbTemplates 
      : staticTemplates

  // Find recommended template based on campaign type
  const recommendedTemplateId = campaignType
    ? allTemplates.find(t => t.category === campaignType && (t.isDefault || t.source === 'static'))?.id
    : null

  /**
   * Auto-save with retry logic
   * 
   * Requirements: 6.5 - Auto-save on design change
   * Requirements: 10.2 - Auto-save retry on failure
   */
  const performAutoSave = useCallback(async (retryCount = 0): Promise<boolean> => {
    if (!editorRef.current || !isEditorReady) {
      return false
    }

    setIsSaving(true)
    
    try {
      // Export design and HTML from Unlayer
      const result = await editorRef.current.exportHtml()
      
      // Validate HTML before saving
      const validation = EmailGenerationService.validateHtml(result.html)
      if (!validation.valid) {
        console.warn('[StepDesign] HTML validation failed:', validation.error)
        // Still save the design JSON even if HTML validation fails
      }
      
      // Update parent with both design JSON and HTML content
      onChange({
        unlayerDesignJson: result.design,
        htmlContent: result.html,
      })
      
      setIsSaving(false)
      pendingSaveRef.current = false
      return true
    } catch (error) {
      console.error('[StepDesign] Auto-save failed:', error)
      
      // Retry once after delay
      if (retryCount < 1) {
        await new Promise(resolve => setTimeout(resolve, AUTO_SAVE_RETRY_DELAY_MS))
        return performAutoSave(retryCount + 1)
      }
      
      // Show notification on persistent failure
      toast.error('Failed to auto-save design. Your changes may not be saved.')
      setIsSaving(false)
      pendingSaveRef.current = false
      return false
    }
  }, [isEditorReady, onChange])

  /**
   * Handle design changes from Unlayer editor
   * Triggers debounced auto-save
   * 
   * Requirements: 6.5 - Auto-save on design change
   */
  const handleDesignChange = useCallback((design: UnlayerDesignJson) => {
    // Mark that we have a pending save
    pendingSaveRef.current = true
    
    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
    
    // Set up debounced auto-save
    autoSaveTimerRef.current = setTimeout(() => {
      if (pendingSaveRef.current) {
        performAutoSave()
      }
    }, AUTO_SAVE_DEBOUNCE_MS)
  }, [performAutoSave])

  /**
   * Handle editor ready event
   */
  const handleEditorReady = useCallback(() => {
    setIsEditorReady(true)
  }, [])

  /**
   * Handle editor error
   */
  const handleEditorError = useCallback((error: Error) => {
    console.error('[StepDesign] Editor error:', error)
    toast.error(`Email editor error: ${error.message}`)
  }, [])

  /**
   * Handle template selection
   * Supports both static and library templates
   * 
   * Requirements: 6.2 - Template loading for Unlayer
   * Requirements: 10.5 - Template selection from library
   */
  const handleSelectTemplate = useCallback((templateId: string, template: UnifiedTemplate | null) => {
    if (templateId === "blank") {
      // Start with blank template
      onChange({
        templateId,
        designJson: createBlankTemplate(),
        unlayerDesignJson: null,
        htmlContent: null,
        isLibraryTemplate: false,
      })
    } else if (template) {
      if (template.source === 'library') {
        // Library template - check for Unlayer design JSON first
        if (template.unlayerDesignJson) {
          onChange({
            templateId,
            designJson: null,
            unlayerDesignJson: template.unlayerDesignJson,
            htmlContent: null,
            subject: template.subject || data.subject,
            isLibraryTemplate: true,
          })
        } else {
          // Fallback to legacy design JSON
          const designJson = template.designJson as EmailBuilderState
          onChange({
            templateId,
            designJson: designJson || createBlankTemplate(),
            unlayerDesignJson: null,
            htmlContent: null,
            subject: template.subject || data.subject,
            isLibraryTemplate: true,
          })
        }
      } else {
        // Static template - use state from EMAIL_TEMPLATES
        // Note: Static templates use legacy format, will need conversion
        const staticTemplate = EMAIL_TEMPLATES.find(t => t.id === templateId)
        onChange({
          templateId,
          designJson: staticTemplate?.state || createBlankTemplate(),
          unlayerDesignJson: null,
          htmlContent: null,
          isLibraryTemplate: false,
        })
      }
    }
    
    setDesignMode("email-builder")
    setIsEditorReady(false)
  }, [onChange, data.subject])

  /**
   * Handle going back to template selection
   */
  const handleBackToTemplates = useCallback(() => {
    // Perform final save before leaving
    if (pendingSaveRef.current && editorRef.current) {
      performAutoSave()
    }
    setDesignMode("template-selection")
    setIsEditorReady(false)
  }, [performAutoSave])

  /**
   * Handle template selection from Unlayer template library sheet
   * Loads the selected template design directly into the editor
   */
  const handleUnlayerTemplateSelect = useCallback((design: UnlayerDesignJson) => {
    // Load the design into the editor if it's ready
    if (editorRef.current) {
      editorRef.current.loadDesign(design)
    }
    // Also update the state so it persists
    onChange({
      unlayerDesignJson: design,
      htmlContent: null,
    })
    toast.success('Template loaded successfully')
  }, [onChange])

  /**
   * Get the selected template info for display
   */
  const getSelectedTemplateInfo = useCallback(() => {
    if (!data.templateId || data.templateId === 'blank') return null
    
    const template = allTemplates.find(t => t.id === data.templateId)
    if (template) {
      return {
        name: template.name,
        description: template.description,
        category: template.category,
        source: template.source,
        emoji: CATEGORY_EMOJI[template.category] || '📄',
      }
    }
    
    // Fallback for static templates by ID
    const staticTemplate = EMAIL_TEMPLATES.find(t => t.id === data.templateId)
    if (staticTemplate) {
      return {
        name: staticTemplate.name,
        description: staticTemplate.description,
        category: staticTemplate.campaignType,
        source: 'static' as TemplateSource,
        emoji: CATEGORY_EMOJI[staticTemplate.campaignType] || '📄',
      }
    }
    
    return null
  }, [data.templateId, allTemplates])

  const selectedTemplateInfo = getSelectedTemplateInfo()

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
      // Perform final save on unmount if there are pending changes
      if (pendingSaveRef.current && editorRef.current) {
        performAutoSave()
      }
    }
  }, [performAutoSave])

  // ---- WhatsApp channel: show WhatsApp composer instead of email builder ----
  if (channel === "whatsapp") {
    return (
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <WhatsAppComposer
          data={{
            subject: data.subject,
            whatsappTemplateId: data.whatsappTemplateId,
            whatsappMessageBody: data.whatsappMessageBody,
            whatsappMediaUrl: data.whatsappMediaUrl,
            whatsappMediaType: data.whatsappMediaType,
          }}
          onChange={onChange}
          channelId={whatsappChannelId}
        />
      </div>
    )
  }

  // ---- SMS channel: show SMS composer ----
  if (channel === "sms") {
    return (
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <SmsComposer
          data={{
            subject: data.subject,
            smsBody: data.smsBody,
            smsSenderId: data.smsSenderId,
            smsOptOutFooter: data.smsOptOutFooter,
          }}
          onChange={onChange}
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          {designMode === "email-builder" && (
            <button
              onClick={handleBackToTemplates}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                border: "1px solid #E8E4DF",
                borderRadius: "6px",
                backgroundColor: "transparent",
                fontSize: "13px",
                color: "#6B6B6B",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <ChevronLeft style={{ width: "14px", height: "14px" }} />
              Change Template
            </button>
          )}
          {isSaving && (
            <span style={{ fontSize: "12px", color: "#9A9A9A", display: "flex", alignItems: "center", gap: "4px" }}>
              <Loader2 style={{ width: "12px", height: "12px", animation: "spin 1s linear infinite" }} />
              Saving...
            </span>
          )}
        </div>
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 300,
            letterSpacing: "0.02em",
            color: "#2C2C2C",
            marginBottom: "8px",
          }}
        >
          {designMode === "template-selection" ? "Choose a Template" : "Design Your Email"}
        </h2>
        <p style={{ color: "#6B6B6B", fontSize: "14px" }}>
          {designMode === "template-selection"
            ? "Start with a template from your library or use a built-in design"
            : "Customize your email content and subject line"}
        </p>
      </div>

      {designMode === "template-selection" ? (
        /* Template Selection View */
        <div>
          {/* Template source filter */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "20px",
            }}
          >
            <span style={{ fontSize: "13px", color: "#6B6B6B" }}>Show:</span>
            {[
              { value: 'all', label: 'All Templates' },
              { value: 'library', label: 'Library', icon: Database },
              { value: 'builtin', label: 'Built-in', icon: FileText },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTemplateSource(value as typeof templateSource)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  border: templateSource === value ? "1px solid #C4A35A" : "1px solid #E8E4DF",
                  borderRadius: "6px",
                  backgroundColor: templateSource === value ? "rgba(196, 163, 90, 0.1)" : "transparent",
                  fontSize: "13px",
                  color: templateSource === value ? "#C4A35A" : "#6B6B6B",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {Icon && <Icon style={{ width: "14px", height: "14px" }} />}
                {label}
                {value === 'library' && (
                  <span
                    style={{
                      padding: "2px 6px",
                      backgroundColor: templateSource === value ? "#C4A35A" : "#E8E4DF",
                      borderRadius: "9999px",
                      fontSize: "10px",
                      color: templateSource === value ? "#FAFAFA" : "#6B6B6B",
                    }}
                  >
                    {dbTemplates.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Loading state */}
          {isLoadingLibrary && templateSource !== 'builtin' && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px",
                color: "#6B6B6B",
              }}
            >
              <Loader2 style={{ width: "24px", height: "24px", animation: "spin 1s linear infinite", marginRight: "8px" }} />
              Loading templates from library...
            </div>
          )}

          {/* Empty state for library */}
          {!isLoadingLibrary && templateSource === 'library' && dbTemplates.length === 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px",
                backgroundColor: "#F5F3F0",
                borderRadius: "12px",
                border: "1px dashed #E8E4DF",
              }}
            >
              <Database style={{ width: "48px", height: "48px", color: "#9A9A9A", marginBottom: "16px" }} />
              <p style={{ fontSize: "14px", color: "#6B6B6B", marginBottom: "8px" }}>
                No templates in your library yet
              </p>
              <p style={{ fontSize: "12px", color: "#9A9A9A" }}>
                Create templates in the Template Library to use them here
              </p>
            </div>
          )}

          {/* Template grid */}
          {(!isLoadingLibrary || templateSource === 'builtin') && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "16px",
              }}
            >
              {/* Blank template option */}
              <BlankTemplateCard
                isSelected={data.templateId === "blank"}
                onSelect={() => handleSelectTemplate("blank", null)}
              />

              {/* Templates */}
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={data.templateId === template.id}
                  onSelect={() => handleSelectTemplate(template.id, template)}
                  isRecommended={template.id === recommendedTemplateId}
                />
              ))}
            </div>
          )}

          {/* Recommendation hint */}
          {recommendedTemplateId && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "24px",
                padding: "12px 16px",
                backgroundColor: "rgba(92, 138, 107, 0.08)",
                borderRadius: "8px",
                border: "1px solid rgba(92, 138, 107, 0.2)",
              }}
            >
              <Sparkles style={{ width: "16px", height: "16px", color: "#5C8A6B" }} />
              <p style={{ fontSize: "13px", color: "#5C8A6B" }}>
                Based on your campaign type, we recommend a{" "}
                <strong>{campaignType}</strong>{" "}
                template
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Email Builder View */
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Subject line input */}
          <SubjectLineInput
            value={data.subject}
            onChange={(subject) => onChange({ subject })}
            showPreview={showSubjectPreview}
          />

          {/* Unlayer Email Builder */}
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
              Email Content
            </label>
            <UnlayerEmailBuilder
              ref={editorRef}
              campaignId={campaignId}
              initialDesign={data.unlayerDesignJson || undefined}
              onDesignChange={handleDesignChange}
              onReady={handleEditorReady}
              onError={handleEditorError}
              onOpenTemplateLibrary={() => setIsTemplateLibraryOpen(true)}
            />
          </div>

          {/* Template Library Sheet */}
          <TemplateLibrarySheet
            isOpen={isTemplateLibraryOpen}
            onClose={() => setIsTemplateLibraryOpen(false)}
            onSelectTemplate={handleUnlayerTemplateSelect}
          />

          {/* Template info */}
          {selectedTemplateInfo && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px",
                backgroundColor: "#F5F3F0",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "36px",
                  height: "36px",
                  backgroundColor: "#FAFAFA",
                  borderRadius: "8px",
                  fontSize: "18px",
                }}
              >
                {selectedTemplateInfo.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "#2C2C2C" }}>
                    Using: {selectedTemplateInfo.name}
                  </p>
                  {selectedTemplateInfo.source === 'library' && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px 6px",
                        backgroundColor: "rgba(196, 163, 90, 0.15)",
                        borderRadius: "4px",
                        fontSize: "10px",
                        color: "#C4A35A",
                      }}
                    >
                      <Database style={{ width: "10px", height: "10px" }} />
                      Library
                    </span>
                  )}
                </div>
                <p style={{ fontSize: "12px", color: "#6B6B6B" }}>
                  {selectedTemplateInfo.description || 'No description'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CSS for spinner animation */}
      <style jsx global>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}

export default StepDesign
