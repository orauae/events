/**
 * @fileoverview Admin Dashboard Page - Platform-wide management overview
 * 
 * This page provides administrators with a comprehensive dashboard including:
 * - Campaign statistics (total, by status, performance metrics)
 * - Email performance metrics (open rates, click rates, bounces)
 * - Event and guest overviews
 * - Recent campaign activity
 * - Quick links to admin management areas
 * 
 * @module app/admin/page
 * @route /admin
 * @access Admin only - Requires admin role
 * 
 * @example
 * ```
 * // URL: /admin
 * // Displays platform-wide statistics and management overview
 * ```
 */

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Mail,
  FileText,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Users,
  MousePointerClick,
  Eye,
  ArrowRight,
  Plus,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ORAAccentLine } from "@/components/ui/ora-brand"

/**
 * Admin Dashboard Statistics Interface
 * Represents aggregated statistics for the admin overview
 * 
 * @interface AdminDashboardStats
 * @property {object} campaigns - Campaign statistics by status
 * @property {object} emails - Email delivery and engagement metrics
 * @property {object} templates - Template library statistics
 * @property {Array} recentCampaigns - Recently active campaigns
 * @property {object} [events] - Optional event statistics
 * @property {object} [guests] - Optional guest statistics
 */
interface AdminDashboardStats {
  campaigns: {
    total: number
    draft: number
    scheduled: number
    sending: number
    sent: number
    paused: number
  }
  emails: {
    totalSent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    openRate: number
    clickRate: number
  }
  templates: {
    total: number
  }
  recentCampaigns: Array<{
    id: string
    name: string
    status: string
    sentAt: string | null
    openRate: number
  }>
  events?: {
    total: number
    upcoming: number
  }
  guests?: {
    total: number
    attending: number
    pending: number
    checkedIn: number
  }
}

/**
 * Stat Card Component - ORA Design System
 * Displays a single statistic with icon and label
 */
function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
  href,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  iconColor: string
  href?: string
}) {
  const content = (
    <div 
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid transparent',
        padding: '20px',
        transition: 'all 0.2s ease',
        cursor: href ? 'pointer' : 'default',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#B8956B'
        if (href) e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'transparent'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ 
          padding: '12px', 
          backgroundColor: '#F5F3F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Icon style={{ width: '20px', height: '20px', color: iconColor }} />
        </div>
        <div>
          <p style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '4px', letterSpacing: '0.02em' }}>
            {label}
          </p>
          <p style={{ fontSize: '24px', fontWeight: 300, color: '#2C2C2C', letterSpacing: '0.01em' }}>
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
        </div>
      </div>
    </div>
  )

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none' }}>{content}</Link>
  }

  return content
}

/**
 * Loading skeleton for the dashboard - ORA Design System
 */
function DashboardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <Skeleton className="h-1 w-12 mb-4" />
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Campaign stats skeleton */}
      <div>
        <Skeleton className="h-3 w-32 mb-4" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ backgroundColor: '#FFFFFF', border: '1px solid transparent', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Skeleton className="h-11 w-11 rounded-lg" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-12" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent campaigns skeleton */}
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid transparent', padding: '24px' }}>
        <Skeleton className="h-6 w-40 mb-4" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid #E8E4DF' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Admin Dashboard Page - ORA Design System
 * 
 * Displays overview statistics for the admin section including:
 * - Campaign counts by status
 * - Email delivery metrics (sent, delivered, opened, clicked)
 * - Template library count
 * - Recent campaign activity
 * 
 * Requirements: 1 (Admin Layout and Navigation)
 */
export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadStats = async () => {
      try {
        setIsLoading(true)
        
        // Fetch real stats from API
        const response = await fetch('/api/admin/stats')
        
        if (!response.ok) {
          throw new Error('Failed to fetch admin statistics')
        }
        
        const data = await response.json()
        setStats(data)
      } catch (err) {
        setError("Failed to load dashboard statistics")
        console.error("Dashboard stats error:", err)
      } finally {
        setIsLoading(false)
      }
    }

    loadStats()
  }, [])

  if (isLoading) {
    return <DashboardSkeleton />
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
        <AlertCircle style={{ width: '48px', height: '48px', color: '#B85C5C', marginBottom: '16px' }} />
        <h2 style={{ fontSize: '18px', fontWeight: 300, color: '#2C2C2C', marginBottom: '8px' }}>Error Loading Dashboard</h2>
        <p style={{ color: '#6B6B6B' }}>{error}</p>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const campaignStats = [
    { label: "Total Campaigns", value: stats.campaigns.total, icon: Mail, iconColor: "#5C7A8A", href: "/admin/campaigns" },
    { label: "Draft", value: stats.campaigns.draft, icon: FileText, iconColor: "#6B6B6B", href: "/admin/campaigns?status=Draft" },
    { label: "Scheduled", value: stats.campaigns.scheduled, icon: Clock, iconColor: "#C4A35A", href: "/admin/campaigns?status=Scheduled" },
    { label: "Sending", value: stats.campaigns.sending, icon: Send, iconColor: "#B8956B", href: "/admin/campaigns?status=Sending" },
    { label: "Sent", value: stats.campaigns.sent, icon: CheckCircle, iconColor: "#5C8A6B", href: "/admin/campaigns?status=Sent" },
    { label: "Paused", value: stats.campaigns.paused, icon: AlertCircle, iconColor: "#C4A35A", href: "/admin/campaigns?status=Paused" },
  ]

  const emailMetrics = [
    { label: "Emails Sent", value: stats.emails.totalSent, icon: Send, iconColor: "#5C7A8A" },
    { label: "Delivered", value: stats.emails.delivered, icon: CheckCircle, iconColor: "#5C8A6B" },
    { label: "Opened", value: stats.emails.opened, icon: Eye, iconColor: "#B8956B" },
    { label: "Clicked", value: stats.emails.clicked, icon: MousePointerClick, iconColor: "#C4A35A" },
    { label: "Open Rate", value: `${stats.emails.openRate.toFixed(1)}%`, icon: TrendingUp, iconColor: "#5C8A6B" },
    { label: "Click Rate", value: `${stats.emails.clickRate.toFixed(1)}%`, icon: TrendingUp, iconColor: "#5C7A8A" },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <ORAAccentLine className="mb-4" />
          <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C', marginBottom: '8px' }}>
            Admin Dashboard
          </h1>
          <p style={{ color: '#6B6B6B', fontSize: '14px' }}>
            Overview of campaigns and performance metrics
          </p>
        </div>
        <Link
          href="/admin/campaigns/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: '#2C2C2C',
            color: '#FAFAFA',
            fontSize: '14px',
            fontWeight: 500,
            letterSpacing: '0.02em',
            borderRadius: '9999px',
            textDecoration: 'none',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#4A4A4A'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#2C2C2C'
          }}
        >
          <Plus style={{ width: '16px', height: '16px' }} />
          New Campaign
        </Link>
      </div>

      {/* Campaign Statistics */}
      <div>
        <p style={{ 
          fontSize: '11px', 
          fontWeight: 500, 
          color: '#9A9A9A', 
          textTransform: 'uppercase', 
          letterSpacing: '0.15em', 
          marginBottom: '16px' 
        }}>
          Campaign Overview
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          {campaignStats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      </div>

      {/* Email Delivery Metrics */}
      <div>
        <p style={{ 
          fontSize: '11px', 
          fontWeight: 500, 
          color: '#9A9A9A', 
          textTransform: 'uppercase', 
          letterSpacing: '0.15em', 
          marginBottom: '16px' 
        }}>
          Email Performance
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          {emailMetrics.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      </div>

      {/* Quick Actions & Recent Activity */}
      <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
        {/* Quick Actions */}
        <div style={{ 
          backgroundColor: '#FFFFFF', 
          border: '1px solid transparent', 
          padding: '24px',
          transition: 'border-color 0.2s ease',
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#B8956B'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 300, color: '#2C2C2C', marginBottom: '4px' }}>
            Quick Actions
          </h2>
          <p style={{ fontSize: '13px', color: '#9A9A9A', marginBottom: '20px' }}>
            Common tasks and shortcuts
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <QuickActionLink
              href="/admin/campaigns/new"
              icon={Mail}
              iconColor="#5C7A8A"
              label="Create New Campaign"
            />
            <QuickActionLink
              href="/admin/templates"
              icon={FileText}
              iconColor="#B8956B"
              label="Manage Templates"
            />
            <QuickActionLink
              href="/admin/settings/smtp"
              icon={Users}
              iconColor="#C4A35A"
              label="Configure SMTP"
            />
            <QuickActionLink
              href="/admin/reports"
              icon={TrendingUp}
              iconColor="#5C8A6B"
              label="View Reports"
            />
          </div>
        </div>

        {/* Recent Campaigns */}
        <div style={{ 
          backgroundColor: '#FFFFFF', 
          border: '1px solid transparent', 
          padding: '24px',
          transition: 'border-color 0.2s ease',
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#B8956B'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 300, color: '#2C2C2C', marginBottom: '4px' }}>
                Recent Campaigns
              </h2>
              <p style={{ fontSize: '13px', color: '#9A9A9A' }}>
                Latest campaign activity
              </p>
            </div>
            <Link
              href="/admin/campaigns"
              style={{ 
                fontSize: '13px', 
                color: '#B8956B', 
                textDecoration: 'none',
                transition: 'color 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#2C2C2C'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#B8956B'}
            >
              View all
            </Link>
          </div>
          
          {stats.recentCampaigns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Mail style={{ width: '48px', height: '48px', color: '#D4CFC8', margin: '0 auto 16px' }} />
              <p style={{ color: '#6B6B6B', marginBottom: '4px' }}>No campaigns yet</p>
              <p style={{ fontSize: '13px', color: '#9A9A9A', marginBottom: '20px' }}>
                Create your first campaign to get started
              </p>
              <Link
                href="/admin/campaigns/new"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  border: '1px solid #E8E4DF',
                  borderRadius: '9999px',
                  fontSize: '13px',
                  color: '#2C2C2C',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#D4CFC8'
                  e.currentTarget.style.backgroundColor = '#F5F3F0'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#E8E4DF'
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <Plus style={{ width: '14px', height: '14px' }} />
                Create Campaign
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {stats.recentCampaigns.map((campaign, index) => (
                <Link
                  key={campaign.id}
                  href={`/admin/campaigns/${campaign.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 8px',
                    borderBottom: index < stats.recentCampaigns.length - 1 ? '1px solid #E8E4DF' : 'none',
                    textDecoration: 'none',
                    transition: 'background-color 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5F3F0'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: '#2C2C2C', marginBottom: '4px' }}>
                      {campaign.name}
                    </p>
                    <p style={{ fontSize: '12px', color: '#9A9A9A' }}>
                      {campaign.sentAt
                        ? `Sent ${new Date(campaign.sentAt).toLocaleDateString()}`
                        : campaign.status}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {campaign.status === "Sent" && (
                      <span style={{ fontSize: '12px', color: '#6B6B6B' }}>
                        {campaign.openRate.toFixed(1)}% opens
                      </span>
                    )}
                    <StatusBadge status={campaign.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Template Library Summary */}
      <div style={{ 
        backgroundColor: '#FFFFFF', 
        border: '1px solid transparent', 
        padding: '24px',
        transition: 'border-color 0.2s ease',
      }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#B8956B'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 300, color: '#2C2C2C', marginBottom: '4px' }}>
              Template Library
            </h2>
            <p style={{ fontSize: '13px', color: '#9A9A9A' }}>
              {stats.templates.total} template{stats.templates.total !== 1 ? "s" : ""} available
            </p>
          </div>
          <Link
            href="/admin/templates"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              border: '1px solid #E8E4DF',
              borderRadius: '9999px',
              fontSize: '13px',
              color: '#2C2C2C',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#D4CFC8'
              e.currentTarget.style.backgroundColor = '#F5F3F0'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#E8E4DF'
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <FileText style={{ width: '14px', height: '14px' }} />
            Manage Templates
          </Link>
        </div>
        
        {stats.templates.total === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <FileText style={{ width: '40px', height: '40px', color: '#D4CFC8', margin: '0 auto 12px' }} />
            <p style={{ color: '#6B6B6B', marginBottom: '4px' }}>No templates created yet</p>
            <p style={{ fontSize: '13px', color: '#9A9A9A' }}>
              Create reusable email templates to speed up campaign creation
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ 
              padding: '16px', 
              backgroundColor: '#F5F3F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FileText style={{ width: '24px', height: '24px', color: '#B8956B' }} />
            </div>
            <div>
              <p style={{ fontSize: '28px', fontWeight: 300, color: '#2C2C2C' }}>
                {stats.templates.total}
              </p>
              <p style={{ fontSize: '13px', color: '#6B6B6B' }}>
                Email templates ready to use
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Quick Action Link Component - ORA Design System
 */
function QuickActionLink({
  href,
  icon: Icon,
  iconColor,
  label,
}: {
  href: string
  icon: React.ComponentType<{ style?: React.CSSProperties }>
  iconColor: string
  label: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        border: '1px solid #E8E4DF',
        textDecoration: 'none',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#D4CFC8'
        e.currentTarget.style.backgroundColor = '#F5F3F0'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#E8E4DF'
        e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ 
          padding: '8px', 
          backgroundColor: '#F5F3F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Icon style={{ width: '16px', height: '16px', color: iconColor }} />
        </div>
        <span style={{ fontSize: '14px', fontWeight: 500, color: '#2C2C2C' }}>{label}</span>
      </div>
      <ArrowRight style={{ width: '16px', height: '16px', color: '#D4CFC8' }} />
    </Link>
  )
}

/**
 * Status Badge Component - ORA Design System
 * Displays campaign status with appropriate styling
 */
function StatusBadge({ status }: { status: string }) {
  const statusStyles: Record<string, { bg: string; text: string }> = {
    Draft: { bg: '#F5F3F0', text: '#6B6B6B' },
    Scheduled: { bg: 'rgba(196, 163, 90, 0.1)', text: '#C4A35A' },
    Queued: { bg: 'rgba(184, 149, 107, 0.2)', text: '#B8956B' },
    Sending: { bg: 'rgba(184, 149, 107, 0.1)', text: '#B8956B' },
    Sent: { bg: 'rgba(92, 138, 107, 0.1)', text: '#5C8A6B' },
    Paused: { bg: 'rgba(196, 163, 90, 0.1)', text: '#C4A35A' },
    Cancelled: { bg: 'rgba(184, 92, 92, 0.1)', text: '#B85C5C' },
  }

  const style = statusStyles[status] || statusStyles.Draft

  return (
    <span
      style={{
        padding: '4px 12px',
        fontSize: '12px',
        fontWeight: 500,
        borderRadius: '9999px',
        backgroundColor: style.bg,
        color: style.text,
      }}
    >
      {status}
    </span>
  )
}
