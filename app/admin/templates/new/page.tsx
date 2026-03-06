"use client"

/**
 * @fileoverview Admin New Template Page - Create new email template
 * 
 * Provides a full-page template creator with:
 * - Template metadata editing (name, description, category, subject)
 * - Visual email builder integration
 * - Save functionality
 * 
 * @module app/admin/templates/new/page
 * @requires react
 * @requires next/navigation
 * 
 * Requirements: 10 (Email Template Library)
 */

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { 
  ArrowLeft, 
  Save, 
  Eye,
  Loader2,
} from "lucide-react"
import { ORAAccentLine } from "@/components/ui/ora-brand"
import { useCreateEmailTemplate } from "@/hooks/use-email-templates"
import { createInitialState } from "@/lib/types/email-builder"
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Admin New Template Page
 * 
 * Provides a full-page template creator with metadata editing and visual builder.
 * Follows the ORA design system for consistent styling.
 * 
 * Requirements: 10 (Email Template Library)
 */
export default function AdminNewTemplatePage() {
  const router = useRouter()
  
  // Form state
  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    description: '',
    category: 'Custom',
    subject: '',
  })
  const [designJson] = useState<EmailBuilderState>(createInitialState())
  
  // Mutations
  const { mutateAsync: createTemplate, isPending: isCreating } = useCreateEmailTemplate()
  
  // Handle form changes
  const handleFormChange = useCallback((field: keyof TemplateFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }, [])
  
  // Handle save
  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) {
      return
    }
    if (!formData.subject.trim()) {
      return
    }
    
    try {
      const template = await createTemplate({
        name: formData.name,
        description: formData.description || undefined,
        category: formData.category,
        subject: formData.subject,
        designJson: designJson,
      })
      router.push(`/admin/templates/${template.id}`)
    } catch (error) {
      // Error is handled by the mutation
    }
  }, [formData, designJson, createTemplate, router])
  
  // Handle back navigation
  const handleBack = useCallback(() => {
    const hasContent = formData.name || formData.subject || formData.description
    if (hasContent) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to leave?'
      )
      if (!confirmed) return
    }
    router.push('/admin/templates')
  }, [router, formData])
  
  const canSave = formData.name.trim() && formData.subject.trim()
  
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
              Create Template
            </h1>
          </div>
        </div>
        
        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleSave}
            disabled={isCreating || !canSave}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
              backgroundColor: canSave ? '#2C2C2C' : '#9A9A9A',
              color: '#FAFAFA',
              border: 'none',
              borderRadius: '9999px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: isCreating || !canSave ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (canSave && !isCreating) {
                e.currentTarget.style.backgroundColor = '#4A4A4A'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = canSave ? '#2C2C2C' : '#9A9A9A'
            }}
          >
            {isCreating ? (
              <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
            ) : (
              <Save style={{ width: '16px', height: '16px' }} />
            )}
            Create Template
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
            For now, create the template with basic details and edit it later.
          </p>
        </div>
      </div>
    </div>
  )
}
