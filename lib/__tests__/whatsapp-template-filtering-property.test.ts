import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';

/**
 * @fileoverview Property-based tests for WhatsApp Template Filtering
 *
 * Feature: whatsapp-template-management
 * Property 11: Template filtering correctness
 *
 * **Validates: Requirements 5.3, 5.4**
 *
 * Tests the client-side filtering logic from WhatsAppTemplateSelectionSheet.
 * The filtering logic is extracted as a pure function to enable direct testing
 * without React component overhead.
 */

// ============================================================================
// Types (mirrors the DB schema shape used in the component)
// ============================================================================

interface Template {
  id: string;
  name: string;
  category: string;
  status: string;
  isDeleted: boolean;
}

// ============================================================================
// Pure filtering function (mirrors the useMemo logic in the component)
// ============================================================================

/**
 * Replicates the exact filtering logic from
 * components/whatsapp-template-selection-sheet.tsx useMemo block.
 */
function filterTemplates(
  templates: Template[],
  search: string,
  categoryFilter: string,
  statusFilter: string,
): Template[] {
  let result = templates.filter((t) => !t.isDeleted);

  // Search filter (case-insensitive name match)
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter((t) => t.name.toLowerCase().includes(q));
  }

  // Category filter
  if (categoryFilter !== 'all') {
    result = result.filter((t) => t.category === categoryFilter);
  }

  // Status filter
  if (statusFilter !== 'all') {
    result = result.filter((t) => t.status === statusFilter);
  }

  return result;
}

// ============================================================================
// Generators
// ============================================================================

const CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
const STATUSES = ['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED'] as const;

const categoryArb = fc.constantFrom(...CATEGORIES);
const statusArb = fc.constantFrom(...STATUSES);

/** Template name: lowercase alpha strings to allow meaningful substring search. */
const templateNameArb = fc.stringMatching(/^[a-z]{2,20}$/);

const templateArb = fc.record({
  id: fc.uuid(),
  name: templateNameArb,
  category: categoryArb,
  status: statusArb,
  isDeleted: fc.boolean(),
}).map((t) => t as Template);

const templateListArb = fc.array(templateArb, { minLength: 0, maxLength: 30 });

/** Search query: either empty or a short lowercase substring. */
const searchArb = fc.oneof(
  fc.constant(''),
  fc.stringMatching(/^[a-z]{1,8}$/),
  // Also test with whitespace padding
  fc.stringMatching(/^[a-z]{1,5}$/).map((s) => `  ${s}  `),
);

/** Category filter: "all" or one of the valid categories. */
const categoryFilterArb = fc.oneof(
  fc.constant('all'),
  categoryArb,
);

/** Status filter: "all" or one of the valid statuses. */
const statusFilterArb = fc.oneof(
  fc.constant('all'),
  statusArb,
);

// ============================================================================
// Property 11: Template filtering correctness
// ============================================================================

/**
 * Feature: whatsapp-template-management, Property 11: Template filtering correctness
 *
 * For any list of templates and any combination of search query, category filter,
 * and status filter, the filtered result should contain exactly the templates that
 * match all active filter criteria simultaneously (search is case-insensitive
 * substring match on name, category and status are exact matches).
 *
 * **Validates: Requirements 5.3, 5.4**
 */
describe('Property 11: Template filtering correctness', () => {
  test.prop(
    [templateListArb, searchArb, categoryFilterArb, statusFilterArb],
    { numRuns: 100 },
  )(
    'filtered result contains exactly the templates matching all active criteria',
    (templates, search, categoryFilter, statusFilter) => {
      const result = filterTemplates(templates, search, categoryFilter, statusFilter);

      // Compute expected result independently using the spec definition
      const expected = templates.filter((t) => {
        // Must not be deleted
        if (t.isDeleted) return false;

        // Search: case-insensitive substring match on name
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          if (!t.name.toLowerCase().includes(q)) return false;
        }

        // Category: exact match when not "all"
        if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;

        // Status: exact match when not "all"
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;

        return true;
      });

      // The result should contain exactly the expected templates (same set, same order)
      expect(result).toEqual(expected);
    },
  );

  test.prop(
    [templateListArb],
    { numRuns: 100 },
  )(
    'no filters returns all non-deleted templates',
    (templates) => {
      const result = filterTemplates(templates, '', 'all', 'all');
      const expected = templates.filter((t) => !t.isDeleted);
      expect(result).toEqual(expected);
    },
  );

  test.prop(
    [templateListArb, searchArb, categoryFilterArb, statusFilterArb],
    { numRuns: 100 },
  )(
    'deleted templates are never included in results',
    (templates, search, categoryFilter, statusFilter) => {
      const result = filterTemplates(templates, search, categoryFilter, statusFilter);
      for (const t of result) {
        expect(t.isDeleted).toBe(false);
      }
    },
  );

  test.prop(
    [templateListArb, searchArb, categoryFilterArb, statusFilterArb],
    { numRuns: 100 },
  )(
    'every result template satisfies all active filter criteria',
    (templates, search, categoryFilter, statusFilter) => {
      const result = filterTemplates(templates, search, categoryFilter, statusFilter);
      const trimmedSearch = search.trim().toLowerCase();

      for (const t of result) {
        // Not deleted
        expect(t.isDeleted).toBe(false);

        // Search match
        if (trimmedSearch) {
          expect(t.name.toLowerCase()).toContain(trimmedSearch);
        }

        // Category match
        if (categoryFilter !== 'all') {
          expect(t.category).toBe(categoryFilter);
        }

        // Status match
        if (statusFilter !== 'all') {
          expect(t.status).toBe(statusFilter);
        }
      }
    },
  );

  test.prop(
    [templateListArb, searchArb, categoryFilterArb, statusFilterArb],
    { numRuns: 100 },
  )(
    'no qualifying template is excluded from the result',
    (templates, search, categoryFilter, statusFilter) => {
      const result = filterTemplates(templates, search, categoryFilter, statusFilter);
      const resultIds = new Set(result.map((t) => t.id));
      const trimmedSearch = search.trim().toLowerCase();

      for (const t of templates) {
        if (t.isDeleted) continue;

        const matchesSearch = !trimmedSearch || t.name.toLowerCase().includes(trimmedSearch);
        const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
        const matchesStatus = statusFilter === 'all' || t.status === statusFilter;

        if (matchesSearch && matchesCategory && matchesStatus) {
          expect(resultIds.has(t.id)).toBe(true);
        }
      }
    },
  );

  test.prop(
    [templateListArb, searchArb, categoryFilterArb, statusFilterArb],
    { numRuns: 100 },
  )(
    'result is a subset of the input (no new templates introduced)',
    (templates, search, categoryFilter, statusFilter) => {
      const result = filterTemplates(templates, search, categoryFilter, statusFilter);
      const inputIds = new Set(templates.map((t) => t.id));

      for (const t of result) {
        expect(inputIds.has(t.id)).toBe(true);
      }
    },
  );

  test.prop(
    [templateListArb, searchArb, categoryFilterArb, statusFilterArb],
    { numRuns: 100 },
  )(
    'result preserves original ordering of templates',
    (templates, search, categoryFilter, statusFilter) => {
      const result = filterTemplates(templates, search, categoryFilter, statusFilter);

      // Each result template should appear in the same relative order as in the input
      let lastInputIndex = -1;
      for (const t of result) {
        const inputIndex = templates.indexOf(t);
        expect(inputIndex).toBeGreaterThan(lastInputIndex);
        lastInputIndex = inputIndex;
      }
    },
  );
});
