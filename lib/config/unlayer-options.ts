/**
 * Unlayer Editor Options Configuration
 * 
 * Defines the editor options including display mode, fonts, and features.
 * Follows the official Unlayer React component API:
 * @see https://docs.unlayer.com/builder/react-component
 * @see https://docs.unlayer.com/builder/installation
 */

import type { EmailEditorProps } from 'react-email-editor';
import { ORA_MERGE_TAGS } from './unlayer-merge-tags';
import { ORA_UNLAYER_APPEARANCE, ORA_UNLAYER_CUSTOM_CSS } from './unlayer-appearance';

/**
 * Unlayer Editor Options
 * 
 * Configuration passed to the <EmailEditor options={...} /> prop.
 * 
 * Key notes from Unlayer docs:
 * - `appearance` goes inside `options` (per official React example)
 * - `customCSS` accepts string | string[] — paid feature, kept as fallback
 * - `displayMode: 'email'` loads the email builder
 * - Container should be at least 1024px wide and 700px high
 */
export const ORA_UNLAYER_OPTIONS: Partial<EmailEditorProps['options']> = {
  displayMode: 'email',
  version: 'latest',
  appearance: ORA_UNLAYER_APPEARANCE,
  features: {
    preview: true,
    imageEditor: true,
    undoRedo: true,
    stockImages: {
      enabled: true,
      safeSearch: true,
      defaultSearchTerm: 'event',
    },
    textEditor: {
      spellChecker: true,
      tables: true,
      cleanPaste: true,
    },
  },
  fonts: {
    showDefaultFonts: true,
    customFonts: [
      {
        label: 'Poppins',
        value: "'Poppins', sans-serif",
        url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
      },
      {
        label: 'Inter',
        value: "'Inter', sans-serif",
        url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
      },
      {
        label: 'Playfair Display',
        value: "'Playfair Display', serif",
        url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap',
      },
    ],
  },
  specialLinks: {
    event_links: {
      name: 'Event Links',
      specialLinks: {
        rsvp_link: { name: 'RSVP Link', href: '{rsvpLink}', target: '_blank' },
        badge_link: { name: 'Badge Link', href: '{badgeLink}', target: '_blank' },
        unsubscribe_link: { name: 'Unsubscribe Link', href: '{unsubscribeLink}', target: '_blank' },
      },
    },
  },
  tools: {
    // Use default tool configurations
  },
  editor: {
    autoSelectOnDrop: true,
    confirmOnDelete: true,
  },
  // customCSS is a paid feature (Optimize plan). Kept as fallback
  // for when a paid projectId is configured.
  customCSS: ORA_UNLAYER_CUSTOM_CSS,
};

/**
 * Get the complete Unlayer editor props configuration
 * 
 * Per the official React component docs, appearance is passed inside `options`.
 * @see https://github.com/unlayer/react-email-editor/blob/master/demo/src/example/index.tsx
 */
export function getUnlayerEditorProps(): Partial<EmailEditorProps> {
  return {
    options: {
      ...ORA_UNLAYER_OPTIONS,
      mergeTags: ORA_MERGE_TAGS,
    },
  };
}

/**
 * Get merge tags configuration for Unlayer
 */
export function getUnlayerMergeTags() {
  return ORA_MERGE_TAGS;
}

// Re-export for convenience
export { ORA_MERGE_TAGS } from './unlayer-merge-tags';
export { ORA_UNLAYER_APPEARANCE, ORA_COLORS, ORA_DEFAULT_BODY_VALUES } from './unlayer-appearance';
