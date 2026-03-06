"use client"

import Link from "next/link"
import Image from "next/image"
import { Calendar, MapPin, Users } from "lucide-react"
import { Badge } from "@/components/ui"
import type { Event } from "@/db/schema"

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1503428593586-e225b39bddfe?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"

const typeColors: Record<string, "default" | "secondary" | "info" | "success"> = {
  Conference: "info",
  Private: "secondary",
  Corporate: "default",
  Exhibition: "success",
}

function formatShortDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

interface EventGridCardProps {
  event: Event
  guestCount?: number
}

export function EventGridCard({ event, guestCount }: EventGridCardProps) {
  const now = new Date()
  const isPast = new Date(event.endDate) < now
  const isToday =
    new Date(event.startDate).toDateString() === now.toDateString() ||
    (new Date(event.startDate) <= now && new Date(event.endDate) >= now)

  return (
    <Link href={`/admin/events/${event.id}`}>
      <div className="group bg-white border border-transparent hover:border-ora-gold overflow-hidden transition-all cursor-pointer hover:shadow-md">
        {/* Image */}
        <div className="relative h-40 overflow-hidden">
          <Image
            src={PLACEHOLDER_IMAGE}
            alt={event.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
          />
          {/* Dark gradient overlay at bottom */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          {/* Upcoming/Past ribbon */}
          <div className="absolute top-3 left-0">
            <div
              className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white ${
                isToday ? "bg-ora-gold" : isPast ? "bg-ora-graphite" : "bg-green-600"
              }`}
              style={{ borderRadius: "0 4px 4px 0" }}
            >
              {isToday ? "Live" : isPast ? "Past" : "Upcoming"}
            </div>
          </div>

          {/* Bottom overlay info */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3">
            <span className="flex items-center gap-1 text-[11px] text-white/90 bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
              <Calendar className="h-3 w-3 stroke-1" />
              {formatShortDate(event.startDate)}
            </span>
            {guestCount !== undefined && (
              <span className="flex items-center gap-1 text-[11px] text-white/90 bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
                <Users className="h-3 w-3 stroke-1" />
                {guestCount.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-semibold text-ora-charcoal line-clamp-1 text-sm">{event.name}</h3>
            <Badge variant={typeColors[event.type] || "secondary"} className="shrink-0 text-[10px]">
              {event.type}
            </Badge>
          </div>

          {event.description && (
            <p className="text-xs text-ora-graphite line-clamp-1 mb-2">{event.description}</p>
          )}

          <div className="flex items-center gap-1.5 text-xs text-ora-graphite">
            <MapPin className="h-3 w-3 stroke-1 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
