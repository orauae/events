"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Mail,
  Plus,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Copy,
  Trash2,
  Download,
  Eye,
  Send,
  Pause,
  Play,
  X,
  Calendar,
  ArrowUpDown,
  CheckSquare,
  Square,
  AlertCircle,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ORAAccentLine } from "@/components/ui/ora-brand"
import { useAdminCampaigns, useBulkCampaignActions } from "@/hooks/use-admin-campaigns"
import type { CampaignStatus, CampaignType } from "@/db/schema"

/**
 * Campaign with event relation for display
 */
interface CampaignWithEvent {
  id: string
  name: string
  type: CampaignType
  status: CampaignStatus
  subject: string
  recipientCount: number
  sentCount: number
  deliveredCount: number
  openedCount: number
  clickedCount: number
  bouncedCount: number
  scheduledAt: Date | null
  sentAt: Date | null
  createdAt: Date
  updatedAt: Date
  event: {
    id: string
    name: string
  }
}

/**
 * Status badge colors following ORA design system
 */
const statusStyles: Record<CampaignStatus, { bg: string; text: string }> = {
  Draft: { bg: '#F5F3F0', text: '#6B6B6B' },
  Scheduled: { bg: 'rgba(196, 163, 90, 0.1)', text: '#C4A35A' },
  Queued: { bg: 'rgba(184, 149, 107, 0.2)', text: '#B8956B' },
  Sending: { bg: 'rgba(184, 149, 107, 0.1)', text: '#B8956B' },
  Sent: { bg: 'rgba(92, 138, 107, 0.1)', text: '#5C8A6B' },
  Paused: { bg: 'rgba(196, 163, 90, 0.1)', text: '#C4A35A' },
  Cancelled: { bg: 'rgba(184, 92, 92, 0.1)', text: '#B85C5C' },
}

/**
 * Campaign type badge colors
 */
const typeStyles: Record<CampaignType, { bg: string; text: string }> = {
  Invitation: { bg: 'rgba(92, 122, 138, 0.1)', text: '#5C7A8A' },
  Reminder: { bg: 'rgba(184, 149, 107, 0.1)', text: '#B8956B' },
  LastChance: { bg: 'rgba(196, 163, 90, 0.1)', text: '#C4A35A' },
  EventDayInfo: { bg: 'rgba(92, 138, 107, 0.1)', text: '#5C8A6B' },
  ThankYou: { bg: 'rgba(138, 92, 138, 0.1)', text: '#8A5C8A' },
  Feedback: { bg: 'rgba(107, 107, 107, 0.1)', text: '#6B6B6B' },
}

/**
 * Status Badge Component
 */
function StatusBadge({ status }: { status: CampaignStatus }) {
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
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  )
}

/**
 * Type Badge Component
 */
function TypeBadge({ type }: { type: CampaignType }) {
  const style = typeStyles[type] || typeStyles.Invitation
  return (
    <span
      style={{
        padding: '4px 10px',
        fontSize: '11px',
        fontWeight: 500,
        borderRadius: '6px',
        backgroundColor: style.bg,
        color: style.text,
        whiteSpace: 'nowrap',
      }}
    >
      {type}
    </span>
  )
}

/**
 * Format date for display
 */
function formatDate(date: Date | string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Format percentage for display
 */
function formatPercent(value: number, total: number): string {
  if (total === 0) return '—'
  return `${((value / total) * 100).toFixed(1)}%`
}

/**
 * Loading skeleton for the campaigns table
 */
function CampaignsTableSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Skeleton className="h-10 w-64" />
        <div style={{ display: 'flex', gap: '12px' }}>
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>
      
      {/* Table skeleton */}
      <div style={{ 
        backgroundColor: '#FFFFFF', 
        border: '1px solid transparent', 
        
        overflow: 'hidden'
      }}>
        {/* Table header */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '40px 2fr 1fr 1fr 1fr 1fr 1fr 1fr 60px',
          gap: '16px',
          padding: '16px 20px',
          borderBottom: '1px solid #E8E4DF',
          backgroundColor: '#F5F3F0'
        }}>
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-8" />
        </div>
        
        {/* Table rows */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div 
            key={i}
            style={{ 
              display: 'grid', 
              gridTemplateColumns: '40px 2fr 1fr 1fr 1fr 1fr 1fr 1fr 60px',
              gap: '16px',
              padding: '16px 20px',
              borderBottom: '1px solid #E8E4DF'
            }}
          >
            <Skeleton className="h-4 w-4" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Filter dropdown component
 */
function FilterDropdown({
  label,
  options,
  value,
  onChange,
  icon: Icon,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  icon?: React.ComponentType<{ style?: React.CSSProperties }>
}) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          border: '1px solid #E8E4DF',
          
          backgroundColor: value ? '#F5F3F0' : 'transparent',
          fontSize: '14px',
          color: '#2C2C2C',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#D4CFC8'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#E8E4DF'
        }}
      >
        {Icon && <Icon style={{ width: '16px', height: '16px', color: '#6B6B6B' }} />}
        <span>{value ? options.find(o => o.value === value)?.label : label}</span>
        <ChevronDown style={{ width: '14px', height: '14px', color: '#9A9A9A' }} />
      </button>
      
      {isOpen && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              minWidth: '180px',
              backgroundColor: '#FAFAFA',
              border: '1px solid #E8E4DF',
              
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              zIndex: 50,
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => {
                onChange('')
                setIsOpen(false)
              }}
              style={{
                width: '100%',
                padding: '10px 16px',
                textAlign: 'left',
                fontSize: '14px',
                color: '#6B6B6B',
                backgroundColor: !value ? '#F5F3F0' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5F3F0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = !value ? '#F5F3F0' : 'transparent'}
            >
              All {label}
            </button>
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: '#2C2C2C',
                  backgroundColor: value === option.value ? '#F5F3F0' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5F3F0'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = value === option.value ? '#F5F3F0' : 'transparent'}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}


/**
 * Row actions dropdown
 */
function RowActionsDropdown({
  campaign,
  onDuplicate,
  onDelete,
  onPause,
  onResume,
}: {
  campaign: CampaignWithEvent
  onDuplicate: () => void
  onDelete: () => void
  onPause: () => void
  onResume: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          border: '1px solid transparent',
          borderRadius: '6px',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#F5F3F0'
          e.currentTarget.style.borderColor = '#E8E4DF'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.borderColor = 'transparent'
        }}
      >
        <MoreHorizontal style={{ width: '16px', height: '16px', color: '#6B6B6B' }} />
      </button>
      
      {isOpen && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              minWidth: '160px',
              backgroundColor: '#FAFAFA',
              border: '1px solid #E8E4DF',
              
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              zIndex: 50,
              overflow: 'hidden',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                router.push(`/admin/campaigns/${campaign.id}`)
                setIsOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '10px 14px',
                textAlign: 'left',
                fontSize: '13px',
                color: '#2C2C2C',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5F3F0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Eye style={{ width: '14px', height: '14px', color: '#6B6B6B' }} />
              View Details
            </button>
            
            {campaign.status === 'Sending' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onPause()
                  setIsOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontSize: '13px',
                  color: '#C4A35A',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5F3F0'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Pause style={{ width: '14px', height: '14px' }} />
                Pause Sending
              </button>
            )}
            
            {campaign.status === 'Paused' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onResume()
                  setIsOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontSize: '13px',
                  color: '#5C8A6B',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5F3F0'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Play style={{ width: '14px', height: '14px' }} />
                Resume Sending
              </button>
            )}
            
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate()
                setIsOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '10px 14px',
                textAlign: 'left',
                fontSize: '13px',
                color: '#2C2C2C',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5F3F0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Copy style={{ width: '14px', height: '14px', color: '#6B6B6B' }} />
              Duplicate
            </button>
            
            {campaign.status !== 'Sent' && campaign.status !== 'Sending' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                  setIsOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontSize: '13px',
                  color: '#B85C5C',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(184, 92, 92, 0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Trash2 style={{ width: '14px', height: '14px' }} />
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Sortable column header
 */
function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentOrder,
  onSort,
}: {
  label: string
  sortKey: string
  currentSort: string
  currentOrder: 'asc' | 'desc'
  onSort: (key: string) => void
}) {
  const isActive = currentSort === sortKey
  
  return (
    <button
      onClick={() => onSort(sortKey)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: 0,
        border: 'none',
        backgroundColor: 'transparent',
        fontSize: '12px',
        fontWeight: 500,
        color: isActive ? '#2C2C2C' : '#6B6B6B',
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        transition: 'color 0.2s ease',
      }}
      onMouseEnter={(e) => e.currentTarget.style.color = '#2C2C2C'}
      onMouseLeave={(e) => e.currentTarget.style.color = isActive ? '#2C2C2C' : '#6B6B6B'}
    >
      {label}
      {isActive ? (
        currentOrder === 'asc' ? (
          <ChevronUp style={{ width: '14px', height: '14px' }} />
        ) : (
          <ChevronDown style={{ width: '14px', height: '14px' }} />
        )
      ) : (
        <ArrowUpDown style={{ width: '12px', height: '12px', opacity: 0.5 }} />
      )}
    </button>
  )
}

/**
 * Pagination component
 */
function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number
  totalPages: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const pageSizes = [25, 50, 100]
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 20px',
      borderTop: '1px solid #E8E4DF',
      backgroundColor: '#F5F3F0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '13px', color: '#6B6B6B' }}>
          Showing {startItem} to {endItem} of {totalItems} campaigns
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: '#6B6B6B' }}>Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            style={{
              padding: '6px 10px',
              border: '1px solid #E8E4DF',
              borderRadius: '6px',
              backgroundColor: '#FAFAFA',
              fontSize: '13px',
              color: '#2C2C2C',
              cursor: 'pointer',
            }}
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          style={{
            padding: '8px 14px',
            border: '1px solid #E8E4DF',
            borderRadius: '6px',
            backgroundColor: currentPage === 1 ? '#F5F3F0' : '#FAFAFA',
            fontSize: '13px',
            color: currentPage === 1 ? '#9A9A9A' : '#2C2C2C',
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          Previous
        </button>
        
        <span style={{ fontSize: '13px', color: '#6B6B6B', padding: '0 8px' }}>
          Page {currentPage} of {totalPages}
        </span>
        
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          style={{
            padding: '8px 14px',
            border: '1px solid #E8E4DF',
            borderRadius: '6px',
            backgroundColor: currentPage === totalPages ? '#F5F3F0' : '#FAFAFA',
            fontSize: '13px',
            color: currentPage === totalPages ? '#9A9A9A' : '#2C2C2C',
            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          Next
        </button>
      </div>
    </div>
  )
}


/**
 * Admin Campaigns Page
 * 
 * Displays a list of all campaigns with filtering, sorting, and bulk actions.
 * Follows the ORA design system for consistent styling.
 * 
 * Requirements: 3 (Campaign List and Management)
 */
export default function AdminCampaignsPage() {
  const router = useRouter()
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  
  // Sort state
  const [sortBy, setSortBy] = useState<string>('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  
  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  
  // Fetch campaigns with filters
  const { 
    data: campaignsData, 
    isLoading, 
    error,
    refetch 
  } = useAdminCampaigns({
    status: statusFilter as CampaignStatus | undefined,
    type: typeFilter as CampaignType | undefined,
    search: searchQuery,
    page: currentPage,
    pageSize,
    sortBy: sortBy as 'name' | 'createdAt' | 'sentAt' | 'status' | 'openedCount' | 'clickedCount',
    sortOrder,
  })
  
  // Bulk actions
  const { 
    deleteCampaigns, 
    duplicateCampaign,
    pauseCampaign,
    resumeCampaign,
    isDeleting,
    isDuplicating,
  } = useBulkCampaignActions()
  
  // Handle sort
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(key)
      setSortOrder('desc')
    }
    setCurrentPage(1)
  }
  
  // Handle selection
  const handleSelectAll = () => {
    if (!campaignsData?.data) return
    
    if (selectedIds.size === campaignsData.data.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(campaignsData.data.map(c => c.id)))
    }
  }
  
  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }
  
  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    
    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedIds.size} campaign(s)? This action cannot be undone.`
    )
    
    if (confirmed) {
      await deleteCampaigns(Array.from(selectedIds))
      setSelectedIds(new Set())
      refetch()
    }
  }
  
  // Handle single actions
  const handleDuplicate = async (id: string) => {
    await duplicateCampaign(id)
    refetch()
  }
  
  const handleDelete = async (id: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this campaign? This action cannot be undone.'
    )
    
    if (confirmed) {
      await deleteCampaigns([id])
      refetch()
    }
  }
  
  const handlePause = async (id: string) => {
    await pauseCampaign(id)
    refetch()
  }
  
  const handleResume = async (id: string) => {
    await resumeCampaign(id)
    refetch()
  }
  
  // Handle page size change
  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }
  
  // Clear filters
  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('')
    setTypeFilter('')
    setCurrentPage(1)
  }
  
  const hasActiveFilters = searchQuery || statusFilter || typeFilter
  
  // Status options for filter
  const statusOptions = [
    { value: 'Draft', label: 'Draft' },
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Sending', label: 'Sending' },
    { value: 'Sent', label: 'Sent' },
    { value: 'Paused', label: 'Paused' },
    { value: 'Cancelled', label: 'Cancelled' },
  ]
  
  // Type options for filter
  const typeOptions = [
    { value: 'Invitation', label: 'Invitation' },
    { value: 'Reminder', label: 'Reminder' },
    { value: 'LastChance', label: 'Last Chance' },
    { value: 'EventDayInfo', label: 'Event Day' },
    { value: 'ThankYou', label: 'Thank You' },
    { value: 'Feedback', label: 'Feedback' },
  ]
  
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <ORAAccentLine className="mb-4" />
            <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C', marginBottom: '8px' }}>
              Campaigns
            </h1>
            <p style={{ color: '#6B6B6B', fontSize: '14px' }}>
              Manage campaigns across all events
            </p>
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        
        <CampaignsTableSkeleton />
      </div>
    )
  }
  
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <ORAAccentLine className="mb-4" />
            <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C', marginBottom: '8px' }}>
              Campaigns
            </h1>
            <p style={{ color: '#6B6B6B', fontSize: '14px' }}>
              Manage campaigns across all events
            </p>
          </div>
        </div>
        
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: '64px 0',
          backgroundColor: '#FFFFFF',
          border: '1px solid transparent',
          
        }}>
          <AlertCircle style={{ width: '48px', height: '48px', color: '#B85C5C', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 300, color: '#2C2C2C', marginBottom: '8px' }}>
            Error Loading Campaigns
          </h2>
          <p style={{ color: '#6B6B6B', marginBottom: '20px' }}>
            {error instanceof Error ? error.message : 'Failed to load campaigns'}
          </p>
          <button
            onClick={() => refetch()}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2C2C2C',
              color: '#FAFAFA',
              border: 'none',
              borderRadius: '9999px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4A4A4A'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2C2C2C'}
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }
  
  const campaigns = campaignsData?.data || []
  const totalPages = campaignsData?.totalPages || 1
  const totalItems = campaignsData?.total || 0
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <ORAAccentLine className="mb-4" />
          <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C', marginBottom: '8px' }}>
            Campaigns
          </h1>
          <p style={{ color: '#6B6B6B', fontSize: '14px' }}>
            Manage campaigns across all events
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/admin/campaigns/scheduled"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              backgroundColor: 'transparent',
              color: '#2C2C2C',
              fontSize: '14px',
              fontWeight: 500,
              letterSpacing: '0.02em',
              borderRadius: '9999px',
              border: '1px solid #E8E4DF',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#F5F3F0'
              e.currentTarget.style.borderColor = '#D4CFC8'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.borderColor = '#E8E4DF'
            }}
          >
            <Calendar style={{ width: '16px', height: '16px' }} />
            Calendar
          </Link>
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
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4A4A4A'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2C2C2C'}
          >
            <Plus style={{ width: '16px', height: '16px' }} />
            New Campaign
          </Link>
        </div>
      </div>
      
      {/* Filters and Search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', maxWidth: '400px' }}>
          <Search style={{ 
            position: 'absolute', 
            left: '14px', 
            top: '50%', 
            transform: 'translateY(-50%)',
            width: '16px', 
            height: '16px', 
            color: '#9A9A9A' 
          }} />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            style={{
              width: '100%',
              padding: '10px 14px 10px 42px',
              border: '1px solid #E8E4DF',
              
              fontSize: '14px',
              color: '#2C2C2C',
              backgroundColor: '#FAFAFA',
              outline: 'none',
              transition: 'border-color 0.2s ease',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#B8956B'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#E8E4DF'}
          />
        </div>
        
        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FilterDropdown
            label="Status"
            options={statusOptions}
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value)
              setCurrentPage(1)
            }}
            icon={Filter}
          />
          
          <FilterDropdown
            label="Type"
            options={typeOptions}
            value={typeFilter}
            onChange={(value) => {
              setTypeFilter(value)
              setCurrentPage(1)
            }}
            icon={Mail}
          />
          
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 14px',
                border: 'none',
                
                backgroundColor: 'transparent',
                fontSize: '13px',
                color: '#B85C5C',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(184, 92, 92, 0.05)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <X style={{ width: '14px', height: '14px' }} />
              Clear filters
            </button>
          )}
        </div>
      </div>
      
      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          backgroundColor: 'rgba(184, 149, 107, 0.1)',
          border: '1px solid #B8956B',
          
        }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#2C2C2C' }}>
            {selectedIds.size} campaign{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleBulkDelete}
              disabled={isDeleting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                border: '1px solid #B85C5C',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                fontSize: '13px',
                color: '#B85C5C',
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                opacity: isDeleting ? 0.6 : 1,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isDeleting) {
                  e.currentTarget.style.backgroundColor = 'rgba(184, 92, 92, 0.1)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <Trash2 style={{ width: '14px', height: '14px' }} />
              {isDeleting ? 'Deleting...' : 'Delete Selected'}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{
                padding: '8px 14px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                fontSize: '13px',
                color: '#6B6B6B',
                cursor: 'pointer',
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#2C2C2C'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#6B6B6B'}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}
      
      {/* Campaigns Table */}
      <div style={{ 
        backgroundColor: '#FFFFFF', 
        border: '1px solid transparent', 
        
        overflow: 'hidden'
      }}>
        {/* Table Header */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '40px 2fr 100px 100px 100px 100px 80px 80px 60px',
          gap: '16px',
          padding: '14px 20px',
          borderBottom: '1px solid #E8E4DF',
          backgroundColor: '#F5F3F0',
          alignItems: 'center',
        }}>
          <button
            onClick={handleSelectAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
            }}
          >
            {campaigns.length > 0 && selectedIds.size === campaigns.length ? (
              <CheckSquare style={{ width: '18px', height: '18px', color: '#B8956B' }} />
            ) : (
              <Square style={{ width: '18px', height: '18px', color: '#9A9A9A' }} />
            )}
          </button>
          <SortableHeader label="Campaign" sortKey="name" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
          <SortableHeader label="Status" sortKey="status" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</span>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recipients</span>
          <SortableHeader label="Sent" sortKey="sentAt" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
          <SortableHeader label="Opens" sortKey="openedCount" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
          <SortableHeader label="Clicks" sortKey="clickedCount" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
          <span></span>
        </div>
        
        {/* Table Body */}
        {campaigns.length === 0 ? (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '64px 20px',
          }}>
            <Mail style={{ width: '48px', height: '48px', color: '#D4CFC8', marginBottom: '16px' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#2C2C2C', marginBottom: '8px' }}>
              {hasActiveFilters ? 'No campaigns match your filters' : 'No campaigns yet'}
            </h3>
            <p style={{ fontSize: '14px', color: '#6B6B6B', marginBottom: '20px', textAlign: 'center' }}>
              {hasActiveFilters 
                ? 'Try adjusting your filters or search query'
                : 'Create your first campaign to start engaging with your audience'
              }
            </p>
            {!hasActiveFilters && (
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
            )}
          </div>
        ) : (
          campaigns.map((campaign, index) => (
            <div
              key={campaign.id}
              onClick={() => router.push(`/admin/campaigns/${campaign.id}`)}
              style={{ 
                display: 'grid', 
                gridTemplateColumns: '40px 2fr 100px 100px 100px 100px 80px 80px 60px',
                gap: '16px',
                padding: '16px 20px',
                borderBottom: index < campaigns.length - 1 ? '1px solid #E8E4DF' : 'none',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5F3F0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              {/* Checkbox */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleSelectOne(campaign.id)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
              >
                {selectedIds.has(campaign.id) ? (
                  <CheckSquare style={{ width: '18px', height: '18px', color: '#B8956B' }} />
                ) : (
                  <Square style={{ width: '18px', height: '18px', color: '#D4CFC8' }} />
                )}
              </button>
              
              {/* Campaign Name & Event */}
              <div style={{ minWidth: 0 }}>
                <p style={{ 
                  fontSize: '14px', 
                  fontWeight: 500, 
                  color: '#2C2C2C', 
                  marginBottom: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {campaign.name}
                </p>
                <p style={{ 
                  fontSize: '12px', 
                  color: '#9A9A9A',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {campaign.event.name}
                </p>
              </div>
              
              {/* Status */}
              <StatusBadge status={campaign.status} />
              
              {/* Type */}
              <TypeBadge type={campaign.type} />
              
              {/* Recipients */}
              <span style={{ fontSize: '14px', color: '#2C2C2C' }}>
                {campaign.recipientCount.toLocaleString()}
              </span>
              
              {/* Sent Date */}
              <span style={{ fontSize: '13px', color: '#6B6B6B' }}>
                {formatDate(campaign.sentAt)}
              </span>
              
              {/* Open Rate */}
              <span style={{ fontSize: '14px', color: campaign.openedCount > 0 ? '#5C8A6B' : '#9A9A9A' }}>
                {formatPercent(campaign.openedCount, campaign.sentCount)}
              </span>
              
              {/* Click Rate */}
              <span style={{ fontSize: '14px', color: campaign.clickedCount > 0 ? '#5C7A8A' : '#9A9A9A' }}>
                {formatPercent(campaign.clickedCount, campaign.sentCount)}
              </span>
              
              {/* Actions */}
              <RowActionsDropdown
                campaign={campaign}
                onDuplicate={() => handleDuplicate(campaign.id)}
                onDelete={() => handleDelete(campaign.id)}
                onPause={() => handlePause(campaign.id)}
                onResume={() => handleResume(campaign.id)}
              />
            </div>
          ))
        )}
        
        {/* Pagination */}
        {campaigns.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={totalItems}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
          />
        )}
      </div>
    </div>
  )
}
