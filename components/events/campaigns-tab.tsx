"use client"

import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import {
  Send,
  Plus,
  Mail,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Calendar,
  Users,
  Info,
  Download,
  Pencil,
  TrendingUp,
  Eye,
  MousePointer,
  BarChart3,
  SendHorizonal,
  MessageCircle,
  Smartphone,
} from "lucide-react"
import { useCampaignsByEvent, useSendCampaign, useExportCampaignReport } from "@/hooks"
import { useCanAccess } from "@/hooks/use-auth"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui"
import { DataTable } from "@/components/layout"
import type { Campaign } from "@/db/schema"

interface CampaignsTabProps {
  eventId: string
  title?: string
}

/**
 * Campaign metrics for display
 */
interface CampaignMetrics {
  recipientCount: number
  sentCount: number
  deliveredCount: number
  openedCount: number
  clickedCount: number
  bouncedCount: number
  openRate: number
  clickRate: number
  deliveryRate: number
}

// Campaign type labels
const campaignTypeLabels: Record<string, string> = {
  Invitation: "Invitation",
  Reminder: "Reminder",
  LastChance: "Last Chance",
  EventDayInfo: "Event Day Info",
  ThankYou: "Thank You",
  Feedback: "Feedback",
}

// Channel display config
const channelConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  email: { label: "Email", icon: <Mail className="h-3 w-3 stroke-1" />, color: "text-blue-600" },
  whatsapp: { label: "WhatsApp", icon: <MessageCircle className="h-3 w-3 stroke-1" />, color: "text-green-600" },
  sms: { label: "SMS", icon: <Smartphone className="h-3 w-3 stroke-1" />, color: "text-purple-600" },
}

// Campaign status config
const campaignStatusConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "secondary" | "info" | "danger"; icon: React.ReactNode }> = {
  Draft: { label: "Draft", variant: "secondary", icon: <FileText className="h-3 w-3" /> },
  Scheduled: { label: "Scheduled", variant: "info", icon: <Clock className="h-3 w-3" /> },
  Queued: { label: "Queued", variant: "warning", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  Sending: { label: "Sending", variant: "warning", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  Sent: { label: "Sent", variant: "success", icon: <CheckCircle2 className="h-3 w-3" /> },
  Paused: { label: "Paused", variant: "warning", icon: <Clock className="h-3 w-3" /> },
  Cancelled: { label: "Cancelled", variant: "danger", icon: <AlertCircle className="h-3 w-3" /> },
}

// Template variables info
const templateVariables = [
  { name: "{firstName}", description: "Guest's first name" },
  { name: "{lastName}", description: "Guest's last name" },
  { name: "{eventName}", description: "Name of the event" },
  { name: "{eventLocation}", description: "Event location" },
  { name: "{eventDate}", description: "Event date" },
  { name: "{rsvpLink}", description: "RSVP link for the guest" },
  { name: "{badgeLink}", description: "Badge download link" },
]

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

/**
 * Calculate campaign metrics from campaign data
 */
function calculateMetrics(campaign: Campaign): CampaignMetrics {
  const recipientCount = campaign.recipientCount || 0
  const sentCount = campaign.sentCount || 0
  const deliveredCount = campaign.deliveredCount || 0
  const openedCount = campaign.openedCount || 0
  const clickedCount = campaign.clickedCount || 0
  const bouncedCount = campaign.bouncedCount || 0

  return {
    recipientCount,
    sentCount,
    deliveredCount,
    openedCount,
    clickedCount,
    bouncedCount,
    openRate: deliveredCount > 0 ? Math.round((openedCount / deliveredCount) * 100) : 0,
    clickRate: deliveredCount > 0 ? Math.round((clickedCount / deliveredCount) * 100) : 0,
    deliveryRate: sentCount > 0 ? Math.round((deliveredCount / sentCount) * 100) : 0,
  }
}

/**
 * Campaign Metrics Card - Read-only view of campaign performance
 * Requirements: 9.2, 9.3
 */
function CampaignMetricsCard({ campaign }: { campaign: Campaign }) {
  const metrics = calculateMetrics(campaign)

  if (campaign.status === "Draft") {
    return (
      <div className="text-sm text-ora-graphite">
        Not sent yet
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1" title="Open Rate">
        <Eye className="h-3.5 w-3.5 text-ora-graphite" />
        <span className="text-ora-charcoal font-medium">{metrics.openRate}%</span>
      </div>
      <div className="flex items-center gap-1" title="Click Rate">
        <MousePointer className="h-3.5 w-3.5 text-ora-graphite" />
        <span className="text-ora-charcoal font-medium">{metrics.clickRate}%</span>
      </div>
    </div>
  )
}

/**
 * Campaign Performance Trends Chart
 * Requirements: 9.5
 */
function CampaignPerformanceTrends({ campaigns }: { campaigns: Campaign[] }) {
  // Filter to only sent campaigns
  const sentCampaigns = campaigns
    .filter(c => c.status === "Sent" && c.sentAt)
    .sort((a, b) => new Date(a.sentAt!).getTime() - new Date(b.sentAt!).getTime())
    .slice(-5) // Last 5 campaigns

  if (sentCampaigns.length === 0) {
    return null
  }

  // Calculate average metrics
  const avgOpenRate = sentCampaigns.reduce((sum, c) => {
    const metrics = calculateMetrics(c)
    return sum + metrics.openRate
  }, 0) / sentCampaigns.length

  const avgClickRate = sentCampaigns.reduce((sum, c) => {
    const metrics = calculateMetrics(c)
    return sum + metrics.clickRate
  }, 0) / sentCampaigns.length

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-ora-gold" />
          <CardTitle className="text-lg">Performance Trends</CardTitle>
        </div>
        <CardDescription>
          Campaign performance over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="p-4 rounded-lg bg-ora-cream">
            <p className="text-sm text-ora-graphite">Avg. Open Rate</p>
            <p className="text-2xl font-semibold text-ora-charcoal">
              {avgOpenRate.toFixed(1)}%
            </p>
          </div>
          <div className="p-4 rounded-lg bg-ora-cream">
            <p className="text-sm text-ora-graphite">Avg. Click Rate</p>
            <p className="text-2xl font-semibold text-ora-charcoal">
              {avgClickRate.toFixed(1)}%
            </p>
          </div>
          <div className="p-4 rounded-lg bg-ora-cream">
            <p className="text-sm text-ora-graphite">Total Campaigns</p>
            <p className="text-2xl font-semibold text-ora-charcoal">
              {campaigns.length}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-ora-cream">
            <p className="text-sm text-ora-graphite">Sent Campaigns</p>
            <p className="text-2xl font-semibold text-ora-charcoal">
              {sentCampaigns.length}
            </p>
          </div>
        </div>

        {/* Simple bar chart for recent campaigns */}
        {sentCampaigns.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-medium text-ora-charcoal mb-3">Recent Campaign Performance</p>
            <div className="space-y-3">
              {sentCampaigns.map(campaign => {
                const metrics = calculateMetrics(campaign)
                return (
                  <div key={campaign.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ora-charcoal truncate max-w-[200px]">{campaign.name}</span>
                      <div className="flex items-center gap-3 text-ora-graphite">
                        <span>{metrics.openRate}% opens</span>
                        <span>{metrics.clickRate}% clicks</span>
                      </div>
                    </div>
                    <div className="flex gap-1 h-2">
                      <div 
                        className="bg-blue-500 rounded-l"
                        style={{ width: `${metrics.openRate}%` }}
                        title={`Open Rate: ${metrics.openRate}%`}
                      />
                      <div 
                        className="bg-green-500 rounded-r"
                        style={{ width: `${metrics.clickRate}%` }}
                        title={`Click Rate: ${metrics.clickRate}%`}
                      />
                      <div 
                        className="bg-ora-sand flex-1 rounded"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-ora-graphite">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-500 rounded" />
                <span>Open Rate</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-500 rounded" />
                <span>Click Rate</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Campaign Detail View - Read-only metrics view for managers
 * Requirements: 9.3
 */
function CampaignDetailSheet({
  isOpen,
  onClose,
  campaign,
}: {
  isOpen: boolean
  onClose: () => void
  campaign: Campaign | null
}) {
  if (!campaign) return null

  const metrics = calculateMetrics(campaign)

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[70vw] sm:max-w-[70vw] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle>{campaign.name}</SheetTitle>
              <SheetDescription>{campaign.subject}</SheetDescription>
            </div>
            <Badge variant={campaignStatusConfig[campaign.status]?.variant || "secondary"}>
              {campaignStatusConfig[campaign.status]?.icon}
              {campaignStatusConfig[campaign.status]?.label || campaign.status}
            </Badge>
          </div>
        </SheetHeader>
        
        <div className="space-y-6 mt-6">
          {/* Campaign Info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-ora-graphite" />
              <span className="text-ora-graphite">Type:</span>
              <span className="font-medium text-ora-charcoal">
                {campaignTypeLabels[campaign.type] || campaign.type}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-ora-graphite" />
              <span className="text-ora-graphite">Sent:</span>
              <span className="font-medium text-ora-charcoal">
                {campaign.sentAt ? formatDate(campaign.sentAt) : "Not sent"}
              </span>
            </div>
          </div>

          {/* Metrics Grid */}
          {campaign.status !== "Draft" && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-4 rounded-lg bg-ora-cream">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-4 w-4 text-ora-graphite" />
                  <span className="text-sm text-ora-graphite">Recipients</span>
                </div>
                <p className="text-2xl font-semibold text-ora-charcoal">
                  {metrics.recipientCount}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-ora-cream">
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="h-4 w-4 text-ora-graphite" />
                  <span className="text-sm text-ora-graphite">Delivered</span>
                </div>
                <p className="text-2xl font-semibold text-ora-charcoal">
                  {metrics.deliveredCount}
                </p>
                <p className="text-xs text-ora-graphite">
                  {metrics.deliveryRate}% delivery rate
                </p>
              </div>
              <div className="p-4 rounded-lg bg-ora-cream">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-ora-graphite" />
                  <span className="text-sm text-ora-graphite">Bounced</span>
                </div>
                <p className="text-2xl font-semibold text-ora-charcoal">
                  {metrics.bouncedCount}
                </p>
              </div>
            </div>
          )}

          {/* Engagement Metrics */}
          {campaign.status !== "Draft" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 rounded-lg border border-ora-sand">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-5 w-5 text-blue-500" />
                  <span className="font-medium text-ora-charcoal">Opens</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-ora-charcoal">
                    {metrics.openRate}%
                  </span>
                  <span className="text-sm text-ora-graphite">
                    ({metrics.openedCount} opens)
                  </span>
                </div>
                <div className="mt-2 h-2 bg-ora-sand rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${metrics.openRate}%` }}
                  />
                </div>
              </div>
              <div className="p-4 rounded-lg border border-ora-sand">
                <div className="flex items-center gap-2 mb-2">
                  <MousePointer className="h-5 w-5 text-green-500" />
                  <span className="font-medium text-ora-charcoal">Clicks</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-ora-charcoal">
                    {metrics.clickRate}%
                  </span>
                  <span className="text-sm text-ora-graphite">
                    ({metrics.clickedCount} clicks)
                  </span>
                </div>
                <div className="mt-2 h-2 bg-ora-sand rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-500"
                    style={{ width: `${metrics.clickRate}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="mt-6 pt-4 border-t border-ora-sand">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Send Request Sheet - For managers to request campaign sends
 * Requirements: 9.4
 */
function SendRequestSheet({
  isOpen,
  onClose,
  onConfirm,
  isSending,
  campaign,
  canSendDirectly,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  isSending: boolean
  campaign: Campaign | null
  canSendDirectly: boolean
}) {
  if (!campaign) return null

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[70vw] sm:max-w-[70vw]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {canSendDirectly ? (
              <>
                <Send className="h-5 w-5 text-ora-gold" />
                Send Campaign
              </>
            ) : (
              <>
                <SendHorizonal className="h-5 w-5 text-ora-gold" />
                Request Campaign Send
              </>
            )}
          </SheetTitle>
          <SheetDescription>
            {canSendDirectly 
              ? `Are you sure you want to send "${campaign.name}"? This will send emails to all guests added to this event.`
              : `Request to send "${campaign.name}"? An admin will review and approve this request.`
            }
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-4 mt-6">
          <div className="rounded-lg bg-ora-cream p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-ora-graphite" />
              <span className="text-ora-graphite">Subject:</span>
              <span className="font-medium text-ora-charcoal">{campaign.subject}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-ora-graphite" />
              <span className="text-ora-graphite">Type:</span>
              <span className="font-medium text-ora-charcoal">{campaignTypeLabels[campaign.type]}</span>
            </div>
          </div>
          
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
            <p className="text-sm text-amber-800">
              {canSendDirectly 
                ? "This action cannot be undone. Emails will be sent immediately to all event guests."
                : "Your request will be sent to an administrator for approval."
              }
            </p>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} isLoading={isSending}>
            {canSendDirectly ? (
              <>
                <Send className="h-4 w-4" />
                Send Now
              </>
            ) : (
              <>
                <SendHorizonal className="h-4 w-4" />
                Request Send
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function SendCampaignSheet({
  isOpen,
  onClose,
  onConfirm,
  isSending,
  campaign,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  isSending: boolean
  campaign: Campaign | null
}) {
  // This component is kept for backwards compatibility
  if (!campaign) return null

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[70vw] sm:max-w-[70vw]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-ora-gold" />
            Send Campaign
          </SheetTitle>
          <SheetDescription>
            Are you sure you want to send &quot;{campaign.name}&quot;? This will send emails to all guests added to this event.
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-4 mt-6">
          <div className="rounded-lg bg-ora-cream p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-ora-graphite" />
              <span className="text-ora-graphite">Subject:</span>
              <span className="font-medium text-ora-charcoal">{campaign.subject}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-ora-graphite" />
              <span className="text-ora-graphite">Type:</span>
              <span className="font-medium text-ora-charcoal">{campaignTypeLabels[campaign.type]}</span>
            </div>
          </div>
          
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
            <p className="text-sm text-amber-800">
              This action cannot be undone. Emails will be sent immediately to all event guests.
            </p>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} isLoading={isSending}>
            <Send className="h-4 w-4" />
            Send Now
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function CampaignsTab({ eventId, title }: CampaignsTabProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: campaigns, isLoading, error } = useCampaignsByEvent(eventId)
  const sendCampaign = useSendCampaign()
  const { exportCampaignReport, isPending: isExporting } = useExportCampaignReport()
  
  // Authorization hooks - Requirements: 9.1, 9.4
  const { isAdmin, canSendCampaigns, isLoading: isLoadingAuth } = useCanAccess()
  
  const [campaignToSend, setCampaignToSend] = useState<Campaign | null>(null)
  const [campaignToView, setCampaignToView] = useState<Campaign | null>(null)
  
  // Detect if we're in admin context based on pathname
  const isAdminContext = pathname.startsWith('/admin')
  const basePath = isAdminContext ? `/admin/events/${eventId}` : `/events/${eventId}`
  
  const handleCreateCampaign = () => {
    router.push(`${basePath}/campaigns/new`)
  }

  const handleSendCampaign = async () => {
    if (!campaignToSend) return
    try {
      await sendCampaign.mutateAsync(campaignToSend.id)
      setCampaignToSend(null)
    } catch {
      // Error handled by mutation
    }
  }

  // Determine if user can create campaigns (admin or has permission)
  const canCreateCampaigns = isAdmin || canSendCampaigns
  
  // Determine if user can send directly (admin) or needs to request (manager with permission)
  const canSendDirectly = isAdmin

  // Build columns based on user role - Requirements: 9.2
  const columns = [
    {
      key: "name",
      header: "Campaign",
      cell: (campaign: Campaign) => (
        <div 
          className="cursor-pointer hover:text-ora-gold transition-colors"
          onClick={() => setCampaignToView(campaign)}
        >
          <div className="font-medium text-ora-charcoal">{campaign.name}</div>
          <div className="text-xs text-ora-graphite">{campaign.subject}</div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (campaign: Campaign) => (
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary">
            {campaignTypeLabels[campaign.type] || campaign.type}
          </Badge>
          {campaign.channel && campaign.channel !== 'email' && (
            <span className={`flex items-center gap-0.5 text-xs ${channelConfig[campaign.channel]?.color || ''}`}>
              {channelConfig[campaign.channel]?.icon}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (campaign: Campaign) => {
        const config = campaignStatusConfig[campaign.status] || campaignStatusConfig.Draft
        return (
          <Badge variant={config.variant} className="gap-1">
            {config.icon}
            {config.label}
          </Badge>
        )
      },
    },
    {
      key: "sentAt",
      header: "Sent",
      cell: (campaign: Campaign) => (
        <span className="text-ora-graphite text-sm">
          {campaign.sentAt ? formatDate(campaign.sentAt) : "—"}
        </span>
      ),
    },
    // Inline metrics column - Requirements: 9.2
    {
      key: "metrics",
      header: "Performance",
      cell: (campaign: Campaign) => <CampaignMetricsCard campaign={campaign} />,
    },
    {
      key: "actions",
      header: "",
      cell: (campaign: Campaign) => (
        <div className="flex items-center gap-2">
          {/* View details button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setCampaignToView(campaign)
            }}
            title="View Details"
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
          
          {/* Edit button - only for admins on draft campaigns */}
          {campaign.status === "Draft" && isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                router.push(`${basePath}/campaigns/${campaign.id}/edit`)
              }}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
          
          {/* Send button - for admins or managers with permission */}
          {campaign.status === "Draft" && canSendCampaigns && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setCampaignToSend(campaign)
              }}
            >
              <Send className="h-4 w-4" />
              {canSendDirectly ? "Send" : "Request"}
            </Button>
          )}
          
          {/* Export button for sent campaigns */}
          {campaign.status === "Sent" && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                exportCampaignReport(campaign.id)
              }}
              isLoading={isExporting}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          )}
        </div>
      ),
      className: "w-48",
    },
  ]

  // Show loading state
  if (isLoading || isLoadingAuth) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-9 w-36" />
          </div>
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Performance Trends Chart - Requirements: 9.5 */}
      {campaigns && campaigns.length > 0 && (
        <CampaignPerformanceTrends campaigns={campaigns} />
      )}

      {canCreateCampaigns ? (
        <div className="flex items-center justify-between mb-4">
          {title && <h1 className="text-lg font-semibold text-ora-charcoal">{title}</h1>}
          <Button onClick={handleCreateCampaign}>
            <Plus className="h-4 w-4" />
            Create Campaign
          </Button>
        </div>
      ) : title ? (
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-ora-charcoal">{title}</h1>
        </div>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              Failed to load campaigns. Please try again.
            </div>
          )}

          {campaigns && campaigns.length === 0 && (
            <div className="py-12 text-center">
              <Send className="mx-auto h-12 w-12 text-ora-stone mb-4" />
              <h3 className="text-lg font-medium text-ora-charcoal mb-2">
                No campaigns yet
              </h3>
              <p className="text-sm text-ora-graphite mb-4">
                {canCreateCampaigns 
                  ? "Create your first campaign to start communicating with your guests"
                  : "No campaigns have been created for this event yet"
                }
              </p>
              {canCreateCampaigns && (
                <Button onClick={handleCreateCampaign}>
                  <Plus className="h-4 w-4" />
                  Create Campaign
                </Button>
              )}
            </div>
          )}

          {campaigns && campaigns.length > 0 && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-ora-graphite">
                  {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
                </p>
                <div className="flex gap-2 text-xs text-ora-graphite">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    {campaigns.filter((c) => c.status === "Sent").length} sent
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3 text-ora-graphite" />
                    {campaigns.filter((c) => c.status === "Draft").length} drafts
                  </span>
                </div>
              </div>
              <DataTable
                columns={columns}
                data={campaigns}
                keyExtractor={(c) => c.id}
                emptyMessage="No campaigns found"
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Send/Request Sheet - Requirements: 9.4 */}
      <SendRequestSheet
        isOpen={!!campaignToSend}
        onClose={() => setCampaignToSend(null)}
        onConfirm={handleSendCampaign}
        isSending={sendCampaign.isPending}
        campaign={campaignToSend}
        canSendDirectly={canSendDirectly}
      />

      {/* Campaign Detail Sheet - Requirements: 9.3 */}
      <CampaignDetailSheet
        isOpen={!!campaignToView}
        onClose={() => setCampaignToView(null)}
        campaign={campaignToView}
      />
    </>
  )
}
