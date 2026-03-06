/**
 * @fileoverview Event Assignment hooks - TanStack Query hooks for event assignment operations
 * 
 * Provides React hooks for event assignment operations with:
 * - Event assignment queries
 * - Assignable users list
 * - Event transfer mutations
 * 
 * @module hooks/use-event-assignment
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * Requirements: 5.2, 5.3
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { EventAssignment, User } from "@/db/schema"
import { eventKeys } from "./use-events"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Event assignment with user details
 */
export interface EventAssignmentWithUser extends EventAssignment {
  assignedUser: User
}

/**
 * User eligible for event assignment
 */
export interface AssignableUser {
  id: string
  name: string
  email: string
  role: "Admin" | "EventManager"
}

/**
 * Query key factory for event assignments.
 */
export const eventAssignmentKeys = {
  all: ["event-assignments"] as const,
  assignment: (eventId: string) => [...eventAssignmentKeys.all, "assignment", eventId] as const,
  assignableUsers: () => [...eventAssignmentKeys.all, "assignable-users"] as const,
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchEventAssignment(eventId: string): Promise<EventAssignmentWithUser> {
  const response = await fetch(`/api/events/${eventId}/assignment`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch event assignment")
  }
  return response.json()
}

async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const response = await fetch("/api/assignable-users")
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch assignable users")
  }
  return response.json()
}

async function assignEvent({
  eventId,
  userId,
}: {
  eventId: string
  userId: string
}): Promise<{ success: boolean; message: string; assignment: EventAssignment }> {
  const response = await fetch(`/api/events/${eventId}/assignment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to assign event")
  }
  return response.json()
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Fetches the assignment for a specific event.
 * 
 * @param eventId - The event ID to get assignment for
 * @returns Query result with event assignment and user details
 * 
 * Requirements: 5.2
 */
export function useEventAssignment(eventId: string) {
  return useQuery({
    queryKey: eventAssignmentKeys.assignment(eventId),
    queryFn: () => fetchEventAssignment(eventId),
    enabled: !!eventId,
    retry: (failureCount, error) => {
      // Don't retry on 404 (event not assigned)
      if (error.message.includes("not assigned")) return false
      return failureCount < 3
    },
  })
}

/**
 * Fetches all users who can be assigned events.
 * 
 * Returns active Admin and EventManager users.
 * 
 * @returns Query result with assignable users array
 * 
 * Requirements: 5.2
 */
export function useAssignableUsers() {
  return useQuery({
    queryKey: eventAssignmentKeys.assignableUsers(),
    queryFn: fetchAssignableUsers,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Assigns or transfers an event to a user.
 * 
 * If the event is already assigned, this will transfer it.
 * If not assigned, this will create a new assignment.
 * 
 * @returns Mutation object with mutate function
 * 
 * Requirements: 5.3
 */
export function useAssignEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: assignEvent,
    onError: (err) => {
      toast.error(err.message || "Failed to assign event")
    },
    onSuccess: (data) => {
      toast.success(data.message)
    },
    onSettled: (_data, _error, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: eventAssignmentKeys.assignment(eventId) })
      queryClient.invalidateQueries({ queryKey: eventKeys.lists() })
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) })
    },
  })
}

/**
 * Transfers an event to a different user.
 * 
 * This is an alias for useAssignEvent since the API handles both
 * initial assignment and transfer through the same endpoint.
 * 
 * @returns Mutation object with mutate function
 * 
 * Requirements: 5.3
 */
export function useTransferEvent() {
  return useAssignEvent()
}
