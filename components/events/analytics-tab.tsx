"use client"

import { useState } from "react"
import {
  Users,
  Mail,
  CheckCircle2,
  Clock,
  UserCheck,
  UserX,
  HelpCircle,
  TrendingUp,
  Download,
  BarChart3,
  Send,
  Zap,
  Play,
  XCircle,
  Presentation,
} from "lucide-react"
import { useEventAnalytics, useCampaignsByEvent, useExportGuestList, useExportAttendance } from "@/hooks"
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
import { PresentationMode } from "./presentation-mode"
import type { Campaign } from "@/db/schema"

interface AnalyticsTabProps {
  eventId: string
}

// Metric Card Component
function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  trend?: { value: number; label: string }
  variant?: "default" | "success" | "warning" | "info"
}) {
  const variantStyles = {
    default: "text-ora-gold",
    success: "text-green-600",
    warning: "text-amber-600",
    info: "text-blue-600",
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-ora-graphite">{title}</p>
            <p className="text-3xl font-semibold text-ora-charcoal mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-ora-graphite mt-1">{subtitle}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-xs text-green-600">{trend.value}%</span>
                <span className="text-xs text-ora-graphite">{trend.label}</span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-lg bg-ora-cream ${variantStyles[variant]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// RSVP Breakdown Chart Component
function RSVPBreakdownChart({
  breakdown,
  total,
}: {
  breakdown: {
    attending: number
    notAttending: number
    pending: number
  }
  total: number
}) {
  const items = [
    { label: "Attending", value: breakdown.attending, color: "bg-green-500", icon: UserCheck },
    { label: "Not Attending", value: breakdown.notAttending, color: "bg-red-500", icon: UserX },
    { label: "Pending", value: breakdown.pending, color: "bg-gray-400", icon: Clock },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">RSVP Breakdown</CardTitle>
        <CardDescription>Response distribution for this event</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Visual bar chart */}
        <div className="space-y-4">
          {items.map((item) => {
            const percentage = total > 0 ? (item.value / total) * 100 : 0
            return (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <item.icon className="h-4 w-4 text-ora-graphite" />
                    <span className="text-ora-charcoal">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ora-charcoal">{item.value}</span>
                    <span className="text-ora-graphite">({percentage.toFixed(1)}%)</span>
                  </div>
                </div>
                <div className="h-2 bg-ora-sand rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Summary */}
        <div className="mt-6 pt-4 border-t border-ora-sand">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ora-graphite">Total Invited</span>
            <span className="font-medium text-ora-charcoal">{total}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Campaign Performance Table Component
function CampaignPerformanceTable({
  campaigns,
  eventId,
}: {
  campaigns: Campaign[]
  eventId: string
}) {
  const sentCampaigns = campaigns.filter((c) => c.status === "Sent")

  if (sentCampaigns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Campaign Performance</CardTitle>
          <CardDescription>Email delivery metrics by campaign</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <Send className="mx-auto h-10 w-10 text-ora-stone mb-3" />
            <p className="text-sm text-ora-graphite">
              No campaigns have been sent yet
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Campaign Performance</CardTitle>
        <CardDescription>Email delivery metrics by campaign</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ora-sand">
                <th className="text-left py-3 px-2 text-sm font-medium text-ora-graphite">
                  Campaign
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-ora-graphite">
                  Type
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-ora-graphite">
                  Sent
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-ora-graphite">
                  Delivered
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-ora-graphite">
                  Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {sentCampaigns.map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// Automation Performance Card Component
// Requirements: 8.6
function AutomationPerformanceCard({
  metrics,
}: {
  metrics: {
    totalAutomations: number
    activeAutomations: number
    totalExecutions: number
    successfulExecutions: number
    failedExecutions: number
    successRate: number
  }
}) {
  if (metrics.totalAutomations === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Automation Performance</CardTitle>
          <CardDescription>Workflow execution metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <Zap className="mx-auto h-10 w-10 text-ora-stone mb-3" />
            <p className="text-sm text-ora-graphite">
              No automations configured yet
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Automation Performance</CardTitle>
        <CardDescription>Workflow execution metrics</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Automations Overview */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-ora-cream">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-ora-gold" />
              <span className="text-sm text-ora-charcoal">Total Automations</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-ora-charcoal">{metrics.totalAutomations}</span>
              <Badge variant="success" className="text-xs">
                {metrics.activeAutomations} active
              </Badge>
            </div>
          </div>

          {/* Execution Stats */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-ora-graphite" />
                <span className="text-ora-charcoal">Total Executions</span>
              </div>
              <span className="font-medium text-ora-charcoal">{metrics.totalExecutions}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-ora-charcoal">Successful</span>
              </div>
              <span className="font-medium text-green-600">{metrics.successfulExecutions}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-ora-charcoal">Failed</span>
              </div>
              <span className="font-medium text-red-500">{metrics.failedExecutions}</span>
            </div>
          </div>

          {/* Success Rate Bar */}
          {metrics.totalExecutions > 0 && (
            <div className="pt-2 border-t border-ora-sand">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-ora-graphite">Success Rate</span>
                <span className="font-medium text-ora-charcoal">
                  {metrics.successRate.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-ora-sand rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-500"
                  style={{ width: `${metrics.successRate}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Campaign Row with analytics
function CampaignRow({ campaign }: { campaign: Campaign }) {
  // For now, we'll show placeholder data since we need to fetch analytics per campaign
  // In a real implementation, you might batch these or use a different approach
  return (
    <tr className="border-b border-ora-sand/50 last:border-0">
      <td className="py-3 px-2">
        <div className="font-medium text-ora-charcoal">{campaign.name}</div>
        <div className="text-xs text-ora-graphite">{campaign.subject}</div>
      </td>
      <td className="py-3 px-2">
        <Badge variant="secondary">{campaign.type}</Badge>
      </td>
      <td className="py-3 px-2 text-right text-ora-charcoal">—</td>
      <td className="py-3 px-2 text-right text-ora-charcoal">—</td>
      <td className="py-3 px-2 text-right">
        <Badge variant="info">—</Badge>
      </td>
    </tr>
  )
}

// Loading skeleton
function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Metric cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-11 w-11 rounded-lg" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Automation performance skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function AnalyticsTab({ eventId }: AnalyticsTabProps) {
  const [showPresentationMode, setShowPresentationMode] = useState(false)
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useEventAnalytics(eventId)
  const { data: campaigns, isLoading: campaignsLoading } = useCampaignsByEvent(eventId)
  const { exportGuestList, isPending: isExportingGuests } = useExportGuestList()
  const { exportAttendance, isPending: isExportingAttendance } = useExportAttendance()

  const isLoading = analyticsLoading || campaignsLoading

  // Show presentation mode (Requirements: 7.1, 7.4)
  if (showPresentationMode) {
    return (
      <PresentationMode
        eventId={eventId}
        refreshInterval={30000}
        onExit={() => setShowPresentationMode(false)}
      />
    )
  }

  if (isLoading) {
    return <AnalyticsSkeleton />
  }

  if (analyticsError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-ora-stone mb-4" />
          <p className="text-ora-graphite">Failed to load analytics. Please try again.</p>
        </CardContent>
      </Card>
    )
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-ora-stone mb-4" />
          <p className="text-ora-graphite">No analytics data available.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Export and Presentation Actions - Requirements: 7.1 */}
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowPresentationMode(true)}
        >
          <Presentation className="h-4 w-4" />
          Presentation Mode
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportGuestList(eventId)}
          isLoading={isExportingGuests}
        >
          <Download className="h-4 w-4" />
          Export Guest List
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportAttendance(eventId)}
          isLoading={isExportingAttendance}
        >
          <Download className="h-4 w-4" />
          Export Attendance
        </Button>
      </div>

      {/* Metric Cards - Requirements 8.1, 8.3, 8.6 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          title="Total Invited"
          value={analytics.totalInvited}
          subtitle="Guests added to event"
          icon={Users}
        />
        <MetricCard
          title="Emails Sent"
          value={analytics.emailsSent}
          subtitle={`${analytics.emailsDelivered} delivered`}
          icon={Mail}
          variant="info"
        />
        <MetricCard
          title="Confirmed Attending"
          value={analytics.rsvpBreakdown.attending}
          subtitle={`${analytics.totalInvited > 0 ? ((analytics.rsvpBreakdown.attending / analytics.totalInvited) * 100).toFixed(1) : 0}% of invited`}
          icon={UserCheck}
          variant="success"
        />
        <MetricCard
          title="Check-In Rate"
          value={`${analytics.checkInRate.toFixed(1)}%`}
          subtitle={`${analytics.checkInCount} checked in`}
          icon={CheckCircle2}
          variant="success"
        />
        <MetricCard
          title="Automations"
          value={analytics.automationMetrics.totalExecutions}
          subtitle={`${analytics.automationMetrics.activeAutomations} active, ${analytics.automationMetrics.successRate.toFixed(0)}% success`}
          icon={Zap}
          variant="warning"
        />
      </div>

      {/* Charts and Tables - Requirements 8.2, 8.3, 8.6 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RSVPBreakdownChart
          breakdown={analytics.rsvpBreakdown}
          total={analytics.totalInvited}
        />
        <CampaignPerformanceTable
          campaigns={campaigns || []}
          eventId={eventId}
        />
      </div>

      {/* Automation Performance - Requirements 8.6 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AutomationPerformanceCard metrics={analytics.automationMetrics} />
      </div>

      {/* Additional Stats Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Engagement Summary</CardTitle>
          <CardDescription>Overall event engagement metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="p-4 rounded-lg bg-ora-cream">
              <p className="text-sm text-ora-graphite">Response Rate</p>
              <p className="text-2xl font-semibold text-ora-charcoal">
                {analytics.totalInvited > 0
                  ? (((analytics.totalInvited - analytics.rsvpBreakdown.pending) / analytics.totalInvited) * 100).toFixed(1)
                  : 0}%
              </p>
              <p className="text-xs text-ora-graphite mt-1">
                {analytics.totalInvited - analytics.rsvpBreakdown.pending} of {analytics.totalInvited} responded
              </p>
            </div>
            <div className="p-4 rounded-lg bg-ora-cream">
              <p className="text-sm text-ora-graphite">Email Delivery Rate</p>
              <p className="text-2xl font-semibold text-ora-charcoal">
                {analytics.emailsSent > 0
                  ? ((analytics.emailsDelivered / analytics.emailsSent) * 100).toFixed(1)
                  : 0}%
              </p>
              <p className="text-xs text-ora-graphite mt-1">
                {analytics.emailsDelivered} of {analytics.emailsSent} delivered
              </p>
            </div>
            <div className="p-4 rounded-lg bg-ora-cream">
              <p className="text-sm text-ora-graphite">Attendance Rate</p>
              <p className="text-2xl font-semibold text-ora-charcoal">
                {analytics.rsvpBreakdown.attending > 0
                  ? ((analytics.checkInCount / analytics.rsvpBreakdown.attending) * 100).toFixed(1)
                  : 0}%
              </p>
              <p className="text-xs text-ora-graphite mt-1">
                {analytics.checkInCount} of {analytics.rsvpBreakdown.attending} confirmed
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
