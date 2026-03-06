"use client"

/**
 * @fileoverview Campaign Creation Wizard Page
 * 
 * A full-page multi-step wizard for creating email campaigns.
 * Uses the WizardContainer component for step navigation and progress.
 * Follows the ORA design system for consistent styling.
 * 
 * Steps:
 * 1. Campaign Details (name, type, description)
 * 2. Recipients (select event, filter guests, or upload list)
 * 3. Email Design (drag-and-drop builder or template selection)
 * 4. Schedule (send now, schedule for later, or save as draft)
 * 5. Review and Confirm
 * 
 * @module app/admin/campaigns/new/page
 * @requires react
 * @requires next/navigation
 * 
 * Requirements: 4 (Multi-Step Campaign Creation Wizard)
 */

import { useState, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  FileText,
  Users,
  Palette,
  Clock,
  CheckCircle,
} from "lucide-react"
import { toast } from "sonner"
import { WizardContainer, type WizardStep, type StepValidation, StepDetails, validateStepDetails, StepRecipients, StepDesign, StepSchedule, StepReview, type RecipientFilters, type FileParseResult } from "@/components/admin/campaign-wizard"
import type { EmailBuilderState } from "@/lib/types/email-builder"
import type { ABTestConfig } from "@/lib/types/ab-test"
import { DEFAULT_AB_TEST_CONFIG } from "@/lib/types/ab-test"
import { useCampaignDraft, useCreateCampaign } from "@/hooks/use-admin-campaigns"
import { useWhatsAppChannel } from "@/hooks/use-whatsapp-templates"
import type { CampaignType } from "@/db/schema"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Campaign wizard data structure
 */
interface CampaignWizardData {
  // Step 1: Details
  name: string
  type: CampaignType | ""
  description: string
  eventId: string
  abTestConfig: ABTestConfig
  channel: "email" | "whatsapp" | "sms"
  
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
  whatsappTemplateId: string
  whatsappMessageBody: string
  whatsappMediaUrl: string
  whatsappMediaType: "" | "image" | "document" | "video"
  smsBody: string
  smsSenderId: string
  smsOptOutFooter: boolean
  
  // Step 4: Schedule
  sendType: "now" | "scheduled" | "draft"
  scheduledAt: Date | null
  timezone: string
  isRecurring: boolean
  recurrencePattern: "daily" | "weekly" | "monthly" | null
  recurrenceEndDate: Date | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Wizard steps configuration
 */
const WIZARD_STEPS: WizardStep[] = [
  {
    id: 1,
    name: "Campaign Details",
    description: "Name and type",
    icon: FileText,
  },
  {
    id: 2,
    name: "Recipients",
    description: "Select audience",
    icon: Users,
  },
  {
    id: 3,
    name: "Design",
    description: "Build your campaign",
    icon: Palette,
  },
  {
    id: 4,
    name: "Schedule",
    description: "When to send",
    icon: Clock,
  },
  {
    id: 5,
    name: "Review",
    description: "Confirm and create",
    icon: CheckCircle,
  },
]

/**
 * Initial wizard data
 */
const INITIAL_WIZARD_DATA: CampaignWizardData = {
  name: "",
  type: "",
  description: "",
  eventId: "",
  abTestConfig: DEFAULT_AB_TEST_CONFIG,
  channel: "email",
  recipientType: "",
  filters: {},
  uploadedFile: null,
  recipientCount: 0,
  parsedFileData: null,
  subject: "",
  templateId: "",
  designJson: null,
  whatsappTemplateId: "",
  whatsappMessageBody: "",
  whatsappMediaUrl: "",
  whatsappMediaType: "",
  smsBody: "",
  smsSenderId: "",
  smsOptOutFooter: true,
  sendType: "draft",
  scheduledAt: null,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  isRecurring: false,
  recurrencePattern: null,
  recurrenceEndDate: null,
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Campaign Creation Wizard Page
 * 
 * A full-page multi-step wizard for creating email campaigns.
 * Uses the WizardContainer component for navigation and progress.
 * 
 * Requirements: 4 (Multi-Step Campaign Creation Wizard)
 */
export default function NewCampaignPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentStep, setCurrentStep] = useState(1)
  const [wizardData, setWizardData] = useState<CampaignWizardData>(() => {
    // Check if there's an eventId in the URL params
    const eventId = searchParams.get('eventId') || ""
    return { ...INITIAL_WIZARD_DATA, eventId }
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)
  const lastSavedDataRef = useRef<string>("")
  
  // Use the draft saving hook
  const { saveDraft, updateDraft, isSaving: isSavingDraft } = useCampaignDraft()
  
  // Fetch WhatsApp channel for the selected event (needed for template features)
  const { data: whatsAppChannel } = useWhatsAppChannel(wizardData.eventId)

  // Use the campaign creation hook
  const { createCampaign, isCreating } = useCreateCampaign()

  /**
   * Update wizard data
   */
  const handleDataChange = useCallback((updates: Partial<CampaignWizardData>) => {
    setWizardData((prev) => ({ ...prev, ...updates }))
  }, [])

  /**
   * Validate current step
   * Returns StepValidation with isValid flag and optional error message
   * Requirements: 4.3 - Validate required fields before proceeding
   */
  const validateStep = useCallback((step: number): StepValidation => {
    switch (step) {
      case 1: {
        // Step 1: Campaign Details validation - use the imported validation function
        return validateStepDetails({
          name: wizardData.name,
          type: wizardData.type,
          channel: wizardData.channel,
          description: wizardData.description,
          abTestConfig: wizardData.abTestConfig,
        })
      }
      case 2: {
        // Step 2: Recipients validation
        // Require a selection type
        if (!wizardData.recipientType) {
          return {
            isValid: false,
            errorMessage: "Please select how you want to choose recipients",
          }
        }
        
        // For event and filter types, require an event selection
        if ((wizardData.recipientType === "event" || wizardData.recipientType === "filter") && !wizardData.eventId) {
          return {
            isValid: false,
            errorMessage: "Please select an event",
          }
        }
        
        // For upload type, require a file with valid parsed data
        if (wizardData.recipientType === "upload") {
          if (!wizardData.uploadedFile) {
            return {
              isValid: false,
              errorMessage: "Please upload a recipient list file",
            }
          }
          
          // Check if file has been parsed successfully
          if (!wizardData.parsedFileData) {
            return {
              isValid: false,
              errorMessage: "Please wait for the file to be processed",
            }
          }
          
          // Check for parsing errors
          if (wizardData.parsedFileData.errors.length > 0) {
            return {
              isValid: false,
              errorMessage: wizardData.parsedFileData.errors[0],
            }
          }
          
          // Check for valid recipients
          if (wizardData.parsedFileData.validRows === 0) {
            return {
              isValid: false,
              errorMessage: "No valid recipients found in the uploaded file",
            }
          }
        }
        
        return { isValid: true }
      }
      case 3: {
        // Step 3: Design validation - channel-aware
        if (wizardData.channel === "whatsapp") {
          if (!wizardData.subject.trim()) {
            return {
              isValid: false,
              errorMessage: "Please enter a preview text for the WhatsApp campaign",
            }
          }
          if (!wizardData.whatsappMessageBody.trim() && !wizardData.whatsappTemplateId.trim()) {
            return {
              isValid: false,
              errorMessage: "Please enter a message body or a template name",
            }
          }
          return { isValid: true }
        }

        if (wizardData.channel === "sms") {
          if (!wizardData.smsBody.trim()) {
            return {
              isValid: false,
              errorMessage: "Please enter an SMS message body",
            }
          }
          return { isValid: true }
        }

        // Email validation
        if (!wizardData.templateId) {
          return {
            isValid: false,
            errorMessage: "Please select a template or start with a blank design",
          }
        }
        
        // Require a subject line
        if (!wizardData.subject.trim()) {
          return {
            isValid: false,
            errorMessage: "Please enter an email subject line",
          }
        }
        
        return { isValid: true }
      }
      case 4: {
        // Step 4: Schedule validation
        // Validate based on send type selection
        if (!wizardData.sendType) {
          return {
            isValid: false,
            errorMessage: "Please select when to send the campaign",
          }
        }
        
        // If scheduled, validate the scheduled date
        if (wizardData.sendType === "scheduled") {
          if (!wizardData.scheduledAt) {
            return {
              isValid: false,
              errorMessage: "Please select a date and time for the scheduled send",
            }
          }
          
          // Validate that scheduled time is at least 15 minutes in the future
          const minScheduleDate = new Date()
          minScheduleDate.setMinutes(minScheduleDate.getMinutes() + 15)
          
          if (wizardData.scheduledAt <= minScheduleDate) {
            return {
              isValid: false,
              errorMessage: "Scheduled time must be at least 15 minutes in the future",
            }
          }
          
          // Validate recurring campaign settings
          if (wizardData.isRecurring) {
            if (!wizardData.recurrencePattern) {
              return {
                isValid: false,
                errorMessage: "Please select a recurrence pattern for the recurring campaign",
              }
            }
            
            // Validate end date if provided
            if (wizardData.recurrenceEndDate) {
              const minEndDate = new Date(wizardData.scheduledAt)
              minEndDate.setDate(minEndDate.getDate() + 1)
              
              if (wizardData.recurrenceEndDate <= minEndDate) {
                return {
                  isValid: false,
                  errorMessage: "Recurrence end date must be at least one day after the scheduled start date",
                }
              }
            }
          }
        }
        
        return { isValid: true }
      }
      case 5: {
        // Step 5: Review - always valid (final confirmation step)
        return { isValid: true }
      }
      default:
        return { isValid: false, errorMessage: "Invalid step" }
    }
  }, [wizardData])

  /**
   * Prepare draft data from wizard data
   */
  const prepareDraftData = useCallback(() => {
    return {
      name: wizardData.name,
      type: wizardData.type,
      description: wizardData.description,
      eventId: wizardData.eventId,
      channel: wizardData.channel,
      subject: wizardData.subject,
      designJson: wizardData.designJson,
      recipientType: wizardData.recipientType,
      filters: wizardData.filters,
      sendType: wizardData.sendType,
      scheduledAt: wizardData.scheduledAt,
      timezone: wizardData.timezone,
      isRecurring: wizardData.isRecurring,
      recurrencePattern: wizardData.recurrencePattern,
      recurrenceEndDate: wizardData.recurrenceEndDate,
      isAbTest: wizardData.abTestConfig?.enabled || false,
      abTestConfig: wizardData.abTestConfig,
    }
  }, [wizardData])

  /**
   * Save as draft
   * Requirements: 4.4 - Allow saving progress as draft at any step
   */
  const handleSaveDraft = useCallback(async () => {
    // Validate minimum required fields
    if (!wizardData.name.trim()) {
      toast.error("Please enter a campaign name before saving")
      return
    }
    
    if (!wizardData.eventId) {
      toast.error("Please select an event before saving the draft")
      return
    }
    
    try {
      const draftData = prepareDraftData()
      
      if (draftId) {
        // Update existing draft
        await updateDraft({ id: draftId, data: draftData })
      } else {
        // Create new draft
        const campaign = await saveDraft(draftData)
        setDraftId(campaign.id)
      }
      
      // Update last saved data reference
      lastSavedDataRef.current = JSON.stringify(draftData)
      
      // Navigate back to campaigns list
      router.push("/admin/campaigns")
    } catch (error) {
      console.error("Failed to save draft:", error)
      // Error toast is handled by the hook
    }
  }, [wizardData, draftId, prepareDraftData, saveDraft, updateDraft, router])

  /**
   * Auto-save draft (called by WizardContainer)
   * Requirements: 4.4 - Auto-save functionality
   */
  const handleAutoSave = useCallback(async () => {
    // Only auto-save if we have minimum required data
    if (!wizardData.name.trim() || !wizardData.eventId) {
      return
    }
    
    const currentData = JSON.stringify(prepareDraftData())
    
    // Skip if data hasn't changed
    if (currentData === lastSavedDataRef.current) {
      return
    }
    
    try {
      const draftData = prepareDraftData()
      
      if (draftId) {
        // Update existing draft silently
        await updateDraft({ id: draftId, data: draftData })
      } else {
        // Create new draft
        const campaign = await saveDraft(draftData)
        setDraftId(campaign.id)
      }
      
      // Update last saved data reference
      lastSavedDataRef.current = currentData
    } catch (error) {
      // Silently fail for auto-save - don't interrupt user
      console.error("Auto-save failed:", error)
    }
  }, [wizardData, draftId, prepareDraftData, saveDraft, updateDraft])

  /**
   * Submit campaign
   * Creates the campaign based on wizard data and send type
   * Requirements: 4.6 - Confirm and create button
   */
  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true)
    try {
      // Validate required fields
      if (!wizardData.name.trim()) {
        toast.error("Campaign name is required")
        return
      }
      
      if (!wizardData.type) {
        toast.error("Campaign type is required")
        return
      }
      
      if (!wizardData.eventId) {
        toast.error("Event selection is required")
        return
      }
      
      if (!wizardData.subject.trim()) {
        toast.error(wizardData.channel === "sms" ? "Campaign description is required" : "Email subject is required")
        return
      }
      
      // Generate content based on channel
      let content = wizardData.description || ""
      if (wizardData.channel === "whatsapp") {
        content = wizardData.whatsappMessageBody || `Template: ${wizardData.whatsappTemplateId}`
      } else if (wizardData.channel === "sms") {
        content = wizardData.smsBody || "SMS campaign"
      } else if (wizardData.designJson && wizardData.designJson.blocks.length > 0) {
        const textContent = wizardData.designJson.blocks
          .filter((block): block is import("@/lib/types/email-builder").TextBlock => 
            block.type === "text"
          )
          .map((block) => block.content)
          .join("\n\n")
        
        if (textContent) {
          content = textContent
        }
      }
      
      if (!content.trim()) {
        content = wizardData.channel === "whatsapp" 
          ? "WhatsApp campaign" 
          : wizardData.channel === "sms"
            ? "SMS campaign"
            : "Email content generated from visual design"
      }
      
      // Prepare recipients data for upload type
      const recipients = wizardData.recipientType === "upload" && wizardData.parsedFileData
        ? wizardData.parsedFileData.recipients
        : undefined
      
      // Create the campaign
      await createCampaign({
        name: wizardData.name,
        type: wizardData.type,
        description: wizardData.description,
        eventId: wizardData.eventId,
        channel: wizardData.channel,
        subject: wizardData.subject,
        content,
        designJson: wizardData.designJson,
        recipientType: wizardData.recipientType || undefined,
        filters: wizardData.filters,
        sendType: wizardData.sendType,
        scheduledAt: wizardData.scheduledAt,
        timezone: wizardData.timezone,
        isRecurring: wizardData.isRecurring,
        recurrencePattern: wizardData.recurrencePattern,
        recurrenceEndDate: wizardData.recurrenceEndDate,
        recipients,
        isAbTest: wizardData.abTestConfig?.enabled || false,
        abTestConfig: wizardData.abTestConfig,
        ...(wizardData.channel === "whatsapp" && {
          whatsappTemplateId: wizardData.whatsappTemplateId || undefined,
          whatsappContent: wizardData.whatsappMessageBody
            ? { type: "text", text: { body: wizardData.whatsappMessageBody } }
            : undefined,
          whatsappMediaUrl: wizardData.whatsappMediaUrl || undefined,
          whatsappMediaType: wizardData.whatsappMediaType || undefined,
        }),
        ...(wizardData.channel === "sms" && {
          smsBody: wizardData.smsBody || undefined,
          smsSenderId: wizardData.smsSenderId || undefined,
          smsOptOutFooter: wizardData.smsOptOutFooter,
        }),
      })
      
      // Navigate to campaigns list on success
      router.push("/admin/campaigns")
    } catch (error) {
      console.error("Failed to create campaign:", error)
      // Error toast is handled by the hook
    } finally {
      setIsSubmitting(false)
    }
  }, [wizardData, createCampaign, router])

  /**
   * Render current step content
   */
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <StepDetails
            data={{
              name: wizardData.name,
              type: wizardData.type,
              channel: wizardData.channel,
              description: wizardData.description,
              abTestConfig: wizardData.abTestConfig,
            }}
            onChange={handleDataChange}
          />
        )
      case 2:
        return (
          <StepRecipients
            data={{
              recipientType: wizardData.recipientType,
              eventId: wizardData.eventId,
              filters: wizardData.filters,
              uploadedFile: wizardData.uploadedFile,
              recipientCount: wizardData.recipientCount,
              parsedFileData: wizardData.parsedFileData,
            }}
            onChange={handleDataChange}
          />
        )
      case 3:
        return (
          <StepDesign
            data={{
              subject: wizardData.subject,
              templateId: wizardData.templateId,
              designJson: wizardData.designJson,
              whatsappTemplateId: wizardData.whatsappTemplateId,
              whatsappMessageBody: wizardData.whatsappMessageBody,
              whatsappMediaUrl: wizardData.whatsappMediaUrl,
              whatsappMediaType: wizardData.whatsappMediaType,
              smsBody: wizardData.smsBody,
              smsSenderId: wizardData.smsSenderId,
              smsOptOutFooter: wizardData.smsOptOutFooter,
            }}
            onChange={handleDataChange}
            campaignType={wizardData.type || undefined}
            channel={wizardData.channel}
            whatsappChannelId={whatsAppChannel?.id}
          />
        )
      case 4:
        return (
          <StepSchedule
            data={{
              sendType: wizardData.sendType,
              scheduledAt: wizardData.scheduledAt,
              timezone: wizardData.timezone,
              isRecurring: wizardData.isRecurring,
              recurrencePattern: wizardData.recurrencePattern,
              recurrenceEndDate: wizardData.recurrenceEndDate,
            }}
            onChange={(updates) => handleDataChange(updates)}
            recipientCount={wizardData.recipientCount}
          />
        )
      case 5:
        return (
          <StepReview 
            data={wizardData} 
            onEditStep={setCurrentStep}
          />
        )
      default:
        return null
    }
  }

  return (
    <WizardContainer
      steps={WIZARD_STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      validateStep={validateStep}
      onSaveDraft={handleSaveDraft}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting || isCreating}
      isSavingDraft={isSavingDraft}
      backLinkUrl="/admin/campaigns"
      title="Create Campaign"
      submitButtonText="Create Campaign"
      autoSaveInterval={30000}
      onAutoSave={handleAutoSave}
    >
      {renderStepContent()}
    </WizardContainer>
  )
}
