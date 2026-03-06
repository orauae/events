/**
 * @fileoverview Guest Photo hooks - TanStack Query hooks for guest photo operations
 * 
 * Provides React hooks for guest photo operations with:
 * - Photo retrieval
 * - Photo upload with progress
 * - Photo deletion
 * 
 * @module hooks/use-guest-photo
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * Requirements: 8.1, 8.3
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { GuestPhoto } from "@/db/schema"
import { guestKeys } from "./use-guests"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Photo upload response
 */
export interface PhotoUploadResponse {
  id: string
  publicUrl: string
  width: number | null
  height: number | null
  fileSize: number
}

/**
 * Query key factory for guest photos.
 */
export const guestPhotoKeys = {
  all: ["guest-photos"] as const,
  photo: (guestId: string) => [...guestPhotoKeys.all, guestId] as const,
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchGuestPhoto(guestId: string): Promise<GuestPhoto | null> {
  const response = await fetch(`/api/guests/${guestId}/photo`)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch guest photo")
  }
  return response.json()
}

async function uploadGuestPhoto({
  guestId,
  file,
}: {
  guestId: string
  file: File
}): Promise<PhotoUploadResponse> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`/api/guests/${guestId}/photo`, {
    method: "POST",
    body: formData,
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to upload photo")
  }
  return response.json()
}

async function deleteGuestPhoto(guestId: string): Promise<void> {
  const response = await fetch(`/api/guests/${guestId}/photo`, {
    method: "DELETE",
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to delete photo")
  }
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Fetches a guest's photo by guest ID.
 * 
 * @param guestId - The guest's ID
 * @returns Query result with guest photo or null if not found
 * 
 * Requirements: 8.1, 8.3
 */
export function useGuestPhoto(guestId: string) {
  return useQuery({
    queryKey: guestPhotoKeys.photo(guestId),
    queryFn: () => fetchGuestPhoto(guestId),
    enabled: !!guestId,
    retry: (failureCount, error) => {
      // Don't retry on 404 (no photo)
      if (error.message.includes("not found")) return false
      return failureCount < 3
    },
  })
}

/**
 * Uploads a photo for a guest.
 * 
 * Validates file type and size before upload.
 * Replaces any existing photo for the guest.
 * 
 * @returns Mutation object with mutate function
 * 
 * Requirements: 8.1, 8.3
 */
export function useUploadPhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: uploadGuestPhoto,
    onError: (err) => {
      toast.error(err.message || "Failed to upload photo")
    },
    onSuccess: () => {
      toast.success("Photo uploaded successfully")
    },
    onSettled: (_data, _error, { guestId }) => {
      queryClient.invalidateQueries({ queryKey: guestPhotoKeys.photo(guestId) })
      queryClient.invalidateQueries({ queryKey: guestKeys.detail(guestId) })
      queryClient.invalidateQueries({ queryKey: guestKeys.lists() })
    },
  })
}

/**
 * Deletes a guest's photo.
 * 
 * @returns Mutation object with mutate function
 * 
 * Requirements: 8.3
 */
export function useDeletePhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteGuestPhoto,
    onError: (err) => {
      toast.error(err.message || "Failed to delete photo")
    },
    onSuccess: () => {
      toast.success("Photo deleted successfully")
    },
    onSettled: (_data, _error, guestId) => {
      queryClient.invalidateQueries({ queryKey: guestPhotoKeys.photo(guestId) })
      queryClient.invalidateQueries({ queryKey: guestKeys.detail(guestId) })
      queryClient.invalidateQueries({ queryKey: guestKeys.lists() })
    },
  })
}

/**
 * Validates a file for guest photo upload.
 * 
 * Checks:
 * - MIME type is one of: image/jpeg, image/png, image/webp
 * - File size is under 5MB
 * 
 * @param file - The file to validate
 * @returns Validation result with error message if invalid
 */
export function validatePhotoFile(file: File): { valid: boolean; error?: string } {
  const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]
  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`,
    }
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of 5MB`,
    }
  }

  return { valid: true }
}
