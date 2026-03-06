"use client"

import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import {
  Zap,
  Plus,
  Play,
  Pause,
  Copy,
  Trash2,
  Clock,
  CheckCircle2,
  FileText,
  MoreHorizontal,
  Sparkles,
} from "lucide-react"
import {
  useAutomationsByEvent,
  useDeleteAutomation,
  useDuplicateAutomation,
  useSetAutomationStatus,
} from "@/hooks/use-automations"
import { TemplateLibrary } from "@/components/automation-builder"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui"
import { DataTable } from "@/components/layout"
import type { Automation, AutomationStatus } from "@/db/schema"

interface AutomationsTabProps {
  eventId: string
}

// Status configuration
const statusConfig: Record<AutomationStatus, { label: string; variant: "default" | "success" | "warning" | "secondary"; icon: React.ReactNode }> = {
  Draft: { label: "Draft", variant: "secondary", icon: <FileText className="h-3 w-3" /> },
  Active: { label: "Active", variant: "success", icon: <CheckCircle2 className="h-3 w-3" /> },
  Paused: { label: "Paused", variant: "warning", icon: <Pause className="h-3 w-3" /> },
}

function formatDate(date: Date | string | null) {
  if (!date) return "Never"
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}


function DeleteConfirmSheet({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  automationName,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  isDeleting: boolean
  automationName: string
}) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[70vw] sm:max-w-[70vw]">
        <SheetHeader>
          <SheetTitle>Delete Automation</SheetTitle>
          <SheetDescription>
            Are you sure you want to delete &quot;{automationName}&quot;? This action cannot be undone.
          </SheetDescription>
        </SheetHeader>
        
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} isLoading={isDeleting}>
            Delete
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function AutomationsTab({ eventId }: AutomationsTabProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: automations, isLoading, error } = useAutomationsByEvent(eventId)
  const deleteAutomation = useDeleteAutomation()
  const duplicateAutomation = useDuplicateAutomation()
  const setStatus = useSetAutomationStatus()

  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false)
  const [automationToDelete, setAutomationToDelete] = useState<Automation | null>(null)

  // Detect if we're in admin context based on pathname
  const isAdminContext = pathname.startsWith('/admin')
  const basePath = isAdminContext ? `/admin/events/${eventId}` : `/events/${eventId}`

  const handleDelete = async () => {
    if (!automationToDelete) return
    try {
      await deleteAutomation.mutateAsync(automationToDelete.id)
      setAutomationToDelete(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleDuplicate = async (automation: Automation) => {
    try {
      await duplicateAutomation.mutateAsync(automation.id)
    } catch {
      // Error handled by mutation
    }
  }

  const handleToggleStatus = async (automation: Automation) => {
    const newStatus: AutomationStatus = automation.status === "Active" ? "Paused" : "Active"
    try {
      await setStatus.mutateAsync({ id: automation.id, status: newStatus })
    } catch {
      // Error handled by mutation
    }
  }

  const handleImportSuccess = (automationId: string) => {
    // Navigate to the automation editor after import
    router.push(`${basePath}/automations/${automationId}`)
  }

  const columns = [
    {
      key: "name",
      header: "Automation",
      cell: (automation: Automation) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ora-gold/10">
            <Zap className="h-4 w-4 text-ora-gold" />
          </div>
          <div>
            <div className="font-medium text-ora-charcoal">{automation.name}</div>
            {automation.description && (
              <div className="text-xs text-ora-graphite truncate max-w-[200px]">
                {automation.description}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (automation: Automation) => {
        const config = statusConfig[automation.status]
        return (
          <Badge variant={config.variant} className="gap-1">
            {config.icon}
            {config.label}
          </Badge>
        )
      },
    },
    {
      key: "updatedAt",
      header: "Last Modified",
      cell: (automation: Automation) => (
        <span className="text-ora-graphite text-sm flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDate(automation.updatedAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (automation: Automation) => (
        <div className="flex items-center gap-1">
          {automation.status !== "Draft" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                handleToggleStatus(automation)
              }}
              disabled={setStatus.isPending}
              title={automation.status === "Active" ? "Pause" : "Activate"}
            >
              {automation.status === "Active" ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
          )}
          {automation.status === "Draft" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                handleToggleStatus(automation)
              }}
              disabled={setStatus.isPending}
              title="Activate"
            >
              <Play className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleDuplicate(automation)
            }}
            disabled={duplicateAutomation.isPending}
            title="Duplicate"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setAutomationToDelete(automation)
            }}
            title="Delete"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
      className: "w-32",
    },
  ]

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Automations</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowTemplateLibrary(true)}>
                <Sparkles className="h-4 w-4" />
                Use Template
              </Button>
              <Button onClick={() => router.push(`${basePath}/automations/new`)}>
                <Plus className="h-4 w-4" />
                Create Automation
              </Button>
            </div>
          </div>
          <CardDescription>
            Automate guest communications and workflows based on event triggers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-ora-sand/50 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              Failed to load automations. Please try again.
            </div>
          )}

          {automations && automations.length === 0 && (
            <div className="py-12 text-center">
              <Zap className="mx-auto h-12 w-12 text-ora-stone mb-4" />
              <h3 className="text-lg font-medium text-ora-charcoal mb-2">
                No automations yet
              </h3>
              <p className="text-sm text-ora-graphite mb-6">
                Create automated workflows to send emails, update guest tags, and more based on event triggers
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" onClick={() => setShowTemplateLibrary(true)}>
                  <Sparkles className="h-4 w-4" />
                  Use Template
                </Button>
                <Button onClick={() => router.push(`${basePath}/automations/new`)}>
                  <Plus className="h-4 w-4" />
                  Create from Scratch
                </Button>
              </div>
            </div>
          )}

          {automations && automations.length > 0 && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-ora-graphite">
                  {automations.length} automation{automations.length !== 1 ? "s" : ""}
                </p>
                <div className="flex gap-2 text-xs text-ora-graphite">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    {automations.filter((a) => a.status === "Active").length} active
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3 text-ora-graphite" />
                    {automations.filter((a) => a.status === "Draft").length} drafts
                  </span>
                </div>
              </div>
              <DataTable
                columns={columns}
                data={automations}
                keyExtractor={(a) => a.id}
                emptyMessage="No automations found"
                onRowClick={(automation) => router.push(`${basePath}/automations/${automation.id}`)}
              />
            </>
          )}
        </CardContent>
      </Card>

      <TemplateLibrary
        isOpen={showTemplateLibrary}
        onClose={() => setShowTemplateLibrary(false)}
        eventId={eventId}
        onImportSuccess={handleImportSuccess}
      />

      <DeleteConfirmSheet
        isOpen={!!automationToDelete}
        onClose={() => setAutomationToDelete(null)}
        onConfirm={handleDelete}
        isDeleting={deleteAutomation.isPending}
        automationName={automationToDelete?.name || ""}
      />
    </>
  )
}
