"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Users,
  UserCheck,
  UserX,
  HelpCircle,
  Clock,
  CheckCircle2,
  X,
  Maximize,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui"
import type { PresentationStats } from "@/lib/services"

interface PresentationModeProps {
  eventId: string
  refreshInterval?: number // default 30000ms (30 seconds)
  onExit?: () => void
}

/**
 * Fetches presentation stats from the API
 */
async function fetchPresentationStats(eventId: string): Promise<PresentationStats> {
  const response = await fetch(`/api/events/${eventId}/presentation-stats`)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to fetch presentation stats")
  }
  return response.json()
}

/**
 * Stat Card Component for presentation mode
 */
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  variant?: "default" | "success" | "warning" | "info" | "danger"
}) {
  const variantStyles = {
    default: "text-ora-gold bg-ora-gold/20",
    success: "text-green-400 bg-green-500/20",
    warning: "text-amber-400 bg-amber-500/20",
    info: "text-blue-400 bg-blue-500/20",
    danger: "text-red-400 bg-red-500/20",
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 md:p-8 flex flex-col items-center justify-center text-center min-w-0">
      <div className={`p-3 md:p-4 rounded-full ${variantStyles[variant]} mb-3 md:mb-4`}>
        <Icon className="h-6 w-6 md:h-8 md:w-8" />
      </div>
      <p className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-1 md:mb-2">{value}</p>
      <p className="text-base md:text-lg lg:text-xl text-white/80 font-medium whitespace-nowrap">{title}</p>
      {subtitle && (
        <p className="text-xs md:text-sm text-white/60 mt-1">{subtitle}</p>
      )}
    </div>
  )
}

/**
 * RSVP Breakdown Bar for presentation mode
 */
function RSVPBreakdownBar({
  breakdown,
  total,
}: {
  breakdown: {
    attending: number
    notAttending: number
    pending: number
  }
  total: number
}) {
  const items = [
    { label: "Attending", value: breakdown.attending, color: "bg-green-500" },
    { label: "Not Attending", value: breakdown.notAttending, color: "bg-red-500" },
    { label: "Pending", value: breakdown.pending, color: "bg-gray-400" },
  ]

  return (
    <div className="w-full">
      {/* Stacked bar */}
      <div className="h-6 md:h-8 rounded-full overflow-hidden flex bg-white/20 mb-4 md:mb-6">
        {items.map((item) => {
          const percentage = total > 0 ? (item.value / total) * 100 : 0
          if (percentage === 0) return null
          return (
            <div
              key={item.label}
              className={`${item.color} transition-all duration-500`}
              style={{ width: `${percentage}%` }}
            />
          )
        })}
      </div>
      
      {/* Legend - Grid layout for better responsiveness */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
        {items.map((item) => {
          const percentage = total > 0 ? (item.value / total) * 100 : 0
          return (
            <div key={item.label} className="flex items-center gap-2 md:gap-3 justify-center bg-white/5 rounded-lg p-2 md:p-3">
              <div className={`w-3 h-3 md:w-4 md:h-4 rounded-full ${item.color} shrink-0`} />
              <div className="flex flex-col items-start min-w-0">
                <span className="text-white/70 text-xs md:text-sm">{item.label}</span>
                <span className="font-bold text-white text-lg md:text-xl">{item.value}
                  <span className="text-white/50 text-xs md:text-sm ml-1">({percentage.toFixed(0)}%)</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * PresentationMode Component
 * 
 * Displays event statistics in a fullscreen, distraction-free layout.
 * Auto-refreshes statistics at a configurable interval.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.5
 */
export function PresentationMode({
  eventId,
  refreshInterval = 30000,
  onExit,
}: PresentationModeProps) {
  const [stats, setStats] = useState<PresentationStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch stats function
  const fetchStats = useCallback(async () => {
    try {
      const data = await fetchPresentationStats(eventId)
      setStats(data)
      setLastRefresh(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats")
    } finally {
      setIsLoading(false)
    }
  }, [eventId])

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchStats()
    
    // Set up auto-refresh interval (Requirements: 7.3)
    const intervalId = setInterval(fetchStats, refreshInterval)
    
    return () => clearInterval(intervalId)
  }, [fetchStats, refreshInterval])

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  // Handle Escape key to exit (Requirements: 7.4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleExit()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Enter fullscreen (Requirements: 7.2)
  const enterFullscreen = useCallback(async () => {
    try {
      if (containerRef.current && document.fullscreenEnabled) {
        await containerRef.current.requestFullscreen()
      }
    } catch (err) {
      console.error("Failed to enter fullscreen:", err)
    }
  }, [])

  // Exit fullscreen and presentation mode
  const handleExit = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.error("Failed to exit fullscreen:", err)
    }
    onExit?.()
  }, [onExit])

  // Manual refresh
  const handleManualRefresh = useCallback(() => {
    setIsLoading(true)
    fetchStats()
  }, [fetchStats])

  // Format time since last refresh
  const formatLastRefresh = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  if (error) {
    return (
      <div
        ref={containerRef}
        className="fixed inset-0 z-50 bg-gradient-to-br from-ora-charcoal to-ora-graphite flex items-center justify-center"
      >
        <div className="text-center text-white">
          <p className="text-2xl mb-4">Failed to load presentation</p>
          <p className="text-white/60 mb-6">{error}</p>
          <div className="flex gap-4 justify-center">
            <Button variant="secondary" onClick={handleManualRefresh}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
            <Button variant="outline" onClick={handleExit}>
              Exit
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-gradient-to-br from-ora-charcoal via-ora-graphite to-ora-charcoal overflow-auto"
    >
      {/* Header with controls */}
      <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          {!isFullscreen && (
            <Button
              variant="ghost"
              size="sm"
              onClick={enterFullscreen}
              className="text-white/60 hover:text-white hover:bg-white/10"
            >
              <Maximize className="h-4 w-4" />
              Fullscreen
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isLoading}
            className="text-white/60 hover:text-white hover:bg-white/10"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-white/40 text-sm">
            Last updated: {formatLastRefresh(lastRefresh)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleExit}
            className="text-white/60 hover:text-white hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="min-h-full flex flex-col items-center justify-center px-4 md:px-8 lg:px-16 py-20 md:py-24">
        {isLoading && !stats ? (
          <div className="text-white text-2xl">Loading...</div>
        ) : stats ? (
          <>
            {/* Event name */}
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-8 md:mb-12 text-center max-w-5xl">
              {stats.eventName}
            </h1>

            {/* Main stats grid - Requirements: 7.5 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8 md:mb-12 w-full max-w-7xl">
              <StatCard
                title="Total Guests"
                value={stats.totalGuests}
                icon={Users}
                variant="default"
              />
              <StatCard
                title="Attending"
                value={stats.rsvpBreakdown.attending}
                icon={UserCheck}
                variant="success"
              />
              <StatCard
                title="Checked In"
                value={stats.checkInStats.checkedIn}
                subtitle={`${stats.checkInStats.percentage.toFixed(1)}% of attending`}
                icon={CheckCircle2}
                variant="info"
              />
              <StatCard
                title="Pending RSVP"
                value={stats.rsvpBreakdown.pending}
                icon={Clock}
                variant="warning"
              />
            </div>

            {/* RSVP Breakdown */}
            <div className="w-full max-w-5xl mb-8 md:mb-12">
              <h2 className="text-xl md:text-2xl font-semibold text-white mb-4 md:mb-6 text-center">
                RSVP Breakdown
              </h2>
              <RSVPBreakdownBar
                breakdown={stats.rsvpBreakdown}
                total={stats.totalGuests}
              />
            </div>

            {/* Check-in progress */}
            <div className="w-full max-w-5xl">
              <h2 className="text-xl md:text-2xl font-semibold text-white mb-4 md:mb-6 text-center">
                Check-in Progress
              </h2>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 md:p-8">
                <div className="flex items-center justify-between mb-4 gap-4">
                  <span className="text-white/80 text-sm md:text-lg whitespace-nowrap">
                    {stats.checkInStats.checkedIn} of {stats.rsvpBreakdown.attending} attending guests
                  </span>
                  <span className="text-2xl md:text-4xl font-bold text-white whitespace-nowrap">
                    {stats.checkInStats.percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="h-4 md:h-6 rounded-full overflow-hidden bg-white/20">
                  <div
                    className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
                    style={{ width: `${Math.min(stats.checkInStats.percentage, 100)}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="flex items-center gap-2 justify-center bg-white/5 rounded-lg p-3">
                    <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                    <span className="text-white/80 text-sm md:text-base whitespace-nowrap">Checked in: <span className="font-bold text-white">{stats.checkInStats.checkedIn}</span></span>
                  </div>
                  <div className="flex items-center gap-2 justify-center bg-white/5 rounded-lg p-3">
                    <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="text-white/80 text-sm md:text-base whitespace-nowrap">Remaining: <span className="font-bold text-white">{stats.checkInStats.notCheckedIn}</span></span>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Footer with auto-refresh indicator */}
      <div className="absolute bottom-0 left-0 right-0 p-4 text-center">
        <p className="text-white/40 text-sm">
          Auto-refreshing every {refreshInterval / 1000} seconds • Press ESC to exit
        </p>
      </div>
    </div>
  )
}

export default PresentationMode
