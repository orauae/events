"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { 
  Plus, 
  Search, 
  Users, 
  Mail, 
  Calendar,
  MoreHorizontal,
  Eye,
  Edit,
  Pause,
  Play,
  UserX,
  Shield,
  ShieldCheck,
  ShieldOff,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react"
import { useEventManagers } from "@/hooks/use-event-managers"
import { useRole } from "@/hooks/use-auth"
import { PageHeader, DataTable } from "@/components/layout"
import { Button, Input, Badge } from "@/components/ui"
import { GuestTableSkeleton } from "@/components/skeletons"
import type { EventManagerWithStats } from "@/lib/services/event-manager-service"
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
 * Permission indicator component
 */
function PermissionIndicators({ permissions }: { permissions: EventManagerWithStats["permissions"] }) {
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
            className={`h-2 w-2 rounded-full ${
              perm.enabled ? "bg-green-500" : "bg-ora-stone"
            }`}
            title={`${perm.label}: ${perm.enabled ? "Enabled" : "Disabled"}`}
          />
        ))}
      </div>
    </div>
  )
}

type SortField = "name" | "email" | "createdAt" | "assignedEventCount"
type SortOrder = "asc" | "desc"

export default function EventManagersPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [sortField, setSortField] = useState<SortField>("createdAt")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editManager, setEditManager] = useState<EventManagerWithStats | null>(null)
  const [suspendManager, setSuspendManager] = useState<EventManagerWithStats | null>(null)
  const [deactivateManager, setDeactivateManager] = useState<EventManagerWithStats | null>(null)
  
  const { data: managers, isLoading, error } = useEventManagers(debouncedQuery)
  const { isAdmin, isLoading: roleLoading } = useRole()

  // Simple debounce for search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(value)
    }, 300)
    return () => clearTimeout(timeoutId)
  }

  // Sort managers
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

  // Toggle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("asc")
    }
  }

  // Sort header component
  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-ora-charcoal"
    >
      {children}
      {sortField === field ? (
        sortOrder === "asc" ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )
      ) : (
        <ArrowUpDown className="h-4 w-4 opacity-50" />
      )}
    </button>
  )

  // Access denied for non-admins
  if (!roleLoading && !isAdmin) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-12 text-center">
        <ShieldOff className="mx-auto h-12 w-12 text-red-400 mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">
          Access Denied
        </h3>
        <p className="text-sm text-red-600">
          You don&apos;t have permission to access this page. Only administrators can manage event managers.
        </p>
      </div>
    )
  }

  const columns = [
    {
      key: "name",
      header: <SortHeader field="name">Name</SortHeader>,
      cell: (manager: EventManagerWithStats) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ora-cream text-ora-charcoal font-medium">
            {manager.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-ora-charcoal">{manager.name}</div>
            <div className="flex items-center gap-1 text-xs text-ora-graphite">
              {manager.role === "Admin" ? (
                <ShieldCheck className="h-3 w-3 text-ora-gold" />
              ) : (
                <Shield className="h-3 w-3" />
              )}
              {manager.role}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "email",
      header: <SortHeader field="email">Email</SortHeader>,
      cell: (manager: EventManagerWithStats) => (
        <div className="flex items-center gap-2 text-ora-graphite">
          <Mail className="h-4 w-4" />
          <span>{manager.email}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (manager: EventManagerWithStats) => (
        <Badge variant={statusColors[manager.status]}>
          {manager.status}
        </Badge>
      ),
    },
    {
      key: "events",
      header: <SortHeader field="assignedEventCount">Events</SortHeader>,
      cell: (manager: EventManagerWithStats) => (
        <div className="flex items-center gap-2 text-ora-graphite">
          <Calendar className="h-4 w-4" />
          <span>{manager.assignedEventCount}</span>
        </div>
      ),
    },
    {
      key: "permissions",
      header: "Permissions",
      cell: (manager: EventManagerWithStats) => (
        manager.role === "Admin" ? (
          <span className="text-sm text-ora-gold font-medium">Full Access</span>
        ) : (
          <PermissionIndicators permissions={manager.permissions} />
        )
      ),
    },
    {
      key: "createdAt",
      header: <SortHeader field="createdAt">Added</SortHeader>,
      cell: (manager: EventManagerWithStats) => (
        <span className="text-ora-graphite">{formatDate(manager.createdAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (manager: EventManagerWithStats) => (
        <div className="flex items-center gap-1">
          <Link href={`/settings/event-managers/${manager.id}`}>
            <Button variant="ghost" size="icon" title="View details">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          <Button 
            variant="ghost" 
            size="icon" 
            title="Edit"
            onClick={() => setEditManager(manager)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          {manager.status === "Active" && manager.role !== "Admin" && (
            <Button 
              variant="ghost" 
              size="icon" 
              title="Suspend"
              onClick={() => setSuspendManager(manager)}
            >
              <Pause className="h-4 w-4" />
            </Button>
          )}
          {manager.status === "Suspended" && (
            <Button 
              variant="ghost" 
              size="icon" 
              title="Reactivate"
              onClick={() => setSuspendManager(manager)}
            >
              <Play className="h-4 w-4" />
            </Button>
          )}
          {manager.status !== "Deactivated" && manager.role !== "Admin" && (
            <Button 
              variant="ghost" 
              size="icon" 
              title="Deactivate"
              onClick={() => setDeactivateManager(manager)}
            >
              <UserX className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Event Managers"
        description="Manage team members and their permissions"
      >
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Manager
        </Button>
      </PageHeader>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ora-graphite" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {(isLoading || roleLoading) && <GuestTableSkeleton rows={5} />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          Failed to load event managers. Please try again.
        </div>
      )}

      {sortedManagers && sortedManagers.length === 0 && !debouncedQuery && !isLoading && (
        <div className="rounded-lg border border-ora-sand bg-ora-white p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-ora-stone mb-4" />
          <h3 className="text-lg font-medium text-ora-charcoal mb-2">
            No event managers yet
          </h3>
          <p className="text-sm text-ora-graphite mb-4">
            Add your first event manager to delegate event management
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Manager
          </Button>
        </div>
      )}

      {sortedManagers && sortedManagers.length === 0 && debouncedQuery && !isLoading && (
        <div className="rounded-lg border border-ora-sand bg-ora-white p-12 text-center">
          <Search className="mx-auto h-12 w-12 text-ora-stone mb-4" />
          <h3 className="text-lg font-medium text-ora-charcoal mb-2">
            No results found
          </h3>
          <p className="text-sm text-ora-graphite">
            No managers match &quot;{debouncedQuery}&quot;. Try a different search term.
          </p>
        </div>
      )}

      {sortedManagers && sortedManagers.length > 0 && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-ora-graphite">
              {sortedManagers.length} manager{sortedManagers.length !== 1 ? "s" : ""} found
            </p>
          </div>
          <DataTable
            columns={columns}
            data={sortedManagers}
            keyExtractor={(manager) => manager.id}
            emptyMessage="No event managers found"
          />
        </>
      )}

      {/* Create/Edit Dialog */}
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

      {/* Suspend/Reactivate Dialog */}
      <SuspendDialog
        open={!!suspendManager}
        onOpenChange={(open: boolean) => !open && setSuspendManager(null)}
        manager={suspendManager}
      />

      {/* Deactivate Dialog */}
      <DeactivateDialog
        open={!!deactivateManager}
        onOpenChange={(open: boolean) => !open && setDeactivateManager(null)}
        manager={deactivateManager}
      />
    </div>
  )
}
