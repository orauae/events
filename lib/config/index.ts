/**
 * Unlayer Configuration Exports
 * 
 * Central export point for all Unlayer email editor configuration.
 */

// Merge Tags
export {
  ORA_MERGE_TAGS,
  REQUIRED_MERGE_TAG_KEYS,
  getAllMergeTagValues,
  validateMergeTagCompleteness,
  isMergeTagGroup,
  type MergeTag,
  type MergeTagGroup,
  type MergeTagConfig,
  type RequiredMergeTagKey,
} from './unlayer-merge-tags';

// Appearance
export {
  ORA_COLORS,
  ORA_UNLAYER_APPEARANCE,
  ORA_UNLAYER_CUSTOM_CSS,
  ORA_DEFAULT_BODY_VALUES,
} from './unlayer-appearance';

// Options
export {
  ORA_UNLAYER_OPTIONS,
  getUnlayerEditorProps,
  getUnlayerMergeTags,
} from './unlayer-options';
