import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  extractPlaceholders,
  replacePlaceholders,
  validatePlaceholderValues,
  type TemplateComponent,
} from '@/lib/utils/whatsapp-template-utils';

/**
 * @fileoverview Property-based tests for WhatsApp template placeholder utilities
 *
 * Feature: whatsapp-template-management
 * - Property 12: Placeholder extraction and replacement
 * - Property 13: Placeholder validation completeness
 *
 * **Validates: Requirements 6.1, 6.2, 6.4**
 */

// ============================================================================
// GENERATORS
// ============================================================================

/** Generate a placeholder index (1-based, realistic range) */
const placeholderIndexArb = fc.integer({ min: 1, max: 20 });

/** Generate non-empty replacement text that doesn't contain placeholder patterns */
const replacementValueArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => !/\{\{\d+\}\}/.test(s) && s.trim().length > 0);

/** Generate text that does NOT contain any {{N}} patterns */
const plainTextArb = fc
  .string({ minLength: 0, maxLength: 100 })
  .filter((s) => !/\{\{\d+\}\}/.test(s));

/** Generate a template body text with embedded placeholders */
function textWithPlaceholdersArb(indices: number[]): fc.Arbitrary<string> {
  if (indices.length === 0) return plainTextArb;

  // Build text by interleaving plain segments with placeholders
  return fc
    .array(plainTextArb, { minLength: indices.length + 1, maxLength: indices.length + 1 })
    .map((segments) => {
      let result = segments[0];
      for (let i = 0; i < indices.length; i++) {
        result += `{{${indices[i]}}}` + segments[i + 1];
      }
      return result;
    });
}

/** Generate a TemplateComponent with a given text */
function componentArb(text: string): TemplateComponent {
  return { type: 'BODY', text };
}

const componentTypeArb = fc.constantFrom<TemplateComponent['type']>(
  'HEADER',
  'BODY',
  'FOOTER',
  'BUTTONS',
);

// ============================================================================
// Property 12: Placeholder extraction and replacement
// ============================================================================

/**
 * Feature: whatsapp-template-management, Property 12: Placeholder extraction and replacement
 * **Validates: Requirements 6.1, 6.2**
 */
describe('Property 12: Placeholder extraction and replacement', () => {

  test.prop(
    [
      fc
        .uniqueArray(placeholderIndexArb, { minLength: 1, maxLength: 10 })
        .chain((indices) => {
          const sorted = [...indices].sort((a, b) => a - b);
          return fc.tuple(
            fc.constant(sorted),
            textWithPlaceholdersArb(sorted),
            fc.tuple(
              ...sorted.map(() => replacementValueArb),
            ),
          );
        }),
    ],
    { numRuns: 100 },
  )(
    'replacing all placeholders removes all {{N}} tokens and preserves non-placeholder text',
    ([indices, text, valuesList]) => {
      // Build the values map
      const values: Record<number, string> = {};
      indices.forEach((idx, i) => {
        values[idx] = valuesList[i];
      });

      const result = replacePlaceholders(text, values);

      // After replacement, none of the mapped {{N}} tokens should remain
      for (const idx of indices) {
        expect(result).not.toContain(`{{${idx}}}`);
      }

      // Each replacement value should appear in the result
      for (const idx of indices) {
        expect(result).toContain(values[idx]);
      }
    },
  );

  test.prop(
    [
      fc
        .uniqueArray(placeholderIndexArb, { minLength: 1, maxLength: 8 })
        .chain((indices) => {
          const sorted = [...indices].sort((a, b) => a - b);
          return fc.tuple(
            fc.constant(sorted),
            textWithPlaceholdersArb(sorted),
          );
        }),
    ],
    { numRuns: 100 },
  )(
    'extractPlaceholders returns the correct sorted unique indices from components',
    ([indices, text]) => {
      const components: TemplateComponent[] = [componentArb(text)];
      const extracted = extractPlaceholders(components);

      expect(extracted).toEqual(indices);
    },
  );

  test.prop(
    [
      fc
        .uniqueArray(placeholderIndexArb, { minLength: 1, maxLength: 6 })
        .chain((indices) => {
          const sorted = [...indices].sort((a, b) => a - b);
          return fc.tuple(
            fc.constant(sorted),
            // Generate multiple components that share the same placeholders
            fc.tuple(
              textWithPlaceholdersArb(sorted),
              textWithPlaceholdersArb(sorted),
            ),
          );
        }),
    ],
    { numRuns: 100 },
  )(
    'extractPlaceholders deduplicates across multiple components',
    ([indices, [text1, text2]]) => {
      const components: TemplateComponent[] = [
        { type: 'HEADER', text: text1 },
        { type: 'BODY', text: text2 },
      ];
      const extracted = extractPlaceholders(components);

      // Should still be the same unique sorted set
      expect(extracted).toEqual(indices);
    },
  );

  test.prop([plainTextArb], { numRuns: 100 })(
    'text without placeholders is returned unchanged by replacePlaceholders',
    (text) => {
      const result = replacePlaceholders(text, { 1: 'anything' });
      expect(result).toBe(text);
    },
  );
});

// ============================================================================
// Property 13: Placeholder validation completeness
// ============================================================================

/**
 * Feature: whatsapp-template-management, Property 13: Placeholder validation completeness
 * **Validates: Requirements 6.4**
 */
describe('Property 13: Placeholder validation completeness', () => {
  test.prop(
    [
      fc
        .uniqueArray(placeholderIndexArb, { minLength: 1, maxLength: 10 })
        .chain((indices) => {
          const sorted = [...indices].sort((a, b) => a - b);
          return fc.tuple(
            fc.constant(sorted),
            fc.tuple(...sorted.map(() => replacementValueArb)),
          );
        }),
    ],
    { numRuns: 100 },
  )(
    'validation passes when all placeholders have non-empty values',
    ([placeholders, valuesList]) => {
      const values: Record<number, string> = {};
      placeholders.forEach((p, i) => {
        values[p] = valuesList[i];
      });

      expect(validatePlaceholderValues(placeholders, values)).toBe(true);
    },
  );

  test.prop(
    [
      fc
        .uniqueArray(placeholderIndexArb, { minLength: 1, maxLength: 10 })
        .chain((indices) => {
          const sorted = [...indices].sort((a, b) => a - b);
          // Pick a random index to omit
          return fc.tuple(
            fc.constant(sorted),
            fc.integer({ min: 0, max: sorted.length - 1 }),
            fc.tuple(...sorted.map(() => replacementValueArb)),
          );
        }),
    ],
    { numRuns: 100 },
  )(
    'validation fails when at least one placeholder value is missing',
    ([placeholders, omitIdx, valuesList]) => {
      const values: Record<number, string> = {};
      placeholders.forEach((p, i) => {
        if (i !== omitIdx) {
          values[p] = valuesList[i];
        }
        // Omit the value at omitIdx
      });

      expect(validatePlaceholderValues(placeholders, values)).toBe(false);
    },
  );

  test.prop(
    [
      fc
        .uniqueArray(placeholderIndexArb, { minLength: 1, maxLength: 10 })
        .chain((indices) => {
          const sorted = [...indices].sort((a, b) => a - b);
          return fc.tuple(
            fc.constant(sorted),
            fc.integer({ min: 0, max: sorted.length - 1 }),
            fc.tuple(...sorted.map(() => replacementValueArb)),
          );
        }),
    ],
    { numRuns: 100 },
  )(
    'validation fails when a placeholder value is empty or whitespace-only',
    ([placeholders, emptyIdx, valuesList]) => {
      const values: Record<number, string> = {};
      placeholders.forEach((p, i) => {
        values[p] = i === emptyIdx ? '   ' : valuesList[i];
      });

      expect(validatePlaceholderValues(placeholders, values)).toBe(false);
    },
  );

  test.prop([fc.constant([])], { numRuns: 100 })(
    'validation passes for templates with no placeholders (empty array)',
    (placeholders) => {
      expect(validatePlaceholderValues(placeholders, {})).toBe(true);
    },
  );
});
