/**
 * Template Service
 * Requirements: 5.2, 5.3
 * 
 * Provides methods to query and import automation templates.
 */

import { automationTemplates, type AutomationTemplate, type TemplateCategory } from '../automation-templates';
import { AutomationService, type AutomationWithDetails } from './automation-service';

/**
 * TemplateService - Handles automation template operations
 * Requirements: 5.2, 5.3
 */
export const TemplateService = {
  /**
   * Get all available automation templates
   * Requirements: 5.2
   */
  getAll(): AutomationTemplate[] {
    return automationTemplates;
  },

  /**
   * Get a template by ID
   * Requirements: 5.2
   */
  getById(id: string): AutomationTemplate | null {
    return automationTemplates.find(t => t.id === id) ?? null;
  },

  /**
   * Get templates by category
   * Requirements: 5.2
   */
  getByCategory(category: TemplateCategory): AutomationTemplate[] {
    return automationTemplates.filter(t => t.category === category);
  },

  /**
   * Import a template to create a new automation for an event
   * Requirements: 5.3
   * 
   * Creates a new automation from the template with:
   * - A new unique ID
   * - All nodes and edges from the template with new IDs
   * - The specified eventId
   * - Status set to "Draft"
   * 
   * The template itself remains unchanged.
   */
  async importToEvent(templateId: string, eventId: string): Promise<AutomationWithDetails> {
    const template = this.getById(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Create a new automation from the template
    // The AutomationService.create method handles:
    // - Generating new IDs for the automation, nodes, and edges
    // - Mapping template node indices to new node IDs in edges
    // - Setting status to 'Draft'
    const automation = await AutomationService.create(eventId, {
      name: template.name,
      description: template.description,
      nodes: template.nodes,
      edges: template.edges,
    });

    return automation;
  },
};

export default TemplateService;
