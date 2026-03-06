import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  isLegacyFormat,
  isUnlayerFormat,
  convertLegacyToUnlayer,
  ensureUnlayerFormat,
  createBlankUnlayerDesign,
} from '@/lib/utils/design-format-converter';
import type { EmailBuilderState, Block, TextBlock, ButtonBlock, DividerBlock, SpacerBlock } from '@/lib/types/email-builder';
import { DEFAULT_GLOBAL_STYLES, DEFAULT_TEXT_STYLES, DEFAULT_BUTTON_STYLES, DEFAULT_DIVIDER_STYLES } from '@/lib/types/email-builder';
import type { UnlayerDesignJson } from '@/components/unlayer-email-builder';

/**
 * @fileoverview Property-based tests for Design Format Converter
 *
 * Feature: react-email-editor-migration, Property: Backward Compatibility
 *
 * Property: For any valid legacy EmailBuilderState design, the system SHALL
 * successfully convert it to Unlayer format while preserving the essential
 * content structure, allowing legacy campaigns to still be loaded and sent.
 *
 * **Validates: Requirements 7.4**
 */

// ============================================================================
// ARBITRARIES
// ============================================================================

/**
 * Arbitrary for generating valid text content with merge tags
 */
const textContentArb = fc.oneof(
  fc.constant('<p>Hello {firstName}!</p>'),
  fc.constant('<p>Welcome to {eventName}</p>'),
  fc.constant('<h1>Event on {eventDate}</h1>'),
  fc.constant('<p>Location: {eventLocation}</p>'),
  fc.string({ minLength: 1, maxLength: 200 }).map(s => `<p>${s}</p>`)
);

/**
 * Arbitrary for generating valid hex color strings
 */
const hexColorArb = fc.tuple(
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 })
).map(([r, g, b]) => `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);

/**
 * Arbitrary for generating valid text styles
 */
const textStylesArb = fc.record({
  fontSize: fc.integer({ min: 10, max: 48 }),
  color: hexColorArb,
  textAlign: fc.constantFrom('left', 'center', 'right') as fc.Arbitrary<'left' | 'center' | 'right'>,
  fontWeight: fc.constantFrom('normal', 'bold') as fc.Arbitrary<'normal' | 'bold'>,
  fontStyle: fc.constantFrom('normal', 'italic') as fc.Arbitrary<'normal' | 'italic'>,
  lineHeight: fc.double({ min: 1, max: 2, noNaN: true }),
});

/**
 * Arbitrary for generating valid TextBlock
 */
const textBlockArb: fc.Arbitrary<TextBlock> = fc.record({
  id: fc.uuid(),
  type: fc.constant('text' as const),
  content: textContentArb,
  styles: textStylesArb,
});

/**
 * Arbitrary for generating valid button styles
 */
const buttonStylesArb = fc.record({
  backgroundColor: hexColorArb,
  textColor: hexColorArb,
  borderRadius: fc.integer({ min: 0, max: 50 }),
  paddingVertical: fc.integer({ min: 4, max: 24 }),
  paddingHorizontal: fc.integer({ min: 8, max: 48 }),
  fontSize: fc.integer({ min: 12, max: 24 }),
});

/**
 * Arbitrary for generating valid ButtonBlock
 */
const buttonBlockArb: fc.Arbitrary<ButtonBlock> = fc.record({
  id: fc.uuid(),
  type: fc.constant('button' as const),
  text: fc.string({ minLength: 1, maxLength: 50 }),
  url: fc.oneof(
    fc.constant('{rsvpLink}'),
    fc.constant('{badgeLink}'),
    fc.webUrl()
  ),
  styles: buttonStylesArb,
});

/**
 * Arbitrary for generating valid divider styles
 */
const dividerStylesArb = fc.record({
  color: hexColorArb,
  thickness: fc.integer({ min: 1, max: 5 }),
  width: fc.integer({ min: 50, max: 100 }),
  style: fc.constantFrom('solid', 'dashed', 'dotted') as fc.Arbitrary<'solid' | 'dashed' | 'dotted'>,
});

/**
 * Arbitrary for generating valid DividerBlock
 */
const dividerBlockArb: fc.Arbitrary<DividerBlock> = fc.record({
  id: fc.uuid(),
  type: fc.constant('divider' as const),
  styles: dividerStylesArb,
});

/**
 * Arbitrary for generating valid SpacerBlock
 */
const spacerBlockArb: fc.Arbitrary<SpacerBlock> = fc.record({
  id: fc.uuid(),
  type: fc.constant('spacer' as const),
  height: fc.integer({ min: 10, max: 100 }),
});

/**
 * Arbitrary for generating a mix of blocks
 */
const blockArb: fc.Arbitrary<Block> = fc.oneof(
  textBlockArb,
  buttonBlockArb,
  dividerBlockArb,
  spacerBlockArb
) as fc.Arbitrary<Block>;

/**
 * Arbitrary for generating valid global styles
 */
const globalStylesArb = fc.record({
  backgroundColor: hexColorArb,
  contentBackgroundColor: hexColorArb,
  contentWidth: fc.integer({ min: 400, max: 800 }),
  fontFamily: fc.constantFrom(
    'Poppins, Arial, sans-serif',
    'Arial, sans-serif',
    'Georgia, serif'
  ),
  padding: fc.integer({ min: 10, max: 40 }),
});

/**
 * Arbitrary for generating valid EmailBuilderState
 */
const emailBuilderStateArb: fc.Arbitrary<EmailBuilderState> = fc.record({
  blocks: fc.array(blockArb, { minLength: 0, maxLength: 10 }),
  globalStyles: globalStylesArb,
  metadata: fc.record({
    lastSaved: fc.option(
      fc.integer({ min: 1577836800000, max: 1924905600000 }) // 2020-01-01 to 2030-12-31 in milliseconds
        .map(ms => new Date(ms).toISOString()), 
      { nil: null }
    ),
    version: fc.integer({ min: 1, max: 10 }),
  }),
});

// ============================================================================
// PROPERTY TESTS
// ============================================================================

/**
 * Feature: react-email-editor-migration, Property: Backward Compatibility
 * **Validates: Requirements 7.4**
 */
describe('Property: Backward Compatibility - Legacy Design Format Conversion', () => {
  
  test.prop([emailBuilderStateArb])(
    'legacy EmailBuilderState is correctly detected as legacy format',
    (legacyDesign) => {
      expect(isLegacyFormat(legacyDesign)).toBe(true);
      expect(isUnlayerFormat(legacyDesign)).toBe(false);
    }
  );

  test.prop([emailBuilderStateArb])(
    'legacy designs can be successfully converted to Unlayer format',
    (legacyDesign) => {
      const result = convertLegacyToUnlayer(legacyDesign);
      
      expect(result.success).toBe(true);
      expect(result.design).not.toBeNull();
      expect(result.error).toBeUndefined();
    }
  );

  test.prop([emailBuilderStateArb])(
    'converted designs have valid Unlayer structure',
    (legacyDesign) => {
      const result = convertLegacyToUnlayer(legacyDesign);
      
      if (result.success && result.design) {
        // Check Unlayer structure
        expect(result.design).toHaveProperty('body');
        expect(result.design).toHaveProperty('counters');
        expect(result.design.body).toHaveProperty('rows');
        expect(result.design.body).toHaveProperty('values');
        expect(Array.isArray(result.design.body.rows)).toBe(true);
        
        // Verify it's detected as Unlayer format
        expect(isUnlayerFormat(result.design)).toBe(true);
        expect(isLegacyFormat(result.design)).toBe(false);
      }
    }
  );

  test.prop([emailBuilderStateArb])(
    'converted designs preserve the number of content blocks',
    (legacyDesign) => {
      const result = convertLegacyToUnlayer(legacyDesign);
      
      if (result.success && result.design) {
        // Each legacy block should become at least one row
        // (some blocks like header/footer may create multiple rows)
        const legacyBlockCount = legacyDesign.blocks.length;
        const unlayerRowCount = result.design.body.rows.length;
        
        // The number of rows should be at least equal to the number of blocks
        // (could be more due to header/footer expansion)
        expect(unlayerRowCount).toBeGreaterThanOrEqual(legacyBlockCount);
      }
    }
  );

  test.prop([emailBuilderStateArb])(
    'converted designs preserve global background color',
    (legacyDesign) => {
      const result = convertLegacyToUnlayer(legacyDesign);
      
      if (result.success && result.design) {
        const bodyValues = result.design.body.values as Record<string, unknown>;
        expect(bodyValues.backgroundColor).toBe(legacyDesign.globalStyles.backgroundColor);
      }
    }
  );

  test.prop([emailBuilderStateArb])(
    'converted designs preserve content width',
    (legacyDesign) => {
      const result = convertLegacyToUnlayer(legacyDesign);
      
      if (result.success && result.design) {
        const bodyValues = result.design.body.values as Record<string, unknown>;
        expect(bodyValues.contentWidth).toBe(`${legacyDesign.globalStyles.contentWidth}px`);
      }
    }
  );

  test.prop([emailBuilderStateArb])(
    'ensureUnlayerFormat handles legacy designs correctly',
    (legacyDesign) => {
      const result = ensureUnlayerFormat(legacyDesign);
      
      expect(result.success).toBe(true);
      expect(result.design).not.toBeNull();
      
      if (result.design) {
        expect(isUnlayerFormat(result.design)).toBe(true);
      }
    }
  );
});

/**
 * Tests for Unlayer format detection
 */
describe('Unlayer Format Detection', () => {
  it('correctly identifies blank Unlayer design', () => {
    const blankDesign = createBlankUnlayerDesign();
    
    expect(isUnlayerFormat(blankDesign)).toBe(true);
    expect(isLegacyFormat(blankDesign)).toBe(false);
  });

  it('ensureUnlayerFormat returns Unlayer designs unchanged', () => {
    const unlayerDesign = createBlankUnlayerDesign();
    const result = ensureUnlayerFormat(unlayerDesign);
    
    expect(result.success).toBe(true);
    expect(result.design).toEqual(unlayerDesign);
  });

  it('handles null/undefined gracefully', () => {
    expect(isLegacyFormat(null)).toBe(false);
    expect(isLegacyFormat(undefined)).toBe(false);
    expect(isUnlayerFormat(null)).toBe(false);
    expect(isUnlayerFormat(undefined)).toBe(false);
  });

  it('handles non-object values gracefully', () => {
    expect(isLegacyFormat('string')).toBe(false);
    expect(isLegacyFormat(123)).toBe(false);
    expect(isLegacyFormat([])).toBe(false);
    expect(isUnlayerFormat('string')).toBe(false);
    expect(isUnlayerFormat(123)).toBe(false);
    expect(isUnlayerFormat([])).toBe(false);
  });

  it('ensureUnlayerFormat returns error for unknown formats', () => {
    const unknownFormat = { foo: 'bar' };
    const result = ensureUnlayerFormat(unknownFormat);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown design format');
  });
});

/**
 * Tests for specific block type conversions
 */
describe('Block Type Conversions', () => {
  it('converts text blocks with merge tags', () => {
    const legacyDesign: EmailBuilderState = {
      blocks: [
        {
          id: 'text-1',
          type: 'text',
          content: '<p>Hello {firstName}, welcome to {eventName}!</p>',
          styles: { ...DEFAULT_TEXT_STYLES },
        },
      ],
      globalStyles: { ...DEFAULT_GLOBAL_STYLES },
      metadata: { lastSaved: null, version: 1 },
    };

    const result = convertLegacyToUnlayer(legacyDesign);
    
    expect(result.success).toBe(true);
    expect(result.design?.body.rows.length).toBe(1);
  });

  it('converts button blocks with RSVP links', () => {
    const legacyDesign: EmailBuilderState = {
      blocks: [
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

    const result = convertLegacyToUnlayer(legacyDesign);
    
    expect(result.success).toBe(true);
    expect(result.design?.body.rows.length).toBe(1);
  });

  it('converts divider blocks', () => {
    const legacyDesign: EmailBuilderState = {
      blocks: [
        {
          id: 'divider-1',
          type: 'divider',
          styles: { ...DEFAULT_DIVIDER_STYLES },
        },
      ],
      globalStyles: { ...DEFAULT_GLOBAL_STYLES },
      metadata: { lastSaved: null, version: 1 },
    };

    const result = convertLegacyToUnlayer(legacyDesign);
    
    expect(result.success).toBe(true);
    expect(result.design?.body.rows.length).toBe(1);
  });

  it('converts spacer blocks', () => {
    const legacyDesign: EmailBuilderState = {
      blocks: [
        {
          id: 'spacer-1',
          type: 'spacer',
          height: 30,
        },
      ],
      globalStyles: { ...DEFAULT_GLOBAL_STYLES },
      metadata: { lastSaved: null, version: 1 },
    };

    const result = convertLegacyToUnlayer(legacyDesign);
    
    expect(result.success).toBe(true);
    expect(result.design?.body.rows.length).toBe(1);
  });

  it('converts empty designs', () => {
    const legacyDesign: EmailBuilderState = {
      blocks: [],
      globalStyles: { ...DEFAULT_GLOBAL_STYLES },
      metadata: { lastSaved: null, version: 1 },
    };

    const result = convertLegacyToUnlayer(legacyDesign);
    
    expect(result.success).toBe(true);
    expect(result.design?.body.rows.length).toBe(0);
  });

  it('converts complex designs with multiple block types', () => {
    const legacyDesign: EmailBuilderState = {
      blocks: [
        {
          id: 'text-1',
          type: 'text',
          content: '<h1>Welcome!</h1>',
          styles: { ...DEFAULT_TEXT_STYLES, fontSize: 28, textAlign: 'center' },
        },
        {
          id: 'spacer-1',
          type: 'spacer',
          height: 20,
        },
        {
          id: 'text-2',
          type: 'text',
          content: '<p>Dear {firstName},</p>',
          styles: { ...DEFAULT_TEXT_STYLES },
        },
        {
          id: 'divider-1',
          type: 'divider',
          styles: { ...DEFAULT_DIVIDER_STYLES },
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

    const result = convertLegacyToUnlayer(legacyDesign);
    
    expect(result.success).toBe(true);
    expect(result.design?.body.rows.length).toBe(5);
  });
});
