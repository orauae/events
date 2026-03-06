import { z } from 'zod';

/**
 * Supported template variables for email templates
 * Requirements: 4.3
 */
export const TEMPLATE_VARIABLES = [
  'firstName',
  'lastName',
  'eventName',
  'rsvpLink',
  'badgeLink',
  'eventLocation',
  'eventDate',
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

/**
 * Context data for template rendering
 * Contains all the values that can be substituted into templates
 */
export interface TemplateContext {
  firstName: string;
  lastName: string;
  eventName: string;
  rsvpLink: string;
  badgeLink: string;
  eventLocation: string;
  eventDate: string;
}

/**
 * Zod schema for validating template context
 */
export const templateContextSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  eventName: z.string(),
  rsvpLink: z.string(),
  badgeLink: z.string(),
  eventLocation: z.string(),
  eventDate: z.string(),
});

/**
 * Result of template rendering
 */
export interface RenderResult {
  success: boolean;
  content: string;
  unsubstitutedVariables: string[];
}

/**
 * Regular expression to match template variables in the format {variableName}
 */
const VARIABLE_PATTERN = /\{([a-zA-Z]+)\}/g;

/**
 * EmailTemplateService - Handles email template rendering with variable substitution
 * Requirements: 4.3
 */
export const EmailTemplateService = {
  /**
   * Render a template by substituting all variables with their values
   * Requirements: 4.3
   * 
   * @param template - The template string containing variables like {firstName}
   * @param context - The context object containing values for all variables
   * @returns RenderResult with the rendered content and any unsubstituted variables
   */
  render(template: string, context: TemplateContext): RenderResult {
    // Validate context
    templateContextSchema.parse(context);

    const unsubstitutedVariables: string[] = [];
    
    // Replace all variables in the template
    const content = template.replace(VARIABLE_PATTERN, (match, variableName) => {
      // Check if this is a supported variable
      if (TEMPLATE_VARIABLES.includes(variableName as TemplateVariable)) {
        const value = context[variableName as TemplateVariable];
        // If value is empty string, still consider it substituted
        return value;
      }
      
      // Unknown variable - keep track of it
      unsubstitutedVariables.push(variableName);
      return match; // Keep the original placeholder
    });

    return {
      success: unsubstitutedVariables.length === 0,
      content,
      unsubstitutedVariables,
    };
  },

  /**
   * Extract all variables from a template string
   * 
   * @param template - The template string to analyze
   * @returns Array of variable names found in the template
   */
  extractVariables(template: string): string[] {
    const variables: string[] = [];
    let match;
    
    // Reset regex state
    const pattern = new RegExp(VARIABLE_PATTERN);
    
    while ((match = pattern.exec(template)) !== null) {
      const variableName = match[1];
      if (!variables.includes(variableName)) {
        variables.push(variableName);
      }
    }
    
    return variables;
  },

  /**
   * Validate that a template only contains supported variables
   * 
   * @param template - The template string to validate
   * @returns Object with isValid flag and any unsupported variables found
   */
  validateTemplate(template: string): { isValid: boolean; unsupportedVariables: string[] } {
    const variables = this.extractVariables(template);
    const unsupportedVariables = variables.filter(
      (v) => !TEMPLATE_VARIABLES.includes(v as TemplateVariable)
    );
    
    return {
      isValid: unsupportedVariables.length === 0,
      unsupportedVariables,
    };
  },

  /**
   * Get a list of all supported template variables
   * 
   * @returns Array of supported variable names
   */
  getSupportedVariables(): readonly string[] {
    return TEMPLATE_VARIABLES;
  },

  /**
   * Create a template context from guest and event data
   * Helper method to build context from domain objects
   * 
   * @param guest - Guest data with firstName, lastName
   * @param event - Event data with name, location, startDate
   * @param qrToken - The QR token for generating RSVP and badge links
   * @param baseUrl - Base URL for generating links
   * @returns TemplateContext ready for rendering
   */
  createContext(
    guest: { firstName: string; lastName: string },
    event: { name: string; location: string; startDate: Date },
    qrToken: string,
    baseUrl: string
  ): TemplateContext {
    return {
      firstName: guest.firstName,
      lastName: guest.lastName,
      eventName: event.name,
      eventLocation: event.location,
      eventDate: event.startDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      rsvpLink: `${baseUrl}/rsvp/${qrToken}`,
      badgeLink: `${baseUrl}/badge/${qrToken}`,
    };
  },
};

export default EmailTemplateService;
