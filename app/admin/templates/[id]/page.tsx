"use client"

/**
 * @fileoverview Admin Template Edit Page - Edit email template with visual builder
 * 
 * Provides a full-page template editor with:
 * - Template metadata editing (name, description, category, subject)
 * - Visual email builder integration
 * - Save and preview functionality
 * - Set as default option
 * 
 * @module app/admin/templates/[id]/page
 * @requires react
 * @requires next/navigation
 * 
 * Requirements: 10 (Email Template Library)
 */

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { 
  ArrowLeft, 
  Save, 
  Eye, 
  Star, 
  AlertCircle,
  Loader2,
} from "lucide-react"
import { ORAAccentLine } from "@/components/ui/ora-brand"
import { Skeleton } from "@/components/ui/skeleton"
import { 
  useEmailTemplate, 
  useUpdateEmailTemplate,
} from "@/hooks/use-email-templates"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { TemplateCategory } from "@/db/schema"
import type { EmailBuilderState } from "@/lib/types/email-builder"

// ============================================================================
// TYPES
// ============================================================================

interface TemplateFormData {
  name: string
  description: string
  category: TemplateCategory
  subject: string
  isDefault: boolean
}

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
// CONSTANTS
// ============================================================================

const categoryOptions: { value: TemplateCategory; label: string }[] = [
  { value: 'Invitation', label: 'Invitation' },
  { value: 'Reminder', label: 'Reminder' },
  { value: 'LastChance', label: 'Last Chance' },
  { value: 'EventDay', label: 'Event Day' },
  { value: 'ThankYou', label: 'Thank You' },
  { value: 'Feedback', label: 'Feedback' },
  { value: 'Custom', label: 'Custom' },
]

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Form field component
 */
function FormField({
  label,
  required = false,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '13px', fontWeight: 500, color: '#2C2C2C' }}>
        {label}
        {required && <span style={{ color: '#B85C5C', marginLeft: '4px' }}>*</span>}
      </label>
      {children}
    </div>
  )
}

/**
 * Loading skeleton for the template editor
 */
function TemplateEditorSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Skeleton className="h-10 w-10 rounded-full" />
        <div>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      
      {/* Form skeleton */}
      <div style={{ 
        backgroundColor: '#FFFFFF', 
        border: '1px solid transparent', 
        
        padding: '24px',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div>
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
      
      {/* Builder placeholder skeleton */}
      <div style={{ 
        backgroundColor: '#FFFFFF', 
        border: '1px solid transparent', 
        
        height: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Skeleton className="h-8 w-48" />
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Admin Template Edit Page
 * 
 * Provides a full-page template editor with metadata editing and visual builder.
 * Follows the ORA design system for consistent styling.
 * 
 * Requirements: 10 (Email Template Library)
 */
export default function AdminTemplateEditPage() {
  const router = useRouter()
  const params = useParams()
  const templateId = params.id as string
  const isNewTemplate = templateId === 'new'
  
  // Form state
  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    description: '',
    category: 'Custom',
    subject: '',
    isDefault: false,
  })
  const [designJson, setDesignJson] = useState<EmailBuilderState | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  
  // Fetch template data (only for editing existing templates)
  const { 
    data: template, 
    isLoading, 
    error,
  } = useEmailTemplate(isNewTemplate ? undefined : templateId)
  
  // Mutations
  const { mutateAsync: updateTemplate, isPending: isUpdating } = useUpdateEmailTemplate()
  const { mutateAsync: setDefault, isPending: isSettingDefault } = useSetTemplateAsDefault()
  
  // Initialize form data when template loads
  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description || '',
        category: template.category,
        subject: template.subject,
        isDefault: template.isDefault,
      })
      setDesignJson(template.designJson as EmailBuilderState)
    }
  }, [template])
  
  // Handle form changes
  const handleFormChange = useCallback((field: keyof TemplateFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }, [])
  
  // Handle save
  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) {
      toast.error("Template name is required")
      return
    }
    if (!formData.subject.trim()) {
      toast.error("Subject line is required")
      return
    }
    
    try {
      await updateTemplate({
        id: templateId,
        name: formData.name,
        description: formData.description || undefined,
        category: formData.category,
        subject: formData.subject,
        designJson: designJson || undefined,
      })
      setHasChanges(false)
    } catch (error) {
      // Error is handled by the mutation
    }
  }, [templateId, formData, designJson, updateTemplate])
  
  // Handle set as default
  const handleSetDefault = useCallback(async () => {
    await setDefault(templateId)
    setFormData(prev => ({ ...prev, isDefault: true }))
  }, [templateId, setDefault])
  
  // Handle back navigation
  const handleBack = useCallback(() => {
    if (hasChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to leave?'
      )
      if (!confirmed) return
    }
    router.push('/admin/templates')
  }, [router, hasChanges])
  
  // Loading state
  if (isLoading && !isNewTemplate) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <TemplateEditorSkeleton />
      </div>
    )
  }
  
  // Error state
  if (error && !isNewTemplate) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={handleBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              border: '1px solid #E8E4DF',
              borderRadius: '9999px',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = '#D4CFC8'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E8E4DF'}
          >
            <ArrowLeft style={{ width: '18px', height: '18px', color: '#6B6B6B' }} />
          </button>
          <div>
            <ORAAccentLine className="mb-2" />
            <h1 style={{ fontSize: '24px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C' }}>
              Edit Template
            </h1>
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
            Template Not Found
          </h2>
          <p style={{ color: '#6B6B6B', marginBottom: '20px' }}>
            {error instanceof Error ? error.message : 'Failed to load template'}
          </p>
          <button
            onClick={handleBack}
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
            Back to Templates
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={handleBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              border: '1px solid #E8E4DF',
              borderRadius: '9999px',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = '#D4CFC8'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E8E4DF'}
          >
            <ArrowLeft style={{ width: '18px', height: '18px', color: '#6B6B6B' }} />
          </button>
          <div>
            <ORAAccentLine className="mb-2" />
            <h1 style={{ fontSize: '24px', fontWeight: 300, letterSpacing: '0.02em', color: '#2C2C2C' }}>
              {isNewTemplate ? 'Create Template' : 'Edit Template'}
            </h1>
          </div>
        </div>
        
        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!isNewTemplate && !formData.isDefault && (
            <button
              onClick={handleSetDefault}
              disabled={isSettingDefault}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                backgroundColor: 'transparent',
                color: '#C4A35A',
                border: '1px solid #C4A35A',
                borderRadius: '9999px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: isSettingDefault ? 'not-allowed' : 'pointer',
                opacity: isSettingDefault ? 0.6 : 1,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isSettingDefault) {
                  e.currentTarget.style.backgroundColor = 'rgba(196, 163, 90, 0.1)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              {isSettingDefault ? (
                <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
              ) : (
                <Star style={{ width: '16px', height: '16px' }} />
              )}
              Set as Default
            </button>
          )}
          
          {formData.isDefault && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                backgroundColor: 'rgba(196, 163, 90, 0.15)',
                color: '#C4A35A',
                borderRadius: '9999px',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <Star style={{ width: '14px', height: '14px', fill: 'currentColor' }} />
              Default Template
            </span>
          )}
          
          <button
            onClick={handleSave}
            disabled={isUpdating || !hasChanges}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
              backgroundColor: hasChanges ? '#2C2C2C' : '#9A9A9A',
              color: '#FAFAFA',
              border: 'none',
              borderRadius: '9999px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: isUpdating || !hasChanges ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (hasChanges && !isUpdating) {
                e.currentTarget.style.backgroundColor = '#4A4A4A'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = hasChanges ? '#2C2C2C' : '#9A9A9A'
            }}
          >
            {isUpdating ? (
              <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
            ) : (
              <Save style={{ width: '16px', height: '16px' }} />
            )}
            Save Changes
          </button>
        </div>
      </div>
      
      {/* Template Metadata Form */}
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
        <h2 style={{ fontSize: '16px', fontWeight: 500, color: '#2C2C2C', marginBottom: '20px' }}>
          Template Details
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Name */}
          <FormField label="Template Name" required>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              placeholder="Enter template name"
              style={{
                padding: '10px 14px',
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
          </FormField>
          
          {/* Category */}
          <FormField label="Category" required>
            <select
              value={formData.category}
              onChange={(e) => handleFormChange('category', e.target.value as TemplateCategory)}
              style={{
                padding: '10px 14px',
                border: '1px solid #E8E4DF',
                
                fontSize: '14px',
                color: '#2C2C2C',
                backgroundColor: '#FAFAFA',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
          
          {/* Subject */}
          <div style={{ gridColumn: 'span 2' }}>
            <FormField label="Subject Line" required>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => handleFormChange('subject', e.target.value)}
                placeholder="Enter email subject line"
                style={{
                  padding: '10px 14px',
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
            </FormField>
          </div>
          
          {/* Description */}
          <div style={{ gridColumn: 'span 2' }}>
            <FormField label="Description">
              <textarea
                value={formData.description}
                onChange={(e) => handleFormChange('description', e.target.value)}
                placeholder="Enter template description (optional)"
                rows={3}
                style={{
                  padding: '10px 14px',
                  border: '1px solid #E8E4DF',
                  
                  fontSize: '14px',
                  color: '#2C2C2C',
                  backgroundColor: '#FAFAFA',
                  outline: 'none',
                  resize: 'vertical',
                  transition: 'border-color 0.2s ease',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#B8956B'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#E8E4DF'}
              />
            </FormField>
          </div>
        </div>
      </div>
      
      {/* Email Builder Placeholder */}
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
        <h2 style={{ fontSize: '16px', fontWeight: 500, color: '#2C2C2C', marginBottom: '20px' }}>
          Email Design
        </h2>
        
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '64px 24px',
            backgroundColor: '#F5F3F0',
            border: '1px dashed #D4CFC8',
            
          }}
        >
          <Eye style={{ width: '48px', height: '48px', color: '#9A9A9A', marginBottom: '16px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 400, color: '#6B6B6B', marginBottom: '8px' }}>
            Email Builder
          </h3>
          <p style={{ fontSize: '14px', color: '#9A9A9A', textAlign: 'center', maxWidth: '400px' }}>
            The visual email builder will be integrated here. 
            For now, you can edit the template metadata above.
          </p>
        </div>
      </div>
    </div>
  )
}
