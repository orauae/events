'use client';

import { useCallback, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Upload, X, FileIcon, ImageIcon, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { Progress } from '@/components/ui/progress';

export interface FileUploadProps {
  /**
   * Callback when files are successfully uploaded
   */
  onUpload: (files: UploadedFile[]) => void;
  /**
   * Callback when an error occurs during upload
   */
  onError?: (error: Error) => void;
  /**
   * API endpoint to upload files to
   */
  uploadEndpoint: string;
  /**
   * Accepted file types (MIME types)
   * @default ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
   */
  accept?: string[];
  /**
   * Maximum file size in bytes
   * @default 10MB (10 * 1024 * 1024)
   */
  maxSize?: number;
  /**
   * Allow multiple files
   * @default false
   */
  multiple?: boolean;
  /**
   * Custom class name for the container
   */
  className?: string;
  /**
   * Disabled state
   */
  disabled?: boolean;
  /**
   * Placeholder text
   */
  placeholder?: string;
  /**
   * Show file preview after upload
   * @default true
   */
  showPreview?: boolean;
  /**
   * Type of files being uploaded (for display purposes)
   */
  fileType?: 'image' | 'document' | 'any';
}

export interface UploadedFile {
  id: string;
  publicUrl: string;
  filename: string;
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
}

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
  result?: UploadedFile;
}

const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateTempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function FileUpload({
  onUpload,
  onError,
  uploadEndpoint,
  accept = DEFAULT_ACCEPT,
  maxSize = DEFAULT_MAX_SIZE,
  multiple = false,
  className,
  disabled = false,
  placeholder,
  showPreview = true,
  fileType = 'image',
}: FileUploadProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!accept.includes(file.type)) {
        const acceptedExts = accept
          .map((type) => type.split('/')[1]?.toUpperCase())
          .join(', ');
        return `Invalid file type. Accepted: ${acceptedExts}`;
      }
      if (file.size > maxSize) {
        return `File too large. Maximum size: ${formatFileSize(maxSize)}`;
      }
      return null;
    },
    [accept, maxSize]
  );

  const uploadFile = useCallback(
    async (file: File, tempId: string) => {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadingFiles((prev) =>
              prev.map((f) => (f.id === tempId ? { ...f, progress } : f))
            );
          }
        });

        // Handle completion
        const result = await new Promise<UploadedFile>((resolve, reject) => {
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = JSON.parse(xhr.responseText);
                resolve({
                  id: response.id,
                  publicUrl: response.publicUrl || response.url,
                  filename: file.name,
                  size: file.size,
                  mimeType: file.type,
                  width: response.width,
                  height: response.height,
                });
              } catch {
                reject(new Error('Invalid server response'));
              }
            } else {
              try {
                const error = JSON.parse(xhr.responseText);
                reject(new Error(error.message || 'Upload failed'));
              } catch {
                reject(new Error(`Upload failed: ${xhr.statusText}`));
              }
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
          });

          xhr.addEventListener('abort', () => {
            reject(new Error('Upload cancelled'));
          });

          xhr.open('POST', uploadEndpoint);
          xhr.send(formData);
        });

        // Update state with success
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? { ...f, status: 'success' as const, progress: 100, result }
              : f
          )
        );

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Upload failed';
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? { ...f, status: 'error' as const, error: errorMessage }
              : f
          )
        );
        throw error;
      }
    },
    [uploadEndpoint]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const filesToUpload = multiple ? fileArray : fileArray.slice(0, 1);

      // Validate and prepare files
      const preparedFiles: UploadingFile[] = [];
      const errors: string[] = [];

      for (const file of filesToUpload) {
        const validationError = validateFile(file);
        if (validationError) {
          errors.push(`${file.name}: ${validationError}`);
          continue;
        }

        preparedFiles.push({
          id: generateTempId(),
          file,
          progress: 0,
          status: 'uploading',
        });
      }

      if (errors.length > 0) {
        onError?.(new Error(errors.join('\n')));
      }

      if (preparedFiles.length === 0) return;

      // Add to uploading state
      setUploadingFiles((prev) => [...prev, ...preparedFiles]);

      // Upload files
      const results: UploadedFile[] = [];

      for (const preparedFile of preparedFiles) {
        try {
          const result = await uploadFile(preparedFile.file, preparedFile.id);
          results.push(result);
        } catch (error) {
          console.error('Upload error:', error);
        }
      }

      if (results.length > 0) {
        onUpload(results);
      }
    },
    [multiple, validateFile, uploadFile, onUpload, onError]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (!disabled && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [disabled, handleFiles]
  );

  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }, [disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
        // Reset input value to allow uploading the same file again
        e.target.value = '';
      }
    },
    [handleFiles]
  );

  const removeFile = useCallback((id: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <ImageIcon className="h-4 w-4" />;
    }
    return <FileIcon className="h-4 w-4" />;
  };

  const getPlaceholderText = () => {
    if (placeholder) return placeholder;
    switch (fileType) {
      case 'image':
        return 'Drop images here or click to browse';
      case 'document':
        return 'Drop files here or click to browse';
      default:
        return 'Drop files here or click to browse';
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drop zone */}
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
          isDragOver && !disabled
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleClick();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={accept.join(',')}
          multiple={multiple}
          onChange={handleInputChange}
          disabled={disabled}
        />

        <Upload
          className={cn(
            'mb-2 h-8 w-8',
            isDragOver ? 'text-primary' : 'text-muted-foreground'
          )}
        />
        <p className="text-sm text-muted-foreground">{getPlaceholderText()}</p>
        <p className="mt-1 text-xs text-muted-foreground/75">
          Max size: {formatFileSize(maxSize)}
        </p>
      </div>

      {/* Uploading files list */}
      {showPreview && uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 rounded-lg border bg-card p-3"
            >
              {/* File icon or preview */}
              {file.file.type.startsWith('image/') && file.result?.publicUrl ? (
                <img
                  src={file.result.publicUrl}
                  alt={file.file.name}
                  className="h-10 w-10 rounded object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                  {getFileIcon(file.file.type)}
                </div>
              )}

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{file.file.name}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.file.size)}
                  </p>
                  {file.status === 'uploading' && (
                    <Progress value={file.progress} className="h-1 flex-1" />
                  )}
                  {file.status === 'success' && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle className="h-3 w-3" />
                      Uploaded
                    </span>
                  )}
                  {file.status === 'error' && (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {file.error}
                    </span>
                  )}
                </div>
              </div>

              {/* Remove button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(file.id);
                }}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Remove</span>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FileUpload;
