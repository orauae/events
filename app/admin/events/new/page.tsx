"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useCreateEvent } from "@/hooks/use-events"
import { useAssignableUsers } from "@/hooks/use-event-assignment"
import { LocationInput } from "@/components/admin"
import type { LocationResult } from "@/components/admin"
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

export default function AdminCreateEventPage() {
  const router = useRouter()
  const createEvent = useCreateEvent()
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

  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    if (!formData.name.trim()) newErrors.name = "Event name is required"
    if (formData.name.length > 200) newErrors.name = "Event name must be 200 characters or less"
    if (!formData.type) newErrors.type = "Event type is required"
    if (!formData.startDate) newErrors.startDate = "Start date is required"
    if (!formData.endDate) newErrors.endDate = "End date is required"
    if (formData.startDate && formData.endDate && formData.endDate < formData.startDate) {
      newErrors.endDate = "End date must be after start date"
    }
    if (!formData.location.trim()) newErrors.location = "Location is required"
    if (formData.location.length > 500) newErrors.location = "Location must be 500 characters or less"
    if (formData.description.length > 5000) newErrors.description = "Description must be 5000 characters or less"
    if (!formData.assignedUserId) newErrors.assignedUserId = "Please select a manager"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    try {
      await createEvent.mutateAsync({
        name: formData.name,
        type: formData.type as (typeof EVENT_TYPES)[number],
        description: formData.description,
        startDate: formData.startDate!,
        endDate: formData.endDate!,
        location: formData.location,
        latitude: formData.latitude || undefined,
        longitude: formData.longitude || undefined,
        addressId: formData.addressId || undefined,
        assignedUserId: formData.assignedUserId,
      })
      router.push("/admin/events")
    } catch {
      // Error handled by mutation
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }))
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
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }))
    const otherField = field === "startDate" ? "endDate" : "startDate"
    if (errors[otherField]?.includes("must be")) {
      setErrors((prev) => ({ ...prev, [otherField]: "" }))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-ora-charcoal">Create Event</h1>
          <p className="text-sm text-ora-graphite mt-1">Set up a new event</p>
        </div>
        <Link href="/admin/events">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 stroke-1" />
            Back to Events
          </Button>
        </Link>
      </div>

      <Card className="w-full rounded-none">
        <CardHeader>
          <CardTitle>Event Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Event Name *</Label>
              <Input id="name" value={formData.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="Enter event name" maxLength={200} />
              {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Event Type *</Label>
              <Select value={formData.type} onValueChange={(value) => handleChange("type", value)}>
                <SelectTrigger><SelectValue placeholder="Select event type" /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((type) => (<SelectItem key={type} value={type}>{EVENT_TYPE_LABELS[type]}</SelectItem>))}
                </SelectContent>
              </Select>
              {errors.type && <p className="text-sm text-red-600">{errors.type}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea id="description" value={formData.description} onChange={(e) => handleChange("description", e.target.value)} placeholder="Enter event description" rows={3} maxLength={5000} className="flex w-full rounded-lg border border-ora-sand bg-ora-white px-3 py-2 text-sm text-ora-charcoal placeholder:text-ora-graphite/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ora-gold focus-visible:ring-offset-2" />
              <div className="flex justify-between">
                {errors.description ? <p className="text-sm text-red-600">{errors.description}</p> : <span />}
                <p className="text-xs text-ora-graphite">{formData.description.length}/5000</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <DateTimePicker
                  value={formData.startDate}
                  onChange={(date) => handleDateChange("startDate", date)}
                  placeholder="Select start date and time"
                  maxDate={formData.endDate}
                />
                {errors.startDate && <p className="text-sm text-red-600">{errors.startDate}</p>}
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <DateTimePicker
                  value={formData.endDate}
                  onChange={(date) => handleDateChange("endDate", date)}
                  placeholder="Select end date and time"
                  minDate={formData.startDate}
                />
                {errors.endDate && <p className="text-sm text-red-600">{errors.endDate}</p>}
              </div>
            </div>

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
              {errors.location && <p className="text-sm text-red-600">{errors.location}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignedUserId">Assign to Manager *</Label>
              <Select value={formData.assignedUserId} onValueChange={(value) => handleChange("assignedUserId", value)} disabled={isLoadingUsers}>
                <SelectTrigger><SelectValue placeholder={isLoadingUsers ? "Loading managers..." : "Select a manager"} /></SelectTrigger>
                <SelectContent>
                  {assignableUsers?.map((user) => (<SelectItem key={user.id} value={user.id}>{user.name} ({user.email}) - {user.role}</SelectItem>))}
                </SelectContent>
              </Select>
              {errors.assignedUserId && <p className="text-sm text-red-600">{errors.assignedUserId}</p>}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Link href="/admin/events"><Button type="button" variant="outline">Cancel</Button></Link>
              <Button type="submit" isLoading={createEvent.isPending}>Create Event</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
