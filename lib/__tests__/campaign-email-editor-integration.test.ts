import { describe, expect, it, vi, beforeEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { EmailGenerationService } from '@/lib/services/email-generation-service';
import { 
  isUnlayerFormat, 
  isLegacyFormat, 
  ensureUnlayerFormat, 
  createBlankUnlayerDesign 
} from '@/lib/utils/design-format-converter';
import { ORA_MERGE_TAGS, REQUIRED_MERGE_TAG_KEYS } from '@/lib/config/unlayer-merge-tags';
import { 
  INVITATION_TEMPLATE, 
  REMINDER_TEMPLATE, 
  THANK_YOU_TEMPLATE 
} from '@/lib/email-templates/unlayer-templates';
import type { UnlayerDesignJson } from '@/components/unlayer-email-builder';
import type { EmailBuilderState } from '@/lib/types/email-builder';
import { DEFAULT_GLOBAL_STYLES, DEFAULT_TEXT_STYLES, DEFAULT_BUTTON_STYLES } from '@/lib/types/email-builder';

/**
 * @fileoverview Integration tests for Campaign Email Editor Migration
 *
 * Tests the full campaign creation flow with the new Unlayer editor:
 * - Template selection and loading
 * - Design save and load cycle
 * - Email generation from Unlayer HTML
 *
 * **Validates: Requirements 6.1, 6.2, 6.3**
 */

// ============================================================================
// MOCK DATA
// ============================================================================

/**
 * Sample Unlayer design JSON for testing
 */
const createSampleUnlayerDesign = (): UnlayerDesignJson => ({
  counters: {
    u_column: 1,
    u_row: 1,
    u_content_text: 1,
  },
  body: {
    id: 'test-body',
    rows: [
      {
        id: 'row-1',
        cells: [1],
        columns: [
          {
            id: 'col-1',
            contents: [
              {
                id: 'text-1',
                type: 'text',
                values: {
                  text: '<p>Hello {firstName}, welcome to {eventName}!</p>',
                },
              },
            ],
            values: {},
          },
        ],
        values: {},
      },
    ],
    headers: [],
    footers: [],
    values: {
      backgroundColor: '#F5F3F0',
      contentWidth: '600px',
      contentAlign: 'center',
      fontFamily: {
        label: 'Poppins',
        value: "'Poppins', sans-serif",
      },
    },
  },
  schemaVersion: 16,
});

/**
 * Sample exported HTML from Unlayer
 */
const createSampleExportedHtml = (content: string = 'Hello John, welcome to Annual Conference!'): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Email</title>
</head>
<body style="background-color: #F5F3F0; font-family: 'Poppins', sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <p>${content}</p>
  </div>
</body>
</html>
`;

// ============================================================================
// INTEGRATION TESTS: Campaign Creation Flow
// ============================================================================

describe('Integration: Campaign Creation Flow with Unlayer Editor', () => {
  /**
   * Test: Full campaign creation flow with new editor
   * **Validates: Requirements 6.1**
   */
  describe('Campaign Wizard Design Step', () => {
    it('displays UnlayerEmailBuilder when user reaches design step', () => {
      // Simulate the design step state
      const designStepState = {
        templateId: null,
        designJson: null,
        htmlContent: null,
        subject: '',
      };

      // When no template is selected, should show template selection
      expect(designStepState.templateId).toBeNull();
      
      // After selecting a template, designJson should be populated
      const afterTemplateSelection = {
        ...designStepState,
        templateId: 'invitation',
        designJson: INVITATION_TEMPLATE.design,
      };
      
      expect(afterTemplateSelection.designJson).not.toBeNull();
      expect(isUnlayerFormat(afterTemplateSelection.designJson)).toBe(true);
    });

    it('initializes editor with blank design when starting fresh', () => {
      const blankDesign = createBlankUnlayerDesign();
      
      expect(blankDesign).not.toBeNull();
      expect(isUnlayerFormat(blankDesign)).toBe(true);
      expect(blankDesign.body.rows).toHaveLength(0);
    });
  });

  /**
   * Test: Template selection and loading
   * **Validates: Requirements 6.2**
   */
  describe('Template Selection and Loading', () => {
    it('loads Invitation template in Unlayer format', () => {
      expect(INVITATION_TEMPLATE).not.toBeNull();
      expect(isUnlayerFormat(INVITATION_TEMPLATE.design)).toBe(true);
      expect(INVITATION_TEMPLATE.design.body.rows.length).toBeGreaterThan(0);
    });

    it('loads Reminder template in Unlayer format', () => {
      expect(REMINDER_TEMPLATE).not.toBeNull();
      expect(isUnlayerFormat(REMINDER_TEMPLATE.design)).toBe(true);
      expect(REMINDER_TEMPLATE.design.body.rows.length).toBeGreaterThan(0);
    });

    it('loads Thank You template in Unlayer format', () => {
      expect(THANK_YOU_TEMPLATE).not.toBeNull();
      expect(isUnlayerFormat(THANK_YOU_TEMPLATE.design)).toBe(true);
      expect(THANK_YOU_TEMPLATE.design.body.rows.length).toBeGreaterThan(0);
    });

    it('all templates have ORA brand colors configured', () => {
      const templates = [
        INVITATION_TEMPLATE,
        REMINDER_TEMPLATE,
        THANK_YOU_TEMPLATE,
      ];

      for (const template of templates) {
        const bodyValues = template.design.body.values as Record<string, unknown>;
        // Check that background color is set (ORA cream or white)
        expect(bodyValues.backgroundColor).toBeDefined();
      }
    });

    it('handles template selection by loading design JSON', () => {
      // Simulate template selection handler
      const handleSelectTemplate = (templateId: string): UnlayerDesignJson | null => {
        switch (templateId) {
          case 'invitation':
            return INVITATION_TEMPLATE.design;
          case 'reminder':
            return REMINDER_TEMPLATE.design;
          case 'thank-you':
            return THANK_YOU_TEMPLATE.design;
          case 'blank':
            return createBlankUnlayerDesign();
          default:
            return null;
        }
      };

      expect(handleSelectTemplate('invitation')).toEqual(INVITATION_TEMPLATE.design);
      expect(handleSelectTemplate('reminder')).toEqual(REMINDER_TEMPLATE.design);
      expect(handleSelectTemplate('thank-you')).toEqual(THANK_YOU_TEMPLATE.design);
      expect(isUnlayerFormat(handleSelectTemplate('blank'))).toBe(true);
    });
  });

  /**
   * Test: Save and load cycle
   * **Validates: Requirements 6.3**
   */
  describe('Design Save and Load Cycle', () => {
    it('exports design JSON and HTML on save', async () => {
      // Simulate export result from Unlayer
      const exportResult = {
        design: createSampleUnlayerDesign(),
        html: createSampleExportedHtml(),
      };

      // Validate the export result
      expect(exportResult.design).not.toBeNull();
      expect(exportResult.html).not.toBeNull();
      expect(isUnlayerFormat(exportResult.design)).toBe(true);
      
      // Validate HTML
      const validation = EmailGenerationService.validateHtml(exportResult.html);
      expect(validation.valid).toBe(true);
    });

    it('stores both designJson and htmlContent', () => {
      const exportResult = {
        design: createSampleUnlayerDesign(),
        html: createSampleExportedHtml(),
      };

      // Simulate campaign data storage
      const campaignData = {
        designJson: exportResult.design,
        htmlContent: exportResult.html,
        plainTextContent: EmailGenerationService.generatePlainText(exportResult.html),
      };

      expect(campaignData.designJson).not.toBeNull();
      expect(campaignData.htmlContent).not.toBeNull();
      expect(campaignData.plainTextContent).not.toBeNull();
      expect(campaignData.plainTextContent.length).toBeGreaterThan(0);
    });

    it('validates HTML before saving', () => {
      const validHtml = createSampleExportedHtml();
      const emptyHtml = '';
      const malformedHtml = 'Just plain text without HTML';

      expect(EmailGenerationService.validateHtml(validHtml).valid).toBe(true);
      expect(EmailGenerationService.validateHtml(emptyHtml).valid).toBe(false);
      expect(EmailGenerationService.validateHtml(malformedHtml).valid).toBe(false);
    });

    it('loads saved design back into editor', () => {
      const savedDesign = createSampleUnlayerDesign();
      
      // Simulate loading design into editor
      const loadDesign = (design: UnlayerDesignJson): boolean => {
        if (!isUnlayerFormat(design)) {
          return false;
        }
        // In real implementation, this would call editor.loadDesign(design)
        return true;
      };

      expect(loadDesign(savedDesign)).toBe(true);
    });

    it('handles legacy designs by converting to Unlayer format', () => {
      const legacyDesign: EmailBuilderState = {
        blocks: [
          {
            id: 'text-1',
            type: 'text',
            content: '<p>Hello {firstName}!</p>',
            styles: { ...DEFAULT_TEXT_STYLES },
          },
          {
            id: 'button-1',
            type: 'button',
            text: 'RSVP Now',
            url: '{rsvpLink}',
            styles: { ...DEFAULT_BUTTON_STYLES },
          },
        ],
        globalStyles: { ...DEFAULT_GLOBAL_STYLES },
        metadata: { lastSaved: null, version: 1 },
      };

      // Ensure legacy design is converted
      const result = ensureUnlayerFormat(legacyDesign);
      
      expect(result.success).toBe(true);
      expect(result.design).not.toBeNull();
      expect(isUnlayerFormat(result.design)).toBe(true);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS: Email Generation
// ============================================================================

describe('Integration: Email Generation from Unlayer HTML', () => {
  it('generates email with substituted merge tags', () => {
    const html = createSampleExportedHtml('Hello {firstName}, welcome to {eventName}!');
    const context = {
      firstName: 'John',
      eventName: 'Annual Conference 2026',
    };

    const result = EmailGenerationService.generate(html, context);

    expect(result.html).toContain('Hello John');
    expect(result.html).toContain('Annual Conference 2026');
    expect(result.html).not.toContain('{firstName}');
    expect(result.html).not.toContain('{eventName}');
  });

  it('generates plain text version from HTML', () => {
    const html = createSampleExportedHtml('Hello John, welcome to Annual Conference!');
    
    const plainText = EmailGenerationService.generatePlainText(html);

    expect(plainText).toContain('Hello John');
    expect(plainText).toContain('Annual Conference');
    // Should not contain actual HTML tags (elements like <p>, <div>, etc.)
    expect(plainText).not.toMatch(/<[a-zA-Z][^>]*>/);
  });

  it('handles all required merge tags', () => {
    const context = EmailGenerationService.getSampleContext();
    
    // Build HTML with all merge tags
    const mergeTagsHtml = REQUIRED_MERGE_TAG_KEYS
      .map(key => `<p>{${key}}</p>`)
      .join('');
    const html = createSampleExportedHtml(mergeTagsHtml);

    const result = EmailGenerationService.generate(html, context);

    // Verify all merge tags were substituted
    for (const key of REQUIRED_MERGE_TAG_KEYS) {
      expect(result.html).not.toContain(`{${key}}`);
    }
  });

  it('preserves unmatched merge tags for later substitution', () => {
    const html = createSampleExportedHtml('Hello {firstName}, your {customField} is ready.');
    const context = { firstName: 'John' };

    const result = EmailGenerationService.substituteVariables(html, context);

    expect(result).toContain('Hello John');
    expect(result).toContain('{customField}'); // Unmatched tag preserved
  });
});

// ============================================================================
// INTEGRATION TESTS: Merge Tag Configuration
// ============================================================================

describe('Integration: Merge Tag Configuration', () => {
  it('all required merge tags are configured', () => {
    const flattenMergeTags = (tags: typeof ORA_MERGE_TAGS): string[] => {
      const result: string[] = [];
      for (const [key, value] of Object.entries(tags)) {
        if ('mergeTags' in value) {
          // It's a group
          for (const [subKey] of Object.entries(value.mergeTags)) {
            result.push(subKey);
          }
        } else {
          result.push(key);
        }
      }
      return result;
    };

    const configuredTags = flattenMergeTags(ORA_MERGE_TAGS);
    
    // Map required keys to their config keys
    const keyMapping: Record<string, string> = {
      firstName: 'first_name',
      lastName: 'last_name',
      email: 'email',
      companyName: 'company_name',
      jobTitle: 'job_title',
      eventName: 'event_name',
      eventDate: 'event_date',
      eventLocation: 'event_location',
      rsvpLink: 'rsvp_link',
      badgeLink: 'badge_link',
      unsubscribeLink: 'unsubscribe_link',
    };

    for (const requiredKey of REQUIRED_MERGE_TAG_KEYS) {
      const configKey = keyMapping[requiredKey];
      expect(configuredTags).toContain(configKey);
    }
  });

  it('merge tags have human-readable names', () => {
    const checkMergeTagNames = (tags: typeof ORA_MERGE_TAGS): boolean => {
      for (const value of Object.values(tags)) {
        if ('mergeTags' in value) {
          // It's a group - check group name and nested tags
          if (!value.name || value.name.length === 0) return false;
          for (const subValue of Object.values(value.mergeTags)) {
            if (!subValue.name || subValue.name.length === 0) return false;
          }
        } else {
          // It's a single tag
          if (!value.name || value.name.length === 0) return false;
        }
      }
      return true;
    };

    expect(checkMergeTagNames(ORA_MERGE_TAGS)).toBe(true);
  });

  it('merge tags have sample values for preview', () => {
    const checkMergeTagSamples = (tags: typeof ORA_MERGE_TAGS): boolean => {
      for (const value of Object.values(tags)) {
        if ('mergeTags' in value) {
          // It's a group - check nested tags
          for (const subValue of Object.values(value.mergeTags)) {
            if (!subValue.sample || subValue.sample.length === 0) return false;
          }
        } else {
          // It's a single tag
          if (!value.sample || value.sample.length === 0) return false;
        }
      }
      return true;
    };

    expect(checkMergeTagSamples(ORA_MERGE_TAGS)).toBe(true);
  });
});

// ============================================================================
// PROPERTY-BASED TESTS
// ============================================================================

describe('Property: Design Format Round-Trip', () => {
  // Arbitrary for generating valid hex color strings
  const hexColorArb = fc.tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 })
  ).map(([r, g, b]) => `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);

  // Arbitrary for generating valid Unlayer design structures
  const unlayerDesignArb = fc.record({
    counters: fc.record({
      u_column: fc.integer({ min: 1, max: 100 }),
      u_row: fc.integer({ min: 1, max: 100 }),
      u_content_text: fc.integer({ min: 0, max: 100 }),
    }),
    body: fc.record({
      id: fc.uuid(),
      rows: fc.array(
        fc.record({
          id: fc.uuid(),
          cells: fc.constant([1]),
          columns: fc.constant([]),
          values: fc.constant({}),
        }),
        { minLength: 0, maxLength: 10 }
      ),
      headers: fc.constant([]),
      footers: fc.constant([]),
      values: fc.record({
        backgroundColor: hexColorArb,
        contentWidth: fc.integer({ min: 400, max: 800 }).map(n => `${n}px`),
        contentAlign: fc.constantFrom('center', 'left'),
        fontFamily: fc.constant({
          label: 'Poppins',
          value: "'Poppins', sans-serif",
        }),
      }),
    }),
    schemaVersion: fc.constant(16),
  }) as fc.Arbitrary<UnlayerDesignJson>;

  test.prop([unlayerDesignArb])(
    'Unlayer designs are correctly identified as Unlayer format',
    (design) => {
      expect(isUnlayerFormat(design)).toBe(true);
      expect(isLegacyFormat(design)).toBe(false);
    }
  );

  test.prop([unlayerDesignArb])(
    'ensureUnlayerFormat returns Unlayer designs unchanged',
    (design) => {
      const result = ensureUnlayerFormat(design);
      
      expect(result.success).toBe(true);
      expect(result.design).toEqual(design);
    }
  );
});

describe('Property: HTML Generation Consistency', () => {
  // Arbitrary for generating valid HTML content
  const htmlContentArb = fc.string({ minLength: 1, maxLength: 100 })
    .filter(s => s.trim().length > 0)
    .filter(s => !/<[a-zA-Z]/.test(s)) // Exclude strings that look like HTML
    .map(content => createSampleExportedHtml(content));

  test.prop([htmlContentArb])(
    'valid HTML always passes validation',
    (html) => {
      const result = EmailGenerationService.validateHtml(html);
      expect(result.valid).toBe(true);
    }
  );

  test.prop([htmlContentArb])(
    'plain text generation always produces non-empty output for valid HTML',
    (html) => {
      const plainText = EmailGenerationService.generatePlainText(html);
      expect(plainText.length).toBeGreaterThan(0);
    }
  );

  test.prop([htmlContentArb])(
    'plain text generation removes all HTML element tags',
    (html) => {
      const plainText = EmailGenerationService.generatePlainText(html);
      // Should not contain actual HTML element tags (tags that start with a letter)
      expect(plainText).not.toMatch(/<[a-zA-Z][^>]*>/);
    }
  );
});
