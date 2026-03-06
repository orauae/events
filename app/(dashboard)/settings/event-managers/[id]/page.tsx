"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft,
  Mail, 
  Calendar,
  Shield,
  ShieldCheck,
  ShieldOff,
  Edit,
  Pause,
  Play,
  UserX,
  Check,
  X,
  ExternalLink,
} from "lucide-react"
import { useEventManager } from "@/hooks/use-event-managers"
import { useRole } from "@/hooks/use-auth"
import { PageHeader } from "@/components/layout"
import { 
  Button, 
  Badge, 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent,
  CardDescription,
} from "@/components/ui"
import { Skeleton } from "@/components/ui/skeleton"
import type { ManagerStatus } from "@/db/schema"
import { EventManagerFormDialog } from "@/components/settings/event-manager-form"
import { 
  SuspendDialog, 
  DeactivateDialog 
} from "@/components/settings/status-management-dialogs"

/**
 * Status badge color mapping
 */
const statusColors: Record<ManagerStatus, "success" | "warning" | "danger"> = {
  Active: "success",
  Suspended: "warning",
  Deactivated: "danger",
}

/**
 * Format date for display
 */
function formatDate(date: Date | string | null) {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Permission item component
 */
function PermissionItem({ 
  label, 
  enabled, 
  description 
}: { 
  label: string
  enabled: boolean
  description: string 
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-ora-sand last:border-b-0">
      <div>
        <div className="text-sm font-medium text-ora-charcoal">{label}</div>
        <div className="text-xs text-ora-graphite">{description}</div>
      </div>
      <div className={`flex items-center gap-1 ${enabled ? "text-green-600" : "text-ora-stone"}`}>
        {enabled ? (
          <>
            <Check className="h-4 w-4" />
            <span className="text-sm">Enabled</span>
          </>
        ) : (
          <>
            <X className="h-4 w-4" />
            <span className="text-sm">Disabled</span>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Loading skeleton for the detail page
 */
function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-48" />
    </div>
  )
}

/**
 * Event Manager Detail Page
 * Requirements: 3.3
 */
export default function EventManagerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const managerId = params.id as string
  
  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false)
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  
  const { data: manager, isLoading, error } = useEventManager(managerId)
  const { isAdmin, isLoading: roleLoading } = useRole()

  // Access denied for non-admins
  if (!roleLoading && !isAdmin) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-12 text-center">
        <ShieldOff className="mx-auto h-12 w-12 text-red-400 mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">
          Access Denied
        </h3>
        <p className="text-sm text-red-600">
          You don&apos;t have permission to access this page.
        </p>
      </div>
    )
  }

  if (isLoading || roleLoading) {
    return (
      <div>
        <PageHeader title="Event Manager Details" />
        <DetailSkeleton />
      </div>
    )
  }

  if (error || !manager) {
    return (
      <div>
        <PageHeader title="Event Manager Details">
          <Link href="/settings/event-managers">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to List
            </Button>
          </Link>
        </PageHeader>
        <div className="rounded-lg border border-red-200 bg-red-50 p-12 text-center">
          <h3 className="text-lg font-medium text-red-800 mb-2">
            Manager Not Found
          </h3>
          <p className="text-sm text-red-600">
            The event manager you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    )
  }

  // Convert manager to the format expected by dialogs
  const managerForDialogs = {
    ...manager,
    lastActiveAt: null,
  }

  return (
    <div>
      <PageHeader title="Event Manager Details">
        <Link href="/settings/event-managers">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back to List
          </Button>
        </Link>
      </PageHeader>

      {/* Profile Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ora-cream text-ora-charcoal text-2xl font-semibold">
            {manager.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-ora-charcoal">{manager.name}</h2>
              <Badge variant={statusColors[manager.status]}>
                {manager.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-ora-graphite mt-1">
              <Mail className="h-4 w-4" />
              <span>{manager.email}</span>
            </div>
            <div className="flex items-center gap-1 text-sm text-ora-graphite mt-1">
              {manager.role === "Admin" ? (
                <ShieldCheck className="h-4 w-4 text-ora-gold" />
              ) : (
                <Shield className="h-4 w-4" />
              )}
              <span>{manager.role}</span>
            </div>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
            <Edit className="h-4 w-4" />
            Edit
          </Button>
          {manager.status === "Active" && manager.role !== "Admin" && (
            <Button variant="outline" onClick={() => setSuspendDialogOpen(true)}>
              <Pause className="h-4 w-4" />
              Suspend
            </Button>
          )}
          {manager.status === "Suspended" && (
            <Button variant="outline" onClick={() => setSuspendDialogOpen(true)}>
              <Play className="h-4 w-4" />
              Reactivate
            </Button>
          )}
          {manager.status !== "Deactivated" && manager.role !== "Admin" && (
            <Button variant="danger" onClick={() => setDeactivateDialogOpen(true)}>
              <UserX className="h-4 w-4" />
              Deactivate
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Profile Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between py-2 border-b border-ora-sand">
              <span className="text-sm text-ora-graphite">Email</span>
              <span className="text-sm text-ora-charcoal">{manager.email}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-ora-sand">
              <span className="text-sm text-ora-graphite">Role</span>
              <span className="text-sm text-ora-charcoal">{manager.role}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-ora-sand">
              <span className="text-sm text-ora-graphite">Status</span>
              <Badge variant={statusColors[manager.status]} className="text-xs">
                {manager.status}
              </Badge>
            </div>
            <div className="flex justify-between py-2 border-b border-ora-sand">
              <span className="text-sm text-ora-graphite">Email Verified</span>
              <span className="text-sm text-ora-charcoal">
                {manager.emailVerified ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-ora-sand">
              <span className="text-sm text-ora-graphite">Created</span>
              <span className="text-sm text-ora-charcoal">{formatDate(manager.createdAt)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-ora-graphite">Last Updated</span>
              <span className="text-sm text-ora-charcoal">{formatDate(manager.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Permissions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Permissions</CardTitle>
            <CardDescription>
              {manager.role === "Admin" 
                ? "Admin users have full access to all features"
                : "Configured capabilities for this event manager"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {manager.role === "Admin" ? (
              <div className="rounded-lg bg-ora-cream p-4 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-ora-gold mb-2" />
                <p className="text-sm text-ora-charcoal font-medium">Full Access</p>
                <p className="text-xs text-ora-graphite mt-1">
                  Admin users can perform all actions
                </p>
              </div>
            ) : manager.permissions ? (
              <div>
                <PermissionItem
                  label="Create Events"
                  enabled={manager.permissions.canCreateEvents}
                  description="Can create new events"
                />
                <PermissionItem
                  label="Upload Excel"
                  enabled={manager.permissions.canUploadExcel}
                  description="Can import guests via Excel"
                />
                <PermissionItem
                  label="Send Campaigns"
                  enabled={manager.permissions.canSendCampaigns}
                  description="Can send email campaigns"
                />
                <PermissionItem
                  label="Manage Automations"
                  enabled={manager.permissions.canManageAutomations}
                  description="Can create and edit automations"
                />
                <PermissionItem
                  label="Delete Guests"
                  enabled={manager.permissions.canDeleteGuests}
                  description="Can remove guests from events"
                />
              </div>
            ) : (
              <p className="text-sm text-ora-graphite text-center py-4">
                No permissions configured
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assigned Events */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Assigned Events</CardTitle>
              <CardDescription>
                Events currently assigned to this manager
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-ora-graphite">
              <Calendar className="h-4 w-4" />
              <span className="text-sm font-medium">{manager.assignedEventCount} events</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {manager.assignedEvents && manager.assignedEvents.length > 0 ? (
            <div className="divide-y divide-ora-sand">
              {manager.assignedEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium text-ora-charcoal">{event.name}</div>
                    <div className="text-xs text-ora-graphite">
                      {formatDate(event.startDate)}
                    </div>
                  </div>
                  <Link href={`/events/${event.id}`}>
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="h-4 w-4" />
                      View
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Calendar className="mx-auto h-8 w-8 text-ora-stone mb-2" />
              <p className="text-sm text-ora-graphite">No events assigned</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <EventManagerFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        manager={managerForDialogs}
      />

      {/* Suspend/Reactivate Dialog */}
      <SuspendDialog
        open={suspendDialogOpen}
        onOpenChange={setSuspendDialogOpen}
        manager={managerForDialogs}
      />

      {/* Deactivate Dialog */}
      <DeactivateDialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
        manager={managerForDialogs}
      />
    </div>
  )
}
