"use client"

import { useState } from "react"
import Link from "next/link"
import { Calendar, MapPin, Users, Search, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useEvents } from "@/hooks/use-events"

export default function BrowseEventsPage() {
  const [search, setSearch] = useState("")
  const { data: events, isLoading } = useEvents()

  const filteredEvents = events?.filter((event) =>
    event.name.toLowerCase().includes(search.toLowerCase()) ||
    event.location.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  const upcomingEvents = filteredEvents.filter(
    (event) => new Date(event.startDate) >= new Date()
  )

  return (
    <div className="min-h-screen bg-ora-white">
      {/* Header */}
      <header className="border-b border-ora-sand">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 bg-ora-gold" />
            <span className="text-xl font-semibold text-ora-charcoal">EventOS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-ora-graphite hover:text-ora-charcoal"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-ora-charcoal">Browse Events</h1>
          <p className="mt-2 text-ora-graphite">
            Discover upcoming events and find your next experience.
          </p>
        </div>

        {/* Search */}
        <div className="mb-8 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ora-stone" />
            <Input
              placeholder="Search events by name or location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Events grid */}
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse p-6">
                <div className="h-4 w-3/4 rounded bg-ora-sand" />
                <div className="mt-4 h-3 w-1/2 rounded bg-ora-sand" />
                <div className="mt-6 h-3 w-full rounded bg-ora-sand" />
                <div className="mt-2 h-3 w-2/3 rounded bg-ora-sand" />
              </Card>
            ))}
          </div>
        ) : upcomingEvents.length === 0 ? (
          <div className="border border-ora-sand bg-ora-cream p-12 text-center">
            <Calendar className="mx-auto h-12 w-12 text-ora-stone" />
            <h3 className="mt-4 text-lg font-medium text-ora-charcoal">No events found</h3>
            <p className="mt-2 text-ora-graphite">
              {search
                ? "Try adjusting your search terms."
                : "Check back later for upcoming events."}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingEvents.map((event) => (
              <Card
                key={event.id}
                className="overflow-hidden"
              >
                <div className="bg-gradient-to-r from-ora-gold to-ora-cream p-4">
                  <Badge variant="secondary" className="bg-white/80">
                    {event.type}
                  </Badge>
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-ora-charcoal">
                    {event.name}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-ora-graphite">
                    {event.description}
                  </p>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-ora-stone">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {new Date(event.startDate).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-ora-stone">
                      <MapPin className="h-4 w-4" />
                      <span className="truncate">{event.location}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-ora-sand bg-ora-white py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-ora-stone sm:px-6 lg:px-8">
          © {new Date().getFullYear()} EventOS. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
