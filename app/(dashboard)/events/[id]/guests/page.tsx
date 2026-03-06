"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { EventGuestsTab } from "@/components/events"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui"

export default function EventGuestsPage() {
  const params = useParams()
  const eventId = params.id as string

  return (
    <div className="space-y-6">
      <PageHeader title="Guests" description="Manage your event guest list">
        <Link href={`/events/${eventId}`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back to Event
          </Button>
        </Link>
      </PageHeader>

      <EventGuestsTab eventId={eventId} />
    </div>
  )
}
