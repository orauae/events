/**
 * @fileoverview Automation Execution hooks - TanStack Query hooks for execution logs
 * 
 * Provides React hooks for querying automation execution history:
 * - Paginated execution list for an automation
 * - Detailed execution view with step-by-step history
 * - Sync execution status from Trigger.dev
 * 
 * @module hooks/use-automation-executions
 * @requires @tanstack/react-query
 * 
 * @example
 * ```tsx
 * import { useAutomationExecutions, useExecutionDetails } from '@/hooks';
 * 
 * function ExecutionLogs({ automationId }) {
 *   const { data } = useAutomationExecutions(automationId);
 *   
 *   return (
 *     <ul>
 *       {data?.executions.map(exec => (
 *         <li key={exec.id}>{exec.status}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { AutomationExecution, ExecutionStep, ExecutionStatus } from "@/db/schema"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Execution with its steps for detailed view.
 */
export interface ExecutionWithSteps extends AutomationExecution {
  steps: ExecutionStep[]
}

/**
 * Paginated result for execution queries.
 */
export interface PaginatedExecutions {
  executions: AutomationExecution[]
  total: number
  limit: number
  offset: number
}

/**
 * Result of syncing a single execution status.
 */
export interface SyncResult {
  executionId: string
  triggerDevRunId: string
  previousStatus: ExecutionStatus
  newStatus: ExecutionStatus
  triggerDevStatus: string
  updated: boolean
  error?: string
}

/**
 * Result of syncing multiple executions.
 */
export interface BatchSyncResult {
  synced: number
  failed: number
  unchanged: number
  results: SyncResult[]
}

/**
 * Query key factory for executions.
 * Use these keys for cache invalidation and prefetching.
 */
export const executionKeys = {
  all: ["executions"] as const,
  lists: () => [...executionKeys.all, "list"] as const,
  listByAutomation: (automationId: string, options?: { limit?: number; offset?: number }) =>
    [...executionKeys.lists(), { automationId, ...options }] as const,
  details: () => [...executionKeys.all, "detail"] as const,
  detail: (automationId: string, executionId: string) =>
    [...executionKeys.details(), { automationId, executionId }] as const,
}

// Fetch functions
async function fetchExecutionsByAutomation(
  automationId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<PaginatedExecutions> {
  const params = new URLSearchParams()
  if (options.limit) params.set("limit", String(options.limit))
  if (options.offset) params.set("offset", String(options.offset))

  const url = `/api/automations/${automationId}/executions${params.toString() ? `?${params}` : ""}`
  const response = await fetch(url)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch executions")
  }
  return response.json()
}

async function fetchExecution(
  automationId: string,
  executionId: string
): Promise<ExecutionWithSteps> {
  const response = await fetch(`/api/automations/${automationId}/executions/${executionId}`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch execution")
  }
  return response.json()
}

/**
 * Sync execution status from Trigger.dev
 * Requirements: 10.6
 */
async function syncExecutionStatus(
  automationId: string,
  executionId: string
): Promise<SyncResult> {
  const response = await fetch(
    `/api/automations/${automationId}/executions/${executionId}/sync`,
    { method: "POST" }
  )
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to sync execution status")
  }
  return response.json()
}

/**
 * Sync all running executions for an automation
 * Requirements: 10.6
 */
async function syncAllExecutions(automationId: string): Promise<BatchSyncResult> {
  const response = await fetch(
    `/api/automations/${automationId}/executions/sync`,
    { method: "POST" }
  )
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to sync execution statuses")
  }
  return response.json()
}

// Hooks

/**
 * Query execution history for an automation with pagination
 * Requirements: 7.2
 */
export function useAutomationExecutions(
  automationId: string,
  options: { limit?: number; offset?: number } = {}
) {
  return useQuery({
    queryKey: executionKeys.listByAutomation(automationId, options),
    queryFn: () => fetchExecutionsByAutomation(automationId, options),
    enabled: !!automationId,
  })
}

/**
 * Query execution details with steps
 * Requirements: 7.3
 */
export function useExecutionDetails(automationId: string, executionId: string) {
  return useQuery({
    queryKey: executionKeys.detail(automationId, executionId),
    queryFn: () => fetchExecution(automationId, executionId),
    enabled: !!automationId && !!executionId,
  })
}

/**
 * Mutation to sync a single execution status from Trigger.dev
 * Requirements: 10.6
 */
export function useSyncExecutionStatus(automationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (executionId: string) => syncExecutionStatus(automationId, executionId),
    onSuccess: (result, executionId) => {
      // Invalidate execution queries to refresh data
      queryClient.invalidateQueries({
        queryKey: executionKeys.detail(automationId, executionId),
      })
      queryClient.invalidateQueries({
        queryKey: executionKeys.lists(),
      })
    },
  })
}

/**
 * Mutation to sync all running executions for an automation
 * Requirements: 10.6
 */
export function useSyncAllExecutions(automationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => syncAllExecutions(automationId),
    onSuccess: () => {
      // Invalidate all execution queries for this automation
      queryClient.invalidateQueries({
        queryKey: executionKeys.lists(),
      })
    },
  })
}
