"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { sanitizeHtml } from "@/lib/utils/sanitize"
import {
  ArrowLeft,
  Mail,
  Send,
  Pause,
  Play,
  XCircle,
  Copy,
  FileText,
  Calendar,
  Users,
  Eye,
  MousePointerClick,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3,
  Loader2,
} from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { ORAAccentLine } from "@/components/ui/ora-brand"
import type { CampaignStatus, CampaignType } from "@/db/schema"

/**
 * Campaign with event relation
 */
interface CampaignDetail {
  id: string
  name: string
  type: CampaignType
  status: CampaignStatus
  subject: string
  content: string
  recipientCount: number
  sentCount: number
  deliveredCount: number
  openedCount: number
  clickedCount: number
  bouncedCount: number
  unsubscribedCount: number
  scheduledAt: string | null
  sentAt: string | null
  createdAt: string
  updatedAt: string
  eventId: string
  event?: {
    id: string
    name: string
  }
}

/**
 * Status badge colors following ORA design system
 */
const statusStyles: Record<CampaignStatus, { bg: string; text: string; label: string }> = {
  Draft: { bg: '#F5F3F0', text: '#6B6B6B', label: 'Draft' },
  Scheduled: { bg: 'rgba(196, 163, 90, 0.1)', text: '#C4A35A', label: 'Scheduled' },
  Queued: { bg: 'rgba(184, 149, 107, 0.2)', text: '#B8956B', label: 'Queued' },
  Sending: { bg: 'rgba(184, 149, 107, 0.1)', text: '#B8956B', label: 'Sending' },
  Sent: { bg: 'rgba(92, 138, 107, 0.1)', text: '#5C8A6B', label: 'Sent' },
  Paused: { bg: 'rgba(196, 163, 90, 0.1)', text: '#C4A35A', label: 'Paused' },
  Cancelled: { bg: 'rgba(184, 92, 92, 0.1)', text: '#B85C5C', label: 'Cancelled' },
}

/**
 * Campaign type labels
 */
const typeLabels: Record<CampaignType, string> = {
  Invitation: 'Invitation',
  Reminder: 'Reminder',
  LastChance: 'Last Chance',
  EventDayInfo: 'Event Day Info',
  ThankYou: 'Thank You',
  Feedback: 'Feedback',
}

function formatDate(dateString: string | null) {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  iconColor: string
}) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid transparent',
        
        padding: '16px',
        transition: 'border-color 0.2s ease',
      }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#B8956B'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            padding: '10px',
            
            backgroundColor: '#F5F3F0',
          }}
        >
          <Icon style={{ width: '18px', height: '18px', color: iconColor }} />
        </div>
        <div>
          <p style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '2px' }}>{label}</p>
          <p style={{ fontSize: '20px', fontWeight: 300, color: '#2C2C2C' }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </div>
      </div>
    </div>
  )
}

function CampaignDetailSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div>
          <Skeleton className="h-7 w-64 mb-2" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  )
}

export default function AdminCampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const campaignId = params.id as string

  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Fetch campaign details
  const {
    data: campaign,
    isLoading,
    error,
  } = useQuery<CampaignDetail>({
    queryKey: ['admin-campaign', campaignId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/campaigns/${campaignId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch campaign')
      }
      return response.json()
    },
  })

  // Action mutations
  const sendCampaign = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: 'POST',
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to send campaign')
      }
      return response.json()
    },
    onSuccess: () => {
      toast.success('Campaign is being sent')
      queryClient.invalidateQueries({ queryKey: ['admin-campaign', campaignId] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const pauseCampaign = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/pause`, {
        method: 'POST',
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to pause campaign')
      }
      return response.json()
    },
    onSuccess: () => {
      toast.success('Campaign paused')
      queryClient.invalidateQueries({ queryKey: ['admin-campaign', campaignId] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const resumeCampaign = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/resume`, {
        method: 'POST',
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to resume campaign')
      }
      return response.json()
    },
    onSuccess: () => {
      toast.success('Campaign resumed')
      queryClient.invalidateQueries({ queryKey: ['admin-campaign', campaignId] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const cancelCampaign = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/cancel`, {
        method: 'POST',
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to cancel campaign')
      }
      return response.json()
    },
    onSuccess: () => {
      toast.success('Campaign cancelled')
      queryClient.invalidateQueries({ queryKey: ['admin-campaign', campaignId] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const duplicateCampaign = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/duplicate`, {
        method: 'POST',
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to duplicate campaign')
      }
      return response.json()
    },
    onSuccess: (data) => {
      toast.success('Campaign duplicated')
      router.push(`/admin/campaigns/${data.id}`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  if (isLoading) {
    return <CampaignDetailSkeleton />
  }

  if (error || !campaign) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
        <AlertCircle style={{ width: '48px', height: '48px', color: '#B85C5C', marginBottom: '16px' }} />
        <h2 style={{ fontSize: '18px', fontWeight: 300, color: '#2C2C2C', marginBottom: '8px' }}>Campaign Not Found</h2>
        <p style={{ color: '#6B6B6B', marginBottom: '24px' }}>The campaign you're looking for doesn't exist or you don't have access.</p>
        <Link
          href="/admin/campaigns"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: '#2C2C2C',
            color: '#FAFAFA',
            
            textDecoration: 'none',
            fontSize: '14px',
          }}
        >
          <ArrowLeft style={{ width: '16px', height: '16px' }} />
          Back to Campaigns
        </Link>
      </div>
    )
  }

  const statusStyle = statusStyles[campaign.status] || statusStyles.Draft
  const openRate = campaign.deliveredCount > 0 ? ((campaign.openedCount / campaign.deliveredCount) * 100).toFixed(1) : '0.0'
  const clickRate = campaign.deliveredCount > 0 ? ((campaign.clickedCount / campaign.deliveredCount) * 100).toFixed(1) : '0.0'

  const canSend = campaign.status === 'Draft' || campaign.status === 'Scheduled'
  const canPause = campaign.status === 'Sending' || campaign.status === 'Queued'
  const canResume = campaign.status === 'Paused'
  const canCancel = campaign.status === 'Sending' || campaign.status === 'Scheduled' || campaign.status === 'Paused' || campaign.status === 'Queued'
  const isProcessing = campaign.status === 'Queued' || campaign.status === 'Sending'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header */}
      <div>
        <Link
          href="/admin/campaigns"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: '#6B6B6B',
            textDecoration: 'none',
            fontSize: '14px',
            marginBottom: '16px',
          }}
        >
          <ArrowLeft style={{ width: '16px', height: '16px' }} />
          Back to Campaigns
        </Link>
        
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <ORAAccentLine className="mb-4" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '28px', fontWeight: 300, color: '#2C2C2C' }}>{campaign.name}</h1>
              <span
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  borderRadius: '9999px',
                  backgroundColor: statusStyle.bg,
                  color: statusStyle.text,
                }}
              >
                {statusStyle.label}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#6B6B6B', fontSize: '14px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText style={{ width: '14px', height: '14px' }} />
                {typeLabels[campaign.type]}
              </span>
              {campaign.event && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar style={{ width: '14px', height: '14px' }} />
                  {campaign.event.name}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users style={{ width: '14px', height: '14px' }} />
                {campaign.recipientCount} recipients
              </span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {canSend && (
              <button
                onClick={() => sendCampaign.mutate()}
                disabled={sendCampaign.isPending}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  backgroundColor: '#5C8A6B',
                  color: '#FAFAFA',
                  border: 'none',
                  
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: sendCampaign.isPending ? 'not-allowed' : 'pointer',
                  opacity: sendCampaign.isPending ? 0.7 : 1,
                }}
              >
                {sendCampaign.isPending ? (
                  <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Send style={{ width: '16px', height: '16px' }} />
                )}
                Send Now
              </button>
            )}
            {canPause && (
              <button
                onClick={() => pauseCampaign.mutate()}
                disabled={pauseCampaign.isPending}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  backgroundColor: '#C4A35A',
                  color: '#FAFAFA',
                  border: 'none',
                  
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: pauseCampaign.isPending ? 'not-allowed' : 'pointer',
                }}
              >
                <Pause style={{ width: '16px', height: '16px' }} />
                Pause
              </button>
            )}
            {canResume && (
              <button
                onClick={() => resumeCampaign.mutate()}
                disabled={resumeCampaign.isPending}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  backgroundColor: '#5C8A6B',
                  color: '#FAFAFA',
                  border: 'none',
                  
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: resumeCampaign.isPending ? 'not-allowed' : 'pointer',
                }}
              >
                <Play style={{ width: '16px', height: '16px' }} />
                Resume
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => cancelCampaign.mutate()}
                disabled={cancelCampaign.isPending}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  backgroundColor: '#B85C5C',
                  color: '#FAFAFA',
                  border: 'none',
                  
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: cancelCampaign.isPending ? 'not-allowed' : 'pointer',
                }}
              >
                <XCircle style={{ width: '16px', height: '16px' }} />
                Cancel
              </button>
            )}
            <button
              onClick={() => duplicateCampaign.mutate()}
              disabled={duplicateCampaign.isPending}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                backgroundColor: '#F5F3F0',
                color: '#2C2C2C',
                border: '1px solid #E8E4DF',
                
                fontSize: '14px',
                fontWeight: 500,
                cursor: duplicateCampaign.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              <Copy style={{ width: '16px', height: '16px' }} />
              Duplicate
            </button>
            <Link
              href={`/admin/campaigns/${campaignId}/report`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                backgroundColor: '#F5F3F0',
                color: '#2C2C2C',
                border: '1px solid #E8E4DF',
                
                fontSize: '14px',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              <BarChart3 style={{ width: '16px', height: '16px' }} />
              View Report
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <StatCard label="Recipients" value={campaign.recipientCount} icon={Users} iconColor="#5C7A8A" />
        <StatCard label="Sent" value={campaign.sentCount} icon={Send} iconColor="#B8956B" />
        <StatCard label="Delivered" value={campaign.deliveredCount} icon={CheckCircle} iconColor="#5C8A6B" />
        <StatCard label="Opened" value={campaign.openedCount} icon={Eye} iconColor="#C4A35A" />
        <StatCard label="Clicked" value={campaign.clickedCount} icon={MousePointerClick} iconColor="#5C7A8A" />
        <StatCard label="Bounced" value={campaign.bouncedCount} icon={AlertCircle} iconColor="#B85C5C" />
        <StatCard label="Open Rate" value={`${openRate}%`} icon={Eye} iconColor="#5C8A6B" />
        <StatCard label="Click Rate" value={`${clickRate}%`} icon={MousePointerClick} iconColor="#5C8A6B" />
      </div>

      {/* Campaign Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left Column - Info */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid transparent',
            
            padding: '24px',
            transition: 'border-color 0.2s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#B8956B'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 500, color: '#2C2C2C', marginBottom: '16px' }}>
            Campaign Details
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <p style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>Subject</p>
              <p style={{ fontSize: '14px', color: '#2C2C2C' }}>{campaign.subject}</p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>Created</p>
              <p style={{ fontSize: '14px', color: '#2C2C2C' }}>{formatDate(campaign.createdAt)}</p>
            </div>
            {campaign.scheduledAt && (
              <div>
                <p style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>Scheduled For</p>
                <p style={{ fontSize: '14px', color: '#2C2C2C' }}>{formatDate(campaign.scheduledAt)}</p>
              </div>
            )}
            {campaign.sentAt && (
              <div>
                <p style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>Sent At</p>
                <p style={{ fontSize: '14px', color: '#2C2C2C' }}>{formatDate(campaign.sentAt)}</p>
              </div>
            )}
            <div>
              <p style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>Last Updated</p>
              <p style={{ fontSize: '14px', color: '#2C2C2C' }}>{formatDate(campaign.updatedAt)}</p>
            </div>
          </div>
        </div>

        {/* Right Column - Email Preview */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid transparent',
            
            padding: '24px',
            transition: 'border-color 0.2s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#B8956B'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 500, color: '#2C2C2C', marginBottom: '16px' }}>
            Email Preview
          </h2>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E8E4DF',
              
              padding: '16px',
              maxHeight: '400px',
              overflow: 'auto',
            }}
          >
            {campaign.content ? (
              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(campaign.content) }} />
            ) : (
              <p style={{ color: '#6B6B6B', fontStyle: 'italic' }}>No content available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
