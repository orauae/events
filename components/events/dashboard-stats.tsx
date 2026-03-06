"use client"

import { Calendar, Users, Clock, CheckCircle, Mail, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboardStats } from "@/hooks/use-analytics"

/**
 * Dashboard statistics component for event managers.
 * 
 * Displays summary statistics across all assigned events:
 * - Total guests
 * - Upcoming events
 * - Pending RSVPs
 * - Total attending
 * - Total checked-in
 * 
 * Requirements: 6.2
 */
export function DashboardStats() {
  const { data: stats, isLoading, error } = useDashboardStats()

  if (error) {
    return null // Silently fail - stats are supplementary
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-12" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!stats || stats.totalEvents === 0) {
    return null // Don't show stats if no events
  }

  const statItems = [
    {
      label: "Total Events",
      value: stats.totalEvents,
      icon: Calendar,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      label: "Upcoming Events",
      value: stats.upcomingEvents,
      icon: Clock,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
    },
    {
      label: "Total Guests",
      value: stats.totalGuests,
      icon: Users,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      label: "Pending RSVPs",
      value: stats.pendingRsvps,
      icon: Mail,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      label: "Confirmed Attending",
      value: stats.totalAttending,
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      label: "Checked In",
      value: stats.totalCheckedIn,
      icon: CheckCircle,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6">
      {statItems.map((item) => (
        <Card key={item.label} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${item.bgColor}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <p className="text-xs text-ora-graphite">{item.label}</p>
                <p className="text-xl font-semibold text-ora-charcoal">
                  {item.value.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
