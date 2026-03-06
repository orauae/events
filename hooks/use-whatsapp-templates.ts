"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { WhatsAppTemplate } from "@/db/schema"
import type {
  CreateTemplateInput,
  EditTemplateInput,
  TemplateFilters,
} from "@/lib/services/whatsapp-template-management-service"

// ============================================================================
// TYPES
// ============================================================================

interface APIError {
  code: string
  message: string
}

/**
 * Fetch the WhatsApp channel for a given event.
 * Returns the channel record (including its `id` used as channelId for template APIs).
 */
export function useWhatsAppChannel(eventId: string) {
  return useQuery({
    queryKey: ["whatsapp-channel", eventId],
    queryFn: async () => {
      const response = await fetch(`/api/events/${eventId}/whatsapp/channel`)
      if (!response.ok) {
        if (response.status === 404) return null
        const error: APIError = await response.json()
        throw new Error(error.message || "Failed to fetch WhatsApp channel")
      }
      return response.json() as Promise<{ id: string; whatsappBusinessAccountId: string; [key: string]: unknown }>
    },
    enabled: !!eventId,
  })
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const whatsappTemplateKeys = {
  all: ["whatsapp-templates"] as const,
  lists: () => [...whatsappTemplateKeys.all, "list"] as const,
  listByChannel: (channelId: string, filters?: TemplateFilters) =>
    [...whatsappTemplateKeys.lists(), { channelId, ...filters }] as const,
  details: () => [...whatsappTemplateKeys.all, "detail"] as const,
  detail: (channelId: string, templateId: string) =>
    [...whatsappTemplateKeys.details(), channelId, templateId] as const,
  favorites: () => [...whatsappTemplateKeys.all, "favorites"] as const,
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchTemplates(
  channelId: string,
  filters?: TemplateFilters,
): Promise<WhatsAppTemplate[]> {
  const params = new URLSearchParams()
  if (filters?.search) params.set("search", filters.search)
  if (filters?.category) params.set("category", filters.category)
  if (filters?.status) params.set("status", filters.status)

  const qs = params.toString()
  const url = `/api/whatsapp-templates/${channelId}${qs ? `?${qs}` : ""}`
  const response = await fetch(url)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch templates")
  }
  return response.json()
}

async function fetchTemplate(
  channelId: string,
  templateId: string,
): Promise<WhatsAppTemplate> {
  const response = await fetch(
    `/api/whatsapp-templates/${channelId}/${templateId}`,
  )
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch template")
  }
  return response.json()
}

async function createTemplate(
  channelId: string,
  input: CreateTemplateInput,
): Promise<WhatsAppTemplate> {
  const response = await fetch(`/api/whatsapp-templates/${channelId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to create template")
  }
  return response.json()
}

async function editTemplate(
  channelId: string,
  templateId: string,
  input: EditTemplateInput,
): Promise<WhatsAppTemplate> {
  const response = await fetch(
    `/api/whatsapp-templates/${channelId}/${templateId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  )
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to edit template")
  }
  return response.json()
}

async function deleteTemplate(
  channelId: string,
  templateId: string,
): Promise<void> {
  const response = await fetch(
    `/api/whatsapp-templates/${channelId}/${templateId}`,
    { method: "DELETE" },
  )
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to delete template")
  }
}

async function syncTemplates(
  channelId: string,
): Promise<{ synced: number; errors: number }> {
  const response = await fetch(
    `/api/whatsapp-templates/${channelId}/sync`,
    { method: "POST" },
  )
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to sync templates")
  }
  return response.json()
}

async function toggleFavorite(
  templateId: string,
): Promise<{ favorited: boolean }> {
  const response = await fetch(
    `/api/whatsapp-templates/favorites/${templateId}`,
    { method: "POST" },
  )
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to toggle favorite")
  }
  return response.json()
}

async function fetchFavorites(): Promise<string[]> {
  const response = await fetch("/api/whatsapp-templates/favorites")
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch favorites")
  }
  return response.json()
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Fetch the list of WhatsApp templates for a channel with optional filters.
 *
 * Requirements: 2.1
 */
export function useWhatsAppTemplates(
  channelId: string,
  filters?: TemplateFilters,
) {
  return useQuery({
    queryKey: whatsappTemplateKeys.listByChannel(channelId, filters),
    queryFn: () => fetchTemplates(channelId, filters),
    enabled: !!channelId,
  })
}

/**
 * Fetch a single WhatsApp template by ID.
 *
 * Requirements: 2.1
 */
export function useWhatsAppTemplate(channelId: string, templateId: string) {
  return useQuery({
    queryKey: whatsappTemplateKeys.detail(channelId, templateId),
    queryFn: () => fetchTemplate(channelId, templateId),
    enabled: !!channelId && !!templateId,
  })
}

/**
 * Mutation to create a new WhatsApp template on Meta and cache locally.
 *
 * Requirements: 2.1
 */
export function useCreateWhatsAppTemplate(channelId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      createTemplate(channelId, input),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: whatsappTemplateKeys.lists() })
      toast.success(`Template "${template.name}" created and submitted for review`)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create template")
    },
  })
}

/**
 * Mutation to edit an existing WhatsApp template.
 *
 * Requirements: 2.2
 */
export function useEditWhatsAppTemplate(channelId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      templateId,
      input,
    }: {
      templateId: string
      input: EditTemplateInput
    }) => editTemplate(channelId, templateId, input),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: whatsappTemplateKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: whatsappTemplateKeys.details(),
      })
      toast.success(`Template "${template.name}" updated and resubmitted for review`)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to edit template")
    },
  })
}

/**
 * Mutation to delete a WhatsApp template.
 *
 * Requirements: 2.3
 */
export function useDeleteWhatsAppTemplate(channelId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (templateId: string) =>
      deleteTemplate(channelId, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: whatsappTemplateKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: whatsappTemplateKeys.details(),
      })
      toast.success("Template deleted successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete template")
    },
  })
}

/**
 * Mutation to trigger a manual sync of templates from Meta.
 *
 * Requirements: 2.1
 */
export function useSyncWhatsAppTemplates(channelId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => syncTemplates(channelId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: whatsappTemplateKeys.lists() })
      toast.success(`Synced ${result.synced} templates`)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to sync templates")
    },
  })
}

/**
 * Mutation to toggle a template as favorite/unfavorite.
 *
 * Requirements: 4.1, 4.2
 */
export function useToggleTemplateFavorite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (templateId: string) => toggleFavorite(templateId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: whatsappTemplateKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: whatsappTemplateKeys.favorites(),
      })
      toast.success(
        result.favorited ? "Template added to favorites" : "Template removed from favorites",
      )
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to toggle favorite")
    },
  })
}

/**
 * Fetch the current user's favorite template IDs.
 *
 * Requirements: 4.1
 */
export function useWhatsAppTemplateFavorites() {
  return useQuery({
    queryKey: whatsappTemplateKeys.favorites(),
    queryFn: fetchFavorites,
  })
}
