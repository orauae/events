"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import type { Node } from "reactflow"
import {
  ArrowLeft,
  Save,
  Play,
  Pause,
  History,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Undo2,
  Redo2,
  Settings,
} from "lucide-react"
import { useAutomation, useUpdateAutomation, useSetAutomationStatus } from "@/hooks/use-automations"
import {
  WorkflowCanvas,
  NodePalette,
  NodeConfigSheet,
} from "@/components/automation-builder"
import { PageHeader } from "@/components/layout"
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
} from "@/components/ui"
import type { AutomationStatus } from "@/db/schema"

const AUTO_SAVE_INTERVAL = 30000

interface CanvasNode {
  type: "trigger" | "condition" | "action"
  subType: string
  label: string
  positionX: string
  positionY: string
  config: unknown
  clientId: string
}
interface CanvasEdge {
  sourceNodeId: string
  targetNodeId: string
  sourceHandle: string | null
}

function EditorSkeleton() {
  return (
    <div className="flex h-[calc(100vh-200px)] gap-4">
      <div className="w-64 flex-shrink-0">
        <Skeleton className="h-full rounded-lg" />
      </div>
      <div className="flex-1">
        <Skeleton className="h-full rounded-lg" />
      </div>
      <div className="w-80 flex-shrink-0">
        <Skeleton className="h-full rounded-lg" />
      </div>
    </div>
  )
}

export default function AdminAutomationEditorPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string
  const automationId = params.automationId as string

  const { data: automation, isLoading, error } = useAutomation(automationId)
  const updateAutomation = useUpdateAutomation()
  const setStatus = useSetAutomationStatus()

  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [configSheetOpen, setConfigSheetOpen] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [undoTrigger, setUndoTrigger] = useState(0)
  const [redoTrigger, setRedoTrigger] = useState(0)

  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges)

  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
    hasUnsavedChangesRef.current = hasUnsavedChanges
  }, [nodes, edges, hasUnsavedChanges])

  useEffect(() => {
    if (automation) {
      const initialNodes = automation.nodes.map((node) => ({
        type: node.type,
        subType: node.subType,
        label: node.label,
        positionX: node.positionX,
        positionY: node.positionY,
        config: node.config as Record<string, unknown>,
        clientId: node.id,
      }))
      const initialEdges = automation.edges.map((edge) => ({
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        sourceHandle: edge.sourceHandle,
      }))
      setNodes(initialNodes)
      setEdges(initialEdges)
      setLastSaved(new Date(automation.updatedAt))
    }
  }, [automation])

  const handleSave = useCallback(async (showToast = true) => {
    if (!automation) return

    setIsSaving(true)
    try {
      const apiNodes = nodesRef.current.map(node => ({
        type: node.type,
        subType: node.subType,
        label: node.label,
        position: { x: parseFloat(node.positionX), y: parseFloat(node.positionY) },
        config: node.config as Record<string, unknown>,
        clientId: node.clientId,
      }))
      const apiEdges = edgesRef.current.map(edge => ({
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        sourceHandle: edge.sourceHandle ?? undefined,
      }))

      await updateAutomation.mutateAsync({
        id: automationId,
        input: {
          nodes: apiNodes,
          edges: apiEdges,
        },
      })
      setHasUnsavedChanges(false)
      setLastSaved(new Date())
    } catch {
      // Error handled by mutation
    } finally {
      setIsSaving(false)
    }
  }, [automation, automationId, updateAutomation])

  useEffect(() => {
    const interval = setInterval(() => {
      if (hasUnsavedChangesRef.current && !isSaving) {
        handleSave(false)
      }
    }, AUTO_SAVE_INTERVAL)

    return () => clearInterval(interval)
  }, [handleSave, isSaving])

  const handleNodesChange = useCallback((newNodes: CanvasNode[]) => {
    setNodes(newNodes)
    setHasUnsavedChanges(true)
  }, [])

  const handleEdgesChange = useCallback((newEdges: CanvasEdge[]) => {
    setEdges(newEdges)
    setHasUnsavedChanges(true)
  }, [])

  const handleNodeSelect = useCallback((node: Node | null) => {
    setSelectedNode(node)
    if (node) {
      setConfigSheetOpen(true)
    }
  }, [])

  const handleNodeDelete = useCallback((nodeId: string) => {
    setSelectedNode(null)
    setConfigSheetOpen(false)
    setHasUnsavedChanges(true)
  }, [])

  const handleNodeUpdate = useCallback((nodeId: string, data: Partial<{ label: string; config: Record<string, unknown> }>) => {
    setHasUnsavedChanges(true)
  }, [])

  const handleUndoRedoChange = useCallback((newCanUndo: boolean, newCanRedo: boolean) => {
    setCanUndo(newCanUndo)
    setCanRedo(newCanRedo)
  }, [])

  const handleUndo = useCallback(() => {
    if (canUndo) {
      setUndoTrigger(prev => prev + 1)
      setHasUnsavedChanges(true)
    }
  }, [canUndo])

  const handleRedo = useCallback(() => {
    if (canRedo) {
      setRedoTrigger(prev => prev + 1)
      setHasUnsavedChanges(true)
    }
  }, [canRedo])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifier = isMac ? event.metaKey : event.ctrlKey

      if (modifier && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
      } else if (modifier && event.key === 'z' && event.shiftKey) {
        event.preventDefault()
        handleRedo()
      } else if (modifier && event.key === 'y') {
        event.preventDefault()
        handleRedo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo])

  const handleToggleStatus = async () => {
    if (!automation) return
    const newStatus: AutomationStatus = automation.status === "Active" ? "Paused" : "Active"
    try {
      await setStatus.mutateAsync({ id: automationId, status: newStatus })
    } catch {
      // Error handled by mutation
    }
  }

  const formatLastSaved = (date: Date | null) => {
    if (!date) return ""
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)

    if (seconds < 60) return "Saved just now"
    if (minutes < 60) return `Saved ${minutes}m ago`
    return `Saved at ${date.toLocaleTimeString()}`
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Loading...">
          <Link href={`/admin/events/${eventId}/automations`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        </PageHeader>
        <EditorSkeleton />
      </div>
    )
  }

  if (error || !automation) {
    return (
      <div>
        <PageHeader title="Automation Not Found">
          <Link href={`/admin/events/${eventId}/automations`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        </PageHeader>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <p className="text-ora-graphite">
              {error ? "Failed to load automation" : "Automation not found"}
            </p>
            <Link href={`/admin/events/${eventId}/automations`} className="mt-4 inline-block">
              <Button variant="outline">Return to Automations</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statusBadge = {
    Draft: { variant: "secondary" as const, icon: null },
    Active: { variant: "success" as const, icon: <CheckCircle2 className="h-3 w-3" /> },
    Paused: { variant: "warning" as const, icon: <Pause className="h-3 w-3" /> },
  }

  return (
    <div className="-m-6 lg:-m-8 h-[calc(100vh-0px)] flex flex-col">
      <PageHeader title={automation.name} description={automation.description || undefined} className="px-6 lg:px-8 pt-6 lg:pt-8">
        <Link href={`/admin/events/${eventId}/automations`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <Link href={`/admin/events/${eventId}/automations/${automationId}/logs`}>
          <Button variant="outline">
            <History className="h-4 w-4" />
            Logs
          </Button>
        </Link>
        <Button
          variant="outline"
          onClick={handleToggleStatus}
          disabled={setStatus.isPending}
        >
          {automation.status === "Active" ? (
            <>
              <Pause className="h-4 w-4" />
              Pause
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Activate
            </>
          )}
        </Button>
        <Button onClick={() => handleSave(true)} disabled={isSaving || !hasUnsavedChanges}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </Button>
      </PageHeader>

      <div className="flex items-center justify-between px-6 lg:px-8 py-2 bg-ora-cream/50 border-b border-ora-sand">
        <div className="flex items-center gap-3">
          <Badge variant={statusBadge[automation.status].variant} className="gap-1">
            {statusBadge[automation.status].icon}
            {automation.status}
          </Badge>
          <div className="flex items-center gap-1 border-l border-ora-sand pl-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="h-7 w-7 p-0"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              className="h-7 w-7 p-0"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
          {hasUnsavedChanges && (
            <span className="text-xs text-ora-graphite flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          )}
        </div>
        <span className="text-xs text-ora-graphite">
          {formatLastSaved(lastSaved)}
        </span>
      </div>

      <div className="flex-1 flex gap-0 overflow-hidden">
        <div className="w-64 flex-shrink-0 border-r border-ora-sand bg-white">
          <NodePalette />
        </div>

        <div className="flex-1 relative">
          <WorkflowCanvas
            initialNodes={automation.nodes}
            initialEdges={automation.edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onNodeSelect={handleNodeSelect}
            onNodeDelete={handleNodeDelete}
            onNodeUpdate={handleNodeUpdate}
            selectedNodeId={selectedNode?.id}
            onUndoRedoChange={handleUndoRedoChange}
            undoTrigger={undoTrigger}
            redoTrigger={redoTrigger}
          />
          
          {selectedNode && !configSheetOpen && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-ora-charcoal text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm">
              <Settings className="h-4 w-4 stroke-1" />
              <span>Click to configure node</span>
            </div>
          )}
        </div>
      </div>

      <NodeConfigSheet
        node={selectedNode}
        eventId={eventId}
        open={configSheetOpen}
        onOpenChange={setConfigSheetOpen}
        onUpdate={(nodeId, data) => {
          handleNodeUpdate(nodeId, data)
          if (selectedNode && selectedNode.id === nodeId) {
            setSelectedNode({
              ...selectedNode,
              data: { ...selectedNode.data, ...data },
            })
          }
        }}
        onDelete={handleNodeDelete}
      />
    </div>
  )
}
