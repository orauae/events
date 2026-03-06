/**
 * Unlayer Appearance Configuration
 * 
 * Defines the visual appearance and branding for the Unlayer email editor.
 * Uses ORA brand colors and design system guidelines.
 */

/**
 * ORA Brand Colors
 */
export const ORA_COLORS = {
  gold: '#B8956B',
  charcoal: '#2C2C2C',
  cream: '#F5F3F0',
  graphite: '#6B6B6B',
  stone: '#9A9A9A',
  sand: '#E8E4DF',
  white: '#FAFAFA',
} as const;

/**
 * Unlayer Appearance Configuration
 * 
 * Passed inside options.appearance per the official React component docs.
 * @see https://docs.unlayer.com/builder/appearance
 */
export const ORA_UNLAYER_APPEARANCE = {
  theme: 'modern_light' as const,
  panels: {
    tools: {
      dock: 'right' as const,
      collapsible: true,
    },
  },
};

/**
 * Custom CSS to inject into the Unlayer editor iframe.
 * 
 * NOTE: customCSS is a paid Unlayer feature (Optimize plan, $2000/mo).
 * On the free plan this CSS will NOT be applied inside the editor iframe.
 * Branding removal is handled via wrapper CSS + DOM manipulation instead.
 * This is kept as a fallback for when a paid projectId is configured.
 */
export const ORA_UNLAYER_CUSTOM_CSS = [
  `
  /* ORA accent color for selection borders */
  .blockbuilder-layer-selector-active {
    border-color: ${ORA_COLORS.gold} !important;
  }
  .btn-primary,
  .blockbuilder-options-button.active {
    background-color: ${ORA_COLORS.gold} !important;
    border-color: ${ORA_COLORS.gold} !important;
  }
  .btn-primary:hover {
    background-color: #A6845F !important;
    border-color: #A6845F !important;
  }
  .blockbuilder-content-tool:focus,
  .blockbuilder-content-tool:focus-visible {
    outline-color: ${ORA_COLORS.gold} !important;
  }
  .blockbuilder-content-tool.selected {
    border-color: ${ORA_COLORS.gold} !important;
  }
`,
];

/**
 * Default body values for new email designs
 * 
 * These values are applied to the email body when creating a new design.
 */
export const ORA_DEFAULT_BODY_VALUES = {
  backgroundColor: ORA_COLORS.cream,
  contentWidth: '600px',
  contentAlign: 'center' as const,
  fontFamily: {
    label: 'Poppins',
    value: "'Poppins', Arial, sans-serif",
    url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  },
  linkStyle: {
    body: true,
    linkColor: ORA_COLORS.gold,
    linkHoverColor: '#A6845F',
    linkUnderline: true,
    linkHoverUnderline: true,
  },
};
