/**
 * @fileoverview Event hooks - TanStack Query hooks for event operations
 * 
 * Provides React hooks for event CRUD operations with:
 * - Automatic caching and background refetching
 * - Optimistic updates for better UX
 * - Error handling with toast notifications
 * - Role-based filtering (Admins see all events, Event Managers see only assigned)
 * 
 * @module hooks/use-events
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * @example
 * ```tsx
 * import { useEvents, useCreateEvent } from '@/hooks';
 * 
 * function EventList() {
 *   const { data: events, isLoading } = useEvents();
 *   const createEvent = useCreateEvent();
 *   
 *   if (isLoading) return <Spinner />;
 *   return <ul>{events?.map(e => <li key={e.id}>{e.name}</li>)}</ul>;
 * }
 * ```
 * 
 * Requirements: 6.1, 9.1
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { Event } from "@/db/schema"
import type { CreateEventInput, UpdateEventInput } from "@/lib/services"
import { adminEventKeys } from "./use-admin-events"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Extended create event input with assignment
 * Requirements: 5.1, 5.6
 */
export interface CreateEventWithAssignmentInput extends CreateEventInput {
  /** User ID to assign the event to (admin only, defaults to current user) */
  assignedUserId?: string
}

/**
 * Query key factory for events.
 * Use these keys for cache invalidation and prefetching.
 * 
 * @example
 * ```typescript
 * // Invalidate all event queries
 * queryClient.invalidateQueries({ queryKey: eventKeys.all });
 * 
 * // Invalidate specific event
 * queryClient.invalidateQueries({ queryKey: eventKeys.detail('event123') });
 * ```
 */
export const eventKeys = {
  all: ["events"] as const,
  lists: () => [...eventKeys.all, "list"] as const,
  list: (filters: string) => [...eventKeys.lists(), { filters }] as const,
  details: () => [...eventKeys.all, "detail"] as const,
  detail: (id: string) => [...eventKeys.details(), id] as const,
}

// Fetch functions
async function fetchEvents(): Promise<Event[]> {
  const response = await fetch("/api/events")
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch events")
  }
  return response.json()
}

async function fetchEvent(id: string): Promise<Event> {
  const response = await fetch(`/api/events/${id}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch event")
  }
  return response.json()
}

async function createEvent(input: CreateEventWithAssignmentInput): Promise<Event> {
  const response = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Too many requests. Please wait a moment and try again.")
    }
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to create event")
  }
  return response.json()
}

async function updateEvent({
  id,
  input,
}: {
  id: string
  input: UpdateEventInput
}): Promise<Event> {
  const response = await fetch(`/api/events/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Too many requests. Please wait a moment and try again.")
    }
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to update event")
  }
  return response.json()
}

async function deleteEvent(id: string): Promise<void> {
  const response = await fetch(`/api/events/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Too many requests. Please wait a moment and try again.")
    }
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to delete event")
  }
}

/**
 * Fetches all events from the API.
 * Results are filtered by user role:
 * - Admins see all events in the system
 * - Event Managers see only events assigned to them
 * Results are ordered by creation date (newest first).
 * 
 * @returns Query result with events array
 * 
 * Requirements: 6.1, 9.1
 * 
 * @example
 * ```tsx
 * const { data: events, isLoading, error } = useEvents();
 * ```
 */
export function useEvents() {
  return useQuery({
    queryKey: eventKeys.lists(),
    queryFn: fetchEvents,
  })
}

/**
 * Fetches a single event by ID.
 * 
 * @param id - The event ID to fetch
 * @returns Query result with event data
 * 
 * @example
 * ```tsx
 * const { data: event } = useEvent('clx1234567890');
 * ```
 */
export function useEvent(id: string) {
  return useQuery({
    queryKey: eventKeys.detail(id),
    queryFn: () => fetchEvent(id),
    enabled: !!id,
  })
}

/**
 * Creates a new event with optimistic updates.
 * 
 * The event appears immediately in the list while the API call is in progress.
 * On error, the optimistic update is rolled back.
 * 
 * For Event Managers with canCreateEvents permission, the event is automatically
 * assigned to them. Admins can optionally specify an assignedUserId to assign
 * the event to a different user.
 * 
 * @returns Mutation object with mutate function
 * 
 * Requirements: 5.1, 5.6
 * 
 * @example
 * ```tsx
 * const createEvent = useCreateEvent();
 * 
 * // Event Manager creating event (auto-assigned to self)
 * createEvent.mutate({
 *   name: 'Tech Summit',
 *   type: 'Conference',
 *   // ... other fields
 * });
 * 
 * // Admin creating event and assigning to another user
 * createEvent.mutate({
 *   name: 'Tech Summit',
 *   type: 'Conference',
 *   assignedUserId: 'user123',
 *   // ... other fields
 * });
 * ```
 */
export function useCreateEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createEvent,
    onMutate: async (newEvent) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: eventKeys.lists() })

      // Snapshot the previous value
      const previousEvents = queryClient.getQueryData<Event[]>(eventKeys.lists())

      // Optimistically update to the new value
      if (previousEvents) {
        const { assignedUserId, ...eventData } = newEvent
        const optimisticEvent: Event = {
          id: `temp-${Date.now()}`,
          ...eventData,
          latitude: eventData.latitude ?? null,
          longitude: eventData.longitude ?? null,
          addressId: (eventData as any).addressId ?? null,
          tierConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        queryClient.setQueryData<Event[]>(eventKeys.lists(), [
          optimisticEvent,
          ...previousEvents,
        ])
      }

      return { previousEvents }
    },
    onError: (err, _newEvent, context) => {
      // Rollback on error
      if (context?.previousEvents) {
        queryClient.setQueryData(eventKeys.lists(), context.previousEvents)
      }
      toast.error(err.message || "Failed to create event")
    },
    onSuccess: () => {
      toast.success("Event created successfully")
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: eventKeys.lists() })
      queryClient.invalidateQueries({ queryKey: adminEventKeys.all })
    },
  })
}

/**
 * Updates an existing event with optimistic updates.
 * 
 * Both the detail and list caches are updated optimistically.
 * 
 * @returns Mutation object with mutate function
 * 
 * @example
 * ```tsx
 * const updateEvent = useUpdateEvent();
 * 
 * updateEvent.mutate({
 *   id: 'event123',
 *   input: { name: 'Updated Name' }
 * });
 * ```
 */
export function useUpdateEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateEvent,
    onMutate: async ({ id, input }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: eventKeys.detail(id) })
      await queryClient.cancelQueries({ queryKey: eventKeys.lists() })

      // Snapshot the previous values
      const previousEvent = queryClient.getQueryData<Event>(eventKeys.detail(id))
      const previousEvents = queryClient.getQueryData<Event[]>(eventKeys.lists())

      // Optimistically update the detail
      if (previousEvent) {
        queryClient.setQueryData<Event>(eventKeys.detail(id), {
          ...previousEvent,
          ...input,
          updatedAt: new Date(),
        })
      }

      // Optimistically update the list
      if (previousEvents) {
        queryClient.setQueryData<Event[]>(
          eventKeys.lists(),
          previousEvents.map((event) =>
            event.id === id
              ? { ...event, ...input, updatedAt: new Date() }
              : event
          )
        )
      }

      return { previousEvent, previousEvents }
    },
    onError: (err, { id }, context) => {
      // Rollback on error
      if (context?.previousEvent) {
        queryClient.setQueryData(eventKeys.detail(id), context.previousEvent)
      }
      if (context?.previousEvents) {
        queryClient.setQueryData(eventKeys.lists(), context.previousEvents)
      }
      toast.error(err.message || "Failed to update event")
    },
    onSuccess: () => {
      toast.success("Event updated successfully")
    },
    onSettled: (_data, _error, { id }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: eventKeys.lists() })
      queryClient.invalidateQueries({ queryKey: adminEventKeys.all })
    },
  })
}

/**
 * Deletes an event with optimistic updates.
 * 
 * The event is removed from the list immediately while the API call is in progress.
 * 
 * @returns Mutation object with mutate function
 * 
 * @example
 * ```tsx
 * const deleteEvent = useDeleteEvent();
 * deleteEvent.mutate('event123');
 * ```
 */
export function useDeleteEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteEvent,
    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: eventKeys.lists() })

      // Snapshot the previous value
      const previousEvents = queryClient.getQueryData<Event[]>(eventKeys.lists())

      // Optimistically remove from the list
      if (previousEvents) {
        queryClient.setQueryData<Event[]>(
          eventKeys.lists(),
          previousEvents.filter((event) => event.id !== id)
        )
      }

      return { previousEvents }
    },
    onError: (err, _id, context) => {
      // Rollback on error
      if (context?.previousEvents) {
        queryClient.setQueryData(eventKeys.lists(), context.previousEvents)
      }
      toast.error(err.message || "Failed to delete event")
    },
    onSuccess: () => {
      toast.success("Event deleted successfully")
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: eventKeys.lists() })
      queryClient.invalidateQueries({ queryKey: adminEventKeys.all })
    },
  })
}
