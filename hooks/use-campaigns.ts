/**
 * @fileoverview Campaign hooks - TanStack Query hooks for campaign operations
 * 
 * Provides React hooks for campaign management including:
 * - Campaign CRUD operations
 * - Email sending
 * - Visual email builder integration
 * - Asset management for images
 * - Preview and test email functionality
 * 
 * @module hooks/use-campaigns
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * @example
 * ```tsx
 * import { useCampaignsByEvent, useSendCampaign } from '@/hooks';
 * 
 * function CampaignList({ eventId }) {
 *   const { data: campaigns } = useCampaignsByEvent(eventId);
 *   const sendCampaign = useSendCampaign();
 *   
 *   const handleSend = (campaignId: string) => {
 *     sendCampaign.mutate(campaignId);
 *   };
 * }
 * ```
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { Campaign } from "@/db/schema"
import type { CreateCampaignInput } from "@/lib/services"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Result of sending a campaign to all recipients.
 */
interface SendCampaignResult {
  success: boolean
  campaignId: string
  totalRecipients: number
  sent: number
  failed: number
  skipped: number
  errors: Array<{ eventGuestId: string; error: string }>
  batchesProcessed: number
  isPaused: boolean
}

/**
 * Query key factory for campaigns.
 * Use these keys for cache invalidation and prefetching.
 */
export const campaignKeys = {
  all: ["campaigns"] as const,
  lists: () => [...campaignKeys.all, "list"] as const,
  listByEvent: (eventId: string) => [...campaignKeys.lists(), { eventId }] as const,
  details: () => [...campaignKeys.all, "detail"] as const,
  detail: (id: string) => [...campaignKeys.details(), id] as const,
}

// Fetch functions
async function fetchCampaignsByEvent(eventId: string): Promise<Campaign[]> {
  const response = await fetch(`/api/events/${eventId}/campaigns`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch campaigns")
  }
  return response.json()
}

async function fetchCampaign(id: string): Promise<Campaign> {
  const response = await fetch(`/api/campaigns/${id}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch campaign")
  }
  return response.json()
}

async function createCampaign({
  eventId,
  input,
}: {
  eventId: string
  input: Omit<CreateCampaignInput, "eventId">
}): Promise<Campaign> {
  const response = await fetch(`/api/events/${eventId}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to create campaign")
  }
  return response.json()
}

async function sendCampaign(id: string): Promise<SendCampaignResult> {
  const response = await fetch(`/api/campaigns/${id}/send`, {
    method: "POST",
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to send campaign")
  }
  return response.json()
}

/**
 * Fetches all campaigns for an event.
 * 
 * @param eventId - The event ID to fetch campaigns for
 * @returns Query result with campaigns array
 * 
 * @example
 * ```tsx
 * const { data: campaigns } = useCampaignsByEvent('event123');
 * ```
 */
export function useCampaignsByEvent(eventId: string) {
  return useQuery({
    queryKey: campaignKeys.listByEvent(eventId),
    queryFn: () => fetchCampaignsByEvent(eventId),
    enabled: !!eventId,
  })
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: campaignKeys.detail(id),
    queryFn: () => fetchCampaign(id),
    enabled: !!id,
  })
}

export function useCreateCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createCampaign,
    onMutate: async ({ eventId, input }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: campaignKeys.listByEvent(eventId),
      })

      // Snapshot the previous value
      const previousCampaigns = queryClient.getQueryData<Campaign[]>(
        campaignKeys.listByEvent(eventId)
      )

      // Optimistically update to the new value
      if (previousCampaigns) {
        const optimisticCampaign: Campaign = {
          id: `temp-${Date.now()}`,
          eventId,
          ...input,
          channel: (input as any).channel || "email",
          status: "Draft",
          designJson: null,
          whatsappTemplateId: null,
          whatsappContent: null,
          whatsappMediaUrl: null,
          whatsappMediaType: null,
          scheduledAt: null,
          sentAt: null,
          recipientCount: 0,
          sentCount: 0,
          deliveredCount: 0,
          openedCount: 0,
          clickedCount: 0,
          bouncedCount: 0,
          unsubscribedCount: 0,
          smsBody: (input as any).smsBody || null,
          smsSenderId: (input as any).smsSenderId || null,
          smsEncoding: null,
          smsSegmentCount: null,
          smsOptOutFooter: (input as any).smsOptOutFooter ?? true,
          isAbTest: false,
          abTestConfig: null,
          winningVariant: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        queryClient.setQueryData<Campaign[]>(
          campaignKeys.listByEvent(eventId),
          [optimisticCampaign, ...previousCampaigns]
        )
      }

      return { previousCampaigns, eventId }
    },
    onError: (err, { eventId }, context) => {
      // Rollback on error
      if (context?.previousCampaigns) {
        queryClient.setQueryData(
          campaignKeys.listByEvent(eventId),
          context.previousCampaigns
        )
      }
      toast.error(err.message || "Failed to create campaign")
    },
    onSuccess: () => {
      toast.success("Campaign created successfully")
    },
    onSettled: (_data, _error, { eventId }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({
        queryKey: campaignKeys.listByEvent(eventId),
      })
    },
  })
}

/**
 * Sends a campaign to all event guests.
 * 
 * Updates campaign status optimistically and shows toast with results.
 * 
 * @returns Mutation object with mutate function
 * 
 * @example
 * ```tsx
 * const sendCampaign = useSendCampaign();
 * sendCampaign.mutate('campaign123');
 * ```
 */
export function useSendCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sendCampaign,
    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: campaignKeys.detail(id) })

      // Snapshot the previous value
      const previousCampaign = queryClient.getQueryData<Campaign>(
        campaignKeys.detail(id)
      )

      // Optimistically update the status
      if (previousCampaign) {
        queryClient.setQueryData<Campaign>(campaignKeys.detail(id), {
          ...previousCampaign,
          status: "Sending",
          updatedAt: new Date(),
        })
      }

      return { previousCampaign }
    },
    onError: (err, id, context) => {
      // Rollback on error
      if (context?.previousCampaign) {
        queryClient.setQueryData(
          campaignKeys.detail(id),
          context.previousCampaign
        )
      }
      toast.error(err.message || "Failed to send campaign")
    },
    onSuccess: (result) => {
      if (result.failed > 0) {
        toast.warning(
          `Campaign sent: ${result.sent} delivered, ${result.failed} failed`
        )
      } else {
        toast.success(`Campaign sent successfully to ${result.sent} recipients`)
      }
    },
    onSettled: (data, _error, id) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(id) })
      // Also invalidate the list if we know the eventId
      queryClient.invalidateQueries({ queryKey: campaignKeys.lists() })
    },
  })
}


// Email Builder Types
interface EmailAsset {
  id: string
  campaignId: string
  originalFilename: string
  r2Key: string
  publicUrl: string
  fileSize: number
  optimizedSize: number | null
  mimeType: string
  width: number | null
  height: number | null
  createdAt: Date
}

interface UploadAssetResult {
  id: string
  publicUrl: string
  width: number
  height: number
  originalSize: number
  optimizedSize: number
  wasOptimized: boolean
}

interface SaveDesignResult {
  id: string
  designJson: unknown
  subject: string
  updatedAt: Date
}

interface PreviewResult {
  mjml: string
  plainText: string
  subject: string
  sampleData: Record<string, string>
}

interface SendTestResult {
  success: boolean
  message: string
  subject: string
}

// Fetch functions for email builder
async function fetchCampaignAssets(campaignId: string): Promise<EmailAsset[]> {
  const response = await fetch(`/api/campaigns/${campaignId}/assets`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch assets")
  }
  return response.json()
}

async function uploadAsset({
  campaignId,
  file,
}: {
  campaignId: string
  file: File
}): Promise<UploadAssetResult> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`/api/campaigns/${campaignId}/assets`, {
    method: "POST",
    body: formData,
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to upload asset")
  }
  return response.json()
}

async function deleteAsset({
  campaignId,
  assetId,
}: {
  campaignId: string
  assetId: string
}): Promise<void> {
  const response = await fetch(`/api/campaigns/${campaignId}/assets/${assetId}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to delete asset")
  }
}

async function saveCampaignDesign({
  campaignId,
  designJson,
  subject,
  htmlContent,
}: {
  campaignId: string
  designJson: unknown
  subject?: string
  htmlContent?: string
}): Promise<SaveDesignResult> {
  const response = await fetch(`/api/campaigns/${campaignId}/design`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ designJson, subject, htmlContent }),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to save design")
  }
  return response.json()
}

async function generatePreview(campaignId: string): Promise<PreviewResult> {
  const response = await fetch(`/api/campaigns/${campaignId}/preview`, {
    method: "POST",
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to generate preview")
  }
  return response.json()
}

async function sendTestEmail({
  campaignId,
  email,
}: {
  campaignId: string
  email: string
}): Promise<SendTestResult> {
  const response = await fetch(`/api/campaigns/${campaignId}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to send test email")
  }
  return response.json()
}

// Email Builder Hooks
export function useCampaignAssets(campaignId: string) {
  return useQuery({
    queryKey: [...campaignKeys.detail(campaignId), "assets"] as const,
    queryFn: () => fetchCampaignAssets(campaignId),
    enabled: !!campaignId,
  })
}

export function useUploadAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: uploadAsset,
    onError: (err) => {
      toast.error(err.message || "Failed to upload image")
    },
    onSuccess: (result) => {
      const savedKB = Math.round((result.originalSize - result.optimizedSize) / 1024)
      if (result.wasOptimized && savedKB > 0) {
        toast.success(`Image uploaded and optimized (saved ${savedKB}KB)`)
      } else {
        toast.success("Image uploaded successfully")
      }
    },
    onSettled: (_data, _error, { campaignId }) => {
      queryClient.invalidateQueries({
        queryKey: [...campaignKeys.detail(campaignId), "assets"],
      })
    },
  })
}

export function useDeleteAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteAsset,
    onError: (err) => {
      toast.error(err.message || "Failed to delete image")
    },
    onSuccess: () => {
      toast.success("Image deleted")
    },
    onSettled: (_data, _error, { campaignId }) => {
      queryClient.invalidateQueries({
        queryKey: [...campaignKeys.detail(campaignId), "assets"],
      })
    },
  })
}

export function useSaveCampaignDesign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: saveCampaignDesign,
    onError: (err) => {
      toast.error(err.message || "Failed to save design")
    },
    onSuccess: () => {
      toast.success("Design saved")
    },
    onSettled: (_data, _error, { campaignId }) => {
      queryClient.invalidateQueries({
        queryKey: campaignKeys.detail(campaignId),
      })
      queryClient.invalidateQueries({
        queryKey: campaignKeys.lists(),
      })
    },
  })
}

export function usePreviewCampaign() {
  return useMutation({
    mutationFn: generatePreview,
    onError: (err) => {
      toast.error(err.message || "Failed to generate preview")
    },
  })
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: sendTestEmail,
    onError: (err) => {
      toast.error(err.message || "Failed to send test email")
    },
    onSuccess: (result) => {
      toast.success(result.message)
    },
  })
}

// Save WhatsApp/SMS campaign content
async function saveCampaignContent({
  campaignId,
  ...fields
}: {
  campaignId: string
  whatsappTemplateId?: string | null
  whatsappTemplateName?: string | null
  whatsappMessageBody?: string | null
  whatsappMediaUrl?: string | null
  whatsappMediaType?: string | null
  whatsappContent?: Record<string, unknown> | null
  content?: string
  subject?: string
  smsBody?: string | null
  smsSenderId?: string | null
  smsOptOutFooter?: boolean
}): Promise<Campaign> {
  const response = await fetch(`/api/campaigns/${campaignId}/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to save campaign content")
  }
  return response.json()
}

export function useSaveCampaignContent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: saveCampaignContent,
    onError: (err) => {
      toast.error(err.message || "Failed to save content")
    },
    onSuccess: () => {
      toast.success("Content saved")
    },
    onSettled: (_data, _error, { campaignId }) => {
      queryClient.invalidateQueries({
        queryKey: campaignKeys.detail(campaignId),
      })
      queryClient.invalidateQueries({
        queryKey: campaignKeys.lists(),
      })
    },
  })
}
