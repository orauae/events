/**
 * @fileoverview Admin Campaign hooks - TanStack Query hooks for admin campaign operations
 * 
 * Provides React hooks for admin campaign management including:
 * - Campaign listing with filters and pagination
 * - Bulk actions (delete, duplicate)
 * - Campaign status management (pause, resume, cancel)
 * 
 * @module hooks/use-admin-campaigns
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * Requirements: 3 (Campaign List and Management)
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { Campaign, CampaignStatus, CampaignType } from "@/db/schema"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Campaign with event relation for admin list
 */
export interface AdminCampaignWithEvent {
  id: string
  name: string
  type: CampaignType
  status: CampaignStatus
  subject: string
  recipientCount: number
  sentCount: number
  deliveredCount: number
  openedCount: number
  clickedCount: number
  bouncedCount: number
  unsubscribedCount: number
  scheduledAt: Date | null
  sentAt: Date | null
  createdAt: Date
  updatedAt: Date
  event: {
    id: string
    name: string
  }
}

/**
 * Paginated result structure
 */
export interface PaginatedCampaigns {
  data: AdminCampaignWithEvent[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Filter options for admin campaigns
 */
export interface AdminCampaignFilters {
  status?: CampaignStatus
  type?: CampaignType
  eventId?: string
  search?: string
  dateFrom?: Date
  dateTo?: Date
  page?: number
  pageSize?: number
  sortBy?: 'name' | 'createdAt' | 'sentAt' | 'status' | 'openedCount' | 'clickedCount'
  sortOrder?: 'asc' | 'desc'
}

/**
 * Query key factory for admin campaigns
 */
export const adminCampaignKeys = {
  all: ["admin-campaigns"] as const,
  lists: () => [...adminCampaignKeys.all, "list"] as const,
  list: (filters: AdminCampaignFilters) => [...adminCampaignKeys.lists(), filters] as const,
  details: () => [...adminCampaignKeys.all, "detail"] as const,
  detail: (id: string) => [...adminCampaignKeys.details(), id] as const,
}

/**
 * Fetch admin campaigns with filters
 */
async function fetchAdminCampaigns(filters: AdminCampaignFilters): Promise<PaginatedCampaigns> {
  const params = new URLSearchParams()
  
  if (filters.status) params.set('status', filters.status)
  if (filters.type) params.set('type', filters.type)
  if (filters.eventId) params.set('eventId', filters.eventId)
  if (filters.search) params.set('search', filters.search)
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom.toISOString())
  if (filters.dateTo) params.set('dateTo', filters.dateTo.toISOString())
  if (filters.page) params.set('page', filters.page.toString())
  if (filters.pageSize) params.set('pageSize', filters.pageSize.toString())
  if (filters.sortBy) params.set('sortBy', filters.sortBy)
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder)
  
  const response = await fetch(`/api/admin/campaigns?${params.toString()}`)
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch campaigns")
  }
  
  return response.json()
}

/**
 * Delete campaigns
 */
async function deleteCampaigns(ids: string[]): Promise<void> {
  const response = await fetch('/api/admin/campaigns/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to delete campaigns")
  }
}

/**
 * Duplicate a campaign
 */
async function duplicateCampaign(id: string): Promise<Campaign> {
  const response = await fetch(`/api/admin/campaigns/${id}/duplicate`, {
    method: 'POST',
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to duplicate campaign")
  }
  
  return response.json()
}

/**
 * Pause a campaign
 */
async function pauseCampaign(id: string): Promise<Campaign> {
  const response = await fetch(`/api/admin/campaigns/${id}/pause`, {
    method: 'POST',
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to pause campaign")
  }
  
  return response.json()
}

/**
 * Resume a campaign
 */
async function resumeCampaign(id: string): Promise<Campaign> {
  const response = await fetch(`/api/admin/campaigns/${id}/resume`, {
    method: 'POST',
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to resume campaign")
  }
  
  return response.json()
}

/**
 * Cancel a campaign
 */
async function cancelCampaign(id: string): Promise<Campaign> {
  const response = await fetch(`/api/admin/campaigns/${id}/cancel`, {
    method: 'POST',
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to cancel campaign")
  }
  
  return response.json()
}

/**
 * Hook to fetch admin campaigns with filters and pagination
 * 
 * @param filters - Filter and pagination options
 * @returns Query result with paginated campaigns
 * 
 * Requirements: 3
 */
export function useAdminCampaigns(filters: AdminCampaignFilters = {}) {
  return useQuery({
    queryKey: adminCampaignKeys.list(filters),
    queryFn: () => fetchAdminCampaigns(filters),
    staleTime: 30000, // 30 seconds
  })
}

/**
 * Hook for bulk campaign actions
 * 
 * @returns Object with mutation functions for bulk actions
 * 
 * Requirements: 3
 */
export function useBulkCampaignActions() {
  const queryClient = useQueryClient()
  
  const deleteMutation = useMutation({
    mutationFn: deleteCampaigns,
    onError: (err) => {
      toast.error(err.message || "Failed to delete campaigns")
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} campaign${ids.length > 1 ? 's' : ''} deleted`)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminCampaignKeys.lists() })
    },
  })
  
  const duplicateMutation = useMutation({
    mutationFn: duplicateCampaign,
    onError: (err) => {
      toast.error(err.message || "Failed to duplicate campaign")
    },
    onSuccess: () => {
      toast.success("Campaign duplicated")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminCampaignKeys.lists() })
    },
  })
  
  const pauseMutation = useMutation({
    mutationFn: pauseCampaign,
    onError: (err) => {
      toast.error(err.message || "Failed to pause campaign")
    },
    onSuccess: () => {
      toast.success("Campaign paused")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminCampaignKeys.lists() })
    },
  })
  
  const resumeMutation = useMutation({
    mutationFn: resumeCampaign,
    onError: (err) => {
      toast.error(err.message || "Failed to resume campaign")
    },
    onSuccess: () => {
      toast.success("Campaign resumed")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminCampaignKeys.lists() })
    },
  })
  
  const cancelMutation = useMutation({
    mutationFn: cancelCampaign,
    onError: (err) => {
      toast.error(err.message || "Failed to cancel campaign")
    },
    onSuccess: () => {
      toast.success("Campaign cancelled")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminCampaignKeys.lists() })
    },
  })
  
  return {
    deleteCampaigns: deleteMutation.mutateAsync,
    duplicateCampaign: duplicateMutation.mutateAsync,
    pauseCampaign: pauseMutation.mutateAsync,
    resumeCampaign: resumeMutation.mutateAsync,
    cancelCampaign: cancelMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    isDuplicating: duplicateMutation.isPending,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
    isCancelling: cancelMutation.isPending,
  }
}

/**
 * Draft campaign data structure for saving wizard progress
 */
export interface CampaignDraftData {
  name: string
  type: CampaignType | ""
  description?: string
  eventId?: string
  channel?: "email" | "whatsapp" | "sms"
  subject?: string
  designJson?: unknown
  recipientType?: "event" | "filter" | "upload" | ""
  filters?: {
    rsvpStatus?: string[]
    tags?: string[]
    checkInStatus?: string[]
  }
  sendType?: "now" | "scheduled" | "draft"
  scheduledAt?: Date | null
  timezone?: string
  whatsappTemplateId?: string
  whatsappContent?: unknown
  whatsappMediaUrl?: string
  whatsappMediaType?: string
}

/**
 * Save campaign draft
 */
async function saveCampaignDraft(data: CampaignDraftData): Promise<Campaign> {
  const response = await fetch('/api/admin/campaigns/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to save draft")
  }
  
  return response.json()
}

/**
 * Update existing campaign draft
 */
async function updateCampaignDraft(id: string, data: Partial<CampaignDraftData>): Promise<Campaign> {
  const response = await fetch(`/api/admin/campaigns/${id}/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to update draft")
  }
  
  return response.json()
}

/**
 * Hook for saving campaign drafts
 * 
 * @returns Object with mutation functions for draft operations
 * 
 * Requirements: 4.4
 */
export function useCampaignDraft() {
  const queryClient = useQueryClient()
  
  const saveDraftMutation = useMutation({
    mutationFn: saveCampaignDraft,
    onError: (err) => {
      toast.error(err.message || "Failed to save draft")
    },
    onSuccess: () => {
      toast.success("Draft saved successfully")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminCampaignKeys.lists() })
    },
  })
  
  const updateDraftMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CampaignDraftData> }) => 
      updateCampaignDraft(id, data),
    onError: (err) => {
      toast.error(err.message || "Failed to update draft")
    },
    onSuccess: () => {
      toast.success("Draft updated")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminCampaignKeys.lists() })
    },
  })
  
  return {
    saveDraft: saveDraftMutation.mutateAsync,
    updateDraft: updateDraftMutation.mutateAsync,
    isSaving: saveDraftMutation.isPending,
    isUpdating: updateDraftMutation.isPending,
  }
}

/**
 * Campaign creation data structure for the wizard
 */
export interface CreateCampaignData {
  name: string
  type: CampaignType
  description?: string
  eventId: string
  channel?: "email" | "whatsapp" | "sms"
  subject: string
  content: string
  designJson?: unknown
  recipientType?: "event" | "filter" | "upload"
  filters?: {
    rsvpStatus?: string[]
    tags?: string[]
    checkInStatus?: string[]
  }
  sendType: "now" | "scheduled" | "draft"
  scheduledAt?: Date | null
  timezone?: string
  isRecurring?: boolean
  recurrencePattern?: "daily" | "weekly" | "monthly" | null
  recurrenceEndDate?: Date | null
  // For upload recipient type
  recipients?: Array<{
    email: string
    firstName?: string
    lastName?: string
    company?: string
  }>
  // A/B testing configuration
  isAbTest?: boolean
  abTestConfig?: {
    enabled: boolean
    testType: "subject" | "sender" | "content" | "sendTime"
    variants: Array<{
      id: string
      name: string
      subject?: string
      senderName?: string
      senderEmail?: string
      designJson?: unknown
      sendTime?: Date
    }>
    testAudiencePercentage: number
    winnerMetric: "openRate" | "clickRate" | "conversionRate"
    testDurationHours: number
    autoSendWinner: boolean
  }
  // WhatsApp fields
  whatsappTemplateId?: string
  whatsappContent?: unknown
  whatsappMediaUrl?: string
  whatsappMediaType?: string
  // SMS fields
  smsBody?: string
  smsSenderId?: string
  smsOptOutFooter?: boolean
}

/**
 * Create a campaign
 */
async function createCampaign(data: CreateCampaignData): Promise<Campaign> {
  const response = await fetch('/api/admin/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId: data.eventId,
      name: data.name,
      type: data.type,
      channel: data.channel || 'email',
      subject: data.subject,
      content: data.content,
      scheduledAt: data.sendType === 'scheduled' ? data.scheduledAt : undefined,
      ...(data.whatsappTemplateId ? { whatsappTemplateId: data.whatsappTemplateId } : {}),
      ...(data.whatsappContent ? { whatsappContent: data.whatsappContent } : {}),
      ...(data.whatsappMediaUrl ? { whatsappMediaUrl: data.whatsappMediaUrl } : {}),
      ...(data.whatsappMediaType ? { whatsappMediaType: data.whatsappMediaType } : {}),
      ...(data.smsBody ? { smsBody: data.smsBody } : {}),
      ...(data.smsSenderId ? { smsSenderId: data.smsSenderId } : {}),
      ...(data.smsOptOutFooter !== undefined ? { smsOptOutFooter: data.smsOptOutFooter } : {}),
    }),
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to create campaign")
  }
  
  return response.json()
}

/**
 * Send a campaign immediately
 */
async function sendCampaignNow(campaignId: string): Promise<{ success: boolean; messagesSent: number }> {
  const response = await fetch(`/api/admin/campaigns/${campaignId}/send`, {
    method: 'POST',
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to send campaign")
  }
  
  return response.json()
}

/**
 * Update campaign design
 */
async function updateCampaignDesign(campaignId: string, designJson: unknown, subject?: string): Promise<Campaign> {
  const response = await fetch(`/api/campaigns/${campaignId}/design`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ designJson, subject }),
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to update campaign design")
  }
  
  return response.json()
}

/**
 * Hook for creating campaigns from the wizard
 * 
 * @returns Object with mutation functions for campaign creation
 * 
 * Requirements: 4 (Multi-Step Campaign Creation Wizard)
 * Requirements: 4.6 - Confirm and create button
 */
export function useCreateCampaign() {
  const queryClient = useQueryClient()
  
  const createMutation = useMutation({
    mutationFn: async (data: CreateCampaignData) => {
      // Step 1: Create the campaign
      const campaign = await createCampaign(data)
      
      // Step 2: Update the design if provided
      if (data.designJson) {
        await updateCampaignDesign(campaign.id, data.designJson, data.subject)
      }
      
      // Step 3: If sendType is 'now', send the campaign immediately
      if (data.sendType === 'now') {
        await sendCampaignNow(campaign.id)
      }
      
      return campaign
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create campaign")
    },
    onSuccess: (_, variables) => {
      if (variables.sendType === 'now') {
        toast.success("Campaign created and sending started!")
      } else if (variables.sendType === 'scheduled') {
        toast.success("Campaign created and scheduled!")
      } else {
        toast.success("Campaign saved as draft!")
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminCampaignKeys.lists() })
    },
  })
  
  return {
    createCampaign: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  }
}

// ============================================================================
// CAMPAIGN REPORT HOOKS
// Requirements: 7 (Campaign Analytics and Reports)
// ============================================================================

/**
 * Campaign report data structure
 */
export interface CampaignReport {
  campaignId: string
  campaignName: string
  campaignType: string
  campaignStatus: string
  eventId: string
  eventName: string
  sentAt: Date | null
  recipientCount: number
  delivery: {
    totalSent: number
    delivered: number
    bounced: number
    hardBounces: number
    softBounces: number
    failed: number
    pending: number
    deliveryRate: number
  }
  engagement: {
    totalOpens: number
    uniqueOpens: number
    openRate: number
    totalClicks: number
    uniqueClicks: number
    clickThroughRate: number
    clickToOpenRate: number
    unsubscribes: number
    unsubscribeRate: number
  }
  linkPerformance: Array<{
    linkId: string
    originalUrl: string
    label: string | null
    totalClicks: number
    uniqueClicks: number
    clickThroughRate: number
  }>
  timeline: Array<{
    timestamp: Date
    opens: number
    clicks: number
  }>
}

/**
 * Export format type
 */
export type ExportFormat = 'csv' | 'pdf'

/**
 * Fetch campaign report
 */
async function fetchCampaignReport(campaignId: string): Promise<CampaignReport> {
  const response = await fetch(`/api/admin/campaigns/${campaignId}/report`)
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch campaign report")
  }
  
  return response.json()
}

/**
 * Export campaign report
 */
async function exportCampaignReport(campaignId: string, format: ExportFormat): Promise<void> {
  const response = await fetch(`/api/admin/campaigns/${campaignId}/report/export?format=${format}`)
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to export campaign report")
  }
  
  // Get the blob from the response
  const blob = await response.blob()
  
  // Create a download link
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `campaign-${campaignId}-report.${format}`
  document.body.appendChild(a)
  a.click()
  
  // Cleanup
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}

/**
 * Hook to fetch campaign report
 * 
 * @param campaignId - The campaign ID to fetch report for
 * @returns Query result with campaign report data
 * 
 * Requirements: 7.1, 7.2
 */
export function useCampaignReport(campaignId: string) {
  return useQuery({
    queryKey: [...adminCampaignKeys.detail(campaignId), 'report'] as const,
    queryFn: () => fetchCampaignReport(campaignId),
    enabled: !!campaignId,
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook for exporting campaign reports in multiple formats
 * 
 * @returns Object with export function and mutation state
 * 
 * Requirements: 7.6
 */
export function useExportCampaignReportWithFormat() {
  const exportMutation = useMutation({
    mutationFn: ({ campaignId, format }: { campaignId: string; format: ExportFormat }) =>
      exportCampaignReport(campaignId, format),
    onError: (err) => {
      toast.error(err.message || "Failed to export report")
    },
    onSuccess: (_, { format }) => {
      toast.success(`Report exported as ${format.toUpperCase()}`)
    },
  })
  
  return {
    exportReport: exportMutation.mutate,
    exportReportAsync: exportMutation.mutateAsync,
    isExporting: exportMutation.isPending,
  }
}

export default useAdminCampaigns
