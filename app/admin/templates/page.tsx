"use client"

/**
 * @fileoverview Admin Templates Page - Email template library management
 * 
 * Provides a comprehensive template library with:
 * - Grid view of templates with thumbnails
 * - Category filter
 * - Search functionality
 * - CRUD actions (create, edit, duplicate, delete)
 * - Set as default functionality
 * 
 * @module app/admin/templates/page
 * @requires react
 * @requires next/navigation
 * 
 * Requirements: 10 (Email Template Library)
 */

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { FileText, AlertCircle, Plus } from "lucide-react"
import { ORAAccentLine } from "@/components/ui/ora-brand"
import { TemplateLibrary, TemplateLibrarySkeleton } from "@/components/admin/template-library"
import { 
  useEmailTemplates, 
  useDeleteEmailTemplate, 
  useDuplicateEmailTemplate,
} from "@/hooks/use-email-templates"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { TemplateCategory } from "@/db/schema"

// ============================================================================
// SET DEFAULT MUTATION
// ============================================================================

async function setTemplateAsDefault(id: string): Promise<void> {
  const response = await fetch(`/api/admin/email-templates/${id}/set-default`, {
    method: 'POST',
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to set template as default")
  }
}

function useSetTemplateAsDefault() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: setTemplateAsDefault,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] })
      toast.success("Template set as default")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to set template as default")
    },
  })
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Admin Templates Page
 * 
 * Displays a grid of email templates with filtering, search, and CRUD actions.
 * Follows the ORA design system for consistent styling.
 * 
 * Requirements: 10 (Email Template Library)
 */
export default function AdminTemplatesPage() {
  const router = useRouter()
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | ''>('')
  
  // Fetch templates with filters
  const { 
    data: templatesData, 
    isLoading, 
    error,
    refetch 
  } = useEmailTemplates({
    category: categoryFilter || undefined,
    search: searchQuery || undefined,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    limit: 100,
  })
  
  // Mutations
  const { mutateAsync: deleteTemplate, isPending: isDeleting } = useDeleteEmailTemplate()
  const { mutateAsync: duplicateTemplate, isPending: isDuplicating } = useDuplicateEmailTemplate()
  const { mutateAsync: setDefault, isPending: isSettingDefault } = useSetTemplateAsDefault()
  
  // Handlers
  const handleEdit = useCallback((id: string) => {
    router.push(`/admin/templates/${id}`)
  }, [router])
  
  const handleCreate = useCallback(() => {
    router.push('/admin/templates/new')
  }, [router])
  
  const handleDuplicate = useCallback(async (id: string) => {
    await duplicateTemplate(id)
  }, [duplicateTemplate])
  
  const handleDelete = useCallback(async (id: string) => {
    await deleteTemplate(id)
  }, [deleteTemplate])
  
  const handleSetDefault = useCallback(async (id: string) => {
    await setDefault(id)
  }, [setDefault])
  
  // Loading state
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <ORAAccentLine className="mb-4" />
            <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C', marginBottom: '8px' }}>
              Email Templates
            </h1>
            <p style={{ color: '#6B6B6B', fontSize: '14px' }}>
              Manage reusable email templates for campaigns
            </p>
          </div>
        </div>
        
        <TemplateLibrarySkeleton />
      </div>
    )
  }
  
  // Error state
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <ORAAccentLine className="mb-4" />
            <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C', marginBottom: '8px' }}>
              Email Templates
            </h1>
            <p style={{ color: '#6B6B6B', fontSize: '14px' }}>
              Manage reusable email templates for campaigns
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
            Error Loading Templates
          </h2>
          <p style={{ color: '#6B6B6B', marginBottom: '20px' }}>
            {error instanceof Error ? error.message : 'Failed to load templates'}
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
  
  const templates = templatesData?.templates || []
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <ORAAccentLine className="mb-4" />
          <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C', marginBottom: '8px' }}>
            Email Templates
          </h1>
          <p style={{ color: '#6B6B6B', fontSize: '14px' }}>
            Manage reusable email templates for campaigns
          </p>
        </div>
      </div>
      
      {/* Template Library */}
      <TemplateLibrary
        templates={templates}
        isLoading={isLoading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onSetDefault={handleSetDefault}
        onCreate={handleCreate}
        isDuplicating={isDuplicating}
        isDeleting={isDeleting}
      />
    </div>
  )
}
