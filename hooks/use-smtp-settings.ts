/**
 * @fileoverview SMTP Settings Hooks - React hooks for SMTP configuration management
 * 
 * Provides React hooks for SMTP settings operations with:
 * - CRUD operations for SMTP configurations
 * - Connection testing functionality
 * - Default provider management
 * - Optimistic updates and cache invalidation
 * 
 * @module hooks/use-smtp-settings
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * Requirements: 2 (SMTP Configuration Management)
 * 
 * @example
 * ```tsx
 * import { useSMTPSettings, useCreateSMTPSettings, useTestSMTPConnection } from '@/hooks';
 * 
 * function SMTPSettingsPage() {
 *   const { data: settings, isLoading } = useSMTPSettings();
 *   const createSettings = useCreateSMTPSettings();
 *   const testConnection = useTestSMTPConnection();
 *   
 *   const handleCreate = (data) => {
 *     createSettings.mutate(data);
 *   };
 *   
 *   const handleTest = (id, email) => {
 *     testConnection.mutate({ id, testEmail: email });
 *   };
 * }
 * ```
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

// ============================================================================
// TYPES
// ============================================================================

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * SMTP Settings public interface (without encrypted password)
 */
export interface SMTPSettingsPublic {
  id: string
  name: string
  host: string
  port: number
  username: string
  encryption: "tls" | "ssl" | "none"
  fromEmail: string
  fromName: string
  replyToEmail: string | null
  isDefault: boolean
  isActive: boolean
  dailyLimit: number | null
  hourlyLimit: number | null
  hasPassword: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Input for creating SMTP settings
 */
export interface CreateSMTPSettingsInput {
  name: string
  host: string
  port: number
  username: string
  password: string
  encryption?: "tls" | "ssl" | "none"
  fromEmail: string
  fromName: string
  replyToEmail?: string | null
  isDefault?: boolean
  isActive?: boolean
  dailyLimit?: number | null
  hourlyLimit?: number | null
}

/**
 * Input for updating SMTP settings
 */
export interface UpdateSMTPSettingsInput {
  name?: string
  host?: string
  port?: number
  username?: string
  password?: string
  encryption?: "tls" | "ssl" | "none"
  fromEmail?: string
  fromName?: string
  replyToEmail?: string | null
  isDefault?: boolean
  isActive?: boolean
  dailyLimit?: number | null
  hourlyLimit?: number | null
}

/**
 * Test connection result
 */
export interface TestConnectionResult {
  success: boolean
  message: string
  error?: string
}

// ============================================================================
// QUERY KEYS
// ============================================================================

/**
 * Query key factory for SMTP settings.
 * Use these keys for cache invalidation and prefetching.
 */
export const smtpSettingsKeys = {
  all: ["smtp-settings"] as const,
  lists: () => [...smtpSettingsKeys.all, "list"] as const,
  list: () => [...smtpSettingsKeys.lists()] as const,
  details: () => [...smtpSettingsKeys.all, "detail"] as const,
  detail: (id: string) => [...smtpSettingsKeys.details(), id] as const,
  default: () => [...smtpSettingsKeys.all, "default"] as const,
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchSMTPSettings(): Promise<SMTPSettingsPublic[]> {
  const response = await fetch("/api/admin/smtp")
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch SMTP settings")
  }
  return response.json()
}

async function fetchSMTPSettingsById(id: string): Promise<SMTPSettingsPublic> {
  const response = await fetch(`/api/admin/smtp/${id}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch SMTP settings")
  }
  return response.json()
}

async function createSMTPSettings(input: CreateSMTPSettingsInput): Promise<SMTPSettingsPublic> {
  const response = await fetch("/api/admin/smtp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to create SMTP settings")
  }
  return response.json()
}

async function updateSMTPSettings({
  id,
  input,
}: {
  id: string
  input: UpdateSMTPSettingsInput
}): Promise<SMTPSettingsPublic> {
  const response = await fetch(`/api/admin/smtp/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to update SMTP settings")
  }
  return response.json()
}

async function deleteSMTPSettings(id: string): Promise<void> {
  const response = await fetch(`/api/admin/smtp/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to delete SMTP settings")
  }
}

async function setDefaultSMTPSettings(id: string): Promise<SMTPSettingsPublic> {
  const response = await fetch(`/api/admin/smtp/${id}/set-default`, {
    method: "POST",
  })
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to set default SMTP settings")
  }
  return response.json()
}

async function testSMTPConnection({
  id,
  testEmail,
}: {
  id: string
  testEmail: string
}): Promise<TestConnectionResult> {
  const response = await fetch(`/api/admin/smtp/${id}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testEmail }),
  })
  // Don't throw on non-ok response - the API returns success: false for failed tests
  return response.json()
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook for fetching all SMTP settings.
 * 
 * @returns Query result with SMTP settings array
 * 
 * @example
 * ```tsx
 * const { data: settings, isLoading, error } = useSMTPSettings();
 * ```
 * 
 * Requirements: 2.1, 2.7
 */
export function useSMTPSettings() {
  return useQuery({
    queryKey: smtpSettingsKeys.list(),
    queryFn: fetchSMTPSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Hook for fetching a single SMTP settings by ID.
 * 
 * @param id - The SMTP settings ID
 * @returns Query result with SMTP settings
 * 
 * @example
 * ```tsx
 * const { data: settings, isLoading } = useSMTPSettingsById('smtp-123');
 * ```
 * 
 * Requirements: 2.1
 */
export function useSMTPSettingsById(id: string) {
  return useQuery({
    queryKey: smtpSettingsKeys.detail(id),
    queryFn: () => fetchSMTPSettingsById(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Hook for creating new SMTP settings.
 * 
 * Automatically invalidates the settings list cache on success.
 * Shows toast notifications for success/error.
 * 
 * @returns Mutation object with mutate function
 * 
 * @example
 * ```tsx
 * const createSettings = useCreateSMTPSettings();
 * createSettings.mutate({
 *   name: 'Primary SMTP',
 *   host: 'smtp.example.com',
 *   port: 587,
 *   username: 'user@example.com',
 *   password: 'secret',
 *   fromEmail: 'noreply@example.com',
 *   fromName: 'EventOS',
 * });
 * ```
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.7, 2.8
 */
export function useCreateSMTPSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createSMTPSettings,
    onError: (err) => {
      toast.error(err.message || "Failed to create SMTP settings")
    },
    onSuccess: () => {
      toast.success("SMTP settings created successfully")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: smtpSettingsKeys.lists() })
    },
  })
}

/**
 * Hook for updating existing SMTP settings.
 * 
 * Automatically invalidates the settings list and detail cache on success.
 * Shows toast notifications for success/error.
 * 
 * @returns Mutation object with mutate function
 * 
 * @example
 * ```tsx
 * const updateSettings = useUpdateSMTPSettings();
 * updateSettings.mutate({
 *   id: 'smtp-123',
 *   input: { name: 'Updated SMTP' },
 * });
 * ```
 * 
 * Requirements: 2.1, 2.2, 2.3
 */
export function useUpdateSMTPSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateSMTPSettings,
    onError: (err) => {
      toast.error(err.message || "Failed to update SMTP settings")
    },
    onSuccess: () => {
      toast.success("SMTP settings updated successfully")
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: smtpSettingsKeys.lists() })
      queryClient.invalidateQueries({ queryKey: smtpSettingsKeys.detail(id) })
    },
  })
}

/**
 * Hook for deleting SMTP settings.
 * 
 * Automatically invalidates the settings list cache on success.
 * Shows toast notifications for success/error.
 * 
 * @returns Mutation object with mutate function
 * 
 * @example
 * ```tsx
 * const deleteSettings = useDeleteSMTPSettings();
 * deleteSettings.mutate('smtp-123');
 * ```
 * 
 * Requirements: 2.1
 */
export function useDeleteSMTPSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteSMTPSettings,
    onError: (err) => {
      toast.error(err.message || "Failed to delete SMTP settings")
    },
    onSuccess: () => {
      toast.success("SMTP settings deleted successfully")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: smtpSettingsKeys.lists() })
    },
  })
}

/**
 * Hook for setting an SMTP configuration as default.
 * 
 * Automatically invalidates the settings list cache on success.
 * Shows toast notifications for success/error.
 * 
 * @returns Mutation object with mutate function
 * 
 * @example
 * ```tsx
 * const setDefault = useSetDefaultSMTPSettings();
 * setDefault.mutate('smtp-123');
 * ```
 * 
 * Requirements: 2.7
 */
export function useSetDefaultSMTPSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: setDefaultSMTPSettings,
    onError: (err) => {
      toast.error(err.message || "Failed to set default SMTP settings")
    },
    onSuccess: () => {
      toast.success("Default SMTP provider updated")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: smtpSettingsKeys.lists() })
    },
  })
}

/**
 * Hook for testing SMTP connection.
 * 
 * Sends a test email to verify the SMTP configuration.
 * Shows toast notifications for success/error based on test result.
 * 
 * @returns Mutation object with mutate function
 * 
 * @example
 * ```tsx
 * const testConnection = useTestSMTPConnection();
 * testConnection.mutate({
 *   id: 'smtp-123',
 *   testEmail: 'test@example.com',
 * });
 * ```
 * 
 * Requirements: 2.4, 2.5, 2.6
 */
export function useTestSMTPConnection() {
  return useMutation({
    mutationFn: testSMTPConnection,
    onError: (err) => {
      toast.error(err.message || "Failed to test SMTP connection")
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error || result.message)
      }
    },
  })
}
