"use client"

import { useMemo, useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  Play,
  SkipForward,
  Zap,
  ExternalLink,
  Pause,
  Timer,
} from "lucide-react"
import { useAutomation } from "@/hooks/use-automations"
import { useExecutionDetails, useSyncExecutionStatus } from "@/hooks/use-automation-executions"
import { WorkflowCanvas } from "@/components/automation-builder"
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
} from "@/components/ui"
import { toast } from "sonner"
import type { ExecutionStatus, StepStatus, AutomationNode } from "@/db/schema"

type DisplayStatus = ExecutionStatus | "Waiting"

const executionStatusConfig: Record<DisplayStatus, { label: string; variant: "default" | "success" | "danger" | "warning" | "secondary"; icon: React.ReactNode }> = {
  Running: { label: "Running", variant: "default", icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  Waiting: { label: "Waiting", variant: "secondary", icon: <Pause className="h-4 w-4" /> },
  Success: { label: "Success", variant: "success", icon: <CheckCircle2 className="h-4 w-4" /> },
  Failed: { label: "Failed", variant: "danger", icon: <XCircle className="h-4 w-4" /> },
  Partial: { label: "Partial", variant: "warning", icon: <AlertTriangle className="h-4 w-4" /> },
}

const stepStatusConfig: Record<StepStatus, { label: string; variant: "default" | "success" | "danger" | "warning" | "secondary"; icon: React.ReactNode }> = {
  Pending: { label: "Pending", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  Running: { label: "Running", variant: "default", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  Success: { label: "Success", variant: "success", icon: <CheckCircle2 className="h-3 w-3" /> },
  Failed: { label: "Failed", variant: "danger", icon: <XCircle className="h-3 w-3" /> },
  Skipped: { label: "Skipped", variant: "secondary", icon: <SkipForward className="h-3 w-3" /> },
}

function formatDate(date: Date | string | null) {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
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

function formatElapsedTime(start: Date | string): string {
  const startTime = new Date(start).getTime()
  const now = Date.now()
  const elapsedMs = now - startTime

  if (elapsedMs < 1000) return "Just started"
  if (elapsedMs < 60000) return `${Math.floor(elapsedMs / 1000)}s elapsed`
  if (elapsedMs < 3600000) return `${Math.floor(elapsedMs / 60000)}m elapsed`
  return `${Math.floor(elapsedMs / 3600000)}h ${Math.floor((elapsedMs % 3600000) / 60000)}m elapsed`
}

function ElapsedTimeDisplay({ startedAt }: { startedAt: Date | string }) {
  const [elapsed, setElapsed] = useState(() => formatElapsedTime(startedAt))

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(formatElapsedTime(startedAt))
    }, 1000)

    return () => clearInterval(interval)
  }, [startedAt])

  return (
    <span className="flex items-center gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      {elapsed}
    </span>
  )
}

function isWaitStep(step: { output?: unknown }): boolean {
  const output = step.output as Record<string, unknown> | null
  return !!(output?.waitStartTime || output?.waitCompletionTime)
}

function getWaitInfo(step: { output?: unknown }): { waitStartTime?: string; waitCompletionTime?: string; duration?: number; unit?: string } | null {
  const output = step.output as Record<string, unknown> | null
  if (!output) return null
  
  return {
    waitStartTime: output.waitStartTime as string | undefined,
    waitCompletionTime: output.waitCompletionTime as string | undefined,
    duration: output.duration as number | undefined,
    unit: output.unit as string | undefined,
  }
}

function ExecutionDetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
      <Skeleton className="h-[400px] rounded-lg" />
    </div>
  )
}

export default function AdminExecutionDetailPage() {
  const params = useParams()
  const eventId = params.id as string
  const automationId = params.automationId as string
  const executionId = params.executionId as string

  const { data: automation, isLoading: automationLoading } = useAutomation(automationId)
  const { data: execution, isLoading: executionLoading, error, refetch } = useExecutionDetails(automationId, executionId)
  const syncMutation = useSyncExecutionStatus(automationId)

  const isLoading = automationLoading || executionLoading

  const handleSync = async () => {
    try {
      const result = await syncMutation.mutateAsync(executionId)
      if (result.updated) {
        toast.success(`Status updated: ${result.previousStatus} → ${result.newStatus}`)
        refetch()
      } else if (result.error) {
        toast.error(`Sync failed: ${result.error}`)
      } else {
        toast.info("Status unchanged")
      }
    } catch (err) {
      toast.error("Failed to sync status from Trigger.dev")
    }
  }

  const executedNodeIds = useMemo(() => {
    if (!execution?.steps) return new Set<string>()
    return new Set(execution.steps.map((step) => step.nodeId))
  }, [execution?.steps])

  const nodeStatusMap = useMemo(() => {
    if (!execution?.steps) return new Map<string, StepStatus>()
    const map = new Map<string, StepStatus>()
    execution.steps.forEach((step) => {
      map.set(step.nodeId, step.status)
    })
    return map
  }, [execution?.steps])

  const currentNode = useMemo((): AutomationNode | null => {
    if (!execution?.steps || !automation?.nodes) return null
    
    const runningStep = execution.steps.find((s) => s.status === "Running")
    if (runningStep) {
      return automation.nodes.find((n) => n.id === runningStep.nodeId) ?? null
    }
    
    const sortedSteps = [...execution.steps].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )
    if (sortedSteps.length > 0) {
      return automation.nodes.find((n) => n.id === sortedSteps[0].nodeId) ?? null
    }
    
    return null
  }, [execution?.steps, automation?.nodes])

  const isWaiting = useMemo(() => {
    if (!execution?.steps || execution.status !== "Running") return false
    
    return execution.steps.some((step) => {
      const waitInfo = getWaitInfo(step)
      return waitInfo?.waitStartTime && !waitInfo?.waitCompletionTime
    })
  }, [execution?.steps, execution?.status])

  const displayStatus: DisplayStatus = isWaiting ? "Waiting" : (execution?.status || "Running")

  const getNodeLabel = (nodeId: string) => {
    const node = automation?.nodes.find((n) => n.id === nodeId)
    return node?.label || nodeId
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Execution Details">
          <Link href={`/admin/events/${eventId}/automations/${automationId}/logs`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to Logs
            </Button>
          </Link>
        </PageHeader>
        <ExecutionDetailSkeleton />
      </div>
    )
  }

  if (error || !execution) {
    return (
      <div>
        <PageHeader title="Execution Not Found">
          <Link href={`/admin/events/${eventId}/automations/${automationId}/logs`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to Logs
            </Button>
          </Link>
        </PageHeader>
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <p className="text-ora-graphite">
              {error ? "Failed to load execution details" : "Execution not found"}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statusConfig = executionStatusConfig[displayStatus]

  return (
    <div>
      <PageHeader
        title={`Execution: ${automation?.name || "Automation"}`}
        description={`Execution ID: ${executionId.slice(0, 8)}...`}
      >
        <Link href={`/admin/events/${eventId}/automations/${automationId}/logs`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back to Logs
          </Button>
        </Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 stroke-1 text-ora-gold" />
                  Execution Summary
                </CardTitle>
                <Badge variant={statusConfig.variant} className="gap-1">
                  {statusConfig.icon}
                  {statusConfig.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-ora-graphite">Started</span>
                  <p className="font-medium text-ora-charcoal">{formatDate(execution.startedAt)}</p>
                </div>
                <div>
                  <span className="text-ora-graphite">Completed</span>
                  <p className="font-medium text-ora-charcoal">{formatDate(execution.completedAt)}</p>
                </div>
                <div>
                  <span className="text-ora-graphite">Duration</span>
                  <p className="font-medium text-ora-charcoal">
                    {displayStatus === "Running" || displayStatus === "Waiting" ? (
                      <ElapsedTimeDisplay startedAt={execution.startedAt} />
                    ) : (
                      formatDuration(execution.startedAt, execution.completedAt)
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-ora-graphite">Steps Executed</span>
                  <p className="font-medium text-ora-charcoal">{execution.steps?.length || 0}</p>
                </div>
              </div>

              {execution.triggerDevRunId ? (
                <div className="mt-4 p-3 rounded-lg bg-ora-cream border border-ora-sand">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-ora-charcoal flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        Trigger.dev Run ID
                      </p>
                      <p className="text-sm text-ora-graphite font-mono mt-1">
                        {execution.triggerDevRunId}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSync}
                      disabled={syncMutation.isPending}
                    >
                      {syncMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Sync Status"
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}

              {execution.error ? (
                <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm font-medium text-red-800">Trigger.dev Error</p>
                  <p className="text-sm text-red-600 mt-1">{execution.error}</p>
                </div>
              ) : null}

              {execution.triggerData && typeof execution.triggerData === 'object' && Object.keys(execution.triggerData).length > 0 ? (
                <div className="mt-4">
                  <p className="text-sm font-medium text-ora-charcoal mb-2">Trigger Data</p>
                  <pre className="text-xs bg-ora-cream p-3 rounded-lg overflow-auto max-h-32">
                    {JSON.stringify(execution.triggerData, null, 2)}
                  </pre>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5 stroke-1 text-ora-gold" />
                Execution Steps
              </CardTitle>
              <CardDescription>
                Step-by-step execution trace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {execution.steps && execution.steps.length > 0 ? (
                <div className="space-y-3">
                  {execution.steps.map((step, index) => {
                    const stepConfig = stepStatusConfig[step.status]
                    const waitInfo = getWaitInfo(step)
                    const isCurrentlyWaiting = waitInfo?.waitStartTime && !waitInfo?.waitCompletionTime
                    
                    return (
                      <div
                        key={step.id}
                        className={`p-3 rounded-lg border ${
                          step.status === "Failed"
                            ? "border-red-200 bg-red-50"
                            : step.status === "Success"
                            ? "border-green-200 bg-green-50"
                            : step.status === "Skipped"
                            ? "border-ora-stone bg-ora-cream/50"
                            : isCurrentlyWaiting
                            ? "border-blue-200 bg-blue-50"
                            : "border-ora-sand bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-ora-graphite">
                              Step {index + 1}
                            </span>
                            <span className="font-medium text-ora-charcoal">
                              {getNodeLabel(step.nodeId)}
                            </span>
                          </div>
                          <Badge variant={isCurrentlyWaiting ? "secondary" : stepConfig.variant} className="gap-1">
                            {isCurrentlyWaiting ? <Pause className="h-3 w-3" /> : stepConfig.icon}
                            {isCurrentlyWaiting ? "Waiting" : stepConfig.label}
                          </Badge>
                        </div>

                        <div className="text-xs text-ora-graphite space-y-1">
                          <div className="flex gap-4">
                            <span>Started: {formatDate(step.startedAt)}</span>
                            {step.completedAt && (
                              <span>
                                Duration: {formatDuration(step.startedAt, step.completedAt)}
                              </span>
                            )}
                          </div>
                        </div>

                        {waitInfo && (
                          <div className="mt-2 p-2 rounded bg-blue-100 text-xs">
                            <div className="flex items-center gap-1 text-blue-800 font-medium mb-1">
                              <Timer className="h-3 w-3" />
                              Wait/Delay: {waitInfo.duration} {waitInfo.unit}
                            </div>
                            <div className="text-blue-700 space-y-0.5">
                              {waitInfo.waitStartTime && (
                                <div>Started waiting: {formatDate(waitInfo.waitStartTime)}</div>
                              )}
                              {waitInfo.waitCompletionTime ? (
                                <div>Resumed at: {formatDate(waitInfo.waitCompletionTime)}</div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Currently waiting...
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {step.error ? (
                          <div className="mt-2 p-2 rounded bg-red-100 text-xs text-red-700">
                            {step.error}
                          </div>
                        ) : null}

                        {step.output && typeof step.output === 'object' && Object.keys(step.output).length > 0 && !isWaitStep(step) ? (
                          <details className="mt-2">
                            <summary className="text-xs text-ora-graphite cursor-pointer hover:text-ora-charcoal">
                              View output
                            </summary>
                            <pre className="mt-1 text-xs bg-white p-2 rounded border border-ora-sand overflow-auto max-h-24">
                              {JSON.stringify(step.output, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-ora-graphite">
                  No steps recorded for this execution
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Workflow Path</CardTitle>
            <CardDescription>
              Highlighted nodes show the execution path
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[500px] border border-ora-sand rounded-lg overflow-hidden">
              {automation && (
                <WorkflowCanvas
                  initialNodes={automation.nodes}
                  initialEdges={automation.edges}
                  readOnly={true}
                  selectedNodeId={null}
                />
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-ora-graphite">Success</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-ora-graphite">Failed</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-ora-stone" />
                <span className="text-ora-graphite">Skipped</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-ora-sand" />
                <span className="text-ora-graphite">Not executed</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
