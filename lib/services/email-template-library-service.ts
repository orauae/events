/**
 * @fileoverview Email Template Library Service
 * 
 * Provides CRUD operations for email templates stored in the database.
 * Templates can be used as starting points for campaign creation.
 * Includes import/export functionality for HTML and JSON formats.
 * 
 * @module lib/services/email-template-library-service
 * @requires drizzle-orm
 * @requires @/db
 * 
 * Requirements: 10 (Email Template Library)
 */

import { db } from '@/db';
import { emailTemplates, type EmailTemplate, type TemplateCategory } from '@/db/schema';
import { eq, and, desc, asc, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import type { EmailBuilderState } from '@/lib/types/email-builder';
import { createInitialState } from '@/lib/types/email-builder';
import type { UnlayerDesignJson } from '@/components/unlayer-email-builder';
import { isUnlayerFormat, isLegacyFormat, ensureUnlayerFormat, createBlankUnlayerDesign } from '@/lib/utils/design-format-converter';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Schema for creating a new email template
 */
export const createEmailTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  category: z.enum(['Invitation', 'Reminder', 'LastChance', 'EventDay', 'ThankYou', 'Feedback', 'Custom']),
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject must be 200 characters or less'),
  designJson: z.any(), // EmailBuilderState - validated separately
  htmlContent: z.string().optional(),
  isDefault: z.boolean().optional().default(false),
  thumbnailUrl: z.string().url().optional().nullable(),
});

/**
 * Schema for updating an email template
 */
export const updateEmailTemplateSchema = createEmailTemplateSchema.partial();

/**
 * Schema for listing templates with filters
 */
export const listEmailTemplatesSchema = z.object({
  category: z.enum(['Invitation', 'Reminder', 'LastChance', 'EventDay', 'ThankYou', 'Feedback', 'Custom']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'category']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

/**
 * Schema for importing a template from HTML
 * Requirements: 10.6
 */
export const importFromHtmlSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  category: z.enum(['Invitation', 'Reminder', 'LastChance', 'EventDay', 'ThankYou', 'Feedback', 'Custom']),
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject must be 200 characters or less'),
  htmlContent: z.string().min(1, 'HTML content is required'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
});

/**
 * Schema for exported template JSON format
 * Requirements: 10.7
 */
export const exportedTemplateSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  template: z.object({
    name: z.string(),
    description: z.string().nullable(),
    category: z.enum(['Invitation', 'Reminder', 'LastChance', 'EventDay', 'ThankYou', 'Feedback', 'Custom']),
    subject: z.string(),
    designJson: z.any(),
    htmlContent: z.string().nullable(),
  }),
});

// ============================================================================
// TYPES
// ============================================================================

export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateSchema>;
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;
export type ListEmailTemplatesInput = z.infer<typeof listEmailTemplatesSchema>;
export type ImportFromHtmlInput = z.infer<typeof importFromHtmlSchema>;
export type ExportedTemplate = z.infer<typeof exportedTemplateSchema>;

export interface EmailTemplateWithDesign extends EmailTemplate {
  designJson: EmailBuilderState;
}

export interface PaginatedTemplates {
  templates: EmailTemplate[];
  total: number;
  limit: number;
  offset: number;
}

export interface ExportResult {
  json: string;
  html: string | null;
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * EmailTemplateLibraryService - Handles email template library operations
 * 
 * Requirements: 10 (Email Template Library)
 */
export const EmailTemplateLibraryService = {
  /**
   * Create a new email template
   * 
   * Requirements: 10.2
   */
  async create(input: CreateEmailTemplateInput): Promise<EmailTemplate> {
    const validated = createEmailTemplateSchema.parse(input);
    
    // If this template is marked as default, unset other defaults in the same category
    if (validated.isDefault) {
      await db.update(emailTemplates)
        .set({ isDefault: false })
        .where(eq(emailTemplates.category, validated.category));
    }
    
    const [template] = await db.insert(emailTemplates)
      .values({
        name: validated.name,
        description: validated.description || null,
        category: validated.category,
        subject: validated.subject,
        designJson: validated.designJson,
        htmlContent: validated.htmlContent || null,
        isDefault: validated.isDefault,
        thumbnailUrl: validated.thumbnailUrl || null,
      })
      .returning();
    
    return template;
  },

  /**
   * Get a template by ID
   * 
   * Requirements: 10.2
   */
  async getById(id: string): Promise<EmailTemplate | null> {
    const [template] = await db.select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, id));
    
    return template || null;
  },

  /**
   * List templates with optional filters
   * 
   * Requirements: 10.1, 10.3
   */
  async list(input: ListEmailTemplatesInput = {}): Promise<PaginatedTemplates> {
    const validated = listEmailTemplatesSchema.parse(input);
    const { 
      category, 
      search, 
      sortBy = 'createdAt', 
      sortOrder = 'desc', 
      limit = 50, 
      offset = 0 
    } = validated;
    
    // Build where conditions
    const conditions = [];
    
    if (category) {
      conditions.push(eq(emailTemplates.category, category));
    }
    
    if (search) {
      conditions.push(
        or(
          ilike(emailTemplates.name, `%${search}%`),
          ilike(emailTemplates.description, `%${search}%`)
        )
      );
    }
    
    // Build order by
    const orderColumn = {
      name: emailTemplates.name,
      createdAt: emailTemplates.createdAt,
      updatedAt: emailTemplates.updatedAt,
      category: emailTemplates.category,
    }[sortBy || 'createdAt'];
    
    const orderFn = sortOrder === 'asc' ? asc : desc;
    
    // Execute query
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const templates = await db.select()
      .from(emailTemplates)
      .where(whereClause)
      .orderBy(orderFn(orderColumn))
      .limit(limit)
      .offset(offset);
    
    // Get total count
    const [{ count }] = await db.select({ count: db.$count(emailTemplates) })
      .from(emailTemplates)
      .where(whereClause);
    
    return {
      templates,
      total: Number(count),
      limit,
      offset,
    };
  },

  /**
   * Get templates by category
   * 
   * Requirements: 10.3
   */
  async getByCategory(category: TemplateCategory): Promise<EmailTemplate[]> {
    return db.select()
      .from(emailTemplates)
      .where(eq(emailTemplates.category, category))
      .orderBy(desc(emailTemplates.isDefault), asc(emailTemplates.name));
  },

  /**
   * Get the default template for a category
   * 
   * Requirements: 10.4
   */
  async getDefaultForCategory(category: TemplateCategory): Promise<EmailTemplate | null> {
    const [template] = await db.select()
      .from(emailTemplates)
      .where(and(
        eq(emailTemplates.category, category),
        eq(emailTemplates.isDefault, true)
      ));
    
    return template || null;
  },

  /**
   * Update a template
   * 
   * Requirements: 10.2
   */
  async update(id: string, input: UpdateEmailTemplateInput): Promise<EmailTemplate> {
    const validated = updateEmailTemplateSchema.parse(input);
    
    // Check if template exists
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Template not found');
    }
    
    // If setting as default, unset other defaults in the same category
    if (validated.isDefault) {
      const category = validated.category || existing.category;
      await db.update(emailTemplates)
        .set({ isDefault: false })
        .where(and(
          eq(emailTemplates.category, category),
          eq(emailTemplates.isDefault, true)
        ));
    }
    
    const [updated] = await db.update(emailTemplates)
      .set({
        ...validated,
        updatedAt: new Date(),
      })
      .where(eq(emailTemplates.id, id))
      .returning();
    
    return updated;
  },

  /**
   * Delete a template
   * 
   * Requirements: 10.2
   */
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Template not found');
    }
    
    await db.delete(emailTemplates)
      .where(eq(emailTemplates.id, id));
  },

  /**
   * Duplicate a template
   * 
   * Requirements: 10.2
   */
  async duplicate(id: string): Promise<EmailTemplate> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Template not found');
    }
    
    const [duplicated] = await db.insert(emailTemplates)
      .values({
        name: `${existing.name} (Copy)`,
        description: existing.description,
        category: existing.category,
        subject: existing.subject,
        designJson: existing.designJson,
        htmlContent: existing.htmlContent,
        isDefault: false, // Duplicates are never default
        thumbnailUrl: existing.thumbnailUrl,
      })
      .returning();
    
    return duplicated;
  },

  /**
   * Set a template as default for its category
   * 
   * Requirements: 10.4
   */
  async setAsDefault(id: string): Promise<EmailTemplate> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Template not found');
    }
    
    // Unset other defaults in the same category
    await db.update(emailTemplates)
      .set({ isDefault: false })
      .where(eq(emailTemplates.category, existing.category));
    
    // Set this template as default
    const [updated] = await db.update(emailTemplates)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(emailTemplates.id, id))
      .returning();
    
    return updated;
  },

  /**
   * Get all templates for campaign wizard selection
   * Returns templates grouped by category with defaults first
   * 
   * Requirements: 10.5
   */
  async getForCampaignWizard(): Promise<EmailTemplate[]> {
    return db.select()
      .from(emailTemplates)
      .orderBy(
        asc(emailTemplates.category),
        desc(emailTemplates.isDefault),
        asc(emailTemplates.name)
      );
  },

  /**
   * Import a template from HTML content
   * Creates a new template with the HTML stored directly
   * The designJson will be a minimal structure since we can't reverse-engineer the builder state
   * 
   * Requirements: 10.6
   */
  async importFromHtml(input: ImportFromHtmlInput): Promise<EmailTemplate> {
    const validated = importFromHtmlSchema.parse(input);
    
    // Create a minimal design JSON structure for imported HTML
    // Since we can't reverse-engineer the visual builder state from HTML,
    // we store the HTML directly and create an empty builder state
    const designJson: EmailBuilderState = {
      ...createInitialState(),
      metadata: {
        lastSaved: new Date().toISOString(),
        version: 1,
      },
    };
    
    const [template] = await db.insert(emailTemplates)
      .values({
        name: validated.name,
        description: validated.description || `Imported from HTML`,
        category: validated.category,
        subject: validated.subject,
        designJson: designJson,
        htmlContent: validated.htmlContent,
        isDefault: false,
        thumbnailUrl: null,
      })
      .returning();
    
    return template;
  },

  /**
   * Export a template as JSON
   * Returns a JSON string containing the template data in a portable format
   * 
   * Requirements: 10.7
   */
  async exportAsJson(id: string): Promise<string> {
    const template = await this.getById(id);
    if (!template) {
      throw new Error('Template not found');
    }
    
    const exportData: ExportedTemplate = {
      version: 1,
      exportedAt: new Date().toISOString(),
      template: {
        name: template.name,
        description: template.description,
        category: template.category,
        subject: template.subject,
        designJson: template.designJson,
        htmlContent: template.htmlContent,
      },
    };
    
    return JSON.stringify(exportData, null, 2);
  },

  /**
   * Export a template as HTML
   * Returns the HTML content if available, otherwise throws an error
   * 
   * Requirements: 10.7
   */
  async exportAsHtml(id: string): Promise<string> {
    const template = await this.getById(id);
    if (!template) {
      throw new Error('Template not found');
    }
    
    if (!template.htmlContent) {
      throw new Error('Template does not have HTML content. Generate HTML from the email builder first.');
    }
    
    return template.htmlContent;
  },

  /**
   * Import a template from exported JSON
   * Creates a new template from a previously exported JSON file
   * 
   * Requirements: 10.6
   */
  async importFromJson(jsonContent: string): Promise<EmailTemplate> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonContent);
    } catch {
      throw new Error('Invalid JSON format');
    }
    
    // Validate the exported template format
    const validated = exportedTemplateSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`Invalid template format: ${validated.error.message}`);
    }
    
    const { template: templateData } = validated.data;
    
    const [template] = await db.insert(emailTemplates)
      .values({
        name: `${templateData.name} (Imported)`,
        description: templateData.description,
        category: templateData.category,
        subject: templateData.subject,
        designJson: templateData.designJson,
        htmlContent: templateData.htmlContent,
        isDefault: false,
        thumbnailUrl: null,
      })
      .returning();
    
    return template;
  },

  /**
   * Export a template in both JSON and HTML formats
   * Convenience method that returns both export formats
   * 
   * Requirements: 10.7
   */
  async export(id: string): Promise<ExportResult> {
    const template = await this.getById(id);
    if (!template) {
      throw new Error('Template not found');
    }
    
    const json = await this.exportAsJson(id);
    const html = template.htmlContent || null;
    
    return { json, html };
  },

  /**
   * Get all available categories
   * Returns the list of template categories for filtering
   * 
   * Requirements: 10.3
   */
  getCategories(): TemplateCategory[] {
    return ['Invitation', 'Reminder', 'LastChance', 'EventDay', 'ThankYou', 'Feedback', 'Custom'];
  },

  /**
   * Create a new template with Unlayer design JSON format
   * 
   * Requirements: 8.2 - Save new templates in Unlayer format
   */
  async createWithUnlayerDesign(input: {
    name: string;
    description?: string;
    category: TemplateCategory;
    subject: string;
    unlayerDesignJson: UnlayerDesignJson;
    htmlContent?: string;
    isDefault?: boolean;
    thumbnailUrl?: string | null;
  }): Promise<EmailTemplate> {
    // If this template is marked as default, unset other defaults in the same category
    if (input.isDefault) {
      await db.update(emailTemplates)
        .set({ isDefault: false })
        .where(eq(emailTemplates.category, input.category));
    }
    
    const [template] = await db.insert(emailTemplates)
      .values({
        name: input.name,
        description: input.description || null,
        category: input.category,
        subject: input.subject,
        // Store Unlayer design JSON directly - it will be detected by format check
        designJson: input.unlayerDesignJson as unknown as EmailBuilderState,
        htmlContent: input.htmlContent || null,
        isDefault: input.isDefault || false,
        thumbnailUrl: input.thumbnailUrl || null,
      })
      .returning();
    
    return template;
  },

  /**
   * Get a template's design in Unlayer format
   * Converts legacy format to Unlayer if necessary
   * 
   * Requirements: 8.1 - Convert existing format to Unlayer if necessary
   */
  async getDesignAsUnlayer(id: string): Promise<{ design: UnlayerDesignJson | null; wasConverted: boolean; error?: string }> {
    const template = await this.getById(id);
    if (!template) {
      return { design: null, wasConverted: false, error: 'Template not found' };
    }

    const designJson = template.designJson;
    
    // Check if already Unlayer format
    if (isUnlayerFormat(designJson)) {
      return { design: designJson as unknown as UnlayerDesignJson, wasConverted: false };
    }

    // Check if legacy format and convert
    if (isLegacyFormat(designJson)) {
      const result = ensureUnlayerFormat(designJson);
      if (result.success && result.design) {
        return { design: result.design, wasConverted: true };
      }
      return { design: null, wasConverted: false, error: result.error || 'Conversion failed' };
    }

    // Unknown format - return blank design
    return { 
      design: createBlankUnlayerDesign(), 
      wasConverted: true, 
      error: 'Unknown format, starting with blank design' 
    };
  },

  /**
   * Check if a template's design is in Unlayer format
   */
  isUnlayerFormat(template: EmailTemplate): boolean {
    return isUnlayerFormat(template.designJson);
  },

  /**
   * Check if a template's design is in legacy format
   */
  isLegacyFormat(template: EmailTemplate): boolean {
    return isLegacyFormat(template.designJson);
  },

  /**
   * Update a template with Unlayer design JSON
   * 
   * Requirements: 8.2 - Save templates in Unlayer format
   */
  async updateWithUnlayerDesign(id: string, input: {
    name?: string;
    description?: string;
    category?: TemplateCategory;
    subject?: string;
    unlayerDesignJson?: UnlayerDesignJson;
    htmlContent?: string;
    isDefault?: boolean;
    thumbnailUrl?: string | null;
  }): Promise<EmailTemplate> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Template not found');
    }

    // If setting as default, unset other defaults in the same category
    if (input.isDefault) {
      const category = input.category || existing.category;
      await db.update(emailTemplates)
        .set({ isDefault: false })
        .where(and(
          eq(emailTemplates.category, category),
          eq(emailTemplates.isDefault, true)
        ));
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.category !== undefined) updateData.category = input.category;
    if (input.subject !== undefined) updateData.subject = input.subject;
    if (input.unlayerDesignJson !== undefined) {
      updateData.designJson = input.unlayerDesignJson as unknown as EmailBuilderState;
    }
    if (input.htmlContent !== undefined) updateData.htmlContent = input.htmlContent;
    if (input.isDefault !== undefined) updateData.isDefault = input.isDefault;
    if (input.thumbnailUrl !== undefined) updateData.thumbnailUrl = input.thumbnailUrl;

    const [updated] = await db.update(emailTemplates)
      .set(updateData)
      .where(eq(emailTemplates.id, id))
      .returning();

    return updated;
  },
};
