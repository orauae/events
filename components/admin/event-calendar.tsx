"use client"

import { useState, useMemo } from "react"
import { ChevronLeft, ChevronRight, Calendar, MapPin, Clock, ChevronDown } from "lucide-react"
import Link from "next/link"
import { Button, Badge, Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui"
import type { Event } from "@/db/schema"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  // Monday = 0, Sunday = 6
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const days: { date: Date; isCurrentMonth: boolean }[] = []

  // Previous month padding
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: d, isCurrentMonth: false })
  }
  // Current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true })
  }
  // Next month padding to fill 6 rows
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - lastDay.getDate() - startDow + 1)
    days.push({ date: d, isCurrentMonth: false })
  }
  return days
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

function formatShortDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const typeColors: Record<string, string> = {
  Conference: "bg-blue-100 text-blue-700 border-blue-200",
  Private: "bg-purple-100 text-purple-700 border-purple-200",
  Corporate: "bg-amber-100 text-amber-700 border-amber-200",
  Exhibition: "bg-green-100 text-green-700 border-green-200",
  ProductLaunch: "bg-rose-100 text-rose-700 border-rose-200",
  OpenHouse: "bg-teal-100 text-teal-700 border-teal-200",
}

interface EventCalendarProps {
  events: Event[]
}

export function EventCalendar({ events }: EventCalendarProps) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const days = useMemo(() => getMonthDays(year, month), [year, month])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>()
    events.forEach((event) => {
      const start = new Date(event.startDate)
      const key = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(event)
    })
    return map
  }, [events])

  const getEventsForDate = (date: Date) => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    return eventsByDate.get(key) || []
  }

  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : []

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1) }
    else setMonth(month - 1)
  }

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1) }
    else setMonth(month + 1)
  }

  const goToToday = () => {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setSelectedDate(today)
  }

  const handleMonthSelect = (m: number) => {
    setMonth(m)
    setShowMonthPicker(false)
  }

  const [showMonthPicker, setShowMonthPicker] = useState(false)

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4 stroke-1" />
            </Button>
            <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="Next month">
              <ChevronRight className="h-4 w-4 stroke-1" />
            </Button>
          </div>
          <h2 className="text-lg font-semibold text-ora-charcoal">
            {MONTHS[month]} {year}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Month selector */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMonthPicker(!showMonthPicker)}
            >
              {MONTHS[month].slice(0, 3)} {year}
              <ChevronDown className="h-3.5 w-3.5 stroke-1 ml-1" />
            </Button>
            {showMonthPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMonthPicker(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-ora-sand rounded-lg shadow-lg p-3 w-[220px]">
                  {/* Year nav */}
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => setYear(year - 1)}
                      className="p-1 hover:bg-ora-cream rounded text-ora-graphite"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 stroke-1" />
                    </button>
                    <span className="text-sm font-medium text-ora-charcoal">{year}</span>
                    <button
                      onClick={() => setYear(year + 1)}
                      className="p-1 hover:bg-ora-cream rounded text-ora-graphite"
                    >
                      <ChevronRight className="h-3.5 w-3.5 stroke-1" />
                    </button>
                  </div>
                  {/* Month grid */}
                  <div className="grid grid-cols-3 gap-1">
                    {MONTHS.map((m, i) => {
                      const isActive = i === month && year === today.getFullYear()
                      const isCurrent = i === month
                      return (
                        <button
                          key={m}
                          onClick={() => handleMonthSelect(i)}
                          className={`px-2 py-1.5 text-xs rounded transition-colors ${
                            isCurrent
                              ? "bg-ora-charcoal text-white"
                              : isActive
                              ? "bg-ora-gold/10 text-ora-gold font-medium"
                              : "text-ora-graphite hover:bg-ora-cream"
                          }`}
                        >
                          {m.slice(0, 3)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={goToToday}>Today</Button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px mb-2" style={{ backgroundColor: "#E8E4DF" }}>
        {DAYS.map((day) => (
          <div key={day} className="py-2 text-center text-xs font-medium text-ora-graphite bg-white">
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px" style={{ backgroundColor: "#E8E4DF" }}>
        {days.map((day, i) => {
          const dayEvents = getEventsForDate(day.date)
          const isToday = isSameDay(day.date, today)
          const hasEvents = dayEvents.length > 0

          return (
            <button
              key={i}
              onClick={() => setSelectedDate(day.date)}
              className={`
                relative min-h-[100px] p-1.5 text-left transition-colors
                ${day.isCurrentMonth ? "bg-white" : "bg-[#F5F3F0]"}
                ${hasEvents ? "hover:bg-ora-gold/5 cursor-pointer" : "hover:bg-gray-50 cursor-pointer"}
              `}
            >
              <span
                className={`
                  inline-flex items-center justify-center w-6 h-6 text-xs rounded-full
                  ${isToday ? "bg-ora-gold text-white font-semibold" : ""}
                  ${!isToday && day.isCurrentMonth ? "text-ora-charcoal" : ""}
                  ${!isToday && !day.isCurrentMonth ? "text-ora-stone" : ""}
                `}
              >
                {day.date.getDate()}
              </span>

              {/* Event pills */}
              <div className="mt-0.5 space-y-0.5">
                {dayEvents.slice(0, 2).map((event) => {
                  const colorClass = typeColors[event.type] || "bg-ora-sand text-ora-charcoal"
                  return (
                    <div
                      key={event.id}
                      className={`text-[10px] leading-tight px-1.5 py-0.5 rounded truncate ${colorClass}`}
                      title={event.name}
                    >
                      {event.name}
                    </div>
                  )
                })}
                {dayEvents.length > 2 && (
                  <div className="text-[10px] text-ora-graphite px-1.5">
                    +{dayEvents.length - 2} more
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Day Detail Sheet */}
      <Sheet open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <SheetContent side="right" className="w-[60vw] sm:max-w-[60vw]">
          <SheetHeader>
            <SheetTitle>
              {selectedDate && selectedDate.toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              })}
            </SheetTitle>
            <SheetDescription>
              {selectedEvents.length === 0
                ? "No events scheduled for this day"
                : `${selectedEvents.length} event${selectedEvents.length !== 1 ? "s" : ""}`}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-3">
            {selectedEvents.length === 0 && (
              <div className="py-12 text-center">
                <Calendar className="mx-auto h-10 w-10 stroke-1 text-ora-stone mb-3" />
                <p className="text-sm text-ora-graphite">
                  No events on {selectedDate && formatShortDate(selectedDate)}
                </p>
              </div>
            )}

            {selectedEvents.map((event) => {
              const isPast = new Date(event.endDate) < today
              return (
                <Link key={event.id} href={`/admin/events/${event.id}`}>
                  <div className="p-4 rounded-lg border border-ora-sand bg-white hover:border-ora-gold/50 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-ora-charcoal truncate">{event.name}</h3>
                          <Badge variant={isPast ? "secondary" : "success"} className="shrink-0 text-[10px]">
                            {isPast ? "Past" : "Upcoming"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-ora-graphite">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 stroke-1" />
                            {formatTime(event.startDate)} – {formatTime(event.endDate)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 stroke-1" />
                            <span className="truncate max-w-[200px]">{event.location}</span>
                          </span>
                        </div>
                        {event.description && (
                          <p className="text-xs text-ora-graphite mt-2 line-clamp-2">{event.description}</p>
                        )}
                      </div>
                      <Badge variant={event.type === "Conference" ? "info" : event.type === "Exhibition" ? "success" : "secondary"}>
                        {event.type}
                      </Badge>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
