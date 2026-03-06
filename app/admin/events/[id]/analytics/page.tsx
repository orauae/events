"use client"

import { useParams } from "next/navigation"
import { AnalyticsTab } from "@/components/events"
import { useEvent } from "@/hooks/use-events"
import { AdminBreadcrumb } from "@/components/admin"

export default function AdminEventAnalyticsPage() {
  const params = useParams()
  const eventId = params.id as string
  const { data: event, isLoading: eventLoading } = useEvent(eventId)

  return (
    <div className="space-y-3">
      <div>
        <AdminBreadcrumb
          isLoading={eventLoading}
          items={[
            { label: "Events", href: "/admin/events" },
            { label: event?.name ?? "Event", href: `/admin/events/${eventId}` },
            { label: "Analytics" },
          ]}
        />
        <h1 className="text-lg font-semibold text-ora-charcoal mt-2">Analytics</h1>
      </div>
      <AnalyticsTab eventId={eventId} />
    </div>
  )
}
