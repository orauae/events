"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
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
import { useEventAssignment, useAssignableUsers, useTransferEvent } from "@/hooks/use-event-assignment"
import { AdminBreadcrumb } from "@/components/admin"
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
  return new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
}

function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

function EventDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-32" />
      <Card>
        <CardHeader><Skeleton className="h-8 w-64 mb-2" /><Skeleton className="h-6 w-24" /></CardHeader>
        <CardContent className="space-y-4"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></CardContent>
      </Card>
    </div>
  )
}

function DeleteConfirmDialog({ isOpen, onClose, onConfirm, isDeleting }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; isDeleting: boolean }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-[101] w-full max-w-md mx-4 bg-white shadow-xl">
        <CardHeader>
          <CardTitle>Delete Event</CardTitle>
          <CardDescription>Are you sure? This action cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} isLoading={isDeleting}>Delete</Button>
        </CardContent>
      </Card>
    </div>
  )
}

function TransferEventDialog({ isOpen, onClose, eventId, currentAssignedUserId }: { isOpen: boolean; onClose: () => void; eventId: string; currentAssignedUserId?: string }) {
  const [selectedUserId, setSelectedUserId] = useState("")
  const { data: assignableUsers, isLoading: isLoadingUsers } = useAssignableUsers()
  const transferEvent = useTransferEvent()
  const availableUsers = assignableUsers?.filter((user) => user.id !== currentAssignedUserId)

  const handleTransfer = async () => {
    if (!selectedUserId) return
    try {
      await transferEvent.mutateAsync({ eventId, userId: selectedUserId })
      setSelectedUserId("")
      onClose()
    } catch { /* Error handled */ }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Transfer Event</SheetTitle>
          <SheetDescription>Select a new manager to transfer this event to.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="transfer-user">New Manager</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isLoadingUsers}>
              <SelectTrigger id="transfer-user" className="w-full"><SelectValue placeholder={isLoadingUsers ? "Loading..." : "Select a manager"} /></SelectTrigger>
              <SelectContent>{availableUsers?.map((user) => (<SelectItem key={user.id} value={user.id}>{user.name} ({user.email})</SelectItem>))}</SelectContent>
            </Select>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={onClose} disabled={transferEvent.isPending}>Cancel</Button>
          <Button onClick={handleTransfer} disabled={!selectedUserId} isLoading={transferEvent.isPending}>Transfer Event</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function QuickActionCard({ href, icon: Icon, title, description, count }: { href: string; icon: React.ElementType; title: string; description: string; count?: number }) {
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
              {count !== undefined && <Badge variant="secondary">{count}</Badge>}
              <ChevronRight className="h-4 w-4 stroke-1 text-ora-stone" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export default function AdminEventDetailPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const { data: event, isLoading, error } = useEvent(eventId)
  const { data: assignment, isLoading: isLoadingAssignment } = useEventAssignment(eventId)
  const deleteEvent = useDeleteEvent()

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showTransferDialog, setShowTransferDialog] = useState(false)

  const handleDelete = async () => {
    try {
      await deleteEvent.mutateAsync(eventId)
      router.push("/admin/events")
    } catch { /* Error handled */ }
  }

  if (isLoading) {
    return (
      <div>
        <div className="mb-3">
          <AdminBreadcrumb
            isLoading
            items={[
              { label: "Events", href: "/admin/events" },
              { label: "Event" },
            ]}
          />
          <Skeleton className="h-6 w-48 mt-2" />
        </div>
        <EventDetailSkeleton />
      </div>
    )
  }

  if (error || !event) {
    return (
      <div>
        <div className="mb-3">
          <AdminBreadcrumb
            items={[
              { label: "Events", href: "/admin/events" },
            ]}
          />
        </div>
        <Card><CardContent className="py-12 text-center"><p className="text-ora-graphite">{error ? "Failed to load event" : "Event not found"}</p></CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <AdminBreadcrumb
          items={[
            { label: "Events", href: "/admin/events" },
            { label: event.name },
          ]}
        />
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-lg font-semibold text-ora-charcoal">{event.name}</h1>
          <div className="flex gap-2">
            <Link href={`/admin/events/${eventId}/edit`}><Button variant="secondary"><Edit className="h-4 w-4 stroke-1" />Edit</Button></Link>
            <Button variant="secondary" onClick={() => setShowTransferDialog(true)}><ArrowRightLeft className="h-4 w-4 stroke-1" />Transfer</Button>
            <Button variant="danger" onClick={() => setShowDeleteDialog(true)}><Trash2 className="h-4 w-4 stroke-1" />Delete</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <QuickActionCard href={`/admin/events/${eventId}/guests`} icon={Users} title="Guests" description="Manage guest list" />
        <QuickActionCard href={`/admin/events/${eventId}/campaigns`} icon={Send} title="Campaigns" description="Manage campaigns" />
        <QuickActionCard href={`/admin/events/${eventId}/automations`} icon={Zap} title="Automations" description="Automated workflows" />
        <QuickActionCard href={`/admin/events/${eventId}/analytics`} icon={BarChart3} title="Analytics" description="Event insights" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Event Information</CardTitle>
              <Badge variant={eventTypeColors[event.type] || "secondary"}>{event.type}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 stroke-1 text-ora-gold mt-0.5" />
              <div>
                <p className="font-medium text-ora-charcoal">{formatDate(event.startDate)}</p>
                <p className="text-sm text-ora-graphite">{formatTime(event.startDate)} - {formatTime(event.endDate)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 stroke-1 text-ora-gold mt-0.5" />
              <div>
                <p className="font-medium text-ora-charcoal">Location</p>
                <p className="text-sm text-ora-graphite">{event.location}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg">Assigned Manager</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {isLoadingAssignment ? (
                <div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div></div>
              ) : assignment?.assignedUser ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ora-cream"><User className="h-5 w-5 stroke-1 text-ora-gold" /></div>
                    <div><p className="font-medium text-ora-charcoal">{assignment.assignedUser.name}</p><p className="text-sm text-ora-graphite">{assignment.assignedUser.email}</p></div>
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setShowTransferDialog(true)}><ArrowRightLeft className="h-4 w-4 stroke-1 mr-2" />Transfer Event</Button>
                </>
              ) : (<p className="text-sm text-ora-graphite">No manager assigned</p>)}
            </CardContent>
          </Card>
        </div>
      </div>

      <DeleteConfirmDialog isOpen={showDeleteDialog} onClose={() => setShowDeleteDialog(false)} onConfirm={handleDelete} isDeleting={deleteEvent.isPending} />
      <TransferEventDialog isOpen={showTransferDialog} onClose={() => setShowTransferDialog(false)} eventId={eventId} currentAssignedUserId={assignment?.assignedUserId} />
    </div>
  )
}
