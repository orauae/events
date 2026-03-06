"use client"

import { useState, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Mail,
  Smartphone,
  Palette,
  Eye,
  FileText,
} from "lucide-react"
import { toast } from "sonner"
import { useCreateCampaign, useSaveCampaignDesign, useWhatsAppChannel } from "@/hooks"
import { AdminBreadcrumb } from "@/components/admin"
import { useEvent } from "@/hooks/use-events"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui"
import { 
  UnlayerEmailBuilder, 
  type UnlayerEmailBuilderRef,
  type UnlayerDesignJson,
  TemplateLibrarySheet,
} from "@/components/unlayer-email-builder"
import type { Campaign, CampaignChannel } from "@/db/schema"
import { WhatsAppComposer } from "@/components/whatsapp-composer"
import { SmsComposer } from "@/components/sms-composer"

// Campaign type options with descriptions
const campaignTypes = [
  { value: "Invitation", label: "Invitation", description: "Initial event invitation" },
  { value: "Reminder", label: "Reminder", description: "Reminder for upcoming event" },
  { value: "LastChance", label: "Last Chance", description: "Final reminder before event" },
  { value: "EventDayInfo", label: "Event Day Info", description: "Day-of event information" },
  { value: "ThankYou", label: "Thank You", description: "Post-event thank you message" },
  { value: "Feedback", label: "Feedback", description: "Request for event feedback" },
]

const channelOptions: { value: CampaignChannel; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "email", label: "Email", icon: <Mail className="h-6 w-6 stroke-1" />, description: "HTML email with visual builder" },
  { value: "whatsapp", label: "WhatsApp", icon: <Image src="/icons/whatsapp-color.svg" alt="WhatsApp" width={24} height={24} />, description: "WhatsApp Business message" },
  { value: "sms", label: "SMS", icon: <Smartphone className="h-6 w-6 stroke-1" />, description: "Text message campaign" },
]

type WizardStep = "details" | "design" | "review"

const steps: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
  { id: "details", label: "Details", icon: <FileText className="h-4 w-4 stroke-1" /> },
  { id: "design", label: "Design", icon: <Palette className="h-4 w-4 stroke-1" /> },
  { id: "review", label: "Review", icon: <Eye className="h-4 w-4 stroke-1" /> },
]

export default function AdminNewCampaignPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string
  const editorRef = useRef<UnlayerEmailBuilderRef>(null)
  
  const createCampaign = useCreateCampaign()
  const saveCampaignDesign = useSaveCampaignDesign()
  const { data: event } = useEvent(eventId)
  const { data: whatsAppChannel } = useWhatsAppChannel(eventId)
  const [currentStep, setCurrentStep] = useState<WizardStep>("details")
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [isEditorReady, setIsEditorReady] = useState(false)
  
  const [formData, setFormData] = useState({
    name: "",
    type: "Invitation" as Campaign["type"],
    channel: "email" as CampaignChannel,
    subject: "",
    // WhatsApp-specific
    whatsappTemplateId: "",
    whatsappMessageBody: "",
    whatsappMediaUrl: "",
    whatsappMediaType: "" as "" | "image" | "document" | "video",
    // SMS-specific
    smsBody: "",
    smsSenderId: "",
    smsOptOutFooter: true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [designState, setDesignState] = useState<{
    design: UnlayerDesignJson | null;
    html: string | null;
  }>({ design: null, html: null })
  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false)

  const isWhatsApp = formData.channel === "whatsapp"
  const isSms = formData.channel === "sms"
  const isEmail = formData.channel === "email"
  const currentStepIndex = steps.findIndex(s => s.id === currentStep)

  const validateDetails = () => {
    const newErrors: Record<string, string> = {}
    if (!formData.name.trim()) newErrors.name = "Campaign name is required"

    if (isEmail || isWhatsApp) {
      if (!formData.subject.trim()) newErrors.subject = isWhatsApp ? "Message preview text is required" : "Email subject is required"
    }

    if (isSms) {
      if (!formData.subject.trim()) newErrors.subject = "Campaign description is required"
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleCreateDraft = async () => {
    if (!validateDetails()) return

    try {
      const input: Record<string, unknown> = {
        name: formData.name,
        type: formData.type,
        channel: formData.channel,
        subject: formData.subject,
        content: isWhatsApp
          ? formData.whatsappMessageBody || `Template: ${formData.whatsappTemplateId}`
          : isSms
            ? formData.smsBody || "Draft SMS"
            : "Draft - content will be created in email builder",
      }

      if (isWhatsApp) {
        if (formData.whatsappTemplateId) {
          input.whatsappTemplateId = formData.whatsappTemplateId
        }
        if (formData.whatsappMessageBody) {
          input.whatsappContent = {
            type: "text",
            text: { body: formData.whatsappMessageBody },
          }
        }
        if (formData.whatsappMediaUrl) {
          input.whatsappMediaUrl = formData.whatsappMediaUrl
          input.whatsappMediaType = formData.whatsappMediaType
        }
      }

      if (isSms) {
        if (formData.smsBody) {
          input.smsBody = formData.smsBody
        }
        if (formData.smsSenderId) {
          input.smsSenderId = formData.smsSenderId
        }
        input.smsOptOutFooter = formData.smsOptOutFooter
      }

      const result = await createCampaign.mutateAsync({
        eventId,
        input: input as any,
      })
      setCampaignId(result.id)
      setCurrentStep("design")
    } catch {
      // Error handled by mutation
    }
  }

  const handleEditorReady = useCallback(() => {
    setIsEditorReady(true)
  }, [])

  const handleEditorError = useCallback((error: Error) => {
    console.error('[AdminNewCampaignPage] Editor error:', error)
    toast.error(`Email editor error: ${error.message}`)
  }, [])

  const handleTemplateSelect = useCallback((design: UnlayerDesignJson) => {
    setDesignState(prev => ({ ...prev, design }))
    if (editorRef.current) {
      editorRef.current.loadDesign(design)
    }
    setIsTemplateLibraryOpen(false)
  }, [])

  const handleSaveDesign = async () => {
    if (!editorRef.current || !isEditorReady || !campaignId) {
      return false
    }

    try {
      const result = await editorRef.current.exportHtml()
      setDesignState({ design: result.design, html: result.html })
      
      await saveCampaignDesign.mutateAsync({
        campaignId,
        designJson: result.design,
        htmlContent: result.html,
      })
      
      return true
    } catch (error) {
      console.error('[AdminNewCampaignPage] Save error:', error)
      toast.error('Failed to save design')
      return false
    }
  }

  const handleNext = async () => {
    if (currentStep === "details") {
      handleCreateDraft()
    } else if (currentStep === "design") {
      if (isEmail) {
        const saved = await handleSaveDesign()
        if (saved) setCurrentStep("review")
      } else {
        setCurrentStep("review")
      }
    }
  }

  const handleBack = () => {
    if (currentStep === "design") setCurrentStep("details")
    else if (currentStep === "review") setCurrentStep("design")
  }

  const handleFinish = () => {
    router.push(`/admin/events/${eventId}/campaigns`)
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* Breadcrumb + Title */}
      <div className="mb-4">
        <AdminBreadcrumb
          items={[
            { label: "Events", href: "/admin/events" },
            { label: event?.name ?? "Event", href: `/admin/events/${eventId}` },
            { label: "Campaigns", href: `/admin/events/${eventId}/campaigns` },
            { label: "New Campaign" },
          ]}
        />
        <h1 className="text-lg font-semibold text-ora-charcoal mt-2">Create Campaign</h1>
      </div>

      {/* Step Indicator */}
      <div className="pb-4">
        <div className="flex items-center justify-center gap-2">
            {steps.map((step, index) => {
              const isActive = step.id === currentStep
              const isCompleted = index < currentStepIndex
              
              return (
                <div key={step.id} className="flex items-center">
                  {index > 0 && (
                    <div className={`w-12 h-0.5 mx-2 ${isCompleted ? 'bg-ora-gold' : 'bg-ora-sand'}`} />
                  )}
                  <div className="flex items-center gap-2">
                    <div className={`
                      flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors
                      ${isActive ? 'border-ora-gold bg-ora-gold text-white' : ''}
                      ${isCompleted ? 'border-ora-gold bg-ora-gold text-white' : ''}
                      ${!isActive && !isCompleted ? 'border-ora-sand bg-ora-white text-ora-graphite' : ''}
                    `}>
                      {isCompleted ? (
                        <Check className="h-4 w-4 stroke-2" />
                      ) : (
                        <span className="text-sm font-medium">{index + 1}</span>
                      )}
                    </div>
                    <span className={`text-sm font-medium ${isActive ? 'text-ora-charcoal' : 'text-ora-graphite'}`}>
                      {step.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {currentStep === "details" && (
          <div className="h-full overflow-auto space-y-6">
            {/* Channel Selector */}
            <Card>
              <CardHeader>
                <CardTitle>Channel</CardTitle>
                <CardDescription>Choose how to deliver this campaign</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {channelOptions.map((ch) => (
                    <button
                      key={ch.value}
                      type="button"
                      disabled={false}
                      onClick={() => setFormData((prev) => ({ ...prev, channel: ch.value }))}
                      className={`
                        relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left
                        ${formData.channel === ch.value
                          ? 'border-ora-gold bg-ora-cream'
                          : 'border-ora-sand bg-white hover:border-ora-stone'}
                        cursor-pointer
                      `}
                    >
                      <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg ${
                        formData.channel === ch.value ? 'bg-white' : 'bg-ora-cream/60'
                      }`}>
                        {ch.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-ora-charcoal block">{ch.label}</span>
                        <span className="text-xs text-ora-graphite">{ch.description}</span>
                      </div>
                      {false && null}
                    </button>
                  ))}
                </div>
                {errors.channel && <p className="text-sm text-red-600 mt-2">{errors.channel}</p>}
              </CardContent>
            </Card>

            {/* Campaign Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {isWhatsApp
                    ? <Image src="/icons/whatsapp-color.svg" alt="WhatsApp" width={20} height={20} />
                    : isSms
                      ? <Smartphone className="h-5 w-5 stroke-1 text-blue-600" />
                      : <Mail className="h-5 w-5 stroke-1 text-ora-gold" />}
                  Campaign Details
                </CardTitle>
                <CardDescription>
                  {isWhatsApp ? "Set up your WhatsApp campaign" : isSms ? "Set up your SMS campaign" : "Set up your campaign name, type, and email subject"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Initial Invitation"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  />
                  <p className="text-xs text-ora-graphite">Internal name to identify this campaign</p>
                  {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Campaign Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, type: value as Campaign["type"] }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select campaign type" />
                    </SelectTrigger>
                    <SelectContent>
                      {campaignTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-ora-graphite">
                    {campaignTypes.find(t => t.value === formData.type)?.description}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">{isWhatsApp ? "Preview Text" : isSms ? "Campaign Description" : "Email Subject"}</Label>
                  <Input
                    id="subject"
                    placeholder={isWhatsApp ? "e.g., Event reminder for {eventName}" : isSms ? "e.g., RSVP reminder for Annual Gala" : "e.g., You're Invited to {eventName}!"}
                    value={formData.subject}
                    onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))}
                  />
                  <p className="text-xs text-ora-graphite">
                    {isWhatsApp
                      ? "Short description shown in the campaign list"
                      : isSms
                        ? "Internal description for this SMS campaign"
                        : <>Use {"{eventName}"}, {"{firstName}"}, etc. for personalization</>}
                  </p>
                  {errors.subject && <p className="text-sm text-red-600">{errors.subject}</p>}
                </div>
              </CardContent>
            </Card>

          </div>
        )}

        {currentStep === "design" && campaignId && isEmail && (
          <div className="h-full">
            <UnlayerEmailBuilder
              ref={editorRef}
              campaignId={campaignId}
              initialDesign={designState.design}
              onReady={handleEditorReady}
              onError={handleEditorError}
              onOpenTemplateLibrary={() => setIsTemplateLibraryOpen(true)}
              style={{ height: '100%' }}
            />
            <TemplateLibrarySheet
              isOpen={isTemplateLibraryOpen}
              onClose={() => setIsTemplateLibraryOpen(false)}
              onSelectTemplate={handleTemplateSelect}
            />
          </div>
        )}

        {currentStep === "design" && isWhatsApp && (
          <div className="h-full overflow-auto">
            {/* WhatsApp Design Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#25D366]/10">
                <Image src="/icons/whatsapp-color.svg" alt="WhatsApp" width={24} height={24} />
              </div>
              <div>
                <h2 className="text-lg font-medium text-ora-charcoal">Design WhatsApp Message</h2>
                <p className="text-sm text-ora-graphite">Compose your message, pick a template, or upload a header image</p>
              </div>
            </div>
            <WhatsAppComposer
              data={{
                subject: formData.subject,
                whatsappTemplateId: formData.whatsappTemplateId,
                whatsappMessageBody: formData.whatsappMessageBody,
                whatsappMediaUrl: formData.whatsappMediaUrl,
                whatsappMediaType: formData.whatsappMediaType,
              }}
              onChange={(updates) => setFormData((prev) => ({ ...prev, ...updates }))}
              channelId={whatsAppChannel?.id}
            />
          </div>
        )}

        {currentStep === "design" && isSms && (
          <div className="h-full overflow-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50">
                <Smartphone className="h-6 w-6 stroke-1 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-ora-charcoal">Compose SMS Message</h2>
                <p className="text-sm text-ora-graphite">Write your text message with character counting and segment estimation</p>
              </div>
            </div>
            <SmsComposer
              data={{
                subject: formData.subject,
                smsBody: formData.smsBody,
                smsSenderId: formData.smsSenderId,
                smsOptOutFooter: formData.smsOptOutFooter,
              }}
              onChange={(updates) => setFormData((prev) => ({ ...prev, ...updates }))}
            />
          </div>
        )}

        {currentStep === "review" && (
          <div className="h-full overflow-auto">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5 stroke-1 text-ora-gold" />
                  Review Campaign
                </CardTitle>
                <CardDescription>
                  Review your campaign before saving
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="p-4 rounded-lg bg-ora-cream">
                    <p className="text-sm text-ora-graphite mb-1">Campaign Name</p>
                    <p className="font-medium text-ora-charcoal">{formData.name}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-ora-cream">
                    <p className="text-sm text-ora-graphite mb-1">Type</p>
                    <p className="font-medium text-ora-charcoal">
                      {campaignTypes.find(t => t.value === formData.type)?.label}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-ora-cream">
                    <p className="text-sm text-ora-graphite mb-1">Channel</p>
                    <p className="font-medium text-ora-charcoal flex items-center gap-1.5">
                      {channelOptions.find(c => c.value === formData.channel)?.icon}
                      {channelOptions.find(c => c.value === formData.channel)?.label}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-ora-cream">
                  <p className="text-sm text-ora-graphite mb-1">{isWhatsApp ? "Preview Text" : isSms ? "Description" : "Email Subject"}</p>
                  <p className="font-medium text-ora-charcoal">{formData.subject}</p>
                </div>

                {isWhatsApp && (
                  <>
                    {formData.whatsappTemplateId && (
                      <div className="p-4 rounded-lg bg-ora-cream">
                        <p className="text-sm text-ora-graphite mb-1">WhatsApp Template</p>
                        <p className="font-medium text-ora-charcoal font-mono text-sm">{formData.whatsappTemplateId}</p>
                      </div>
                    )}
                    {formData.whatsappMessageBody && (
                      <div className="p-4 rounded-lg border border-ora-sand">
                        <p className="text-sm text-ora-graphite mb-2">Message Body</p>
                        <p className="text-sm text-ora-charcoal whitespace-pre-wrap">{formData.whatsappMessageBody}</p>
                      </div>
                    )}
                    {formData.whatsappMediaUrl && (
                      <div className="p-4 rounded-lg bg-ora-cream">
                        <p className="text-sm text-ora-graphite mb-1">Media Attachment</p>
                        <p className="text-sm text-ora-charcoal">
                          {formData.whatsappMediaType?.toUpperCase()}: {formData.whatsappMediaUrl}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {isEmail && (
                  <div className="p-4 rounded-lg border border-ora-sand">
                    <p className="text-sm text-ora-graphite mb-2">Email Design</p>
                    <p className="text-sm text-ora-charcoal">
                      {designState.design ? 'Design saved' : 'No design configured'}
                    </p>
                  </div>
                )}

                {isSms && (
                  <>
                    {formData.smsSenderId && (
                      <div className="p-4 rounded-lg bg-ora-cream">
                        <p className="text-sm text-ora-graphite mb-1">Sender ID</p>
                        <p className="font-medium text-ora-charcoal">{formData.smsSenderId}</p>
                      </div>
                    )}
                    {formData.smsBody && (
                      <div className="p-4 rounded-lg border border-ora-sand">
                        <p className="text-sm text-ora-graphite mb-2">SMS Message</p>
                        <p className="text-sm text-ora-charcoal whitespace-pre-wrap">{formData.smsBody}</p>
                        {formData.smsOptOutFooter && (
                          <p className="text-xs text-ora-graphite mt-2 italic">+ Reply STOP to opt out</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      <footer className="flex items-center justify-between pt-4 mt-4 border-t border-ora-sand">
        <div>
          {currentStep !== "details" && (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 stroke-1" />
              Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/admin/events/${eventId}/campaigns`}>
            <Button variant="outline">Cancel</Button>
          </Link>
          {currentStep === "review" ? (
            <Button onClick={handleFinish}>
              <Check className="h-4 w-4 stroke-1" />
              Finish
            </Button>
          ) : (
            <Button 
              onClick={handleNext}
              isLoading={createCampaign.isPending || saveCampaignDesign.isPending}
              disabled={currentStep === "design" && isEmail && !isEditorReady}
            >
              {currentStep === "details" ? "Create & Design" : "Continue"}
              <ArrowRight className="h-4 w-4 stroke-1" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}
