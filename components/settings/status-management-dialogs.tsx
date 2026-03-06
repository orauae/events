/**
 * @fileoverview Status Management Dialogs for Event Managers
 * 
 * This module provides dialog components for managing event manager account
 * statuses, including suspension, reactivation, and permanent deactivation.
 * 
 * ## Features
 * - Suspend/Reactivate toggle with confirmation
 * - Permanent deactivation with event transfer
 * - Visual feedback for pending operations
 * - Event assignment preservation during suspension
 * 
 * ## Requirements Implemented
 * - 4.2: Suspend event manager (revoke login access)
 * - 4.3: Reactivate suspended event manager
 * - 4.4: Deactivate event manager permanently
 * - 4.5: Transfer events before deactivation
 * - 4.6: Prevent deactivation without event transfer
 * 
 * @module components/settings/status-management-dialogs
 * @requires @/components/ui - UI primitives
 * @requires @/hooks/use-event-managers - Event manager mutations
 */

"use client"

import { useState, useEffect } from "react"
import { 
  AlertTriangle, 
  Pause, 
  Play, 
  UserX,
  ArrowRight,
  Users,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui"
import { 
  useSuspendEventManager, 
  useReactivateEventManager,
  useDeactivateEventManager,
  useEventManagers,
} from "@/hooks/use-event-managers"
import type { EventManagerWithStats } from "@/lib/services/event-manager-service"

/**
 * Props for the SuspendDialog component.
 */
interface SuspendDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void
  /** The event manager to suspend/reactivate, or null if none selected */
  manager: EventManagerWithStats | null
}

/**
 * Suspend/Reactivate confirmation dialog for event managers.
 * 
 * Displays a confirmation dialog that allows admins to:
 * - Suspend an active event manager (revokes login access)
 * - Reactivate a suspended event manager (restores access)
 * 
 * Event assignments are preserved during suspension and restored
 * when the manager is reactivated.
 * 
 * @param props - Component props
 * @param props.open - Whether the dialog is visible
 * @param props.onOpenChange - Callback when visibility changes
 * @param props.manager - The event manager to manage
 * 
 * @example
 * ```tsx
 * <SuspendDialog
 *   open={showSuspendDialog}
 *   onOpenChange={setShowSuspendDialog}
 *   manager={selectedManager}
 * />
 * ```
 */
export function SuspendDialog({
  open,
  onOpenChange,
  manager,
}: SuspendDialogProps) {
  const suspendMutation = useSuspendEventManager()
  const reactivateMutation = useReactivateEventManager()
  
  const isSuspended = manager?.status === "Suspended"
  const isLoading = suspendMutation.isPending || reactivateMutation.isPending

  const handleConfirm = async () => {
    if (!manager) return
    
    try {
      if (isSuspended) {
        await reactivateMutation.mutateAsync(manager.id)
      } else {
        await suspendMutation.mutateAsync(manager.id)
      }
      onOpenChange(false)
    } catch (error) {
      // Error handled by mutation hooks
    }
  }

  if (!manager) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className={`rounded-full p-2 ${isSuspended ? "bg-green-100" : "bg-amber-100"}`}>
              {isSuspended ? (
                <Play className="h-5 w-5 text-green-600" />
              ) : (
                <Pause className="h-5 w-5 text-amber-600" />
              )}
            </div>
            <SheetTitle>
              {isSuspended ? "Reactivate" : "Suspend"} {manager.name}?
            </SheetTitle>
          </div>
          <SheetDescription className="pt-2">
            {isSuspended ? (
              <>
                This will restore <strong>{manager.name}&apos;s</strong> access to the platform. 
                They will be able to log in and manage their assigned events again.
              </>
            ) : (
              <>
                This will immediately revoke <strong>{manager.name}&apos;s</strong> login access. 
                Their event assignments will be preserved and can be restored when reactivated.
              </>
            )}
          </SheetDescription>
        </SheetHeader>
        
        {!isSuspended && manager.assignedEventCount > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">
                  {manager.assignedEventCount} event{manager.assignedEventCount !== 1 ? "s" : ""} assigned
                </p>
                <p className="text-amber-700 mt-1">
                  Event assignments will be preserved during suspension.
                </p>
              </div>
            </div>
          </div>
        )}
        
        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant={isSuspended ? "default" : "danger"}
            onClick={handleConfirm}
            isLoading={isLoading}
          >
            {isSuspended ? "Reactivate" : "Suspend"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Props for the DeactivateDialog component.
 */
interface DeactivateDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void
  /** The event manager to deactivate, or null if none selected */
  manager: EventManagerWithStats | null
}

/**
 * Deactivation dialog with mandatory event transfer.
 * 
 * Provides a permanent deactivation workflow for event managers that:
 * - Requires event transfer if the manager has assigned events
 * - Shows available transfer destinations (active managers/admins)
 * - Prevents deactivation without completing the transfer
 * - Displays clear warnings about the permanent nature of the action
 * 
 * This action cannot be undone - the account is permanently deactivated.
 * 
 * @param props - Component props
 * @param props.open - Whether the dialog is visible
 * @param props.onOpenChange - Callback when visibility changes
 * @param props.manager - The event manager to deactivate
 * 
 * @example
 * ```tsx
 * <DeactivateDialog
 *   open={showDeactivateDialog}
 *   onOpenChange={setShowDeactivateDialog}
 *   manager={selectedManager}
 * />
 * ```
 */
export function DeactivateDialog({
  open,
  onOpenChange,
  manager,
}: DeactivateDialogProps) {
  const [transferToUserId, setTransferToUserId] = useState<string>("")
  
  const deactivateMutation = useDeactivateEventManager()
  const { data: allManagers } = useEventManagers()
  
  const isLoading = deactivateMutation.isPending
  const hasEvents = (manager?.assignedEventCount ?? 0) > 0

  // Filter available transfer destinations
  const transferDestinations = allManagers?.filter(m => 
    m.id !== manager?.id && 
    m.status === "Active" &&
    (m.role === "Admin" || m.role === "EventManager")
  ) ?? []

  // Reset transfer selection when dialog opens
  useEffect(() => {
    if (open) {
      setTransferToUserId("")
    }
  }, [open])

  const handleConfirm = async () => {
    if (!manager) return
    
    // Require transfer destination if manager has events
    if (hasEvents && !transferToUserId) {
      return
    }
    
    try {
      await deactivateMutation.mutateAsync({
        id: manager.id,
        transferToUserId: hasEvents ? transferToUserId : "",
      })
      onOpenChange(false)
    } catch (error) {
      // Error handled by mutation hooks
    }
  }

  if (!manager) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-100 p-2">
              <UserX className="h-5 w-5 text-red-600" />
            </div>
            <SheetTitle>Deactivate {manager.name}?</SheetTitle>
          </div>
          <SheetDescription className="pt-2">
            This action is permanent. <strong>{manager.name}</strong> will no longer be able to 
            access the platform and their account cannot be reactivated.
          </SheetDescription>
        </SheetHeader>
        
        {hasEvents ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">
                    Event transfer required
                  </p>
                  <p className="text-amber-700 mt-1">
                    {manager.name} has {manager.assignedEventCount} assigned event{manager.assignedEventCount !== 1 ? "s" : ""}. 
                    You must select a new manager to transfer these events to before deactivating.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="transfer-to">Transfer events to</Label>
              <Select value={transferToUserId} onValueChange={setTransferToUserId}>
                <SelectTrigger id="transfer-to">
                  <SelectValue placeholder="Select a manager..." />
                </SelectTrigger>
                <SelectContent>
                  {transferDestinations.length === 0 ? (
                    <div className="p-2 text-sm text-ora-graphite text-center">
                      No available managers
                    </div>
                  ) : (
                    transferDestinations.map((dest) => (
                      <SelectItem key={dest.id} value={dest.id}>
                        <div className="flex items-center gap-2">
                          <span>{dest.name}</span>
                          <span className="text-ora-graphite">({dest.email})</span>
                          {dest.role === "Admin" && (
                            <span className="text-xs text-ora-gold">Admin</span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            
            {transferToUserId && (
              <div className="rounded-lg bg-ora-cream p-3 text-sm">
                <div className="flex items-center gap-2 text-ora-charcoal">
                  <Users className="h-4 w-4" />
                  <span>{manager.assignedEventCount} event{manager.assignedEventCount !== 1 ? "s" : ""}</span>
                  <ArrowRight className="h-4 w-4" />
                  <span className="font-medium">
                    {transferDestinations.find(d => d.id === transferToUserId)?.name}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-ora-cream p-3 text-sm text-ora-graphite">
            <p>
              {manager.name} has no assigned events. You can proceed with deactivation immediately.
            </p>
          </div>
        )}
        
        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            isLoading={isLoading}
            disabled={hasEvents && !transferToUserId}
          >
            Deactivate
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
