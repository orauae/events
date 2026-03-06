"use client"

import { useState, useMemo } from "react"
import {
  Users,
  Plus,
  Search,
  Trash2,
  Mail,
  Building2,
  CheckCircle2,
  Clock,
  XCircle,
  HelpCircle,
  Download,
  Check,
  UserPlus,
} from "lucide-react"
import { useEventGuests, useAddGuestToEvent, useAddGuestsToEvent, useRemoveGuestFromEvent, useExportGuestList } from "@/hooks"
import { useGuests } from "@/hooks/use-guests"
import {
  Button,
  Card,
  CardContent,
  Badge,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Checkbox,
} from "@/components/ui"
import { DataTable } from "@/components/layout"
import { GuestTableSkeleton } from "@/components/skeletons"
import { GuestAvatar } from "@/components/guests"
import type { EventGuestWithRelations } from "@/hooks/use-event-guests"
import type { Guest } from "@/db/schema"

interface EventGuestsTabProps {
  eventId: string
  title?: string
}

// Status badge variants
const rsvpStatusConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "secondary"; icon: React.ReactNode }> = {
  Pending: { label: "Pending", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  Attending: { label: "Attending", variant: "success", icon: <CheckCircle2 className="h-3 w-3" /> },
  NotAttending: { label: "Not Attending", variant: "danger", icon: <XCircle className="h-3 w-3" /> },
}

const checkInStatusConfig: Record<string, { label: string; variant: "default" | "success" | "secondary" }> = {
  NotCheckedIn: { label: "Not Checked In", variant: "secondary" },
  CheckedIn: { label: "Checked In", variant: "success" },
}

function AddGuestSheet({
  isOpen,
  onClose,
  eventId,
  existingGuestIds,
}: {
  isOpen: boolean
  onClose: () => void
  eventId: string
  existingGuestIds: Set<string>
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set())
  const [addedGuestIds, setAddedGuestIds] = useState<Set<string>>(new Set())
  
  const { data: guests, isLoading } = useGuests(debouncedQuery)
  const addGuest = useAddGuestToEvent()
  const addGuests = useAddGuestsToEvent()

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(value)
    }, 300)
    return () => clearTimeout(timeoutId)
  }

  const handleAddGuest = async (guestId: string) => {
    // Optimistic update - add to local state immediately
    setAddedGuestIds(prev => new Set([...prev, guestId]))
    setSelectedGuestIds(prev => {
      const newSet = new Set(prev)
      newSet.delete(guestId)
      return newSet
    })
    
    try {
      await addGuest.mutateAsync({ eventId, guestId })
    } catch {
      // Rollback on error
      setAddedGuestIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(guestId)
        return newSet
      })
    }
  }

  const handleAddSelectedGuests = async () => {
    if (selectedGuestIds.size === 0) return
    
    const guestIds = Array.from(selectedGuestIds)
    
    // Optimistic update - add all to local state immediately
    setAddedGuestIds(prev => new Set([...prev, ...guestIds]))
    setSelectedGuestIds(new Set())
    
    try {
      await addGuests.mutateAsync({ eventId, guestIds })
    } catch {
      // Rollback on error
      setAddedGuestIds(prev => {
        const newSet = new Set(prev)
        guestIds.forEach(id => newSet.delete(id))
        return newSet
      })
      setSelectedGuestIds(new Set(guestIds))
    }
  }

  const toggleGuestSelection = (guestId: string) => {
    setSelectedGuestIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(guestId)) {
        newSet.delete(guestId)
      } else {
        newSet.add(guestId)
      }
      return newSet
    })
  }

  const toggleSelectAll = () => {
    if (selectedGuestIds.size === availableGuests.length) {
      setSelectedGuestIds(new Set())
    } else {
      setSelectedGuestIds(new Set(availableGuests.map(g => g.id)))
    }
  }

  // Filter out guests already added to the event (including optimistically added ones)
  const availableGuests = useMemo(() => {
    return guests?.filter((g) => !existingGuestIds.has(g.id) && !addedGuestIds.has(g.id)) || []
  }, [guests, existingGuestIds, addedGuestIds])

  const isAllSelected = availableGuests.length > 0 && selectedGuestIds.size === availableGuests.length
  const isSomeSelected = selectedGuestIds.size > 0

  // Reset local state when sheet closes
  const handleClose = () => {
    setSelectedGuestIds(new Set())
    setAddedGuestIds(new Set())
    setSearchQuery("")
    setDebouncedQuery("")
    onClose()
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-[70vw] sm:max-w-[70vw] flex flex-col">
        <SheetHeader>
          <SheetTitle>Add Guests to Event</SheetTitle>
          <SheetDescription>
            Search and select guests from your database to add to this event
          </SheetDescription>
        </SheetHeader>
        
        <div className="flex-1 flex flex-col gap-4 mt-6 overflow-hidden">
          {/* Search and Bulk Actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ora-graphite" />
              <Input
                placeholder="Search by name, email, or company..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
            {isSomeSelected && (
              <Button
                onClick={handleAddSelectedGuests}
                disabled={addGuests.isPending}
                isLoading={addGuests.isPending}
              >
                <UserPlus className="h-4 w-4" />
                Add {selectedGuestIds.size} Selected
              </Button>
            )}
          </div>

          {/* Select All Header */}
          {!isLoading && availableGuests.length > 0 && (
            <div className="flex items-center gap-3 px-3 py-2 bg-ora-cream/50 rounded-lg flex-shrink-0">
              <Checkbox
                checked={isAllSelected}
                onCheckedChange={toggleSelectAll}
                aria-label="Select all guests"
              />
              <span className="text-sm text-ora-graphite">
                {isAllSelected ? "Deselect all" : `Select all ${availableGuests.length} guests`}
              </span>
              {isSomeSelected && !isAllSelected && (
                <Badge variant="secondary" className="ml-auto">
                  {selectedGuestIds.size} selected
                </Badge>
              )}
            </div>
          )}

          {/* Guest List */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-ora-sand/50 rounded-lg animate-pulse" />
                ))}
              </div>
            )}

            {!isLoading && availableGuests.length === 0 && (
              <div className="text-center py-8 text-ora-graphite">
                {debouncedQuery ? (
                  <p>No guests found matching &quot;{debouncedQuery}&quot;</p>
                ) : guests?.length === 0 ? (
                  <p>No guests in your database yet</p>
                ) : (
                  <p>All guests are already added to this event</p>
                )}
              </div>
            )}

            {!isLoading && availableGuests.length > 0 && (
              <div className="space-y-2">
                {availableGuests.map((guest) => {
                  const isSelected = selectedGuestIds.has(guest.id)
                  const isAdding = addGuest.isPending && addGuest.variables?.guestId === guest.id
                  
                  return (
                    <div
                      key={guest.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                        isSelected 
                          ? "border-ora-gold bg-ora-gold/10" 
                          : "border-ora-sand hover:bg-ora-cream"
                      }`}
                      onClick={() => !isAdding && toggleGuestSelection(guest.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleGuestSelection(guest.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${guest.firstName} ${guest.lastName}`}
                      />
                      <GuestAvatar
                        guestId={guest.id}
                        firstName={guest.firstName}
                        lastName={guest.lastName}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ora-charcoal">
                          {guest.firstName} {guest.lastName}
                        </div>
                        <div className="text-xs text-ora-graphite flex items-center gap-2">
                          <Mail className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{guest.email}</span>
                          {guest.company && (
                            <>
                              <span className="text-ora-stone">•</span>
                              <Building2 className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{guest.company}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={isSelected ? "outline" : "default"}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAddGuest(guest.id)
                        }}
                        disabled={isAdding}
                        isLoading={isAdding}
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="flex-shrink-0 pt-4 border-t border-ora-sand">
          <Button variant="outline" onClick={handleClose}>
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function RemoveGuestSheet({
  isOpen,
  onClose,
  onConfirm,
  isRemoving,
  guestName,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  isRemoving: boolean
  guestName: string
}) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[70vw] sm:max-w-[70vw]">
        <SheetHeader>
          <SheetTitle>Remove Guest</SheetTitle>
          <SheetDescription>
            Are you sure you want to remove {guestName} from this event? This will delete their RSVP status and any associated data.
          </SheetDescription>
        </SheetHeader>
        
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onClose} disabled={isRemoving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} isLoading={isRemoving}>
            Remove
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function EventGuestsTab({ eventId, title }: EventGuestsTabProps) {
  const { data: eventGuests, isLoading, error } = useEventGuests(eventId)
  const removeGuest = useRemoveGuestFromEvent()
  const { exportGuestList, isPending: isExporting } = useExportGuestList()
  
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [guestToRemove, setGuestToRemove] = useState<EventGuestWithRelations | null>(null)

  const existingGuestIds = new Set(eventGuests?.map((eg) => eg.guestId) || [])

  const handleRemoveGuest = async () => {
    if (!guestToRemove) return
    await removeGuest.mutateAsync({
      eventId,
      guestId: guestToRemove.guestId,
    })
    setGuestToRemove(null)
  }

  const columns = [
    {
      key: "guest",
      header: "Guest",
      cell: (eg: EventGuestWithRelations) => (
        <div className="flex items-center gap-3">
          <GuestAvatar
            guestId={eg.guestId}
            firstName={eg.guest.firstName}
            lastName={eg.guest.lastName}
            size="sm"
          />
          <div>
            <div className="font-medium text-ora-charcoal">
              {eg.guest.firstName} {eg.guest.lastName}
            </div>
            {eg.guest.jobTitle && (
              <div className="text-xs text-ora-graphite">{eg.guest.jobTitle}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      cell: (eg: EventGuestWithRelations) => (
        <div className="flex items-center gap-2 text-ora-graphite">
          <Mail className="h-4 w-4" />
          <span>{eg.guest.email}</span>
        </div>
      ),
    },
    {
      key: "company",
      header: "Company",
      cell: (eg: EventGuestWithRelations) => (
        eg.guest.company ? (
          <div className="flex items-center gap-2 text-ora-graphite">
            <Building2 className="h-4 w-4" />
            <span>{eg.guest.company}</span>
          </div>
        ) : (
          <span className="text-ora-stone">—</span>
        )
      ),
    },
    {
      key: "rsvpStatus",
      header: "RSVP",
      cell: (eg: EventGuestWithRelations) => {
        const config = rsvpStatusConfig[eg.rsvpStatus] || rsvpStatusConfig.Pending
        return (
          <Badge variant={config.variant} className="gap-1">
            {config.icon}
            {config.label}
          </Badge>
        )
      },
    },
    {
      key: "checkInStatus",
      header: "Check-In",
      cell: (eg: EventGuestWithRelations) => {
        const config = checkInStatusConfig[eg.checkInStatus] || checkInStatusConfig.NotCheckedIn
        return (
          <Badge variant={config.variant}>
            {config.label}
          </Badge>
        )
      },
    },
    {
      key: "actions",
      header: "",
      cell: (eg: EventGuestWithRelations) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            setGuestToRemove(eg)
          }}
          className="text-ora-graphite hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
      className: "w-12",
    },
  ]

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {title && <h1 className="text-lg font-semibold text-ora-charcoal">{title}</h1>}
          {eventGuests && eventGuests.length > 0 && (
            <span className="text-sm text-ora-graphite">{eventGuests.length} guest{eventGuests.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => exportGuestList(eventId)}
            isLoading={isExporting}
            disabled={!eventGuests || eventGuests.length === 0}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Users className="h-4 w-4" />
            Add Guests
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading && <GuestTableSkeleton rows={5} />}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              Failed to load event guests. Please try again.
            </div>
          )}

          {eventGuests && eventGuests.length === 0 && (
            <div className="py-12 text-center">
              <Users className="mx-auto h-12 w-12 text-ora-stone mb-4" />
              <h3 className="text-lg font-medium text-ora-charcoal mb-2">
                No guests added yet
              </h3>
              <p className="text-sm text-ora-graphite mb-4">
                Add guests from your database to start managing invitations
              </p>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4" />
                Add Guests
              </Button>
            </div>
          )}

          {eventGuests && eventGuests.length > 0 && (
            <>
              <div className="mb-4 flex items-center justify-end">
                <div className="flex gap-2 text-xs text-ora-graphite">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    {eventGuests.filter((eg) => eg.rsvpStatus === "Attending").length} attending
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-ora-graphite" />
                    {eventGuests.filter((eg) => eg.rsvpStatus === "Pending").length} pending
                  </span>
                </div>
              </div>
              <DataTable
                columns={columns}
                data={eventGuests}
                keyExtractor={(eg) => eg.id}
                emptyMessage="No guests found"
              />
            </>
          )}
        </CardContent>
      </Card>

      <AddGuestSheet
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        eventId={eventId}
        existingGuestIds={existingGuestIds}
      />

      <RemoveGuestSheet
        isOpen={!!guestToRemove}
        onClose={() => setGuestToRemove(null)}
        onConfirm={handleRemoveGuest}
        isRemoving={removeGuest.isPending}
        guestName={guestToRemove ? `${guestToRemove.guest.firstName} ${guestToRemove.guest.lastName}` : ""}
      />
    </>
  )
}
