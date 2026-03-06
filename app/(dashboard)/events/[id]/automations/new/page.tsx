"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import type { Node } from "reactflow"
import {
  ArrowLeft,
  Save,
  Loader2,
} from "lucide-react"
import { useCreateAutomation } from "@/hooks/use-automations"
import {
  WorkflowCanvas,
  NodePalette,
  PropertiesPanel,
} from "@/components/automation-builder"
import { PageHeader } from "@/components/layout"
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui"

export default function NewAutomationPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const createAutomation = useCreateAutomation()

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [showNameDialog, setShowNameDialog] = useState(true)

  // Canvas state - store in the format expected by WorkflowCanvas callbacks
  interface CanvasNode {
    type: "trigger" | "condition" | "action"
    subType: string
    label: string
    positionX: string
    positionY: string
    config: unknown
  }
  interface CanvasEdge {
    sourceNodeId: string
    targetNodeId: string
    sourceHandle: string | null
  }

  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Refs for save
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)

  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
  }, [nodes, edges])


  // Handle create and save
  const handleCreate = async () => {
    if (!name.trim()) return

    setIsSaving(true)
    try {
      // Transform nodes to API format (position object instead of positionX/Y strings)
      const apiNodes = nodesRef.current.map(node => ({
        type: node.type,
        subType: node.subType,
        label: node.label,
        position: { x: parseFloat(node.positionX), y: parseFloat(node.positionY) },
        config: node.config as Record<string, unknown>,
      }))
      // Transform edges to API format (sourceHandle as optional string)
      const apiEdges = edgesRef.current.map(edge => ({
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        sourceHandle: edge.sourceHandle ?? undefined,
      }))

      const automation = await createAutomation.mutateAsync({
        eventId,
        input: {
          name: name.trim(),
          description: description.trim() || undefined,
          nodes: apiNodes,
          edges: apiEdges,
        },
      })
      router.push(`/events/${eventId}/automations/${automation.id}`)
    } catch {
      // Error handled by mutation
    } finally {
      setIsSaving(false)
    }
  }

  // Handle nodes change from canvas
  const handleNodesChange = useCallback((newNodes: CanvasNode[]) => {
    setNodes(newNodes)
  }, [])

  // Handle edges change from canvas
  const handleEdgesChange = useCallback((newEdges: CanvasEdge[]) => {
    setEdges(newEdges)
  }, [])

  // Handle node selection
  const handleNodeSelect = useCallback((node: Node | null) => {
    setSelectedNode(node)
  }, [])

  // Handle node deletion
  const handleNodeDelete = useCallback(() => {
    setSelectedNode(null)
  }, [])

  // Handle node update from properties panel
  const handleNodeUpdate = useCallback((nodeId: string, data: Partial<{ label: string; config: Record<string, unknown> }>) => {
    // Update handled by canvas
  }, [])

  // Name dialog
  if (showNameDialog) {
    return (
      <div className="space-y-6">
        <PageHeader title="New Automation">
          <Link href={`/events/${eventId}/automations`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Cancel
            </Button>
          </Link>
        </PageHeader>

        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Create New Automation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Automation Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Welcome Email Sequence"
                autoFocus
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of what this automation does"
                className="w-full"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Link href={`/events/${eventId}/automations`}>
                <Button variant="outline">Cancel</Button>
              </Link>
              <Button
                onClick={() => setShowNameDialog(false)}
                disabled={!name.trim()}
              >
                Continue to Editor
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }


  return (
    <div className="-m-6 lg:-m-8 h-[calc(100vh-0px)] flex flex-col">
      <PageHeader title={name} description={description || "New automation"} className="px-6 lg:px-8 pt-6 lg:pt-8">
        <Link href={`/events/${eventId}/automations`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Cancel
          </Button>
        </Link>
        <Button onClick={handleCreate} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Create Automation
        </Button>
      </PageHeader>

      {/* Status bar */}
      <div className="flex items-center justify-between px-6 lg:px-8 py-2 bg-ora-cream/50 border-b border-ora-sand">
        <span className="text-xs text-ora-graphite">
          Draft - Not saved yet
        </span>
        <span className="text-xs text-ora-graphite">
          Add nodes to build your workflow
        </span>
      </div>

      {/* Editor layout */}
      <div className="flex-1 flex gap-0 overflow-hidden">
        {/* Node Palette */}
        <div className="w-64 flex-shrink-0 border-r border-ora-sand bg-white">
          <NodePalette />
        </div>

        {/* Workflow Canvas */}
        <div className="flex-1 relative">
          <WorkflowCanvas
            initialNodes={[]}
            initialEdges={[]}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onNodeSelect={handleNodeSelect}
            onNodeDelete={handleNodeDelete}
            onNodeUpdate={handleNodeUpdate}
            selectedNodeId={selectedNode?.id}
          />
        </div>

        {/* Properties Panel */}
        <div className="w-80 flex-shrink-0 border-l border-ora-sand bg-white">
          <PropertiesPanel
            node={selectedNode}
            eventId={eventId}
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
      </div>
    </div>
  )
}
