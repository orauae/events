/**
 * @fileoverview Admin Managers Page - Event Manager Administration
 * 
 * This page provides administrators with tools to manage event managers,
 * including creating new managers, editing permissions, and managing
 * account statuses (suspend, reactivate, deactivate).
 * 
 * ## Features
 * - View all event managers with sorting
 * - Search by name or email
 * - Create new event managers
 * - Edit manager details and permissions
 * - Suspend/reactivate managers
 * - Permanently deactivate managers with event transfer
 * - Visual permission indicators
 * 
 * ## Access Control
 * - Requires Admin role
 * - Protected by middleware authentication
 * 
 * @module app/admin/managers/page
 * @requires @/hooks/use-event-managers - Event manager data fetching
 * @requires @/components/ui - UI components
 * @requires @/components/settings - Settings components
 */

"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { 
  Plus, 
  Search, 
  Users, 
  Mail, 
  Calendar,
  Eye,
  Edit,
  Pause,
  Play,
  UserX,
  Shield,
  ShieldCheck,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react"
import { useEventManagers } from "@/hooks/use-event-managers"
import { Button, Input, Badge, Card } from "@/components/ui"
import { GuestTableSkeleton } from "@/components/skeletons"
import type { EventManagerWithStats } from "@/lib/services/event-manager-service"
import type { ManagerStatus } from "@/db/schema"
import { EventManagerFormDialog } from "@/components/settings/event-manager-form"
import { SuspendDialog, DeactivateDialog } from "@/components/settings/status-management-dialogs"

/**
 * Color mapping for manager status badges.
 * Maps status values to badge color variants.
 */
const statusColors: Record<ManagerStatus, "success" | "warning" | "danger"> = {
  Active: "success",
  Suspended: "warning",
  Deactivated: "danger",
}

/**
 * Formats a date for display, handling null values.
 * 
 * @param date - Date to format (Date object, ISO string, or null)
 * @returns Formatted date string or em-dash for null
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
 * Props for the PermissionIndicators component.
 */
interface PermissionIndicatorsProps {
  /** The permissions object from the event manager */
  permissions: EventManagerWithStats["permissions"]
}

/**
 * Visual indicator showing enabled/disabled permissions.
 * 
 * Displays a count (e.g., "3/5") and colored dots for each permission.
 * Green dots indicate enabled permissions, gray dots indicate disabled.
 * 
 * @param props - Component props
 * @param props.permissions - Permission flags to display
 */
function PermissionIndicators({ permissions }: PermissionIndicatorsProps) {
  if (!permissions) return <span className="text-ora-stone">No permissions</span>
  
  const permissionList = [
    { key: "canCreateEvents", label: "Create", enabled: permissions.canCreateEvents },
    { key: "canUploadExcel", label: "Excel", enabled: permissions.canUploadExcel },
    { key: "canSendCampaigns", label: "Campaigns", enabled: permissions.canSendCampaigns },
    { key: "canManageAutomations", label: "Automations", enabled: permissions.canManageAutomations },
    { key: "canDeleteGuests", label: "Delete", enabled: permissions.canDeleteGuests },
  ]

  const enabledCount = permissionList.filter(p => p.enabled).length

  return (
    <div className="flex items-center gap-1">
      <span className="text-sm text-ora-graphite">{enabledCount}/5</span>
      <div className="flex gap-0.5">
        {permissionList.map((perm) => (
          <div
            key={perm.key}
            className={`h-2 w-2 rounded-full ${perm.enabled ? "bg-green-500" : "bg-ora-stone"}`}
            title={`${perm.label}: ${perm.enabled ? "Enabled" : "Disabled"}`}
          />
        ))}
      </div>
    </div>
  )
}

/** Available fields for sorting the manager table */
type SortField = "name" | "email" | "createdAt" | "assignedEventCount"

/** Sort direction */
type SortOrder = "asc" | "desc"

/**
 * Admin Managers Page - Main page component.
 * 
 * Displays a sortable table of all event managers with:
 * - Search functionality with debouncing
 * - Column sorting (name, email, date, event count)
 * - Manager creation dialog
 * - Edit, suspend, and deactivate actions
 * - Permission indicators
 * - Loading and error states
 * 
 * @returns The admin managers page component
 */
export default function AdminManagersPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [sortField, setSortField] = useState<SortField>("createdAt")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editManager, setEditManager] = useState<EventManagerWithStats | null>(null)
  const [suspendManager, setSuspendManager] = useState<EventManagerWithStats | null>(null)
  const [deactivateManager, setDeactivateManager] = useState<EventManagerWithStats | null>(null)
  
  const { data: managers, isLoading, error } = useEventManagers(debouncedQuery)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(value)
    }, 300)
    return () => clearTimeout(timeoutId)
  }

  const sortedManagers = useMemo(() => {
    if (!managers) return []
    
    return [...managers].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name)
          break
        case "email":
          comparison = a.email.localeCompare(b.email)
          break
        case "createdAt":
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case "assignedEventCount":
          comparison = a.assignedEventCount - b.assignedEventCount
          break
      }
      return sortOrder === "asc" ? comparison : -comparison
    })
  }, [managers, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("asc")
    }
  }

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button onClick={() => handleSort(field)} className="flex items-center gap-1 hover:text-ora-charcoal">
      {children}
      {sortField === field ? (
        sortOrder === "asc" ? <ChevronUp className="h-4 w-4 stroke-1" /> : <ChevronDown className="h-4 w-4 stroke-1" />
      ) : (
        <ArrowUpDown className="h-4 w-4 stroke-1 opacity-50" />
      )}
    </button>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-ora-charcoal">Event Managers</h1>
          <p className="text-sm text-ora-graphite mt-1">Manage team members and their permissions</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 stroke-1" />
          Add Manager
        </Button>
      </div>

      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 stroke-1 -translate-y-1/2 text-ora-graphite" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {isLoading && <GuestTableSkeleton rows={5} />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          Failed to load event managers. Please try again.
        </div>
      )}

      {sortedManagers && sortedManagers.length === 0 && !debouncedQuery && !isLoading && (
        <div className="rounded-lg border border-ora-sand bg-ora-white p-12 text-center">
          <Users className="mx-auto h-12 w-12 stroke-1 text-ora-stone mb-4" />
          <h3 className="text-lg font-medium text-ora-charcoal mb-2">No event managers yet</h3>
          <p className="text-sm text-ora-graphite mb-4">Add your first event manager to delegate event management</p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 stroke-1" />
            Add Manager
          </Button>
        </div>
      )}

      {sortedManagers && sortedManagers.length === 0 && debouncedQuery && !isLoading && (
        <div className="rounded-lg border border-ora-sand bg-ora-white p-12 text-center">
          <Search className="mx-auto h-12 w-12 stroke-1 text-ora-stone mb-4" />
          <h3 className="text-lg font-medium text-ora-charcoal mb-2">No results found</h3>
          <p className="text-sm text-ora-graphite">No managers match &quot;{debouncedQuery}&quot;.</p>
        </div>
      )}

      {sortedManagers && sortedManagers.length > 0 && (
        <>
          <div className="mb-4">
            <p className="text-sm text-ora-graphite">{sortedManagers.length} manager{sortedManagers.length !== 1 ? "s" : ""}</p>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full">
              <thead className="bg-ora-cream border-b border-ora-sand">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ora-graphite"><SortHeader field="name">Name</SortHeader></th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ora-graphite"><SortHeader field="email">Email</SortHeader></th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ora-graphite">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ora-graphite"><SortHeader field="assignedEventCount">Events</SortHeader></th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ora-graphite">Permissions</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ora-graphite"><SortHeader field="createdAt">Added</SortHeader></th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ora-graphite">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedManagers.map((manager) => (
                  <tr key={manager.id} className="border-b border-ora-sand last:border-0 hover:bg-ora-cream/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ora-cream text-ora-charcoal font-medium">
                          {manager.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-ora-charcoal">{manager.name}</div>
                          <div className="flex items-center gap-1 text-xs text-ora-graphite">
                            {manager.role === "Admin" ? <ShieldCheck className="h-3 w-3 stroke-1 text-ora-gold" /> : <Shield className="h-3 w-3 stroke-1" />}
                            {manager.role}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-ora-graphite">
                        <Mail className="h-4 w-4 stroke-1" />
                        <span>{manager.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge variant={statusColors[manager.status]}>{manager.status}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-ora-graphite">
                        <Calendar className="h-4 w-4 stroke-1" />
                        <span>{manager.assignedEventCount}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {manager.role === "Admin" ? (
                        <span className="text-sm text-ora-gold font-medium">Full Access</span>
                      ) : (
                        <PermissionIndicators permissions={manager.permissions} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-ora-graphite">{formatDate(manager.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link href={`/admin/managers/${manager.id}`}>
                          <Button variant="ghost" size="icon" title="View details"><Eye className="h-4 w-4 stroke-1" /></Button>
                        </Link>
                        <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditManager(manager)}><Edit className="h-4 w-4 stroke-1" /></Button>
                        {manager.status === "Active" && manager.role !== "Admin" && (
                          <Button variant="ghost" size="icon" title="Suspend" onClick={() => setSuspendManager(manager)}><Pause className="h-4 w-4 stroke-1" /></Button>
                        )}
                        {manager.status === "Suspended" && (
                          <Button variant="ghost" size="icon" title="Reactivate" onClick={() => setSuspendManager(manager)}><Play className="h-4 w-4 stroke-1" /></Button>
                        )}
                        {manager.status !== "Deactivated" && manager.role !== "Admin" && (
                          <Button variant="ghost" size="icon" title="Deactivate" onClick={() => setDeactivateManager(manager)}><UserX className="h-4 w-4 stroke-1" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <EventManagerFormDialog
        open={createDialogOpen || !!editManager}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setCreateDialogOpen(false)
            setEditManager(null)
          }
        }}
        manager={editManager}
      />
      <SuspendDialog open={!!suspendManager} onOpenChange={(open: boolean) => !open && setSuspendManager(null)} manager={suspendManager} />
      <DeactivateDialog open={!!deactivateManager} onOpenChange={(open: boolean) => !open && setDeactivateManager(null)} manager={deactivateManager} />
    </div>
  )
}
