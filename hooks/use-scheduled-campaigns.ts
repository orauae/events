/**
 * @fileoverview Hook for fetching scheduled campaigns
 * 
 * Provides React Query hooks for fetching scheduled campaigns
 * for the calendar view and other scheduling-related features.
 * 
 * @module hooks/use-scheduled-campaigns
 * @requires @tanstack/react-query
 * 
 * Requirements: 13.3 - Display scheduled campaigns in a calendar view
 */

import { useQuery } from "@tanstack/react-query"
import type { ScheduledCampaign } from "@/components/admin/scheduled-campaigns-calendar"

/**
 * Fetch scheduled campaigns for a date range
 */
async function fetchScheduledCampaigns(
  startDate: Date,
  endDate: Date
): Promise<ScheduledCampaign[]> {
  const params = new URLSearchParams({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  })
  
  const response = await fetch(`/api/admin/campaigns/scheduled?${params.toString()}`)
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to fetch scheduled campaigns")
  }
  
  const data = await response.json()
  
  // Transform dates from strings to Date objects
  return data.map((campaign: ScheduledCampaign & { scheduledAt: string }) => ({
    ...campaign,
    scheduledAt: new Date(campaign.scheduledAt),
  }))
}

/**
 * Hook for fetching scheduled campaigns within a date range
 * 
 * @param startDate - Start of the date range
 * @param endDate - End of the date range
 * @param options - Additional query options
 * @returns Query result with scheduled campaigns
 * 
 * @example
 * ```tsx
 * const { data: campaigns, isLoading } = useScheduledCampaigns(
 *   new Date('2025-01-01'),
 *   new Date('2025-01-31')
 * )
 * ```
 */
export function useScheduledCampaigns(
  startDate: Date,
  endDate: Date,
  options?: {
    enabled?: boolean
    refetchInterval?: number
  }
) {
  return useQuery({
    queryKey: ["scheduled-campaigns", startDate.toISOString(), endDate.toISOString()],
    queryFn: () => fetchScheduledCampaigns(startDate, endDate),
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
    staleTime: 30000, // 30 seconds
  })
}

/**
 * Hook for fetching scheduled campaigns for a specific month
 * 
 * @param year - Year
 * @param month - Month (0-11)
 * @param options - Additional query options
 * @returns Query result with scheduled campaigns
 * 
 * @example
 * ```tsx
 * const { data: campaigns, isLoading } = useScheduledCampaignsForMonth(2025, 0)
 * ```
 */
export function useScheduledCampaignsForMonth(
  year: number,
  month: number,
  options?: {
    enabled?: boolean
    refetchInterval?: number
  }
) {
  // Calculate start and end of month with some padding for calendar display
  const startDate = new Date(year, month, 1)
  startDate.setDate(startDate.getDate() - 7) // Include previous week for calendar padding
  
  const endDate = new Date(year, month + 1, 0)
  endDate.setDate(endDate.getDate() + 7) // Include next week for calendar padding
  
  return useScheduledCampaigns(startDate, endDate, options)
}

/**
 * Hook for fetching upcoming scheduled campaigns
 * 
 * @param days - Number of days to look ahead (default: 30)
 * @param options - Additional query options
 * @returns Query result with upcoming scheduled campaigns
 * 
 * @example
 * ```tsx
 * const { data: upcoming, isLoading } = useUpcomingScheduledCampaigns(7)
 * ```
 */
export function useUpcomingScheduledCampaigns(
  days: number = 30,
  options?: {
    enabled?: boolean
    refetchInterval?: number
  }
) {
  const startDate = new Date()
  const endDate = new Date()
  endDate.setDate(endDate.getDate() + days)
  
  return useScheduledCampaigns(startDate, endDate, options)
}

export default useScheduledCampaigns
