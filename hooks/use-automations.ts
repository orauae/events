/**
 * @fileoverview Automation hooks - TanStack Query hooks for automation operations
 * 
 * Provides React hooks for automation workflow management:
 * - Automation CRUD operations
 * - Status management (Draft, Active, Paused)
 * - Duplication
 * - Validation before activation
 * 
 * @module hooks/use-automations
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * @example
 * ```tsx
 * import { useAutomationsByEvent, useSetAutomationStatus } from '@/hooks';
 * 
 * function AutomationList({ eventId }) {
 *   const { data: automations } = useAutomationsByEvent(eventId);
 *   const setStatus = useSetAutomationStatus();
 *   
 *   const handleActivate = (id: string) => {
 *     setStatus.mutate({ id, status: 'Active' });
 *   };
 * }
 * ```
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { Automation, AutomationNode, AutomationEdge, AutomationStatus } from "@/db/schema"
import type { CreateAutomationInput, UpdateAutomationInput } from "@/lib/services/automation-service"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Automation with its nodes and edges.
 * Represents the complete workflow definition.
 */
export interface AutomationWithDetails extends Automation {
  nodes: AutomationNode[]
  edges: AutomationEdge[]
}

/**
 * Query key factory for automations.
 * Use these keys for cache invalidation and prefetching.
 */
export const automationKeys = {
  all: ["automations"] as const,
  lists: () => [...automationKeys.all, "list"] as const,
  listByEvent: (eventId: string) => [...automationKeys.lists(), { eventId }] as const,
  details: () => [...automationKeys.all, "detail"] as const,
  detail: (id: string) => [...automationKeys.details(), id] as const,
}

// Fetch functions
async function fetchAutomationsByEvent(eventId: string): Promise<AutomationWithDetails[]> {
  const response = await fetch(`/api/automations/event/${eventId}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch automations")
  }
  return response.json()
}

async function fetchAutomation(id: string): Promise<AutomationWithDetails> {
  const response = await fetch(`/api/automations/${id}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch automation")
  }
  return response.json()
}


async function createAutomation({
  eventId,
  input,
}: {
  eventId: string
  input: CreateAutomationInput
}): Promise<AutomationWithDetails> {
  const response = await fetch(`/api/automations/event/${eventId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to create automation")
  }
  return response.json()
}

async function updateAutomation({
  id,
  input,
}: {
  id: string
  input: UpdateAutomationInput
}): Promise<AutomationWithDetails> {
  const response = await fetch(`/api/automations/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to update automation")
  }
  return response.json()
}

async function deleteAutomation(id: string): Promise<void> {
  const response = await fetch(`/api/automations/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to delete automation")
  }
}

async function duplicateAutomation(id: string): Promise<AutomationWithDetails> {
  const response = await fetch(`/api/automations/${id}/duplicate`, {
    method: "POST",
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to duplicate automation")
  }
  return response.json()
}

async function setAutomationStatus({
  id,
  status,
}: {
  id: string
  status: AutomationStatus
}): Promise<AutomationWithDetails> {
  const response = await fetch(`/api/automations/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to update automation status")
  }
  return response.json()
}


// Hooks

/**
 * Query automations by event
 * Requirements: 6.1
 */
export function useAutomationsByEvent(eventId: string) {
  return useQuery({
    queryKey: automationKeys.listByEvent(eventId),
    queryFn: () => fetchAutomationsByEvent(eventId),
    enabled: !!eventId,
  })
}

/**
 * Query a single automation by ID
 * Requirements: 6.1
 */
export function useAutomation(id: string) {
  return useQuery({
    queryKey: automationKeys.detail(id),
    queryFn: () => fetchAutomation(id),
    enabled: !!id,
  })
}

/**
 * Create a new automation
 * Requirements: 6.1
 */
export function useCreateAutomation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createAutomation,
    onError: (err) => {
      toast.error(err.message || "Failed to create automation")
    },
    onSuccess: () => {
      toast.success("Automation created successfully")
    },
    onSettled: (_data, _error, { eventId }) => {
      queryClient.invalidateQueries({
        queryKey: automationKeys.listByEvent(eventId),
      })
    },
  })
}

/**
 * Update an automation
 * Requirements: 6.4
 */
export function useUpdateAutomation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateAutomation,
    onError: (err) => {
      toast.error(err.message || "Failed to update automation")
    },
    onSuccess: () => {
      toast.success("Automation saved")
    },
    onSettled: (data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: automationKeys.detail(id) })
      if (data?.eventId) {
        queryClient.invalidateQueries({
          queryKey: automationKeys.listByEvent(data.eventId),
        })
      }
    },
  })
}

/**
 * Delete an automation
 * Requirements: 6.4
 */
export function useDeleteAutomation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteAutomation,
    onError: (err) => {
      toast.error(err.message || "Failed to delete automation")
    },
    onSuccess: () => {
      toast.success("Automation deleted")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.lists() })
    },
  })
}

/**
 * Duplicate an automation
 * Requirements: 6.3
 */
export function useDuplicateAutomation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: duplicateAutomation,
    onError: (err) => {
      toast.error(err.message || "Failed to duplicate automation")
    },
    onSuccess: (data) => {
      toast.success(`Automation duplicated as "${data.name}"`)
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

/**
 * Toggle automation status (Draft, Active, Paused)
 * Requirements: 6.2
 */
export function useSetAutomationStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: setAutomationStatus,
    onError: (err) => {
      toast.error(err.message || "Failed to update automation status")
    },
    onSuccess: (data) => {
      const statusMessages: Record<AutomationStatus, string> = {
        Active: "Automation activated",
        Paused: "Automation paused",
        Draft: "Automation set to draft",
      }
      toast.success(statusMessages[data.status])
    },
    onSettled: (data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: automationKeys.detail(id) })
      if (data?.eventId) {
        queryClient.invalidateQueries({
          queryKey: automationKeys.listByEvent(data.eventId),
        })
      }
    },
  })
}
