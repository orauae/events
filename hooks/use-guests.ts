/**
 * @fileoverview Guest hooks - TanStack Query hooks for guest operations
 * 
 * Provides React hooks for guest CRUD operations and CSV import with:
 * - Automatic caching and background refetching
 * - Optimistic updates for better UX
 * - Search functionality
 * - CSV import with progress feedback
 * 
 * @module hooks/use-guests
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * @example
 * ```tsx
 * import { useGuests, useImportGuests } from '@/hooks';
 * 
 * function GuestList() {
 *   const { data: guests } = useGuests('search term');
 *   const importGuests = useImportGuests();
 *   
 *   const handleImport = (csvData: string) => {
 *     importGuests.mutate(csvData);
 *   };
 * }
 * ```
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { Guest } from "@/db/schema"
import type { CreateGuestInput, UpdateGuestInput, ImportResult, PaginatedGuests } from "@/lib/services"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Query key factory for guests.
 * Use these keys for cache invalidation and prefetching.
 */
export const guestKeys = {
  all: ["guests"] as const,
  lists: () => [...guestKeys.all, "list"] as const,
  list: (query: string) => [...guestKeys.lists(), { query }] as const,
  paginatedLists: () => [...guestKeys.all, "paginated"] as const,
  paginatedList: (query: string, page: number, pageSize: number) => 
    [...guestKeys.paginatedLists(), { query, page, pageSize }] as const,
  details: () => [...guestKeys.all, "detail"] as const,
  detail: (id: string) => [...guestKeys.details(), id] as const,
}

// Fetch functions
async function fetchGuests(query: string = ""): Promise<Guest[]> {
  const url = query ? `/api/guests?q=${encodeURIComponent(query)}` : "/api/guests"
  const response = await fetch(url)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch guests")
  }
  const result = await response.json()
  // Handle both paginated and non-paginated responses
  return Array.isArray(result) ? result : result.data
}

async function fetchGuestsPaginated(
  query: string = "",
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedGuests> {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    pageSize: String(pageSize),
  })
  const response = await fetch(`/api/guests?${params}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch guests")
  }
  return response.json()
}

async function fetchGuest(id: string): Promise<Guest> {
  const response = await fetch(`/api/guests/${id}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch guest")
  }
  return response.json()
}

async function createGuest(input: CreateGuestInput): Promise<Guest> {
  const response = await fetch("/api/guests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to create guest")
  }
  return response.json()
}

async function updateGuest({
  id,
  input,
}: {
  id: string
  input: UpdateGuestInput
}): Promise<Guest> {
  const response = await fetch(`/api/guests/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to update guest")
  }
  return response.json()
}

async function importGuests(csvData: string): Promise<ImportResult> {
  const response = await fetch("/api/guests/import", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: csvData,
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to import guests")
  }
  return response.json()
}

/**
 * Fetches guests with optional search query.
 * 
 * @param query - Optional search term (searches name, email, company)
 * @returns Query result with guests array
 * 
 * @example
 * ```tsx
 * // All guests
 * const { data: guests } = useGuests();
 * 
 * // Search guests
 * const { data: results } = useGuests('acme corp');
 * ```
 */
export function useGuests(query: string = "") {
  return useQuery({
    queryKey: guestKeys.list(query),
    queryFn: () => fetchGuests(query),
  })
}

/**
 * Fetches guests with pagination support.
 * 
 * @param query - Optional search term (searches name, email, company)
 * @param page - Page number (1-indexed)
 * @param pageSize - Number of results per page
 * @returns Query result with paginated guests data
 * 
 * @example
 * ```tsx
 * const { data } = useGuestsPaginated('', 1, 20);
 * console.log(data?.data); // Guest[]
 * console.log(data?.total); // Total count
 * console.log(data?.totalPages); // Number of pages
 * ```
 */
export function useGuestsPaginated(
  query: string = "",
  page: number = 1,
  pageSize: number = 20
) {
  return useQuery({
    queryKey: guestKeys.paginatedList(query, page, pageSize),
    queryFn: () => fetchGuestsPaginated(query, page, pageSize),
  })
}

export function useGuest(id: string) {
  return useQuery({
    queryKey: guestKeys.detail(id),
    queryFn: () => fetchGuest(id),
    enabled: !!id,
  })
}

export function useCreateGuest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createGuest,
    onMutate: async (newGuest) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: guestKeys.lists() })

      // Snapshot the previous value
      const previousGuests = queryClient.getQueryData<Guest[]>(guestKeys.list(""))

      // Optimistically update to the new value
      if (previousGuests) {
        const optimisticGuest: Guest = {
          id: `temp-${Date.now()}`,
          ...newGuest,
          mobile: newGuest.mobile ?? null,
          company: newGuest.company ?? null,
          jobTitle: newGuest.jobTitle ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        queryClient.setQueryData<Guest[]>(guestKeys.list(""), [
          optimisticGuest,
          ...previousGuests,
        ])
      }

      return { previousGuests }
    },
    onError: (err, _newGuest, context) => {
      // Rollback on error
      if (context?.previousGuests) {
        queryClient.setQueryData(guestKeys.list(""), context.previousGuests)
      }
      toast.error(err.message || "Failed to create guest")
    },
    onSuccess: () => {
      toast.success("Guest created successfully")
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: guestKeys.lists() })
    },
  })
}

export function useUpdateGuest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateGuest,
    onMutate: async ({ id, input }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: guestKeys.detail(id) })
      await queryClient.cancelQueries({ queryKey: guestKeys.lists() })

      // Snapshot the previous values
      const previousGuest = queryClient.getQueryData<Guest>(guestKeys.detail(id))
      const previousGuests = queryClient.getQueryData<Guest[]>(guestKeys.list(""))

      // Optimistically update the detail
      if (previousGuest) {
        queryClient.setQueryData<Guest>(guestKeys.detail(id), {
          ...previousGuest,
          ...input,
          updatedAt: new Date(),
        })
      }

      // Optimistically update the list
      if (previousGuests) {
        queryClient.setQueryData<Guest[]>(
          guestKeys.list(""),
          previousGuests.map((guest) =>
            guest.id === id
              ? { ...guest, ...input, updatedAt: new Date() }
              : guest
          )
        )
      }

      return { previousGuest, previousGuests }
    },
    onError: (err, { id }, context) => {
      // Rollback on error
      if (context?.previousGuest) {
        queryClient.setQueryData(guestKeys.detail(id), context.previousGuest)
      }
      if (context?.previousGuests) {
        queryClient.setQueryData(guestKeys.list(""), context.previousGuests)
      }
      toast.error(err.message || "Failed to update guest")
    },
    onSuccess: () => {
      toast.success("Guest updated successfully")
    },
    onSettled: (_data, _error, { id }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: guestKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: guestKeys.lists() })
    },
  })
}

/**
 * Imports guests from CSV data.
 * 
 * Shows toast notifications with import results including
 * created, updated, and failed counts.
 * 
 * @returns Mutation object with mutate function
 * 
 * @example
 * ```tsx
 * const importGuests = useImportGuests();
 * 
 * const handleFileUpload = async (file: File) => {
 *   const csvData = await file.text();
 *   importGuests.mutate(csvData);
 * };
 * ```
 */
export function useImportGuests() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: importGuests,
    onError: (err) => {
      toast.error(err.message || "Failed to import guests")
    },
    onSuccess: (result) => {
      const message = `Imported ${result.created} new guests, updated ${result.updated} existing`
      if (result.failed.length > 0) {
        toast.warning(`${message}. ${result.failed.length} rows failed.`)
      } else {
        toast.success(message)
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: guestKeys.lists() })
    },
  })
}
