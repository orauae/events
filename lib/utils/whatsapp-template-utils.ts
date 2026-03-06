/**
 * @fileoverview WhatsApp template placeholder utilities
 *
 * Pure functions for extracting, replacing, and validating
 * placeholder variables ({{1}}, {{2}}, etc.) in WhatsApp
 * message template components.
 *
 * @module lib/utils/whatsapp-template-utils
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
  example?: Record<string, unknown>;
}

// ============================================================================
// PLACEHOLDER REGEX
// ============================================================================

/** Matches {{N}} where N is one or more digits. */
const PLACEHOLDER_REGEX = /\{\{(\d+)\}\}/g;

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Extracts all unique placeholder numbers from template components.
 *
 * Scans the `text` field of each component for `{{N}}` tokens and
 * returns a sorted (ascending) array of unique placeholder indices.
 *
 * @example
 * ```ts
 * extractPlaceholders([
 *   { type: 'BODY', text: 'Hello {{1}}, your order {{2}} is ready' },
 *   { type: 'FOOTER', text: 'Thanks {{1}}' },
 * ]);
 * // => [1, 2]
 * ```
 */
export function extractPlaceholders(components: TemplateComponent[]): number[] {
  const placeholders = new Set<number>();

  for (const component of components) {
    if (!component.text) continue;

    let match: RegExpExecArray | null;
    // Reset lastIndex for safety since we reuse the global regex
    PLACEHOLDER_REGEX.lastIndex = 0;

    while ((match = PLACEHOLDER_REGEX.exec(component.text)) !== null) {
      placeholders.add(Number(match[1]));
    }
  }

  return Array.from(placeholders).sort((a, b) => a - b);
}

/**
 * Replaces `{{N}}` tokens in a text string with the corresponding values.
 *
 * Tokens whose index is not present in the `values` map are left unchanged.
 *
 * @example
 * ```ts
 * replacePlaceholders('Hello {{1}}, order {{2}}', { 1: 'Alice', 2: '#100' });
 * // => 'Hello Alice, order #100'
 * ```
 */
export function replacePlaceholders(
  text: string,
  values: Record<number, string>,
): string {
  return text.replace(PLACEHOLDER_REGEX, (original, index) => {
    const key = Number(index);
    return key in values ? values[key] : original;
  });
}

/**
 * Validates that every placeholder has a non-empty string value.
 *
 * @returns `true` if every placeholder index in `placeholders` has a
 *          corresponding non-empty (after trimming) entry in `values`.
 *
 * @example
 * ```ts
 * validatePlaceholderValues([1, 2], { 1: 'Alice', 2: '#100' }); // true
 * validatePlaceholderValues([1, 2], { 1: 'Alice' });             // false
 * validatePlaceholderValues([1, 2], { 1: 'Alice', 2: '' });      // false
 * ```
 */
export function validatePlaceholderValues(
  placeholders: number[],
  values: Record<number, string>,
): boolean {
  return placeholders.every(
    (p) => p in values && values[p].trim().length > 0,
  );
}
