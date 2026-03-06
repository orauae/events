"use client"

import { useParams } from "next/navigation"
import { EventGuestsTab } from "@/components/events"
import { useEvent } from "@/hooks/use-events"
import { AdminBreadcrumb } from "@/components/admin"

export default function AdminEventGuestsPage() {
  const params = useParams()
  const eventId = params.id as string
  const { data: event, isLoading: eventLoading } = useEvent(eventId)

  return (
    <div className="space-y-3">
      <AdminBreadcrumb
        isLoading={eventLoading}
        items={[
          { label: "Events", href: "/admin/events" },
          { label: event?.name ?? "Event", href: `/admin/events/${eventId}` },
          { label: "Guests" },
        ]}
      />
      <EventGuestsTab eventId={eventId} title="Guests" />
    </div>
  )
}
