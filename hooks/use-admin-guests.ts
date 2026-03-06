/**
 * @fileoverview Admin Guests hooks - TanStack Query hooks for admin guest operations
 * 
 * Provides React hooks for fetching all guests across the platform (admin only).
 * 
 * @module hooks/use-admin-guests
 * @requires @tanstack/react-query
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { Guest } from "@/db/schema"

/**
 * Paginated response structure
 */
interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
}

/**
 * Query key factory for admin guests
 */
export const adminGuestKeys = {
  all: ["admin", "guests"] as const,
  lists: () => [...adminGuestKeys.all, "list"] as const,
  paginated: (search: string, page: number, pageSize: number) => 
    [...adminGuestKeys.lists(), { search, page, pageSize }] as const,
}

/**
 * Fetches paginated guests (admin only - all guests)
 */
async function fetchGuestsPaginated(
  search: string,
  page: number,
  pageSize: number
): Promise<PaginatedResponse<Guest>> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  })
  if (search) {
    params.set("search", search)
  }
  
  const response = await fetch(`/api/admin/guests?${params}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch guests")
  }
  return response.json()
}

/**
 * Hook to fetch paginated guests for admin.
 * 
 * @param search - Search query string
 * @param page - Current page number
 * @param pageSize - Number of items per page
 * @returns Query result with paginated guests
 * 
 * @example
 * ```tsx
 * const { data, isLoading } = useAdminGuestsPaginated("john", 1, 20);
 * ```
 */
export function useAdminGuestsPaginated(search: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: adminGuestKeys.paginated(search, page, pageSize),
    queryFn: () => fetchGuestsPaginated(search, page, pageSize),
  })
}

/**
 * Hook to bulk delete guests (admin only).
 *
 * @returns Mutation for deleting multiple guests at once
 *
 * @example
 * ```tsx
 * const bulkDelete = useBulkDeleteGuests();
 * bulkDelete.mutate(["id1", "id2"]);
 * ```
 */
export function useBulkDeleteGuests() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await fetch("/api/admin/guests/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to delete guests" }))
        throw new Error(error.message || "Failed to delete guests")
      }
      return response.json() as Promise<{ deleted: number }>
    },
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} guest${data.deleted !== 1 ? "s" : ""}`)
      queryClient.invalidateQueries({ queryKey: adminGuestKeys.all })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}