import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  ORA_MERGE_TAGS,
  REQUIRED_MERGE_TAG_KEYS,
  getAllMergeTagValues,
  validateMergeTagCompleteness,
  isMergeTagGroup,
  type MergeTag,
  type MergeTagConfig,
} from '@/lib/config/unlayer-merge-tags';

/**
 * @fileoverview Property-based tests for merge tag configuration
 *
 * Feature: react-email-editor-migration, Property 1: Merge Tag Configuration Completeness
 *
 * For any merge tag in the ORA_MERGE_TAGS configuration, the tag SHALL have a
 * non-empty `name` property (human-readable) and a non-empty `value` property
 * (template syntax), and the configuration SHALL include all required merge tags:
 * firstName, lastName, email, companyName, jobTitle, eventName, eventDate,
 * eventLocation, rsvpLink, badgeLink, unsubscribeLink.
 *
 * **Validates: Requirements 3.1, 3.3**
 */

/**
 * Helper to extract all individual merge tags from the configuration
 */
function extractAllMergeTags(config: Record<string, MergeTagConfig>): MergeTag[] {
  const tags: MergeTag[] = [];
  
  for (const item of Object.values(config)) {
    if (isMergeTagGroup(item)) {
      tags.push(...Object.values(item.mergeTags));
    } else {
      tags.push(item);
    }
  }
  
  return tags;
}

/**
 * Feature: react-email-editor-migration, Property 1: Merge Tag Configuration Completeness
 * **Validates: Requirements 3.1, 3.3**
 */
describe('Property 1: Merge Tag Configuration Completeness', () => {
  const allMergeTags = extractAllMergeTags(ORA_MERGE_TAGS);
  
  // Arbitrary for selecting any merge tag from the configuration
  const mergeTagArb = fc.constantFrom(...allMergeTags);
  
  test.prop([mergeTagArb], { numRuns: allMergeTags.length })(
    'every merge tag has a non-empty name property',
    (tag) => {
      expect(tag.name).toBeDefined();
      expect(typeof tag.name).toBe('string');
      expect(tag.name.trim().length).toBeGreaterThan(0);
    }
  );

  test.prop([mergeTagArb], { numRuns: allMergeTags.length })(
    'every merge tag has a non-empty value property',
    (tag) => {
      expect(tag.value).toBeDefined();
      expect(typeof tag.value).toBe('string');
      expect(tag.value.trim().length).toBeGreaterThan(0);
    }
  );

  test.prop([mergeTagArb], { numRuns: allMergeTags.length })(
    'every merge tag value follows the {variableName} format',
    (tag) => {
      // Value should match pattern {variableName}
      const pattern = /^\{[a-zA-Z][a-zA-Z0-9]*\}$/;
      expect(tag.value).toMatch(pattern);
    }
  );

  // Arbitrary for selecting any required key
  const requiredKeyArb = fc.constantFrom(...REQUIRED_MERGE_TAG_KEYS);

  test.prop([requiredKeyArb], { numRuns: REQUIRED_MERGE_TAG_KEYS.length })(
    'all required merge tag keys are present in the configuration',
    (requiredKey) => {
      const allTagValues = getAllMergeTagValues();
      expect(allTagValues.has(requiredKey)).toBe(true);
      
      const tag = allTagValues.get(requiredKey);
      expect(tag).toBeDefined();
      expect(tag!.name.length).toBeGreaterThan(0);
      expect(tag!.value).toBe(`{${requiredKey}}`);
    }
  );

  describe('configuration validation', () => {
    it('validateMergeTagCompleteness returns valid: true when all required tags are present', () => {
      const result = validateMergeTagCompleteness();
      expect(result.valid).toBe(true);
      expect(result.missingKeys).toHaveLength(0);
      expect(result.presentKeys).toHaveLength(REQUIRED_MERGE_TAG_KEYS.length);
    });

    it('all required merge tags are accounted for', () => {
      const result = validateMergeTagCompleteness();
      
      for (const key of REQUIRED_MERGE_TAG_KEYS) {
        expect(result.presentKeys).toContain(key);
      }
    });
  });

  describe('merge tag groups', () => {
    // Arbitrary for selecting any group from the configuration
    const groupEntries = Object.entries(ORA_MERGE_TAGS).filter(
      ([_, config]) => isMergeTagGroup(config)
    );
    
    if (groupEntries.length > 0) {
      const groupArb = fc.constantFrom(...groupEntries);

      test.prop([groupArb], { numRuns: groupEntries.length })(
        'every merge tag group has a non-empty name',
        ([_, group]) => {
          if (isMergeTagGroup(group)) {
            expect(group.name).toBeDefined();
            expect(typeof group.name).toBe('string');
            expect(group.name.trim().length).toBeGreaterThan(0);
          }
        }
      );

      test.prop([groupArb], { numRuns: groupEntries.length })(
        'every merge tag group has at least one merge tag',
        ([_, group]) => {
          if (isMergeTagGroup(group)) {
            expect(Object.keys(group.mergeTags).length).toBeGreaterThan(0);
          }
        }
      );
    }
  });

  describe('sample values', () => {
    // Filter tags that have sample values
    const tagsWithSamples = allMergeTags.filter(tag => tag.sample !== undefined);
    
    if (tagsWithSamples.length > 0) {
      const tagWithSampleArb = fc.constantFrom(...tagsWithSamples);

      test.prop([tagWithSampleArb], { numRuns: tagsWithSamples.length })(
        'merge tags with sample values have non-empty samples',
        (tag) => {
          if (tag.sample !== undefined) {
            expect(typeof tag.sample).toBe('string');
            expect(tag.sample.length).toBeGreaterThan(0);
          }
        }
      );
    }
  });

  describe('human-readable names', () => {
    test.prop([mergeTagArb], { numRuns: allMergeTags.length })(
      'merge tag names are human-readable (contain spaces or capital letters)',
      (tag) => {
        // Human-readable names typically have spaces or start with capital letters
        const hasSpace = tag.name.includes(' ');
        const startsWithCapital = /^[A-Z]/.test(tag.name);
        expect(hasSpace || startsWithCapital).toBe(true);
      }
    );
  });
});
