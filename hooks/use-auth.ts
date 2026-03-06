/**
 * @fileoverview Authorization hooks - React hooks for role and permission checks
 * 
 * Provides React hooks for authorization operations with:
 * - Current user role and permissions
 * - Event access checks
 * - Permission-based UI rendering
 * 
 * @module hooks/use-auth
 * @requires @tanstack/react-query
 * 
 * Requirements: 2.4, 6.4
 */

"use client"

import { useQuery } from "@tanstack/react-query"
import type { UserRole, EventManagerPermission } from "@/db/schema"
import type { PermissionType } from "@/lib/services/authorization-service"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Current user authorization info
 */
export interface UserAuthInfo {
  userId: string
  role: UserRole
  permissions: EventManagerPermission | null
}

/**
 * Query key factory for authorization.
 */
export const authKeys = {
  all: ["auth"] as const,
  me: () => [...authKeys.all, "me"] as const,
  canAccess: (eventId: string) => [...authKeys.all, "can-access", eventId] as const,
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchCurrentUser(): Promise<UserAuthInfo> {
  const response = await fetch("/api/me")
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch user info")
  }
  return response.json()
}

async function fetchCanAccessEvent(eventId: string): Promise<boolean> {
  const response = await fetch(`/api/me/can-access/${eventId}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to check event access")
  }
  const data = await response.json()
  return data.canAccess
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Gets the current user's role.
 * 
 * @returns Query result with user role
 * 
 * Requirements: 2.4
 */
export function useRole() {
  const query = useQuery({
    queryKey: authKeys.me(),
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  return {
    ...query,
    role: query.data?.role ?? null,
    isAdmin: query.data?.role === "Admin",
    isEventManager: query.data?.role === "EventManager",
  }
}

/**
 * Gets the current user's permissions.
 * 
 * @returns Query result with user permissions
 * 
 * Requirements: 2.4
 */
export function usePermissions() {
  const query = useQuery({
    queryKey: authKeys.me(),
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  return {
    ...query,
    permissions: query.data?.permissions ?? null,
  }
}

/**
 * Checks if the current user can access a specific event.
 * 
 * @param eventId - The event ID to check access for
 * @returns Query result with access boolean
 * 
 * Requirements: 6.4
 */
export function useCanAccessEvent(eventId: string) {
  return useQuery({
    queryKey: authKeys.canAccess(eventId),
    queryFn: () => fetchCanAccessEvent(eventId),
    enabled: !!eventId,
    staleTime: 60 * 1000, // 1 minute
  })
}

/**
 * Checks if the current user has a specific permission.
 * 
 * Admins implicitly have all permissions.
 * EventManagers must have the permission explicitly enabled.
 * 
 * @param permission - The permission to check
 * @returns Object with hasPermission boolean and loading state
 * 
 * Requirements: 2.4
 */
export function useHasPermission(permission: PermissionType) {
  const { data, isLoading, error } = useQuery({
    queryKey: authKeys.me(),
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Admins have all permissions
  if (data?.role === "Admin") {
    return { hasPermission: true, isLoading, error }
  }

  // EventManagers check specific permission
  if (data?.role === "EventManager" && data.permissions) {
    return { 
      hasPermission: data.permissions[permission] === true, 
      isLoading, 
      error 
    }
  }

  return { hasPermission: false, isLoading, error }
}

/**
 * Hook for checking multiple permissions at once.
 * 
 * @returns Object with permission check functions and loading state
 * 
 * Requirements: 2.4
 */
export function useCanAccess() {
  const { data, isLoading, error } = useQuery({
    queryKey: authKeys.me(),
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const checkPermission = (permission: PermissionType): boolean => {
    if (!data) return false
    
    // Admins have all permissions
    if (data.role === "Admin") return true
    
    // EventManagers check specific permission
    if (data.role === "EventManager" && data.permissions) {
      return data.permissions[permission] === true
    }
    
    return false
  }

  return {
    isLoading,
    error,
    isAdmin: data?.role === "Admin" || false,
    isEventManager: data?.role === "EventManager" || false,
    canCreateEvents: checkPermission("canCreateEvents"),
    canUploadExcel: checkPermission("canUploadExcel"),
    canSendCampaigns: checkPermission("canSendCampaigns"),
    canManageAutomations: checkPermission("canManageAutomations"),
    canDeleteGuests: checkPermission("canDeleteGuests"),
    checkPermission,
  }
}
