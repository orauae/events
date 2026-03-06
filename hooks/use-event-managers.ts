/**
 * @fileoverview Event Manager hooks - TanStack Query hooks for event manager operations
 * 
 * Provides React hooks for event manager CRUD operations with:
 * - Automatic caching and background refetching
 * - Optimistic updates for better UX
 * - Error handling with toast notifications
 * 
 * @module hooks/use-event-managers
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { 
  EventManagerWithStats, 
  EventManagerDetail,
  CreateEventManagerInput,
  UpdateEventManagerInput,
  UpdatePermissionsInput,
} from "@/lib/services/event-manager-service"
import type { User, EventManagerPermission } from "@/db/schema"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Query key factory for event managers.
 * Use these keys for cache invalidation and prefetching.
 */
export const eventManagerKeys = {
  all: ["event-managers"] as const,
  lists: () => [...eventManagerKeys.all, "list"] as const,
  list: (filters?: string) => [...eventManagerKeys.lists(), { filters }] as const,
  details: () => [...eventManagerKeys.all, "detail"] as const,
  detail: (id: string) => [...eventManagerKeys.details(), id] as const,
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchEventManagers(search?: string): Promise<EventManagerWithStats[]> {
  const url = search 
    ? `/api/event-managers?search=${encodeURIComponent(search)}` 
    : "/api/event-managers"
  const response = await fetch(url)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch event managers")
  }
  return response.json()
}

async function fetchEventManager(id: string): Promise<EventManagerDetail> {
  const response = await fetch(`/api/event-managers/${id}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch event manager")
  }
  return response.json()
}

async function createEventManager(input: CreateEventManagerInput): Promise<User> {
  const response = await fetch("/api/event-managers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to create event manager")
  }
  return response.json()
}

async function updateEventManager({
  id,
  input,
}: {
  id: string
  input: UpdateEventManagerInput
}): Promise<User> {
  const response = await fetch(`/api/event-managers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to update event manager")
  }
  return response.json()
}

async function suspendEventManager(id: string): Promise<User> {
  const response = await fetch(`/api/event-managers/${id}/suspend`, {
    method: "POST",
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to suspend event manager")
  }
  return response.json()
}

async function reactivateEventManager(id: string): Promise<User> {
  const response = await fetch(`/api/event-managers/${id}/reactivate`, {
    method: "POST",
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to reactivate event manager")
  }
  return response.json()
}

async function deactivateEventManager({
  id,
  transferToUserId,
}: {
  id: string
  transferToUserId: string
}): Promise<void> {
  const response = await fetch(`/api/event-managers/${id}/deactivate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transferToUserId }),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to deactivate event manager")
  }
}

async function updatePermissions({
  id,
  permissions,
}: {
  id: string
  permissions: UpdatePermissionsInput
}): Promise<EventManagerPermission> {
  const response = await fetch(`/api/event-managers/${id}/permissions`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(permissions),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to update permissions")
  }
  return response.json()
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Fetches all event managers with optional search.
 * 
 * @param search - Optional search term (searches name, email)
 * @returns Query result with event managers array
 * 
 * Requirements: 3.1
 */
export function useEventManagers(search?: string) {
  return useQuery({
    queryKey: eventManagerKeys.list(search),
    queryFn: () => fetchEventManagers(search),
  })
}

/**
 * Fetches a single event manager by ID with full details.
 * 
 * @param id - The event manager's user ID
 * @returns Query result with event manager detail
 * 
 * Requirements: 3.3
 */
export function useEventManager(id: string) {
  return useQuery({
    queryKey: eventManagerKeys.detail(id),
    queryFn: () => fetchEventManager(id),
    enabled: !!id,
  })
}

/**
 * Creates a new event manager.
 * 
 * @returns Mutation object with mutate function
 * 
 * Requirements: 3.2
 */
export function useCreateEventManager() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createEventManager,
    onError: (err) => {
      toast.error(err.message || "Failed to create event manager")
    },
    onSuccess: () => {
      toast.success("Event manager created successfully")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: eventManagerKeys.lists() })
    },
  })
}

/**
 * Updates an existing event manager's profile.
 * 
 * @returns Mutation object with mutate function
 * 
 * Requirements: 3.4
 */
export function useUpdateEventManager() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateEventManager,
    onError: (err) => {
      toast.error(err.message || "Failed to update event manager")
    },
    onSuccess: () => {
      toast.success("Event manager updated successfully")
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: eventManagerKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: eventManagerKeys.lists() })
    },
  })
}

/**
 * Suspends an event manager, blocking their access.
 * 
 * @returns Mutation object with mutate function
 * 
 * Requirements: 4.2
 */
export function useSuspendEventManager() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: suspendEventManager,
    onError: (err) => {
      toast.error(err.message || "Failed to suspend event manager")
    },
    onSuccess: () => {
      toast.success("Event manager suspended successfully")
    },
    onSettled: (_data, _error, id) => {
      queryClient.invalidateQueries({ queryKey: eventManagerKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: eventManagerKeys.lists() })
    },
  })
}

/**
 * Reactivates a suspended event manager.
 * 
 * @returns Mutation object with mutate function
 * 
 * Requirements: 4.3
 */
export function useReactivateEventManager() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: reactivateEventManager,
    onError: (err) => {
      toast.error(err.message || "Failed to reactivate event manager")
    },
    onSuccess: () => {
      toast.success("Event manager reactivated successfully")
    },
    onSettled: (_data, _error, id) => {
      queryClient.invalidateQueries({ queryKey: eventManagerKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: eventManagerKeys.lists() })
    },
  })
}

/**
 * Deactivates an event manager with event transfer.
 * 
 * @returns Mutation object with mutate function
 * 
 * Requirements: 4.4, 4.6
 */
export function useDeactivateEventManager() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deactivateEventManager,
    onError: (err) => {
      toast.error(err.message || "Failed to deactivate event manager")
    },
    onSuccess: () => {
      toast.success("Event manager deactivated successfully")
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: eventManagerKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: eventManagerKeys.lists() })
    },
  })
}

/**
 * Updates an event manager's permissions.
 * 
 * @returns Mutation object with mutate function
 * 
 * Requirements: 2.3
 */
export function useUpdatePermissions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updatePermissions,
    onError: (err) => {
      toast.error(err.message || "Failed to update permissions")
    },
    onSuccess: () => {
      toast.success("Permissions updated successfully")
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: eventManagerKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: eventManagerKeys.lists() })
    },
  })
}
