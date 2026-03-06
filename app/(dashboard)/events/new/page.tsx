"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useCreateEvent } from "@/hooks/use-events"
import { useRole } from "@/hooks/use-auth"
import { useAssignableUsers } from "@/hooks/use-event-assignment"
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

export default function CreateEventPage() {
  const router = useRouter()
  const createEvent = useCreateEvent()
  const { isAdmin, data: authData } = useRole()
  const { data: assignableUsers, isLoading: isLoadingUsers } = useAssignableUsers()

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
    assignedUserId: "",
  })

  // Auto-select current user for Event Managers
  useEffect(() => {
    if (!isAdmin && authData?.userId && !formData.assignedUserId) {
      setFormData((prev) => ({ ...prev, assignedUserId: authData.userId }))
    }
  }, [isAdmin, authData?.userId, formData.assignedUserId])

  const [errors, setErrors] = useState<Record<string, string>>({})

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
    if (formData.startDate && formData.endDate && formData.startDate > formData.endDate) {
      newErrors.startDate = "Start date must be before end date"
    }
    if (!formData.location.trim()) {
      newErrors.location = "Location is required"
    }
    // Admins must select an assigned manager
    if (isAdmin && !formData.assignedUserId) {
      newErrors.assignedUserId = "Please select a manager to assign this event to"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    try {
      const createInput: Parameters<typeof createEvent.mutateAsync>[0] = {
        name: formData.name,
        type: formData.type as (typeof EVENT_TYPES)[number],
        description: formData.description,
        startDate: formData.startDate!,
        endDate: formData.endDate!,
        location: formData.location,
        latitude: formData.latitude || undefined,
        longitude: formData.longitude || undefined,
        addressId: formData.addressId || undefined,
      }
      
      // Only include assignedUserId for admins (Event Managers auto-assign to self on backend)
      if (isAdmin && formData.assignedUserId) {
        createInput.assignedUserId = formData.assignedUserId
      }
      
      await createEvent.mutateAsync(createInput)
      router.push("/events")
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
      
      // Auto-validate: if setting start date after end date, clear error message but show validation
      if (field === "startDate" && value && prev.endDate && value > prev.endDate) {
        // Start date is after end date - update end date to match
        newData.endDate = value
      }
      // If setting end date before start date, adjust
      if (field === "endDate" && value && prev.startDate && value < prev.startDate) {
        // End date is before start date - update start date to match
        newData.startDate = value
      }
      
      return newData
    })
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
    // Clear the other date field error if it was related to date comparison
    const otherField = field === "startDate" ? "endDate" : "startDate"
    if (errors[otherField]?.includes("must be")) {
      setErrors((prev) => ({ ...prev, [otherField]: "" }))
    }
  }

  return (
    <div>
      <PageHeader title="Create Event" description="Set up a new event">
        <Link href="/events">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back to Events
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

            {/* Event Manager Assignment - Only shown to Admins */}
            {isAdmin && (
              <div className="space-y-2">
                <Label htmlFor="assignedUserId">Assign to Manager *</Label>
                <Select
                  value={formData.assignedUserId}
                  onValueChange={(value) => handleChange("assignedUserId", value)}
                  disabled={isLoadingUsers}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingUsers ? "Loading managers..." : "Select a manager"} />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableUsers?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email}) - {user.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.assignedUserId && (
                  <p className="text-sm text-red-600">{errors.assignedUserId}</p>
                )}
                <p className="text-sm text-ora-graphite">
                  Select the event manager who will be responsible for this event.
                </p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-4">
              <Link href="/events">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" isLoading={createEvent.isPending}>
                Create Event
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
