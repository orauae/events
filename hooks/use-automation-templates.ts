/**
 * @fileoverview Automation Template hooks - TanStack Query hooks for templates
 * 
 * Provides React hooks for working with pre-built automation templates:
 * - Fetching available templates
 * - Importing templates to create new automations
 * 
 * @module hooks/use-automation-templates
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * @example
 * ```tsx
 * import { useAutomationTemplates, useImportTemplate } from '@/hooks';
 * 
 * function TemplateLibrary({ eventId }) {
 *   const { data: templates } = useAutomationTemplates();
 *   const importTemplate = useImportTemplate();
 *   
 *   const handleImport = (templateId: string) => {
 *     importTemplate.mutate({ templateId, eventId });
 *   };
 * }
 * ```
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { AutomationTemplate } from "@/lib/automation-templates"
import type { AutomationWithDetails } from "./use-automations"
import { automationKeys } from "./use-automations"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Query key factory for templates.
 * Templates are static, so they're cached for 1 hour.
 */
export const templateKeys = {
  all: ["automation-templates"] as const,
  lists: () => [...templateKeys.all, "list"] as const,
  details: () => [...templateKeys.all, "detail"] as const,
  detail: (id: string) => [...templateKeys.details(), id] as const,
}

// Fetch functions
async function fetchTemplates(): Promise<AutomationTemplate[]> {
  const response = await fetch("/api/automation-templates")
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch templates")
  }
  return response.json()
}

async function fetchTemplate(id: string): Promise<AutomationTemplate> {
  const response = await fetch(`/api/automation-templates/${id}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch template")
  }
  return response.json()
}

async function importTemplate({
  templateId,
  eventId,
}: {
  templateId: string
  eventId: string
}): Promise<AutomationWithDetails> {
  const response = await fetch(`/api/automation-templates/${templateId}/import/${eventId}`, {
    method: "POST",
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to import template")
  }
  return response.json()
}

// Hooks

/**
 * Query all automation templates
 * Requirements: 5.1
 */
export function useAutomationTemplates() {
  return useQuery({
    queryKey: templateKeys.lists(),
    queryFn: fetchTemplates,
    staleTime: 1000 * 60 * 60, // Templates are static, cache for 1 hour
  })
}

/**
 * Query a single template by ID
 * Requirements: 5.2
 */
export function useAutomationTemplate(id: string) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: () => fetchTemplate(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 60, // Templates are static, cache for 1 hour
  })
}

/**
 * Import a template to create a new automation for an event
 * Requirements: 5.3
 */
export function useImportTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: importTemplate,
    onError: (err) => {
      toast.error(err.message || "Failed to import template")
    },
    onSuccess: (data) => {
      toast.success(`Template imported as "${data.name}"`)
    },
    onSettled: (data) => {
      if (data?.eventId) {
        queryClient.invalidateQueries({
          queryKey: automationKeys.listByEvent(data.eventId),
        })
      }
    },
  })
}
