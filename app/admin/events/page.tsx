"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Plus, Calendar, LayoutGrid, CalendarDays, Search } from "lucide-react"
import { useAdminEvents } from "@/hooks/use-admin-events"
import { Button } from "@/components/ui"
import { EventListSkeleton } from "@/components/skeletons"
import { EventCalendar, EventGridCard, AdminBreadcrumb } from "@/components/admin"
import type { Event } from "@/db/schema"

type ViewMode = "grid" | "calendar"

export default function AdminEventsPage() {
  const { data, isLoading, error } = useAdminEvents()
  const events = data?.data
  const [view, setView] = useState<ViewMode>("grid")
  const [search, setSearch] = useState("")

  const filteredEvents = useMemo(() => {
    if (!events) return undefined
    if (!search.trim()) return events
    const q = search.toLowerCase()
    return events.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q)
    )
  }, [events, search])

  return (
    <div>
      <AdminBreadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Events" }]} />
      <div className="flex items-center justify-between mt-2 mb-6">
        <h1 className="text-lg font-semibold text-ora-charcoal">Events</h1>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 stroke-1 text-ora-stone" />
            <input
              type="text"
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-64 pl-9 pr-3 text-sm bg-white border border-ora-sand rounded-full placeholder:text-ora-stone text-ora-charcoal outline-none focus:outline-2 focus:-outline-offset-2 focus:outline-ora-gold transition-colors"
            />
          </div>
          {/* View toggle */}
          <div className="flex items-center border border-ora-sand rounded-full p-0.5">
            <button
              onClick={() => setView("grid")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                view === "grid"
                  ? "bg-ora-charcoal text-white"
                  : "text-ora-graphite hover:text-ora-charcoal"
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5 stroke-1" />
              Grid
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                view === "calendar"
                  ? "bg-ora-charcoal text-white"
                  : "text-ora-graphite hover:text-ora-charcoal"
              }`}
              aria-label="Calendar view"
            >
              <CalendarDays className="h-3.5 w-3.5 stroke-1" />
              Calendar
            </button>
          </div>
          <Link href="/admin/events/new">
            <Button>
              <Plus className="h-4 w-4 stroke-1" />
              Create Event
            </Button>
          </Link>
        </div>
      </div>

      {isLoading && <EventListSkeleton count={8} />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          Failed to load events. Please try again.
        </div>
      )}

      {events && events.length === 0 && (
        <div className="rounded-lg border border-ora-sand bg-white p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 stroke-1 text-ora-stone mb-4" />
          <h3 className="text-lg font-medium text-ora-charcoal mb-2">No events yet</h3>
          <p className="text-sm text-ora-graphite mb-4">Create your first event to get started</p>
          <Link href="/admin/events/new">
            <Button>
              <Plus className="h-4 w-4 stroke-1" />
              Create Event
            </Button>
          </Link>
        </div>
      )}

      {events && events.length > 0 && filteredEvents && filteredEvents.length === 0 && (
        <div className="rounded-lg border border-ora-sand bg-white p-12 text-center">
          <Search className="mx-auto h-12 w-12 stroke-1 text-ora-stone mb-4" />
          <h3 className="text-lg font-medium text-ora-charcoal mb-2">No matching events</h3>
          <p className="text-sm text-ora-graphite">Try a different search term</p>
        </div>
      )}

      {filteredEvents && filteredEvents.length > 0 && view === "grid" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredEvents.map((event) => (
            <EventGridCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {filteredEvents && filteredEvents.length > 0 && view === "calendar" && (
        <EventCalendar events={filteredEvents} />
      )}
    </div>
  )
}
