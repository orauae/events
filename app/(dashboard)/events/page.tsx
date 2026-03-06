/**
 * @fileoverview Events List Page - Dashboard view of all user events
 * 
 * This page displays all events assigned to the current user with:
 * - Dashboard statistics (upcoming events, guests, etc.)
 * - Event cards with key information
 * - Create event button (for users with permission)
 * - Role-based filtering (admins see all, managers see assigned)
 * 
 * @module app/(dashboard)/events/page
 * @route /events
 * @access Protected - Requires authentication
 * 
 * @example
 * ```
 * // URL: /events
 * // Displays list of events for the logged-in user
 * ```
 */

"use client"

import Link from "next/link"
import { Plus, Calendar, MapPin } from "lucide-react"
import { useEvents } from "@/hooks/use-events"
import { useCanAccess } from "@/hooks/use-auth"
import { PageHeader } from "@/components/layout"
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui"
import { EventListSkeleton } from "@/components/skeletons"
import { DashboardStats } from "@/components/events"
import type { Event } from "@/db/schema"

const eventTypeColors: Record<string, "default" | "secondary" | "info" | "success"> = {
  Conference: "info",
  Private: "secondary",
  Corporate: "default",
  Exhibition: "success",
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function EventCard({ event }: { event: Event }) {
  return (
    <Link href={`/events/${event.id}`}>
      <Card className="h-full cursor-pointer transition-all hover:shadow-lg hover:border-ora-gold/50">
        <CardHeader className="pb-3">
          {/* Gold accent line */}
          <div className="h-0.5 w-12 bg-ora-gold mb-3 rounded-full" />
          <CardTitle className="text-lg line-clamp-1">{event.name}</CardTitle>
          <Badge variant={eventTypeColors[event.type] || "secondary"} className="w-fit">
            {event.type}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-ora-graphite">
            <Calendar className="h-4 w-4 stroke-1" />
            <span>{formatDate(event.startDate)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-ora-graphite">
            <MapPin className="h-4 w-4 stroke-1" />
            <span className="line-clamp-1">{event.location}</span>
          </div>
          {event.description && (
            <p className="text-sm text-ora-graphite line-clamp-2 mt-2">
              {event.description}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

export default function EventsPage() {
  const { data: events, isLoading, error } = useEvents()
  const { canCreateEvents, isLoading: authLoading } = useCanAccess()

  return (
    <div>
      <PageHeader
        title="My Events"
        description="Manage your assigned events"
      >
        {!authLoading && canCreateEvents && (
          <Link href="/events/new">
            <Button>
              <Plus className="h-4 w-4 stroke-1" />
              Create Event
            </Button>
          </Link>
        )}
      </PageHeader>

      {/* Dashboard Statistics */}
      <DashboardStats />

      {isLoading && <EventListSkeleton count={6} />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          Failed to load events. Please try again.
        </div>
      )}

      {events && events.length === 0 && (
        <div className="rounded-lg border border-ora-sand bg-ora-white p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 stroke-1 text-ora-stone mb-4" />
          <h3 className="text-lg font-medium text-ora-charcoal mb-2">
            No events assigned
          </h3>
          <p className="text-sm text-ora-graphite mb-4">
            {canCreateEvents 
              ? "Create an event or wait for an admin to assign one to you"
              : "Contact an admin to get events assigned to you"
            }
          </p>
          {canCreateEvents && (
            <Link href="/events/new">
              <Button>
                <Plus className="h-4 w-4 stroke-1" />
                Create Event
              </Button>
            </Link>
          )}
        </div>
      )}

      {events && events.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
