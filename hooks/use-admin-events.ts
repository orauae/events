/**
 * @fileoverview Admin Events hooks - TanStack Query hooks for admin event operations
 * 
 * Provides React hooks for fetching events with guest counts for the admin
 * campaign wizard. These hooks are specifically designed for the admin section
 * and include guest count data for each event.
 * 
 * @module hooks/use-admin-events
 * @requires @tanstack/react-query
 * 
 * Requirements: 4.2 - Event selector with guest count preview
 */

"use client"

import { useQuery } from "@tanstack/react-query"
import type { Event } from "@/db/schema"

/**
 * Event with guest count for admin campaign wizard
 */
export interface EventWithGuestCount extends Event {
  guestCount: number
}

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
}

/**
 * Query key factory for admin events
 */
export const adminEventKeys = {
  all: ["admin", "events"] as const,
  lists: () => [...adminEventKeys.all, "list"] as const,
  guestCount: (eventId: string) => [...adminEventKeys.all, "guestCount", eventId] as const,
}

/**
 * Paginated response wrapper
 */
interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

/**
 * Fetches all events (admin only) - paginated
 */
async function fetchAllEvents(page = 1, pageSize = 50): Promise<PaginatedResponse<Event>> {
  const response = await fetch(`/api/admin/events?page=${page}&pageSize=${pageSize}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch events")
  }
  return response.json()
}

/**
 * Fetches all events with guest counts - paginated
 */
async function fetchEventsWithGuestCounts(page = 1, pageSize = 50): Promise<PaginatedResponse<EventWithGuestCount>> {
  const response = await fetch(`/api/admin/events?includeGuestCount=true&page=${page}&pageSize=${pageSize}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch events")
  }
  return response.json()
}

/**
 * Fetches guest count for a specific event
 */
async function fetchEventGuestCount(eventId: string): Promise<{ eventId: string; guestCount: number }> {
  const response = await fetch(`/api/admin/events/${eventId}/guest-count`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch guest count")
  }
  return response.json()
}

/**
 * Hook to fetch all events for admin (paginated).
 * 
 * @param page - Page number (default 1)
 * @param pageSize - Items per page (default 50)
 * @returns Query result with paginated events
 * 
 * @example
 * ```tsx
 * const { data } = useAdminEvents();
 * const events = data?.data;
 * const pagination = data?.pagination;
 * ```
 */
export function useAdminEvents(page = 1, pageSize = 50) {
  return useQuery({
    queryKey: [...adminEventKeys.lists(), { page, pageSize }],
    queryFn: () => fetchAllEvents(page, pageSize),
  })
}

/**
 * Hook to fetch all events with guest counts for admin campaign wizard (paginated).
 * 
 * Returns events with their guest counts for display in the event selector
 * dropdown with guest count preview.
 * 
 * @param page - Page number (default 1)
 * @param pageSize - Items per page (default 50)
 * @returns Query result with events array including guest counts
 * 
 * Requirements: 4.2 - Event selector with guest count preview
 * 
 * @example
 * ```tsx
 * const { data } = useAdminEventsWithGuestCounts();
 * data?.data.forEach(event => {
 *   console.log(`${event.name}: ${event.guestCount} guests`);
 * });
 * ```
 */
export function useAdminEventsWithGuestCounts(page = 1, pageSize = 50) {
  return useQuery({
    queryKey: [...adminEventKeys.lists(), "withGuestCounts", { page, pageSize }],
    queryFn: () => fetchEventsWithGuestCounts(page, pageSize),
  })
}

/**
 * Hook to fetch guest count for a specific event.
 * 
 * Useful when you need to refresh the guest count for a single event
 * without refetching all events.
 * 
 * @param eventId - The event ID to fetch guest count for
 * @returns Query result with guest count
 * 
 * Requirements: 4.2 - Event selector with guest count preview
 * 
 * @example
 * ```tsx
 * const { data } = useEventGuestCount('event123');
 * console.log(`Guest count: ${data?.guestCount}`);
 * ```
 */
export function useEventGuestCount(eventId: string) {
  return useQuery({
    queryKey: adminEventKeys.guestCount(eventId),
    queryFn: () => fetchEventGuestCount(eventId),
    enabled: !!eventId,
  })
}
