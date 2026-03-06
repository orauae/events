/**
 * @fileoverview Guest Tag hooks - TanStack Query hooks for tag management
 * 
 * Provides React hooks for managing guest tags within events:
 * - Fetching tags for an event
 * - Creating new tags
 * - Deleting tags
 * 
 * @module hooks/use-guest-tags
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * @example
 * ```tsx
 * import { useGuestTagsByEvent, useCreateGuestTag } from '@/hooks';
 * 
 * function TagManager({ eventId }) {
 *   const { data: tags } = useGuestTagsByEvent(eventId);
 *   const createTag = useCreateGuestTag();
 *   
 *   const handleCreate = () => {
 *     createTag.mutate({ eventId, input: { name: 'VIP', color: '#B8956B' } });
 *   };
 * }
 * ```
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { GuestTag } from "@/db/schema"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Input for creating a new guest tag.
 */
interface CreateGuestTagInput {
  name: string
  color?: string
}

/**
 * Query key factory for guest tags.
 */
export const guestTagKeys = {
  all: ["guest-tags"] as const,
  lists: () => [...guestTagKeys.all, "list"] as const,
  listByEvent: (eventId: string) => [...guestTagKeys.lists(), { eventId }] as const,
}

// Fetch functions
async function fetchGuestTagsByEvent(eventId: string): Promise<GuestTag[]> {
  const response = await fetch(`/api/guest-tags/event/${eventId}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch guest tags")
  }
  return response.json()
}

async function createGuestTag({
  eventId,
  input,
}: {
  eventId: string
  input: CreateGuestTagInput
}): Promise<GuestTag> {
  const response = await fetch(`/api/guest-tags/event/${eventId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to create guest tag")
  }
  return response.json()
}

async function deleteGuestTag(id: string): Promise<void> {
  const response = await fetch(`/api/guest-tags/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to delete guest tag")
  }
}

// Hooks

/**
 * Query guest tags by event
 * Requirements: 2.4
 */
export function useGuestTagsByEvent(eventId: string) {
  return useQuery({
    queryKey: guestTagKeys.listByEvent(eventId),
    queryFn: () => fetchGuestTagsByEvent(eventId),
    enabled: !!eventId,
  })
}

/**
 * Create a new guest tag
 * Requirements: 4.4
 */
export function useCreateGuestTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createGuestTag,
    onError: (err) => {
      toast.error(err.message || "Failed to create tag")
    },
    onSuccess: (data) => {
      toast.success(`Tag "${data.name}" created`)
    },
    onSettled: (_data, _error, { eventId }) => {
      queryClient.invalidateQueries({
        queryKey: guestTagKeys.listByEvent(eventId),
      })
    },
  })
}

/**
 * Delete a guest tag
 * Requirements: 4.4
 */
export function useDeleteGuestTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteGuestTag,
    onError: (err) => {
      toast.error(err.message || "Failed to delete tag")
    },
    onSuccess: () => {
      toast.success("Tag deleted")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: guestTagKeys.lists() })
    },
  })
}
