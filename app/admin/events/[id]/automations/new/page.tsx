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

export default function AdminNewAutomationPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const createAutomation = useCreateAutomation()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [showNameDialog, setShowNameDialog] = useState(true)

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

  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)

  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
  }, [nodes, edges])

  const handleCreate = async () => {
    if (!name.trim()) return

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

      const automation = await createAutomation.mutateAsync({
        eventId,
        input: {
          name: name.trim(),
          description: description.trim() || undefined,
          nodes: apiNodes,
          edges: apiEdges,
        },
      })
      router.push(`/admin/events/${eventId}/automations/${automation.id}`)
    } catch {
      // Error handled by mutation
    } finally {
      setIsSaving(false)
    }
  }

  const handleNodesChange = useCallback((newNodes: CanvasNode[]) => {
    setNodes(newNodes)
  }, [])

  const handleEdgesChange = useCallback((newEdges: CanvasEdge[]) => {
    setEdges(newEdges)
  }, [])

  const handleNodeSelect = useCallback((node: Node | null) => {
    setSelectedNode(node)
  }, [])

  const handleNodeDelete = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const handleNodeUpdate = useCallback((nodeId: string, data: Partial<{ label: string; config: Record<string, unknown> }>) => {
    // Update handled by canvas
  }, [])

  if (showNameDialog) {
    return (
      <div className="space-y-6">
        <PageHeader title="New Automation">
          <Link href={`/admin/events/${eventId}/automations`}>
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
              <Link href={`/admin/events/${eventId}/automations`}>
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
        <Link href={`/admin/events/${eventId}/automations`}>
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

      <div className="flex items-center justify-between px-6 lg:px-8 py-2 bg-ora-cream/50 border-b border-ora-sand">
        <span className="text-xs text-ora-graphite">
          Draft - Not saved yet
        </span>
        <span className="text-xs text-ora-graphite">
          Add nodes to build your workflow
        </span>
      </div>

      <div className="flex-1 flex gap-0 overflow-hidden">
        <div className="w-64 flex-shrink-0 border-r border-ora-sand bg-white">
          <NodePalette />
        </div>

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
