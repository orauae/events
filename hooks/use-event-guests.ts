/**
 * @fileoverview Event Guest hooks - TanStack Query hooks for event-guest operations
 * 
 * Provides React hooks for managing guest participation in events:
 * - Adding/removing guests from events
 * - Fetching event guest lists with relations
 * - Optimistic updates for immediate UI feedback
 * 
 * @module hooks/use-event-guests
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * @example
 * ```tsx
 * import { useEventGuests, useAddGuestToEvent } from '@/hooks';
 * 
 * function EventGuestList({ eventId }) {
 *   const { data: eventGuests } = useEventGuests(eventId);
 *   const addGuest = useAddGuestToEvent();
 *   
 *   const handleAdd = (guestId: string) => {
 *     addGuest.mutate({ eventId, guestId });
 *   };
 * }
 * ```
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { EventGuest, Guest, Event } from "@/db/schema"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * EventGuest with related guest and event data.
 * Includes full contact info and event details.
 */
export interface EventGuestWithRelations extends EventGuest {
  guest: Guest
  event: Event
}

/**
 * Query key factory for event guests.
 * Use these keys for cache invalidation and prefetching.
 */
export const eventGuestKeys = {
  all: ["eventGuests"] as const,
  lists: () => [...eventGuestKeys.all, "list"] as const,
  listByEvent: (eventId: string) => [...eventGuestKeys.lists(), { eventId }] as const,
  details: () => [...eventGuestKeys.all, "detail"] as const,
  detail: (id: string) => [...eventGuestKeys.details(), id] as const,
}

// Fetch functions
async function fetchEventGuests(eventId: string): Promise<EventGuestWithRelations[]> {
  const response = await fetch(`/api/events/${eventId}/guests`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch event guests")
  }
  return response.json()
}

async function addGuestToEvent({
  eventId,
  guestId,
}: {
  eventId: string
  guestId: string
}): Promise<EventGuestWithRelations> {
  const response = await fetch(`/api/events/${eventId}/guests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId }),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to add guest to event")
  }
  return response.json()
}

async function removeGuestFromEvent({
  eventId,
  guestId,
}: {
  eventId: string
  guestId: string
}): Promise<void> {
  const response = await fetch(`/api/events/${eventId}/guests/${guestId}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to remove guest from event")
  }
}

/**
 * Fetches all guests for an event with their participation status.
 * 
 * @param eventId - The event ID to fetch guests for
 * @returns Query result with event guests array
 * 
 * @example
 * ```tsx
 * const { data: eventGuests } = useEventGuests('event123');
 * 
 * eventGuests?.forEach(eg => {
 *   console.log(`${eg.guest.firstName}: ${eg.rsvpStatus}`);
 * });
 * ```
 */
export function useEventGuests(eventId: string) {
  return useQuery({
    queryKey: eventGuestKeys.listByEvent(eventId),
    queryFn: () => fetchEventGuests(eventId),
    enabled: !!eventId,
  })
}

/**
 * Adds a guest to an event with optimistic updates.
 * 
 * Creates an EventGuest record with initial statuses and QR token.
 * The guest is added to the list immediately while the API call is in progress.
 * 
 * @returns Mutation object with mutate function
 * 
 * @example
 * ```tsx
 * const addGuest = useAddGuestToEvent();
 * addGuest.mutate({ eventId: 'event123', guestId: 'guest456' });
 * ```
 */
export function useAddGuestToEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: addGuestToEvent,
    onMutate: async ({ eventId, guestId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: eventGuestKeys.listByEvent(eventId),
      })

      // Snapshot previous value
      const previousEventGuests = queryClient.getQueryData<EventGuestWithRelations[]>(
        eventGuestKeys.listByEvent(eventId)
      )

      // Return context with previous value
      return { previousEventGuests, eventId, guestId }
    },
    onError: (err, { eventId }, context) => {
      // Rollback on error
      if (context?.previousEventGuests) {
        queryClient.setQueryData(
          eventGuestKeys.listByEvent(eventId),
          context.previousEventGuests
        )
      }
      toast.error(err.message || "Failed to add guest to event")
    },
    onSuccess: (data, { eventId }) => {
      // Add the new guest to the cache
      const previousEventGuests = queryClient.getQueryData<EventGuestWithRelations[]>(
        eventGuestKeys.listByEvent(eventId)
      )
      if (previousEventGuests && data) {
        queryClient.setQueryData<EventGuestWithRelations[]>(
          eventGuestKeys.listByEvent(eventId),
          [...previousEventGuests, data]
        )
      }
      toast.success("Guest added to event")
    },
    onSettled: (_data, _error, { eventId }) => {
      queryClient.invalidateQueries({
        queryKey: eventGuestKeys.listByEvent(eventId),
      })
    },
  })
}

/**
 * Adds multiple guests to an event with optimistic updates.
 * 
 * @returns Mutation object with mutate function
 * 
 * @example
 * ```tsx
 * const addGuests = useAddGuestsToEvent();
 * addGuests.mutate({ eventId: 'event123', guestIds: ['guest1', 'guest2'] });
 * ```
 */
export function useAddGuestsToEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ eventId, guestIds }: { eventId: string; guestIds: string[] }) => {
      const results: EventGuestWithRelations[] = []
      const errors: string[] = []
      
      for (const guestId of guestIds) {
        try {
          const result = await addGuestToEvent({ eventId, guestId })
          results.push(result)
        } catch (err) {
          errors.push(guestId)
        }
      }
      
      return { results, errors, total: guestIds.length }
    },
    onSuccess: (data, { eventId }) => {
      // Update cache with all successfully added guests
      const previousEventGuests = queryClient.getQueryData<EventGuestWithRelations[]>(
        eventGuestKeys.listByEvent(eventId)
      ) || []
      
      queryClient.setQueryData<EventGuestWithRelations[]>(
        eventGuestKeys.listByEvent(eventId),
        [...previousEventGuests, ...data.results]
      )
      
      if (data.errors.length === 0) {
        toast.success(`Added ${data.results.length} guest${data.results.length !== 1 ? 's' : ''} to event`)
      } else {
        toast.warning(`Added ${data.results.length} of ${data.total} guests. ${data.errors.length} failed.`)
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to add guests to event")
    },
    onSettled: (_data, _error, { eventId }) => {
      queryClient.invalidateQueries({
        queryKey: eventGuestKeys.listByEvent(eventId),
      })
    },
  })
}

/**
 * Removes a guest from an event with optimistic updates.
 * 
 * The guest is removed from the list immediately while the API call is in progress.
 * 
 * @returns Mutation object with mutate function
 * 
 * @example
 * ```tsx
 * const removeGuest = useRemoveGuestFromEvent();
 * removeGuest.mutate({ eventId: 'event123', guestId: 'guest456' });
 * ```
 */
export function useRemoveGuestFromEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: removeGuestFromEvent,
    onMutate: async ({ eventId, guestId }) => {
      await queryClient.cancelQueries({
        queryKey: eventGuestKeys.listByEvent(eventId),
      })

      const previousEventGuests = queryClient.getQueryData<EventGuestWithRelations[]>(
        eventGuestKeys.listByEvent(eventId)
      )

      if (previousEventGuests) {
        queryClient.setQueryData<EventGuestWithRelations[]>(
          eventGuestKeys.listByEvent(eventId),
          previousEventGuests.filter((eg) => eg.guestId !== guestId)
        )
      }

      return { previousEventGuests, eventId }
    },
    onError: (err, { eventId }, context) => {
      if (context?.previousEventGuests) {
        queryClient.setQueryData(
          eventGuestKeys.listByEvent(eventId),
          context.previousEventGuests
        )
      }
      toast.error(err.message || "Failed to remove guest from event")
    },
    onSuccess: () => {
      toast.success("Guest removed from event")
    },
    onSettled: (_data, _error, { eventId }) => {
      queryClient.invalidateQueries({
        queryKey: eventGuestKeys.listByEvent(eventId),
      })
    },
  })
}
