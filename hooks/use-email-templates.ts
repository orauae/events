/**
 * @fileoverview Email Template Library hooks - TanStack Query hooks for email templates
 * 
 * Provides React hooks for working with email templates from the database:
 * - Fetching available templates
 * - Creating, updating, deleting templates
 * - Selecting templates for campaign creation
 * 
 * @module hooks/use-email-templates
 * @requires @tanstack/react-query
 * @requires sonner - Toast notifications
 * 
 * Requirements: 10 (Email Template Library)
 * 
 * @example
 * ```tsx
 * import { useEmailTemplates, useEmailTemplate } from '@/hooks';
 * 
 * function TemplateSelector() {
 *   const { data: templates, isLoading } = useEmailTemplates();
 *   
 *   return (
 *     <div>
 *       {templates?.map(template => (
 *         <TemplateCard key={template.id} template={template} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { EmailTemplate, TemplateCategory } from "@/db/schema"
import type { EmailBuilderState } from "@/lib/types/email-builder"

// ============================================================================
// TYPES
// ============================================================================

interface APIError {
  code: string
  message: string
}

interface CreateEmailTemplateInput {
  name: string
  description?: string
  category: TemplateCategory
  subject: string
  designJson: EmailBuilderState
  htmlContent?: string
  isDefault?: boolean
  thumbnailUrl?: string | null
}

interface UpdateEmailTemplateInput extends Partial<CreateEmailTemplateInput> {}

interface ListEmailTemplatesParams {
  category?: TemplateCategory
  search?: string
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'category'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

interface PaginatedTemplates {
  templates: EmailTemplate[]
  total: number
  limit: number
  offset: number
}

// ============================================================================
// QUERY KEYS
// ============================================================================

/**
 * Query key factory for email templates.
 */
export const emailTemplateKeys = {
  all: ["email-templates"] as const,
  lists: () => [...emailTemplateKeys.all, "list"] as const,
  list: (params: ListEmailTemplatesParams) => [...emailTemplateKeys.lists(), params] as const,
  details: () => [...emailTemplateKeys.all, "detail"] as const,
  detail: (id: string) => [...emailTemplateKeys.details(), id] as const,
  byCategory: (category: TemplateCategory) => [...emailTemplateKeys.all, "category", category] as const,
  forWizard: () => [...emailTemplateKeys.all, "wizard"] as const,
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchEmailTemplates(params: ListEmailTemplatesParams = {}): Promise<PaginatedTemplates> {
  const searchParams = new URLSearchParams()
  
  if (params.category) searchParams.set('category', params.category)
  if (params.search) searchParams.set('search', params.search)
  if (params.sortBy) searchParams.set('sortBy', params.sortBy)
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder)
  if (params.limit) searchParams.set('limit', params.limit.toString())
  if (params.offset) searchParams.set('offset', params.offset.toString())
  
  const url = `/api/admin/email-templates${searchParams.toString() ? `?${searchParams}` : ''}`
  const response = await fetch(url)
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch email templates")
  }
  
  return response.json()
}

async function fetchEmailTemplate(id: string): Promise<EmailTemplate> {
  const response = await fetch(`/api/admin/email-templates/${id}`)
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch email template")
  }
  
  return response.json()
}

async function fetchEmailTemplatesForWizard(): Promise<EmailTemplate[]> {
  const response = await fetch('/api/admin/email-templates/wizard')
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch email templates")
  }
  
  return response.json()
}

async function fetchEmailTemplatesByCategory(category: TemplateCategory): Promise<EmailTemplate[]> {
  const response = await fetch(`/api/admin/email-templates?category=${category}`)
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to fetch email templates")
  }
  
  const data: PaginatedTemplates = await response.json()
  return data.templates
}

async function createEmailTemplate(input: CreateEmailTemplateInput): Promise<EmailTemplate> {
  const response = await fetch('/api/admin/email-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to create email template")
  }
  
  return response.json()
}

async function updateEmailTemplate({ id, ...input }: UpdateEmailTemplateInput & { id: string }): Promise<EmailTemplate> {
  const response = await fetch(`/api/admin/email-templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to update email template")
  }
  
  return response.json()
}

async function deleteEmailTemplate(id: string): Promise<void> {
  const response = await fetch(`/api/admin/email-templates/${id}`, {
    method: 'DELETE',
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to delete email template")
  }
}

async function duplicateEmailTemplate(id: string): Promise<EmailTemplate> {
  const response = await fetch(`/api/admin/email-templates/${id}/duplicate`, {
    method: 'POST',
  })
  
  if (!response.ok) {
    const error: APIError = await response.json()
    throw new Error(error.message || "Failed to duplicate email template")
  }
  
  return response.json()
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Query email templates with optional filters
 * 
 * Requirements: 10.1
 */
export function useEmailTemplates(params: ListEmailTemplatesParams = {}) {
  return useQuery({
    queryKey: emailTemplateKeys.list(params),
    queryFn: () => fetchEmailTemplates(params),
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  })
}

/**
 * Query a single email template by ID
 * 
 * Requirements: 10.2
 */
export function useEmailTemplate(id: string | undefined) {
  return useQuery({
    queryKey: emailTemplateKeys.detail(id || ''),
    queryFn: () => fetchEmailTemplate(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  })
}

/**
 * Query email templates for the campaign wizard
 * Returns all templates sorted by category and default status
 * 
 * Requirements: 10.5
 */
export function useEmailTemplatesForWizard() {
  return useQuery({
    queryKey: emailTemplateKeys.forWizard(),
    queryFn: fetchEmailTemplatesForWizard,
    staleTime: 1000 * 60 * 5,
  })
}

/**
 * Query email templates by category
 * 
 * Requirements: 10.3
 */
export function useEmailTemplatesByCategory(category: TemplateCategory | undefined) {
  return useQuery({
    queryKey: emailTemplateKeys.byCategory(category!),
    queryFn: () => fetchEmailTemplatesByCategory(category!),
    enabled: !!category,
    staleTime: 1000 * 60 * 5,
  })
}

/**
 * Mutation to create a new email template
 * 
 * Requirements: 10.2
 */
export function useCreateEmailTemplate() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: createEmailTemplate,
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: emailTemplateKeys.all })
      toast.success(`Template "${template.name}" created successfully`)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create template")
    },
  })
}

/**
 * Mutation to update an email template
 * 
 * Requirements: 10.2
 */
export function useUpdateEmailTemplate() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: updateEmailTemplate,
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: emailTemplateKeys.all })
      queryClient.setQueryData(emailTemplateKeys.detail(template.id), template)
      toast.success(`Template "${template.name}" updated successfully`)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update template")
    },
  })
}

/**
 * Mutation to delete an email template
 * 
 * Requirements: 10.2
 */
export function useDeleteEmailTemplate() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: deleteEmailTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailTemplateKeys.all })
      toast.success("Template deleted successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete template")
    },
  })
}

/**
 * Mutation to duplicate an email template
 * 
 * Requirements: 10.2
 */
export function useDuplicateEmailTemplate() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: duplicateEmailTemplate,
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: emailTemplateKeys.all })
      toast.success(`Template duplicated as "${template.name}"`)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to duplicate template")
    },
  })
}
