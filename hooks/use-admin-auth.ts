/**
 * @fileoverview Admin Authorization Hook - React hook for admin access control
 * 
 * Provides React hooks for admin-specific authorization operations with:
 * - Admin role verification
 * - Admin user info retrieval
 * - Admin route access checks
 * 
 * @module hooks/use-admin-auth
 * @requires @tanstack/react-query
 * 
 * Requirements: 1.1, 1.4, 1.5
 */

"use client"

import { useQuery } from "@tanstack/react-query"
import type { UserRole } from "@/db/schema"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Admin user info returned from API
 */
export interface AdminUserInfo {
  id: string
  name: string
  email: string
  role: UserRole
}

/**
 * Admin verification result
 */
export interface AdminVerificationResult {
  isAdmin: boolean
  userId: string | null
  role: UserRole | null
  error?: string
}

/**
 * Query key factory for admin authorization.
 */
export const adminAuthKeys = {
  all: ["admin-auth"] as const,
  verify: () => [...adminAuthKeys.all, "verify"] as const,
  info: () => [...adminAuthKeys.all, "info"] as const,
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchAdminVerification(): Promise<AdminVerificationResult> {
  const response = await fetch("/api/admin/verify")
  if (!response.ok) {
    // For 401/403, return a non-admin result instead of throwing
    if (response.status === 401 || response.status === 403) {
      return {
        isAdmin: false,
        userId: null,
        role: null,
        error: "Not authorized as admin",
      }
    }
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to verify admin status")
  }
  return response.json()
}

async function fetchAdminInfo(): Promise<AdminUserInfo | null> {
  const response = await fetch("/api/admin/me")
  if (!response.ok) {
    // For 401/403, return null instead of throwing
    if (response.status === 401 || response.status === 403) {
      return null
    }
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch admin info")
  }
  return response.json()
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook for verifying admin access and getting admin status.
 * 
 * Provides comprehensive admin verification with loading and error states.
 * Use this hook to protect admin-only UI components and features.
 * 
 * @returns Object with admin verification status and query state
 * 
 * @example
 * ```tsx
 * function AdminDashboard() {
 *   const { isAdmin, isLoading, error } = useAdminAuth();
 *   
 *   if (isLoading) return <Loading />;
 *   if (!isAdmin) return <AccessDenied />;
 *   
 *   return <AdminContent />;
 * }
 * ```
 * 
 * Requirements: 1.1, 1.4
 */
export function useAdminAuth() {
  const query = useQuery({
    queryKey: adminAuthKeys.verify(),
    queryFn: fetchAdminVerification,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry on auth failures
  })

  return {
    ...query,
    isAdmin: query.data?.isAdmin ?? false,
    userId: query.data?.userId ?? null,
    role: query.data?.role ?? null,
    verificationError: query.data?.error ?? null,
  }
}

/**
 * Hook for getting admin user information.
 * 
 * Returns detailed admin user info including name and email.
 * Only returns data if the current user is an active admin.
 * 
 * @returns Object with admin user info and query state
 * 
 * @example
 * ```tsx
 * function AdminHeader() {
 *   const { adminInfo, isLoading } = useAdminInfo();
 *   
 *   if (isLoading) return <Skeleton />;
 *   if (!adminInfo) return null;
 *   
 *   return <span>Welcome, {adminInfo.name}</span>;
 * }
 * ```
 * 
 * Requirements: 1.5
 */
export function useAdminInfo() {
  const query = useQuery({
    queryKey: adminAuthKeys.info(),
    queryFn: fetchAdminInfo,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry on auth failures
  })

  return {
    ...query,
    adminInfo: query.data ?? null,
  }
}

/**
 * Combined hook for admin authentication and authorization.
 * 
 * Provides both verification status and user info in a single hook.
 * Useful for admin layouts and pages that need both.
 * 
 * @returns Object with admin status, user info, and query states
 * 
 * @example
 * ```tsx
 * function AdminLayout({ children }) {
 *   const { isAdmin, adminInfo, isLoading } = useAdminAccess();
 *   
 *   if (isLoading) return <AdminSkeleton />;
 *   if (!isAdmin) {
 *     redirect('/dashboard');
 *     return null;
 *   }
 *   
 *   return (
 *     <AdminShell user={adminInfo}>
 *       {children}
 *     </AdminShell>
 *   );
 * }
 * ```
 * 
 * Requirements: 1.1, 1.4, 1.5
 */
export function useAdminAccess() {
  const verifyQuery = useQuery({
    queryKey: adminAuthKeys.verify(),
    queryFn: fetchAdminVerification,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  })

  const infoQuery = useQuery({
    queryKey: adminAuthKeys.info(),
    queryFn: fetchAdminInfo,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
    // Only fetch info if verification succeeds
    enabled: verifyQuery.data?.isAdmin === true,
  })

  return {
    // Verification status
    isAdmin: verifyQuery.data?.isAdmin ?? false,
    userId: verifyQuery.data?.userId ?? null,
    role: verifyQuery.data?.role ?? null,
    verificationError: verifyQuery.data?.error ?? null,
    
    // Admin info
    adminInfo: infoQuery.data ?? null,
    
    // Loading states
    isLoading: verifyQuery.isLoading || (verifyQuery.data?.isAdmin && infoQuery.isLoading),
    isVerifying: verifyQuery.isLoading,
    isLoadingInfo: infoQuery.isLoading,
    
    // Error states
    error: verifyQuery.error || infoQuery.error,
    
    // Refetch functions
    refetch: () => {
      verifyQuery.refetch()
      infoQuery.refetch()
    },
  }
}
