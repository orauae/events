/**
 * @fileoverview Event Detail Page - Single event management view
 * 
 * This page provides a comprehensive view of a single event including:
 * - Event details (name, date, location, description)
 * - Quick action cards (Guests, Campaigns, Analytics, Automations)
 * - Event transfer functionality (admin only)
 * - Edit and delete capabilities
 * 
 * @module app/(dashboard)/events/[id]/page
 * @route /events/:id
 * @access Protected - Requires authentication and event access
 * 
 * @param {string} id - Event ID from URL params
 * 
 * @example
 * ```
 * // URL: /events/clx1234567890
 * // Displays full details for event with ID clx1234567890
 * ```
 */

"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Calendar,
  MapPin,
  User,
  Mail,
  Edit,
  Trash2,
  Users,
  Send,
  BarChart3,
  Zap,
  ArrowRightLeft,
  ChevronRight,
} from "lucide-react"
import { useEvent, useDeleteEvent } from "@/hooks/use-events"
import { useRole } from "@/hooks/use-auth"
import { useEventAssignment, useAssignableUsers, useTransferEvent } from "@/hooks/use-event-assignment"
import { PageHeader } from "@/components/layout"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui"

const eventTypeColors: Record<string, "default" | "secondary" | "info" | "success"> = {
  Conference: "info",
  Private: "secondary",
  Corporate: "default",
  Exhibition: "success",
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function EventDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-32" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-6 w-24" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  isDeleting: boolean
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-[101] w-full max-w-md mx-4 bg-white shadow-xl">
        <CardHeader>
          <CardTitle>Delete Event</CardTitle>
          <CardDescription>
            Are you sure you want to delete this event? This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} isLoading={isDeleting}>
            Delete
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function TransferEventDialog({
  isOpen,
  onClose,
  eventId,
  currentAssignedUserId,
}: {
  isOpen: boolean
  onClose: () => void
  eventId: string
  currentAssignedUserId?: string
}) {
  const [selectedUserId, setSelectedUserId] = useState("")
  const { data: assignableUsers, isLoading: isLoadingUsers } = useAssignableUsers()
  const transferEvent = useTransferEvent()

  const availableUsers = assignableUsers?.filter(
    (user) => user.id !== currentAssignedUserId
  )

  const handleTransfer = async () => {
    if (!selectedUserId) return
    try {
      await transferEvent.mutateAsync({ eventId, userId: selectedUserId })
      setSelectedUserId("")
      onClose()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Transfer Event</SheetTitle>
          <SheetDescription>
            Select a new manager to transfer this event to.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="transfer-user">New Manager</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isLoadingUsers}>
              <SelectTrigger id="transfer-user" className="w-full">
                <SelectValue placeholder={isLoadingUsers ? "Loading..." : "Select a manager"} />
              </SelectTrigger>
              <SelectContent>
                {availableUsers?.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={onClose} disabled={transferEvent.isPending}>
            Cancel
          </Button>
          <Button onClick={handleTransfer} disabled={!selectedUserId} isLoading={transferEvent.isPending}>
            Transfer Event
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// Quick action card component
function QuickActionCard({
  href,
  icon: Icon,
  title,
  description,
  count,
}: {
  href: string
  icon: React.ElementType
  title: string
  description: string
  count?: number
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-ora-gold/50 hover:shadow-md transition-all cursor-pointer h-full">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ora-gold/10">
                <Icon className="h-5 w-5 stroke-1 text-ora-gold" />
              </div>
              <div>
                <h3 className="font-medium text-ora-charcoal">{title}</h3>
                <p className="text-sm text-ora-graphite">{description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {count !== undefined && (
                <Badge variant="secondary">{count}</Badge>
              )}
              <ChevronRight className="h-4 w-4 stroke-1 text-ora-stone" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export default function EventDetailPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const { data: event, isLoading, error } = useEvent(eventId)
  const { isAdmin } = useRole()
  const { data: assignment, isLoading: isLoadingAssignment } = useEventAssignment(eventId)
  const deleteEvent = useDeleteEvent()

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showTransferDialog, setShowTransferDialog] = useState(false)

  const handleDelete = async () => {
    try {
      await deleteEvent.mutateAsync(eventId)
      router.push("/events")
    } catch {
      // Error handled by mutation
    }
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Event Details">
          <Link href="/events">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to Events
            </Button>
          </Link>
        </PageHeader>
        <EventDetailSkeleton />
      </div>
    )
  }

  if (error || !event) {
    return (
      <div>
        <PageHeader title="Event Details">
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
    <div className="space-y-6">
      <PageHeader title={event.name} description={event.description}>
        <Link href="/events">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <Link href={`/events/${eventId}/edit`}>
          <Button variant="secondary">
            <Edit className="h-4 w-4" />
            Edit
          </Button>
        </Link>
        {isAdmin && (
          <Button variant="secondary" onClick={() => setShowTransferDialog(true)}>
            <ArrowRightLeft className="h-4 w-4" />
            Transfer
          </Button>
        )}
        <Button variant="danger" onClick={() => setShowDeleteDialog(true)}>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </PageHeader>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <QuickActionCard
          href={`/events/${eventId}/guests`}
          icon={Users}
          title="Guests"
          description="Manage guest list"
        />
        <QuickActionCard
          href={`/events/${eventId}/campaigns`}
          icon={Send}
          title="Campaigns"
          description="Manage campaigns"
        />
        <QuickActionCard
          href={`/events/${eventId}/automations`}
          icon={Zap}
          title="Automations"
          description="Automated workflows"
        />
        <QuickActionCard
          href={`/events/${eventId}/analytics`}
          icon={BarChart3}
          title="Analytics"
          description="Event insights"
        />
      </div>

      {/* Event Details */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Event Information</CardTitle>
              <Badge variant={eventTypeColors[event.type] || "secondary"}>
                {event.type}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 stroke-1 text-ora-gold mt-0.5" />
              <div>
                <p className="font-medium text-ora-charcoal">{formatDate(event.startDate)}</p>
                <p className="text-sm text-ora-graphite">
                  {formatTime(event.startDate)} - {formatTime(event.endDate)}
                </p>
                {formatDate(event.startDate) !== formatDate(event.endDate) && (
                  <p className="text-sm text-ora-graphite">to {formatDate(event.endDate)}</p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 stroke-1 text-ora-gold mt-0.5" />
              <div>
                <p className="font-medium text-ora-charcoal">Location</p>
                <p className="text-sm text-ora-graphite">{event.location}</p>
              </div>
            </div>
            {event.description && (
              <div>
                <h4 className="font-medium text-ora-charcoal mb-2">Description</h4>
                <p className="text-sm text-ora-graphite whitespace-pre-wrap">{event.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assigned Manager</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingAssignment ? (
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ) : assignment?.assignedUser ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ora-cream">
                      <User className="h-5 w-5 stroke-1 text-ora-gold" />
                    </div>
                    <div>
                      <p className="font-medium text-ora-charcoal">{assignment.assignedUser.name}</p>
                      <p className="text-sm text-ora-graphite">{assignment.assignedUser.email}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setShowTransferDialog(true)}>
                      <ArrowRightLeft className="h-4 w-4 stroke-1 mr-2" />
                      Transfer Event
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-sm text-ora-graphite">No manager assigned</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <DeleteConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        isDeleting={deleteEvent.isPending}
      />

      <TransferEventDialog
        isOpen={showTransferDialog}
        onClose={() => setShowTransferDialog(false)}
        eventId={eventId}
        currentAssignedUserId={assignment?.assignedUserId}
      />
    </div>
  )
}
