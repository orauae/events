import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Represents an uploaded file
 */
export interface UploadedFile {
  id: string;
  filename: string;
  publicUrl: string;
  size: number;
  mimeType: string;
  createdAt?: string;
}

/**
 * Upload progress state
 */
export interface UploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  result?: UploadedFile;
}

/**
 * Error response from API
 */
interface APIError {
  code: string;
  message: string;
}

/**
 * Generic file upload response
 */
interface UploadResponse {
  id: string;
  publicUrl?: string;
  url?: string;
  filename?: string;
  originalFilename?: string;
  size?: number;
  fileSize?: number;
  mimeType?: string;
  width?: number;
  height?: number;
}

/**
 * Hook configuration options
 */
export interface UseFileUploadOptions {
  /** Base endpoint for the upload API (e.g., '/api/campaigns/123/attachments') */
  endpoint: string;
  /** Query key for cache invalidation */
  queryKey?: string[];
  /** Callback when upload completes */
  onSuccess?: (file: UploadedFile) => void;
  /** Callback when upload fails */
  onError?: (error: Error) => void;
}

/**
 * Upload a single file to the server
 */
async function uploadFile(endpoint: string, file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error: APIError = await response.json();
    throw new Error(error.message || 'Failed to upload file');
  }

  const data: UploadResponse = await response.json();

  return {
    id: data.id,
    filename: data.filename || data.originalFilename || file.name,
    publicUrl: data.publicUrl || data.url || '',
    size: data.size || data.fileSize || file.size,
    mimeType: data.mimeType || file.type,
  };
}

/**
 * Fetch list of uploaded files
 */
async function fetchFiles(endpoint: string): Promise<UploadedFile[]> {
  const response = await fetch(endpoint);

  if (!response.ok) {
    const error: APIError = await response.json();
    throw new Error(error.message || 'Failed to fetch files');
  }

  return response.json();
}

/**
 * Delete a file
 */
async function deleteFile(endpoint: string, fileId: string): Promise<void> {
  const response = await fetch(`${endpoint}/${fileId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error: APIError = await response.json();
    throw new Error(error.message || 'Failed to delete file');
  }
}

/**
 * Hook for managing file uploads to R2 storage
 * 
 * @example
 * ```tsx
 * const { files, upload, remove, isUploading } = useFileUpload({
 *   endpoint: `/api/campaigns/${campaignId}/attachments`,
 *   queryKey: ['campaign-attachments', campaignId],
 * });
 * ```
 */
export function useFileUpload({
  endpoint,
  queryKey,
  onSuccess,
  onError,
}: UseFileUploadOptions) {
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);

  // Fetch existing files
  const {
    data: files = [],
    isLoading,
    error: fetchError,
    refetch,
  } = useQuery<UploadedFile[], Error>({
    queryKey: queryKey || ['files', endpoint],
    queryFn: () => fetchFiles(endpoint),
    enabled: !!endpoint,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadFile(endpoint, file),
    onSuccess: (result) => {
      // Update progress state
      setUploadProgress((prev) =>
        prev.map((p) =>
          p.file.name === result.filename
            ? { ...p, status: 'success' as const, progress: 100, result }
            : p
        )
      );

      // Invalidate cache
      if (queryKey) {
        queryClient.invalidateQueries({ queryKey });
      }

      onSuccess?.(result);
    },
    onError: (error: Error, file: File) => {
      setUploadProgress((prev) =>
        prev.map((p) =>
          p.file.name === file.name
            ? { ...p, status: 'error' as const, error: error.message }
            : p
        )
      );
      onError?.(error);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => deleteFile(endpoint, fileId),
    onSuccess: () => {
      if (queryKey) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (error: Error) => {
      onError?.(error);
    },
  });

  /**
   * Upload a single file
   */
  const upload = useCallback(
    async (file: File) => {
      // Add to progress tracking
      setUploadProgress((prev) => [
        ...prev,
        { file, progress: 0, status: 'uploading' },
      ]);

      try {
        return await uploadMutation.mutateAsync(file);
      } catch (error) {
        throw error;
      }
    },
    [uploadMutation]
  );

  /**
   * Upload multiple files
   */
  const uploadMultiple = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const results: UploadedFile[] = [];

      for (const file of files) {
        try {
          const result = await upload(file);
          results.push(result);
        } catch {
          // Continue with other files even if one fails
        }
      }

      return results;
    },
    [upload]
  );

  /**
   * Remove a file
   */
  const remove = useCallback(
    async (fileId: string) => {
      await deleteMutation.mutateAsync(fileId);
    },
    [deleteMutation]
  );

  /**
   * Clear upload progress for completed/failed uploads
   */
  const clearProgress = useCallback(() => {
    setUploadProgress((prev) =>
      prev.filter((p) => p.status === 'uploading' || p.status === 'pending')
    );
  }, []);

  return {
    /** List of uploaded files */
    files,
    /** Whether files are being loaded */
    isLoading,
    /** Error from fetching files */
    fetchError,
    /** Refetch files list */
    refetch,
    /** Upload a single file */
    upload,
    /** Upload multiple files */
    uploadMultiple,
    /** Remove a file by ID */
    remove,
    /** Whether an upload is in progress */
    isUploading: uploadMutation.isPending,
    /** Whether a delete is in progress */
    isDeleting: deleteMutation.isPending,
    /** Current upload progress */
    uploadProgress,
    /** Clear completed/failed upload progress */
    clearProgress,
  };
}

export default useFileUpload;
