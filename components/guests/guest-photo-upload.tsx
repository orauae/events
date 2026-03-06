"use client"

/**
 * @fileoverview Guest Photo Upload Component
 * 
 * Provides a drag-and-drop interface for uploading guest photos with:
 * - File validation (MIME type and size)
 * - Upload progress indication
 * - Preview display
 * - Error handling
 * 
 * @module components/guests/guest-photo-upload
 * @requires react-dropzone - Drag and drop file handling
 * 
 * Requirements: 8.1, 8.2, 8.6
 */

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import {
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  User,
  Camera,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui"
import { useGuestPhoto, useUploadPhoto, useDeletePhoto, validatePhotoFile } from "@/hooks/use-guest-photo"

/**
 * Props for the GuestPhotoUpload component
 */
interface GuestPhotoUploadProps {
  /** The guest's ID */
  guestId: string
  /** Callback when upload completes successfully */
  onUploadComplete?: (photoUrl: string) => void
  /** Callback when photo is deleted */
  onDelete?: () => void
  /** Whether the component is in compact mode (smaller size) */
  compact?: boolean
}

/**
 * Upload state tracking
 */
interface UploadState {
  status: "idle" | "uploading" | "success" | "error"
  progress: number
  error?: string
  preview?: string
}

/**
 * GuestPhotoUpload - Drag-and-drop photo upload component for guests
 * 
 * Features:
 * - Drag and drop file upload
 * - File validation (JPEG, PNG, WebP under 5MB)
 * - Upload progress indication
 * - Preview of current/uploaded photo
 * - Delete functionality
 * 
 * @param props - Component props
 * @returns React component
 * 
 * Requirements: 8.1, 8.2, 8.6
 */
export function GuestPhotoUpload({
  guestId,
  onUploadComplete,
  onDelete,
  compact = false,
}: GuestPhotoUploadProps) {
  const { data: existingPhoto, isLoading: isLoadingPhoto } = useGuestPhoto(guestId)
  const uploadPhoto = useUploadPhoto()
  const deletePhoto = useDeletePhoto()

  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
    progress: 0,
  })
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  /**
   * Handles file upload
   */
  const handleUpload = useCallback(
    async (file: File) => {
      // Validate file
      const validation = validatePhotoFile(file)
      if (!validation.valid) {
        setUploadState({
          status: "error",
          progress: 0,
          error: validation.error,
        })
        return
      }

      // Create preview
      const preview = URL.createObjectURL(file)
      setUploadState({ status: "uploading", progress: 0, preview })

      // Simulate progress (actual progress would need XHR)
      const progressInterval = setInterval(() => {
        setUploadState((prev) => ({
          ...prev,
          progress: Math.min(prev.progress + 15, 90),
        }))
      }, 150)

      try {
        const result = await uploadPhoto.mutateAsync({ guestId, file })

        clearInterval(progressInterval)
        setUploadState({
          status: "success",
          progress: 100,
          preview: result.publicUrl,
        })

        onUploadComplete?.(result.publicUrl)

        // Reset after success
        setTimeout(() => {
          setUploadState({ status: "idle", progress: 0 })
        }, 2000)
      } catch (error) {
        clearInterval(progressInterval)
        const message = error instanceof Error ? error.message : "Upload failed"
        setUploadState({
          status: "error",
          progress: 0,
          error: message,
          preview,
        })
      }
    },
    [guestId, uploadPhoto, onUploadComplete]
  )

  /**
   * Handles file drop
   */
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (file) {
        handleUpload(file)
      }
    },
    [handleUpload]
  )

  /**
   * Handles photo deletion
   */
  const handleDelete = async () => {
    try {
      await deletePhoto.mutateAsync(guestId)
      setShowDeleteConfirm(false)
      onDelete?.()
    } catch {
      // Error handled by mutation
    }
  }

  /**
   * Clears upload error state
   */
  const clearError = () => {
    setUploadState({ status: "idle", progress: 0 })
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
    maxSize: 5 * 1024 * 1024, // 5MB
    multiple: false,
    disabled: uploadState.status === "uploading",
  })

  // Loading state
  if (isLoadingPhoto) {
    return (
      <div
        className={`flex items-center justify-center bg-ora-cream rounded-lg ${
          compact ? "h-20 w-20" : "h-32 w-32"
        }`}
      >
        <Loader2 className="h-6 w-6 animate-spin text-ora-stone" />
      </div>
    )
  }

  // Current photo display with option to change
  const currentPhotoUrl = existingPhoto?.publicUrl
  if (currentPhotoUrl && uploadState.status === "idle") {
    return (
      <div className="space-y-3">
        <div
          className={`relative rounded-lg overflow-hidden border border-ora-sand group ${
            compact ? "h-20 w-20" : "h-32 w-32"
          }`}
        >
          <img
            src={currentPhotoUrl}
            alt="Guest photo"
            className="w-full h-full object-cover"
          />
          {/* Overlay with actions */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <div {...getRootProps()}>
              <input {...getInputProps()} />
              <Button
                size="sm"
                variant="secondary"
                className="h-8 w-8 p-0"
                title="Change photo"
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
            <Button
              size="sm"
              variant="danger"
              className="h-8 w-8 p-0"
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete photo"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ora-graphite">Delete photo?</span>
            <Button
              size="sm"
              variant="danger"
              onClick={handleDelete}
              isLoading={deletePhoto.isPending}
            >
              Yes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deletePhoto.isPending}
            >
              No
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Uploading state
  if (uploadState.status === "uploading") {
    return (
      <div
        className={`border-2 border-ora-gold rounded-lg text-center ${
          compact ? "p-3" : "p-6"
        }`}
      >
        {uploadState.preview && (
          <img
            src={uploadState.preview}
            alt="Preview"
            className={`mx-auto object-cover rounded mb-3 ${
              compact ? "h-12 w-12" : "h-20 w-20"
            }`}
          />
        )}
        <div className="flex items-center justify-center gap-2 mb-2">
          <Loader2
            className={`animate-spin text-ora-gold ${
              compact ? "h-4 w-4" : "h-5 w-5"
            }`}
          />
          <span
            className={`font-medium text-ora-charcoal ${
              compact ? "text-xs" : "text-sm"
            }`}
          >
            Uploading...
          </span>
        </div>
        <div className="w-full bg-ora-sand rounded-full h-1.5">
          <div
            className="bg-ora-gold h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${uploadState.progress}%` }}
          />
        </div>
      </div>
    )
  }

  // Success state
  if (uploadState.status === "success") {
    return (
      <div
        className={`border-2 border-green-500 rounded-lg text-center bg-green-50 ${
          compact ? "p-3" : "p-6"
        }`}
      >
        <CheckCircle2
          className={`text-green-500 mx-auto mb-2 ${
            compact ? "h-6 w-6" : "h-10 w-10"
          }`}
        />
        <p
          className={`font-medium text-green-700 ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          Upload complete!
        </p>
      </div>
    )
  }

  // Error state
  if (uploadState.status === "error") {
    return (
      <div
        className={`border-2 border-red-300 rounded-lg text-center bg-red-50 ${
          compact ? "p-3" : "p-6"
        }`}
      >
        <AlertCircle
          className={`text-red-500 mx-auto mb-2 ${
            compact ? "h-6 w-6" : "h-10 w-10"
          }`}
        />
        <p
          className={`font-medium text-red-700 mb-2 ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {uploadState.error}
        </p>
        <Button size="sm" variant="outline" onClick={clearError}>
          Try Again
        </Button>
      </div>
    )
  }

  // Default dropzone (idle state, no existing photo)
  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors
        ${
          isDragActive
            ? "border-ora-gold bg-ora-gold/5"
            : "border-ora-sand hover:border-ora-gold"
        }
        ${compact ? "p-3" : "p-6"}
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-2">
        {isDragActive ? (
          <>
            <Upload
              className={`text-ora-gold ${compact ? "h-6 w-6" : "h-10 w-10"}`}
            />
            <p
              className={`font-medium text-ora-gold ${
                compact ? "text-xs" : "text-sm"
              }`}
            >
              Drop photo here
            </p>
          </>
        ) : (
          <>
            <div
              className={`rounded-full bg-ora-cream flex items-center justify-center ${
                compact ? "h-10 w-10" : "h-16 w-16"
              }`}
            >
              <User
                className={`text-ora-stone ${compact ? "h-5 w-5" : "h-8 w-8"}`}
              />
            </div>
            <div>
              <p
                className={`font-medium text-ora-charcoal ${
                  compact ? "text-xs" : "text-sm"
                }`}
              >
                {compact ? "Add photo" : "Drag & drop a photo"}
              </p>
              {!compact && (
                <p className="text-xs text-ora-graphite mt-1">
                  or click to browse
                </p>
              )}
            </div>
            <p className="text-xs text-ora-graphite">
              {compact ? "JPEG, PNG, WebP • 5MB max" : "JPEG, PNG, WebP • Max 5MB"}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default GuestPhotoUpload
