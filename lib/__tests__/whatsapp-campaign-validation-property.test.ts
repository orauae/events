import { describe, expect, beforeEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';

/**
 * @fileoverview Property-based tests for WhatsApp campaign template validation
 *
 * Feature: whatsapp-template-management
 * - Property 14: Campaign requires APPROVED template
 *
 * **Validates: Requirements 8.1, 8.2**
 */

// ============================================================================
// Mocks — must be declared before the module import
// ============================================================================

const getTemplateMock = vi.fn();

vi.mock('@/lib/services/whatsapp-template-management-service', () => ({
  WhatsAppTemplateManagementService: {
    getTemplate: (...args: unknown[]) => getTemplateMock(...args),
  },
}));

// Import the function under test AFTER mocks are set up
import { validateWhatsAppCampaignTemplate } from '@/lib/services/campaign-service';

// ============================================================================
// Arbitraries
// ============================================================================

const TEMPLATE_STATUSES = ['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED'] as const;
const NON_APPROVED_STATUSES = ['PENDING', 'REJECTED', 'PAUSED', 'DISABLED'] as const;

/** Arbitrary for a non-empty template ID string. */
const templateIdArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

/** Arbitrary for a template status. */
const templateStatusArb = fc.constantFrom(...TEMPLATE_STATUSES);

/** Arbitrary for a non-approved template status. */
const nonApprovedStatusArb = fc.constantFrom(...NON_APPROVED_STATUSES);

/** Arbitrary for a non-whatsapp channel name. */
const nonWhatsappChannelArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.toLowerCase() !== 'whatsapp' && s.trim().length > 0);

/**
 * Build a minimal template record matching the shape returned by getTemplate.
 */
function buildTemplateRecord(id: string, status: string) {
  return {
    id,
    wabaId: 'waba-test',
    metaTemplateId: 'meta-test',
    name: 'test_template',
    language: 'en_US',
    category: 'MARKETING',
    status,
    components: [],
    isDeleted: false,
    lastSyncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}


// ============================================================================
// Property 14: Campaign requires APPROVED template
// ============================================================================

describe('Property 14: Campaign requires APPROVED template', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 14a — Non-whatsapp channels always pass validation
  // -------------------------------------------------------------------------
  test.prop(
    [nonWhatsappChannelArb, fc.option(templateIdArb, { nil: undefined })],
    { numRuns: 100 },
  )(
    'non-whatsapp channels always pass validation regardless of template',
    async (channel, templateId) => {
      const result = await validateWhatsAppCampaignTemplate(channel, templateId);
      expect(result.valid).toBe(true);
      // getTemplate should never be called for non-whatsapp channels
      expect(getTemplateMock).not.toHaveBeenCalled();
    },
  );

  // -------------------------------------------------------------------------
  // 14b — WhatsApp channel with null/undefined template fails
  // -------------------------------------------------------------------------
  test.prop(
    [fc.constantFrom(null, undefined)],
    { numRuns: 100 },
  )(
    'whatsapp channel with missing template ID fails validation',
    async (templateId) => {
      const result = await validateWhatsAppCampaignTemplate('whatsapp', templateId);
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    },
  );

  // -------------------------------------------------------------------------
  // 14c — WhatsApp channel with APPROVED template passes
  // -------------------------------------------------------------------------
  test.prop(
    [templateIdArb],
    { numRuns: 100 },
  )(
    'whatsapp channel with APPROVED template passes validation',
    async (templateId) => {
      getTemplateMock.mockResolvedValue(buildTemplateRecord(templateId, 'APPROVED'));

      const result = await validateWhatsAppCampaignTemplate('whatsapp', templateId);
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    },
  );

  // -------------------------------------------------------------------------
  // 14d — WhatsApp channel with non-APPROVED template fails
  // -------------------------------------------------------------------------
  test.prop(
    [templateIdArb, nonApprovedStatusArb],
    { numRuns: 100 },
  )(
    'whatsapp channel with non-APPROVED template fails validation',
    async (templateId, status) => {
      getTemplateMock.mockResolvedValue(buildTemplateRecord(templateId, status));

      const result = await validateWhatsAppCampaignTemplate('whatsapp', templateId);
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    },
  );

  // -------------------------------------------------------------------------
  // 14e — WhatsApp channel with template not found fails
  // -------------------------------------------------------------------------
  test.prop(
    [templateIdArb],
    { numRuns: 100 },
  )(
    'whatsapp channel with template not found in DB fails validation',
    async (templateId) => {
      getTemplateMock.mockResolvedValue(null);

      const result = await validateWhatsAppCampaignTemplate('whatsapp', templateId);
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    },
  );

  // -------------------------------------------------------------------------
  // 14f — Validation passes iff template is selected AND APPROVED
  // -------------------------------------------------------------------------
  test.prop(
    [templateIdArb, templateStatusArb],
    { numRuns: 100 },
  )(
    'validation passes if and only if template exists and status is APPROVED',
    async (templateId, status) => {
      getTemplateMock.mockResolvedValue(buildTemplateRecord(templateId, status));

      const result = await validateWhatsAppCampaignTemplate('whatsapp', templateId);

      if (status === 'APPROVED') {
        expect(result.valid).toBe(true);
      } else {
        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
      }
    },
  );
});
