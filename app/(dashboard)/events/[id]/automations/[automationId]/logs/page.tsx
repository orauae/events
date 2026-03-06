"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  Filter,
  ChevronRight,
  Zap,
  ExternalLink,
  Pause,
} from "lucide-react"
import { useAutomation } from "@/hooks/use-automations"
import { useAutomationExecutions, useSyncAllExecutions } from "@/hooks/use-automation-executions"
import { PageHeader, DataTable } from "@/components/layout"
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
} from "@/components/ui"
import { toast } from "sonner"
import type { ExecutionStatus, AutomationExecution } from "@/db/schema"

// Extended status type to include "Waiting" for UI display
type DisplayStatus = ExecutionStatus | "Waiting"

// Status configuration with Waiting status for delayed executions
const statusConfig: Record<DisplayStatus, { label: string; variant: "default" | "success" | "danger" | "warning" | "secondary"; icon: React.ReactNode }> = {
  Running: { label: "Running", variant: "default", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  Waiting: { label: "Waiting", variant: "secondary", icon: <Pause className="h-3 w-3" /> },
  Success: { label: "Success", variant: "success", icon: <CheckCircle2 className="h-3 w-3" /> },
  Failed: { label: "Failed", variant: "danger", icon: <XCircle className="h-3 w-3" /> },
  Partial: { label: "Partial", variant: "warning", icon: <AlertTriangle className="h-3 w-3" /> },
}

/**
 * Determine if an execution is in a waiting state based on its steps.
 * An execution is waiting if it's running and has a step with wait output.
 */
function isExecutionWaiting(execution: AutomationExecution): boolean {
  // Check if execution has steps with wait information in output
  // This is determined by checking if the execution is running and has wait data
  if (execution.status !== "Running") return false
  
  // Check trigger data for wait information
  const triggerData = execution.triggerData as Record<string, unknown> | null
  if (triggerData?.waitingUntil) return true
  
  return false
}

/**
 * Get the display status for an execution, accounting for waiting state.
 */
function getDisplayStatus(execution: AutomationExecution): DisplayStatus {
  if (isExecutionWaiting(execution)) return "Waiting"
  return execution.status
}

function formatDate(date: Date | string | null) {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDuration(start: Date | string, end: Date | string | null) {
  if (!end) return "In progress"
  const startTime = new Date(start).getTime()
  const endTime = new Date(end).getTime()
  const durationMs = endTime - startTime

  if (durationMs < 1000) return `${durationMs}ms`
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`
  return `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
}

/**
 * Format elapsed time for running executions.
 * Shows time since execution started.
 */
function formatElapsedTime(start: Date | string): string {
  const startTime = new Date(start).getTime()
  const now = Date.now()
  const elapsedMs = now - startTime

  if (elapsedMs < 1000) return "Just started"
  if (elapsedMs < 60000) return `${Math.floor(elapsedMs / 1000)}s elapsed`
  if (elapsedMs < 3600000) return `${Math.floor(elapsedMs / 60000)}m elapsed`
  return `${Math.floor(elapsedMs / 3600000)}h ${Math.floor((elapsedMs % 3600000) / 60000)}m elapsed`
}

/**
 * Truncate Trigger.dev run ID for display.
 */
function truncateRunId(runId: string | null): string {
  if (!runId) return "—"
  if (runId.length <= 12) return runId
  return `${runId.slice(0, 8)}...`
}


function ExecutionLogsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-14 bg-ora-sand/50 rounded-lg animate-pulse" />
      ))}
    </div>
  )
}

/**
 * Component that displays elapsed time and updates every second.
 * Used for running/waiting executions to show real-time elapsed time.
 */
function ElapsedTimeDisplay({ startedAt }: { startedAt: Date | string }) {
  const [elapsed, setElapsed] = useState(() => formatElapsedTime(startedAt))

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(formatElapsedTime(startedAt))
    }, 1000)

    return () => clearInterval(interval)
  }, [startedAt])

  return (
    <span className="text-ora-graphite text-sm flex items-center gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      {elapsed}
    </span>
  )
}

export default function ExecutionLogsPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string
  const automationId = params.automationId as string

  const { data: automation, isLoading: automationLoading } = useAutomation(automationId)
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | "all">("all")
  const [page, setPage] = useState(0)
  const pageSize = 20

  const { data: executionsData, isLoading: executionsLoading, error, refetch } = useAutomationExecutions(
    automationId,
    { limit: pageSize, offset: page * pageSize }
  )
  const syncAllMutation = useSyncAllExecutions(automationId)

  const executions = executionsData?.executions ?? []
  const total = executionsData?.total ?? 0

  // Check if there are any running executions
  const hasRunningExecutions = executions.some((e) => e.status === "Running")

  // Handle sync all button click
  const handleSyncAll = async () => {
    try {
      const result = await syncAllMutation.mutateAsync()
      if (result.synced > 0) {
        toast.success(`Synced ${result.synced} execution(s)`)
        refetch()
      } else if (result.failed > 0) {
        toast.error(`Failed to sync ${result.failed} execution(s)`)
      } else {
        toast.info("No status changes detected")
      }
    } catch (err) {
      toast.error("Failed to sync execution statuses")
    }
  }

  // Filter executions by status
  const filteredExecutions = statusFilter === "all"
    ? executions
    : executions.filter((e) => e.status === statusFilter)

  const totalPages = Math.ceil(total / pageSize)

  const columns = [
    {
      key: "status",
      header: "Status",
      cell: (execution: typeof executions[0]) => {
        const displayStatus = getDisplayStatus(execution)
        const config = statusConfig[displayStatus]
        return (
          <Badge variant={config.variant} className="gap-1">
            {config.icon}
            {config.label}
          </Badge>
        )
      },
      className: "w-28",
    },
    {
      key: "triggerDevRunId",
      header: "Run ID",
      cell: (execution: typeof executions[0]) => {
        const runId = execution.triggerDevRunId
        if (!runId) return <span className="text-ora-stone text-sm">—</span>
        return (
          <span 
            className="text-ora-graphite text-sm font-mono cursor-help" 
            title={runId}
          >
            {truncateRunId(runId)}
          </span>
        )
      },
      className: "w-32",
    },
    {
      key: "startedAt",
      header: "Started",
      cell: (execution: typeof executions[0]) => (
        <span className="text-ora-graphite text-sm flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDate(execution.startedAt)}
        </span>
      ),
    },
    {
      key: "duration",
      header: "Duration",
      cell: (execution: typeof executions[0]) => {
        const displayStatus = getDisplayStatus(execution)
        // Show elapsed time for running/waiting executions
        if (displayStatus === "Running" || displayStatus === "Waiting") {
          return (
            <ElapsedTimeDisplay startedAt={execution.startedAt} />
          )
        }
        return (
          <span className="text-ora-graphite text-sm">
            {formatDuration(execution.startedAt, execution.completedAt)}
          </span>
        )
      },
      className: "w-32",
    },
    {
      key: "error",
      header: "Error",
      cell: (execution: typeof executions[0]) => (
        execution.error ? (
          <span className="text-red-600 text-sm truncate max-w-[200px] block" title={execution.error}>
            {execution.error}
          </span>
        ) : (
          <span className="text-ora-stone text-sm">—</span>
        )
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (execution: typeof executions[0]) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            router.push(`/events/${eventId}/automations/${automationId}/logs/${execution.id}`)
          }}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      ),
      className: "w-12",
    },
  ]


  if (automationLoading) {
    return (
      <div>
        <PageHeader title="Execution Logs">
          <Link href={`/events/${eventId}/automations/${automationId}`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to Editor
            </Button>
          </Link>
        </PageHeader>
        <Card>
          <CardContent className="py-8">
            <ExecutionLogsSkeleton />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={`Execution Logs: ${automation?.name || "Automation"}`}
        description="View the history of automation executions"
      >
        <Link href={`/events/${eventId}/automations/${automationId}`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back to Editor
          </Button>
        </Link>
      </PageHeader>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-ora-gold" />
                Execution History
              </CardTitle>
              <CardDescription>
                {total} execution{total !== 1 ? "s" : ""} recorded
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {/* Sync All Button - Requirement 10.6 */}
              {hasRunningExecutions && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncAll}
                  disabled={syncAllMutation.isPending}
                >
                  {syncAllMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : null}
                  Sync Running
                </Button>
              )}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-ora-graphite" />
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as ExecutionStatus | "all")}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="Success">Success</SelectItem>
                    <SelectItem value="Failed">Failed</SelectItem>
                    <SelectItem value="Partial">Partial</SelectItem>
                    <SelectItem value="Running">Running</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {executionsLoading && <ExecutionLogsSkeleton />}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              Failed to load execution logs. Please try again.
            </div>
          )}

          {!executionsLoading && !error && filteredExecutions.length === 0 && (
            <div className="py-12 text-center">
              <Zap className="mx-auto h-12 w-12 text-ora-stone mb-4" />
              <h3 className="text-lg font-medium text-ora-charcoal mb-2">
                No executions yet
              </h3>
              <p className="text-sm text-ora-graphite">
                {statusFilter !== "all"
                  ? `No executions with status "${statusFilter}" found.`
                  : "This automation hasn't been triggered yet. Activate it to start recording executions."}
              </p>
            </div>
          )}

          {!executionsLoading && !error && filteredExecutions.length > 0 && (
            <>
              <DataTable
                columns={columns}
                data={filteredExecutions}
                keyExtractor={(e) => e.id}
                emptyMessage="No executions found"
                onRowClick={(execution) =>
                  router.push(`/events/${eventId}/automations/${automationId}/logs/${execution.id}`)
                }
              />

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-ora-sand">
                  <span className="text-sm text-ora-graphite">
                    Page {page + 1} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
