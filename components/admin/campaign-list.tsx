"use client"

/**
 * @fileoverview Campaign List Component - Reusable DataTable for admin campaign management
 * 
 * Provides a comprehensive campaign list with:
 * - DataTable with columns: name, status, type, recipients, sent date, open rate, click rate
 * - Filtering by status, type, date range, event
 * - Sorting by all columns
 * - Bulk actions: delete, duplicate, export
 * - Pagination with configurable page sizes
 * 
 * @module components/admin/campaign-list
 * @requires react
 * @requires next/navigation
 * @requires lucide-react
 * 
 * Requirements: 3 (Campaign List and Management)
 */

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Mail,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Copy,
  Trash2,
  Download,
  Eye,
  Pause,
  Play,
  X,
  Calendar,
  ArrowUpDown,
  CheckSquare,
  Square,
  Plus,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { CampaignStatus, CampaignType } from "@/db/schema"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Campaign with event relation for display
 */
export interface CampaignWithEvent {
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
 * Filter state for the campaign list
 */
export interface CampaignFilters {
  search: string
  status: string
  type: string
  eventId: string
  dateFrom: Date | null
  dateTo: Date | null
}

/**
 * Sort configuration
 */
export interface SortConfig {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

/**
 * Pagination configuration
 */
export interface PaginationConfig {
  currentPage: number
  pageSize: number
  totalPages: number
  totalItems: number
}

/**
 * Props for the CampaignList component
 */
export interface CampaignListProps {
  campaigns: CampaignWithEvent[]
  isLoading?: boolean
  filters: CampaignFilters
  onFiltersChange: (filters: CampaignFilters) => void
  sortConfig: SortConfig
  onSortChange: (sortBy: string) => void
  pagination: PaginationConfig
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onDelete: (ids: string[]) => Promise<void>
  onDuplicate: (id: string) => Promise<void>
  onPause: (id: string) => Promise<void>
  onResume: (id: string) => Promise<void>
  onExport?: (ids: string[]) => Promise<void>
  isDeleting?: boolean
  isDuplicating?: boolean
  events?: { id: string; name: string }[]
}

// ============================================================================
// CONSTANTS
// ============================================================================

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
 * Status options for filter dropdown
 */
const statusOptions = [
  { value: 'Draft', label: 'Draft' },
  { value: 'Scheduled', label: 'Scheduled' },
  { value: 'Queued', label: 'Queued' },
  { value: 'Sending', label: 'Sending' },
  { value: 'Sent', label: 'Sent' },
  { value: 'Paused', label: 'Paused' },
  { value: 'Cancelled', label: 'Cancelled' },
]

/**
 * Type options for filter dropdown
 */
const typeOptions = [
  { value: 'Invitation', label: 'Invitation' },
  { value: 'Reminder', label: 'Reminder' },
  { value: 'LastChance', label: 'Last Chance' },
  { value: 'EventDayInfo', label: 'Event Day' },
  { value: 'ThankYou', label: 'Thank You' },
  { value: 'Feedback', label: 'Feedback' },
]

/**
 * Page size options
 */
const pageSizes = [25, 50, 100]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

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
          borderRadius: '8px',
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
              borderRadius: '8px',
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
 * Date range filter component
 */
function DateRangeFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: {
  dateFrom: Date | null
  dateTo: Date | null
  onDateFromChange: (date: Date | null) => void
  onDateToChange: (date: Date | null) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const hasDateFilter = dateFrom || dateTo
  
  const formatDateInput = (date: Date | null): string => {
    if (!date) return ''
    return date.toISOString().split('T')[0]
  }
  
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
          borderRadius: '8px',
          backgroundColor: hasDateFilter ? '#F5F3F0' : 'transparent',
          fontSize: '14px',
          color: '#2C2C2C',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#D4CFC8'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E8E4DF'}
      >
        <Calendar style={{ width: '16px', height: '16px', color: '#6B6B6B' }} />
        <span>{hasDateFilter ? 'Date Range' : 'Date Range'}</span>
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
              padding: '16px',
              backgroundColor: '#FAFAFA',
              border: '1px solid #E8E4DF',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              zIndex: 50,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>
                  From
                </label>
                <input
                  type="date"
                  value={formatDateInput(dateFrom)}
                  onChange={(e) => onDateFromChange(e.target.value ? new Date(e.target.value) : null)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #E8E4DF',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#2C2C2C',
                    backgroundColor: '#FAFAFA',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>
                  To
                </label>
                <input
                  type="date"
                  value={formatDateInput(dateTo)}
                  onChange={(e) => onDateToChange(e.target.value ? new Date(e.target.value) : null)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #E8E4DF',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#2C2C2C',
                    backgroundColor: '#FAFAFA',
                  }}
                />
              </div>
              {hasDateFilter && (
                <button
                  onClick={() => {
                    onDateFromChange(null)
                    onDateToChange(null)
                  }}
                  style={{
                    padding: '8px 12px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: 'transparent',
                    fontSize: '13px',
                    color: '#B85C5C',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  Clear dates
                </button>
              )}
            </div>
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
              borderRadius: '8px',
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
          Page {currentPage} of {totalPages || 1}
        </span>
        
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          style={{
            padding: '8px 14px',
            border: '1px solid #E8E4DF',
            borderRadius: '6px',
            backgroundColor: currentPage >= totalPages ? '#F5F3F0' : '#FAFAFA',
            fontSize: '13px',
            color: currentPage >= totalPages ? '#9A9A9A' : '#2C2C2C',
            cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
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
 * Loading skeleton for the campaigns table
 */
export function CampaignListSkeleton() {
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
        backgroundColor: '#FAFAFA', 
        border: '1px solid #E8E4DF', 
        borderRadius: '12px',
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Campaign List Component
 * 
 * A comprehensive DataTable for managing email campaigns with:
 * - Filtering by status, type, date range, and event
 * - Sorting by all columns
 * - Bulk actions (delete, duplicate, export)
 * - Pagination with configurable page sizes
 * - Row selection for bulk operations
 * 
 * @param props - Component props
 * @returns Campaign list component
 * 
 * Requirements: 3 (Campaign List and Management)
 */
export function CampaignList({
  campaigns,
  isLoading = false,
  filters,
  onFiltersChange,
  sortConfig,
  onSortChange,
  pagination,
  onPageChange,
  onPageSizeChange,
  onDelete,
  onDuplicate,
  onPause,
  onResume,
  onExport,
  isDeleting = false,
  isDuplicating = false,
  events = [],
}: CampaignListProps) {
  const router = useRouter()
  
  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  
  // Handle selection
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === campaigns.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(campaigns.map(c => c.id)))
    }
  }, [campaigns, selectedIds.size])
  
  const handleSelectOne = useCallback((id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }, [selectedIds])
  
  // Handle bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    
    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedIds.size} campaign(s)? This action cannot be undone.`
    )
    
    if (confirmed) {
      await onDelete(Array.from(selectedIds))
      setSelectedIds(new Set())
    }
  }, [selectedIds, onDelete])
  
  // Handle bulk export
  const handleBulkExport = useCallback(async () => {
    if (selectedIds.size === 0 || !onExport) return
    await onExport(Array.from(selectedIds))
  }, [selectedIds, onExport])
  
  // Handle single actions
  const handleSingleDelete = useCallback(async (id: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this campaign? This action cannot be undone.'
    )
    
    if (confirmed) {
      await onDelete([id])
    }
  }, [onDelete])
  
  // Clear filters
  const clearFilters = useCallback(() => {
    onFiltersChange({
      search: '',
      status: '',
      type: '',
      eventId: '',
      dateFrom: null,
      dateTo: null,
    })
  }, [onFiltersChange])
  
  const hasActiveFilters = filters.search || filters.status || filters.type || filters.eventId || filters.dateFrom || filters.dateTo
  
  // Event options for filter
  const eventOptions = events.map(e => ({ value: e.id, label: e.name }))
  
  if (isLoading) {
    return <CampaignListSkeleton />
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 14px 10px 42px',
              border: '1px solid #E8E4DF',
              borderRadius: '8px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <FilterDropdown
            label="Status"
            options={statusOptions}
            value={filters.status}
            onChange={(value) => onFiltersChange({ ...filters, status: value })}
            icon={Filter}
          />
          
          <FilterDropdown
            label="Type"
            options={typeOptions}
            value={filters.type}
            onChange={(value) => onFiltersChange({ ...filters, type: value })}
            icon={Mail}
          />
          
          {eventOptions.length > 0 && (
            <FilterDropdown
              label="Event"
              options={eventOptions}
              value={filters.eventId}
              onChange={(value) => onFiltersChange({ ...filters, eventId: value })}
            />
          )}
          
          <DateRangeFilter
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            onDateFromChange={(date) => onFiltersChange({ ...filters, dateFrom: date })}
            onDateToChange={(date) => onFiltersChange({ ...filters, dateTo: date })}
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
                borderRadius: '8px',
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
          borderRadius: '8px',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#2C2C2C' }}>
            {selectedIds.size} campaign{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {onExport && (
              <button
                onClick={handleBulkExport}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  border: '1px solid #E8E4DF',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  fontSize: '13px',
                  color: '#2C2C2C',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5F3F0'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Download style={{ width: '14px', height: '14px', color: '#6B6B6B' }} />
                Export
              </button>
            )}
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
        backgroundColor: '#FAFAFA', 
        border: '1px solid #E8E4DF', 
        borderRadius: '12px',
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
          <SortableHeader 
            label="Campaign" 
            sortKey="name" 
            currentSort={sortConfig.sortBy} 
            currentOrder={sortConfig.sortOrder} 
            onSort={onSortChange} 
          />
          <SortableHeader 
            label="Status" 
            sortKey="status" 
            currentSort={sortConfig.sortBy} 
            currentOrder={sortConfig.sortOrder} 
            onSort={onSortChange} 
          />
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Type
          </span>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Recipients
          </span>
          <SortableHeader 
            label="Sent" 
            sortKey="sentAt" 
            currentSort={sortConfig.sortBy} 
            currentOrder={sortConfig.sortOrder} 
            onSort={onSortChange} 
          />
          <SortableHeader 
            label="Opens" 
            sortKey="openedCount" 
            currentSort={sortConfig.sortBy} 
            currentOrder={sortConfig.sortOrder} 
            onSort={onSortChange} 
          />
          <SortableHeader 
            label="Clicks" 
            sortKey="clickedCount" 
            currentSort={sortConfig.sortBy} 
            currentOrder={sortConfig.sortOrder} 
            onSort={onSortChange} 
          />
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
                onDuplicate={() => onDuplicate(campaign.id)}
                onDelete={() => handleSingleDelete(campaign.id)}
                onPause={() => onPause(campaign.id)}
                onResume={() => onResume(campaign.id)}
              />
            </div>
          ))
        )}
        
        {/* Pagination */}
        {campaigns.length > 0 && (
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        )}
      </div>
    </div>
  )
}

export default CampaignList
