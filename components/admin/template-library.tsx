"use client"

/**
 * @fileoverview Template Library Component - Grid view for email templates
 * 
 * Provides a comprehensive template library with:
 * - Grid view of templates with thumbnails
 * - Category filter
 * - Search functionality
 * - CRUD actions (create, edit, duplicate, delete)
 * - Set as default functionality
 * 
 * @module components/admin/template-library
 * @requires react
 * @requires next/navigation
 * @requires lucide-react
 * 
 * Requirements: 10 (Email Template Library)
 */

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  FileText,
  Search,
  Filter,
  ChevronDown,
  MoreHorizontal,
  Copy,
  Trash2,
  Edit,
  Star,
  Plus,
  Grid,
  List,
  Mail,
  AlertCircle,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { EmailTemplate, TemplateCategory } from "@/db/schema"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the TemplateLibrary component
 */
export interface TemplateLibraryProps {
  templates: EmailTemplate[]
  isLoading?: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
  categoryFilter: TemplateCategory | ''
  onCategoryChange: (category: TemplateCategory | '') => void
  onEdit: (id: string) => void
  onDuplicate: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onSetDefault: (id: string) => Promise<void>
  onCreate: () => void
  isDuplicating?: boolean
  isDeleting?: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Category badge colors following ORA design system
 */
const categoryStyles: Record<TemplateCategory, { bg: string; text: string }> = {
  Invitation: { bg: 'rgba(92, 122, 138, 0.1)', text: '#5C7A8A' },
  Reminder: { bg: 'rgba(184, 149, 107, 0.1)', text: '#B8956B' },
  LastChance: { bg: 'rgba(196, 163, 90, 0.1)', text: '#C4A35A' },
  EventDay: { bg: 'rgba(92, 138, 107, 0.1)', text: '#5C8A6B' },
  ThankYou: { bg: 'rgba(138, 92, 138, 0.1)', text: '#8A5C8A' },
  Feedback: { bg: 'rgba(107, 107, 107, 0.1)', text: '#6B6B6B' },
  Custom: { bg: 'rgba(44, 44, 44, 0.1)', text: '#2C2C2C' },
}

/**
 * Category options for filter dropdown
 */
const categoryOptions: { value: TemplateCategory | ''; label: string }[] = [
  { value: '', label: 'All Categories' },
  { value: 'Invitation', label: 'Invitation' },
  { value: 'Reminder', label: 'Reminder' },
  { value: 'LastChance', label: 'Last Chance' },
  { value: 'EventDay', label: 'Event Day' },
  { value: 'ThankYou', label: 'Thank You' },
  { value: 'Feedback', label: 'Feedback' },
  { value: 'Custom', label: 'Custom' },
]

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

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Category Badge Component
 */
function CategoryBadge({ category }: { category: TemplateCategory }) {
  const style = categoryStyles[category] || categoryStyles.Custom
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
      {category === 'LastChance' ? 'Last Chance' : category === 'EventDay' ? 'Event Day' : category === 'ThankYou' ? 'Thank You' : category}
    </span>
  )
}

/**
 * Default Badge Component
 */
function DefaultBadge() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        fontSize: '10px',
        fontWeight: 600,
        borderRadius: '4px',
        backgroundColor: 'rgba(196, 163, 90, 0.15)',
        color: '#C4A35A',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      <Star style={{ width: '10px', height: '10px', fill: 'currentColor' }} />
      Default
    </span>
  )
}

/**
 * Filter dropdown component
 */
function CategoryFilterDropdown({
  value,
  onChange,
}: {
  value: TemplateCategory | ''
  onChange: (value: TemplateCategory | '') => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  
  const selectedLabel = categoryOptions.find(o => o.value === value)?.label || 'All Categories'
  
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
        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#D4CFC8'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E8E4DF'}
      >
        <Filter style={{ width: '16px', height: '16px', color: '#6B6B6B' }} />
        <span>{selectedLabel}</span>
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
            {categoryOptions.map((option) => (
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
                  color: option.value === '' ? '#6B6B6B' : '#2C2C2C',
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
 * Template card actions dropdown
 */
function TemplateCardActions({
  template,
  onEdit,
  onDuplicate,
  onDelete,
  onSetDefault,
}: {
  template: EmailTemplate
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSetDefault: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  
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
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#FAFAFA'
          e.currentTarget.style.borderColor = '#E8E4DF'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)'
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
                onEdit()
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
              <Edit style={{ width: '14px', height: '14px', color: '#6B6B6B' }} />
              Edit Template
            </button>
            
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
            
            {!template.isDefault && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSetDefault()
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
                <Star style={{ width: '14px', height: '14px' }} />
                Set as Default
              </button>
            )}
            
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
          </div>
        </>
      )}
    </div>
  )
}


/**
 * Template Card Component
 */
function TemplateCard({
  template,
  onEdit,
  onDuplicate,
  onDelete,
  onSetDefault,
}: {
  template: EmailTemplate
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSetDefault: () => void
}) {
  return (
    <div
      onClick={onEdit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#FAFAFA',
        border: '1px solid #E8E4DF',
        borderRadius: '12px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#D4CFC8'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#E8E4DF'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Thumbnail / Preview */}
      <div
        style={{
          position: 'relative',
          height: '160px',
          backgroundColor: '#F5F3F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #E8E4DF',
        }}
      >
        {template.thumbnailUrl ? (
          <img
            src={template.thumbnailUrl}
            alt={template.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              color: '#9A9A9A',
            }}
          >
            <Mail style={{ width: '32px', height: '32px' }} />
            <span style={{ fontSize: '12px' }}>No preview</span>
          </div>
        )}
        
        {/* Actions button */}
        <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
          <TemplateCardActions
            template={template}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onSetDefault={onSetDefault}
          />
        </div>
        
        {/* Default badge */}
        {template.isDefault && (
          <div style={{ position: 'absolute', top: '8px', left: '8px' }}>
            <DefaultBadge />
          </div>
        )}
      </div>
      
      {/* Content */}
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
          <h3
            style={{
              fontSize: '15px',
              fontWeight: 500,
              color: '#2C2C2C',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {template.name}
          </h3>
        </div>
        
        <p
          style={{
            fontSize: '13px',
            color: '#6B6B6B',
            margin: '0 0 12px 0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {template.subject}
        </p>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <CategoryBadge category={template.category} />
          <span style={{ fontSize: '11px', color: '#9A9A9A' }}>
            {formatDate(template.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Loading skeleton for the template grid
 */
export function TemplateLibrarySkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Skeleton className="h-10 w-64" />
        <div style={{ display: 'flex', gap: '12px' }}>
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>
      
      {/* Grid skeleton */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px',
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            style={{
              backgroundColor: '#FAFAFA',
              border: '1px solid #E8E4DF',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            <Skeleton className="h-40 w-full rounded-none" />
            <div style={{ padding: '16px' }}>
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-full mb-3" />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Empty state component
 */
function EmptyState({ 
  hasFilters, 
  onClearFilters,
  onCreate,
}: { 
  hasFilters: boolean
  onClearFilters: () => void
  onCreate: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px',
        backgroundColor: '#FAFAFA',
        border: '1px solid #E8E4DF',
        borderRadius: '12px',
      }}
    >
      <FileText style={{ width: '48px', height: '48px', color: '#9A9A9A', marginBottom: '16px' }} />
      <h2 style={{ fontSize: '18px', fontWeight: 300, color: '#2C2C2C', marginBottom: '8px' }}>
        {hasFilters ? 'No templates found' : 'No templates yet'}
      </h2>
      <p style={{ color: '#6B6B6B', marginBottom: '20px', textAlign: 'center' }}>
        {hasFilters 
          ? 'Try adjusting your search or filters'
          : 'Create your first email template to get started'
        }
      </p>
      {hasFilters ? (
        <button
          onClick={onClearFilters}
          style={{
            padding: '10px 20px',
            backgroundColor: 'transparent',
            color: '#2C2C2C',
            border: '1px solid #E8E4DF',
            borderRadius: '9999px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#D4CFC8'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E8E4DF'}
        >
          Clear Filters
        </button>
      ) : (
        <button
          onClick={onCreate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
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
          <Plus style={{ width: '16px', height: '16px' }} />
          Create Template
        </button>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Template Library Component
 * 
 * A grid view for managing email templates with:
 * - Category filtering
 * - Search functionality
 * - CRUD actions
 * - Set as default functionality
 * 
 * @param props - Component props
 * @returns Template library component
 * 
 * Requirements: 10 (Email Template Library)
 */
export function TemplateLibrary({
  templates,
  isLoading = false,
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  onEdit,
  onDuplicate,
  onDelete,
  onSetDefault,
  onCreate,
  isDuplicating = false,
  isDeleting = false,
}: TemplateLibraryProps) {
  const hasFilters = searchQuery !== '' || categoryFilter !== ''
  
  const handleClearFilters = useCallback(() => {
    onSearchChange('')
    onCategoryChange('')
  }, [onSearchChange, onCategoryChange])
  
  const handleDelete = useCallback(async (id: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this template? This action cannot be undone.'
    )
    if (confirmed) {
      await onDelete(id)
    }
  }, [onDelete])
  
  if (isLoading) {
    return <TemplateLibrarySkeleton />
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Filters and Search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '240px', maxWidth: '400px' }}>
          <Search
            style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '16px',
              height: '16px',
              color: '#9A9A9A',
            }}
          />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 42px',
              border: '1px solid #E8E4DF',
              borderRadius: '8px',
              fontSize: '14px',
              color: '#2C2C2C',
              backgroundColor: 'transparent',
              outline: 'none',
              transition: 'border-color 0.2s ease',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#B8956B'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#E8E4DF'}
          />
        </div>
        
        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <CategoryFilterDropdown
            value={categoryFilter}
            onChange={onCategoryChange}
          />
          
          <button
            onClick={onCreate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
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
            <Plus style={{ width: '16px', height: '16px' }} />
            New Template
          </button>
        </div>
      </div>
      
      {/* Template Grid or Empty State */}
      {templates.length === 0 ? (
        <EmptyState 
          hasFilters={hasFilters} 
          onClearFilters={handleClearFilters}
          onCreate={onCreate}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px',
          }}
        >
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => onEdit(template.id)}
              onDuplicate={() => onDuplicate(template.id)}
              onDelete={() => handleDelete(template.id)}
              onSetDefault={() => onSetDefault(template.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default TemplateLibrary
