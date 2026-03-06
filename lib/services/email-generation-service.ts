/**
 * Email Generation Service
 * 
 * Handles email content generation for the Unlayer email editor migration.
 * Provides functions for:
 * - Generating plain text from HTML
 * - Substituting merge tags with actual values
 * - Validating HTML content
 * - Getting sample context for previews
 * 
 * Requirements: 7.2, 7.3, 10.3
 */

import { REQUIRED_MERGE_TAG_KEYS, getAllMergeTagValues } from '../config/unlayer-merge-tags';

/**
 * Result of email generation
 */
export interface EmailGenerationResult {
  html: string;
  plainText: string;
}

/**
 * Result of HTML validation
 */
export interface HtmlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Context for merge tag substitution
 */
export type MergeTagContext = Record<string, string>;

/**
 * Sample context type with all required merge tags
 */
export type SampleContext = {
  [K in typeof REQUIRED_MERGE_TAG_KEYS[number]]: string;
};

/**
 * EmailGenerationService - Handles email content generation for Unlayer editor
 * 
 * Requirements: 7.2, 7.3, 10.3
 */
export const EmailGenerationService = {
  /**
   * Generate plain text from HTML content
   * 
   * Strips HTML tags, decodes HTML entities, and formats whitespace
   * for email clients that don't support HTML.
   * 
   * Requirements: 7.2
   * 
   * @param html - The HTML content to convert
   * @returns Plain text version of the content
   */
  generatePlainText(html: string): string {
    if (!html || html.trim().length === 0) {
      return '';
    }

    let text = html
      // Remove style tags and their content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove script tags and their content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Convert <br> and <br/> to newlines
      .replace(/<br\s*\/?>/gi, '\n')
      // Convert block-level elements to newlines
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      // Convert <hr> to separator
      .replace(/<hr\s*\/?>/gi, '\n---\n')
      // Remove remaining HTML tags - must start with letter (valid tag names)
      // This prevents matching things like "< " which is not a valid tag
      .replace(/<\/?[a-zA-Z][^>]*>/g, '')
      // Decode common HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

    // Clean up whitespace
    text = text
      .split('\n')
      .map(line => line.trim())
      .filter((line, index, arr) => {
        // Remove consecutive empty lines (keep at most one)
        if (line.length === 0 && index > 0 && arr[index - 1].trim().length === 0) {
          return false;
        }
        return true;
      })
      .join('\n')
      .trim();

    return text;
  },

  /**
   * Substitute merge tags with actual values
   * 
   * Replaces all merge tags in the format {variableName} with their
   * corresponding values from the context object.
   * 
   * Requirements: 7.3
   * 
   * @param content - The content string containing merge tags
   * @param context - Object with key-value pairs for substitution
   * @returns Content with all matching merge tags replaced
   */
  substituteVariables(content: string, context: MergeTagContext): string {
    if (!content) {
      return '';
    }

    let result = content;
    
    for (const [key, value] of Object.entries(context)) {
      // Create pattern to match {key} format
      const pattern = new RegExp(`\\{${escapeRegExp(key)}\\}`, 'g');
      // Escape $ in replacement value to prevent special regex replacement patterns
      // $& = matched substring, $$ = literal $, $' = portion after match, $` = portion before match
      const safeValue = (value ?? '').replace(/\$/g, '$$$$');
      result = result.replace(pattern, safeValue);
    }
    
    return result;
  },

  /**
   * Validate HTML content
   * 
   * Checks that HTML is not empty and has basic structure markers.
   * 
   * Requirements: 10.3
   * 
   * @param html - The HTML content to validate
   * @returns Validation result with valid flag and optional error message
   */
  validateHtml(html: string): HtmlValidationResult {
    // Check for empty or whitespace-only content
    if (!html || html.trim().length === 0) {
      return { valid: false, error: 'HTML content is empty' };
    }

    // Check for basic HTML structure markers
    const hasHtmlTag = /<html/i.test(html);
    const hasBodyTag = /<body/i.test(html);
    const hasDoctype = /<!DOCTYPE/i.test(html);
    const hasAnyTag = /<[a-z][^>]*>/i.test(html);

    // Valid if it has html or body tag, or at least some HTML tags
    if (!hasHtmlTag && !hasBodyTag && !hasDoctype && !hasAnyTag) {
      return { valid: false, error: 'HTML content appears malformed' };
    }

    return { valid: true };
  },

  /**
   * Get sample context for preview
   * 
   * Returns a context object with sample values for all merge tags,
   * useful for previewing emails in the editor.
   * 
   * @returns Sample context with all required merge tag values
   */
  getSampleContext(): SampleContext {
    const allTags = getAllMergeTagValues();
    const context: Record<string, string> = {};

    for (const key of REQUIRED_MERGE_TAG_KEYS) {
      const tag = allTags.get(key);
      context[key] = tag?.sample ?? `[${key}]`;
    }

    return context as SampleContext;
  },

  /**
   * Generate both HTML and plain text versions of an email
   * 
   * Convenience method that validates HTML, substitutes variables,
   * and generates plain text in one call.
   * 
   * @param html - The HTML content
   * @param context - Context for merge tag substitution
   * @returns EmailGenerationResult with both HTML and plain text
   * @throws Error if HTML validation fails
   */
  generate(html: string, context: MergeTagContext): EmailGenerationResult {
    const validation = this.validateHtml(html);
    if (!validation.valid) {
      throw new Error(validation.error ?? 'Invalid HTML content');
    }

    const substitutedHtml = this.substituteVariables(html, context);
    const plainText = this.generatePlainText(substitutedHtml);

    return {
      html: substitutedHtml,
      plainText,
    };
  },

  /**
   * Find unsubstituted merge tags in content
   * 
   * Useful for checking if all merge tags have been replaced.
   * 
   * @param content - The content to check
   * @returns Array of merge tag keys that are still present
   */
  findUnsubstitutedTags(content: string): string[] {
    const pattern = /\{([a-zA-Z_]+)\}/g;
    const found: string[] = [];
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const key = match[1];
      if (!found.includes(key)) {
        found.push(key);
      }
    }

    return found;
  },
};

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default EmailGenerationService;
