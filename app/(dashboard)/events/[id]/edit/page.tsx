"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useEvent, useUpdateEvent } from "@/hooks/use-events"
import { LocationInput } from "@/components/admin"
import type { LocationResult } from "@/components/admin"
import { PageHeader } from "@/components/layout"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  DateTimePicker,
} from "@/components/ui"

const EVENT_TYPES = ["Conference", "Private", "Corporate", "Exhibition", "ProductLaunch", "OpenHouse"] as const

const EVENT_TYPE_LABELS: Record<(typeof EVENT_TYPES)[number], string> = {
  Conference: "Conference",
  Private: "Private",
  Corporate: "Corporate",
  Exhibition: "Exhibition",
  ProductLaunch: "Product Launch",
  OpenHouse: "Open House",
}

function EditEventSkeleton() {
  return (
    <Card className="w-full">
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default function EditEventPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const { data: event, isLoading, error } = useEvent(eventId)
  const updateEvent = useUpdateEvent()

  const [formData, setFormData] = useState({
    name: "",
    type: "" as (typeof EVENT_TYPES)[number] | "",
    description: "",
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    location: "",
    latitude: "",
    longitude: "",
    addressId: "",
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Populate form when event data loads
  useEffect(() => {
    if (event) {
      setFormData({
        name: event.name,
        type: event.type as (typeof EVENT_TYPES)[number],
        description: event.description || "",
        startDate: new Date(event.startDate),
        endDate: new Date(event.endDate),
        location: event.location,
        latitude: (event as any).latitude || "",
        longitude: (event as any).longitude || "",
        addressId: (event as any).addressId || "",
      })
    }
  }, [event])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = "Event name is required"
    }
    if (!formData.type) {
      newErrors.type = "Event type is required"
    }
    if (!formData.startDate) {
      newErrors.startDate = "Start date is required"
    }
    if (!formData.endDate) {
      newErrors.endDate = "End date is required"
    }
    if (formData.startDate && formData.endDate && formData.endDate < formData.startDate) {
      newErrors.endDate = "End date must be after start date"
    }
    if (!formData.location.trim()) {
      newErrors.location = "Location is required"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    try {
      await updateEvent.mutateAsync({
        id: eventId,
        input: {
          name: formData.name,
          type: formData.type as (typeof EVENT_TYPES)[number],
          description: formData.description,
          startDate: formData.startDate!,
          endDate: formData.endDate!,
          location: formData.location,
          latitude: formData.latitude || undefined,
          longitude: formData.longitude || undefined,
          addressId: formData.addressId || undefined,
        },
      })
      router.push(`/events/${eventId}`)
    } catch {
      // Error is handled by the mutation
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }

  const handleDateChange = (field: "startDate" | "endDate", value: Date | undefined) => {
    setFormData((prev) => {
      const newData = { ...prev, [field]: value }
      
      // Auto-adjust dates to maintain valid range
      if (field === "startDate" && value && prev.endDate && value > prev.endDate) {
        newData.endDate = value
      }
      if (field === "endDate" && value && prev.startDate && value < prev.startDate) {
        newData.startDate = value
      }
      
      return newData
    })
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
    const otherField = field === "startDate" ? "endDate" : "startDate"
    if (errors[otherField]?.includes("must be")) {
      setErrors((prev) => ({ ...prev, [otherField]: "" }))
    }
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Edit Event">
          <Link href={`/events/${eventId}`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to Event
            </Button>
          </Link>
        </PageHeader>
        <EditEventSkeleton />
      </div>
    )
  }

  if (error || !event) {
    return (
      <div>
        <PageHeader title="Edit Event">
          <Link href="/events">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to Events
            </Button>
          </Link>
        </PageHeader>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-ora-graphite">
              {error ? "Failed to load event" : "Event not found"}
            </p>
            <Link href="/events" className="mt-4 inline-block">
              <Button variant="outline">Return to Events</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Edit Event" description={`Editing: ${event.name}`}>
        <Link href={`/events/${eventId}`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back to Event
          </Button>
        </Link>
      </PageHeader>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Event Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Event Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Event Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Enter event name"
              />
              {errors.name && (
                <p className="text-sm text-red-600">{errors.name}</p>
              )}
            </div>

            {/* Event Type */}
            <div className="space-y-2">
              <Label htmlFor="type">Event Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => handleChange("type", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select event type" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {EVENT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && (
                <p className="text-sm text-red-600">{errors.type}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Enter event description"
                rows={3}
                className="flex w-full rounded-lg border border-ora-sand bg-ora-white px-3 py-2 text-sm text-ora-charcoal placeholder:text-ora-graphite/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ora-gold focus-visible:ring-offset-2"
              />
            </div>

            {/* Dates */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <DateTimePicker
                  value={formData.startDate}
                  onChange={(date) => handleDateChange("startDate", date)}
                  placeholder="Select start date and time"
                  maxDate={formData.endDate}
                />
                {errors.startDate && (
                  <p className="text-sm text-red-600">{errors.startDate}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <DateTimePicker
                  value={formData.endDate}
                  onChange={(date) => handleDateChange("endDate", date)}
                  placeholder="Select end date and time"
                  minDate={formData.startDate}
                />
                {errors.endDate && (
                  <p className="text-sm text-red-600">{errors.endDate}</p>
                )}
              </div>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <LocationInput
                value={formData.location}
                latitude={formData.latitude}
                longitude={formData.longitude}
                onChange={(result: LocationResult) => {
                  setFormData((prev) => ({
                    ...prev,
                    location: result.location,
                    latitude: result.latitude,
                    longitude: result.longitude,
                    addressId: result.addressId || "",
                  }))
                  if (errors.location) setErrors((prev) => ({ ...prev, location: "" }))
                }}
                error={errors.location}
              />
              {errors.location && (
                <p className="text-sm text-red-600">{errors.location}</p>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-4">
              <Link href={`/events/${eventId}`}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" isLoading={updateEvent.isPending}>
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
