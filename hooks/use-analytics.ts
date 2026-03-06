/**
 * @fileoverview Analytics hooks - TanStack Query hooks for analytics data
 * 
 * Provides React hooks for fetching event and campaign analytics:
 * - Event metrics (RSVP breakdown, check-in rates, automation stats)
 * - Campaign metrics (delivery rates)
 * - Dashboard statistics for event managers
 * - Auto-refresh for real-time updates
 * 
 * @module hooks/use-analytics
 * @requires @tanstack/react-query
 * 
 * @example
 * ```tsx
 * import { useEventAnalytics, useDashboardStats } from '@/hooks';
 * 
 * function EventDashboard({ eventId }) {
 *   const { data: analytics } = useEventAnalytics(eventId);
 *   
 *   return (
 *     <div>
 *       <p>Attending: {analytics?.rsvpBreakdown.attending}</p>
 *       <p>Check-in rate: {analytics?.checkInRate.toFixed(1)}%</p>
 *     </div>
 *   );
 * }
 * ```
 * 
 * Requirements: 6.2, 8.1, 8.2, 8.3
 */

"use client"

import { useQuery } from "@tanstack/react-query"
import type { EventAnalytics, CampaignAnalytics, DashboardStats } from "@/lib/services"

/**
 * API error response structure
 */
interface APIError {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Query key factory for analytics.
 * Use these keys for cache invalidation and prefetching.
 */
export const analyticsKeys = {
  all: ["analytics"] as const,
  event: (eventId: string) => [...analyticsKeys.all, "event", eventId] as const,
  campaign: (campaignId: string) => [...analyticsKeys.all, "campaign", campaignId] as const,
  dashboard: () => [...analyticsKeys.all, "dashboard"] as const,
}

// Fetch functions
async function fetchEventAnalytics(eventId: string): Promise<EventAnalytics> {
  const response = await fetch(`/api/events/${eventId}/analytics`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch event analytics")
  }
  return response.json()
}

async function fetchCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics> {
  const response = await fetch(`/api/campaigns/${campaignId}/analytics`)
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch campaign analytics")
  }
  return response.json()
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const response = await fetch("/api/dashboard-stats")
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch dashboard stats")
  }
  return response.json()
}

/**
 * Fetches event analytics with auto-refresh.
 * 
 * Automatically refetches every 30 seconds for real-time updates.
 * 
 * @param eventId - The event ID to fetch analytics for
 * @returns Query result with analytics data
 * 
 * @example
 * ```tsx
 * const { data: analytics, isLoading } = useEventAnalytics('event123');
 * ```
 */
export function useEventAnalytics(eventId: string) {
  return useQuery({
    queryKey: analyticsKeys.event(eventId),
    queryFn: () => fetchEventAnalytics(eventId),
    enabled: !!eventId,
    // Refetch every 30 seconds for real-time updates (Requirement 8.4)
    refetchInterval: 30000,
  })
}

/**
 * Fetches campaign analytics.
 * 
 * @param campaignId - The campaign ID to fetch analytics for
 * @returns Query result with campaign analytics
 * 
 * @example
 * ```tsx
 * const { data: analytics } = useCampaignAnalytics('campaign123');
 * console.log(`Delivery rate: ${analytics?.deliveryRate}%`);
 * ```
 */
export function useCampaignAnalytics(campaignId: string) {
  return useQuery({
    queryKey: analyticsKeys.campaign(campaignId),
    queryFn: () => fetchCampaignAnalytics(campaignId),
    enabled: !!campaignId,
  })
}

/**
 * Fetches dashboard statistics for the current user.
 * 
 * Returns aggregated statistics across all events assigned to the user:
 * - Total guests across all assigned events
 * - Number of events (total and upcoming)
 * - Pending RSVPs
 * - Total attending and checked-in guests
 * 
 * @returns Query result with dashboard statistics
 * 
 * @example
 * ```tsx
 * const { data: stats, isLoading } = useDashboardStats();
 * console.log(`Total events: ${stats?.totalEvents}`);
 * console.log(`Upcoming events: ${stats?.upcomingEvents}`);
 * ```
 * 
 * Requirements: 6.2
 */
export function useDashboardStats() {
  return useQuery({
    queryKey: analyticsKeys.dashboard(),
    queryFn: fetchDashboardStats,
    // Refetch every 60 seconds for dashboard updates
    refetchInterval: 60000,
    staleTime: 30000, // Consider data stale after 30 seconds
  })
}
