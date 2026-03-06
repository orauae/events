/**
 * @fileoverview Legacy Email Builder Types
 * 
 * @deprecated These types are from the legacy custom email builder implementation
 * that used @dnd-kit. New campaigns should use the Unlayer email editor with
 * UnlayerDesignJson from '@/components/unlayer-email-builder'.
 * 
 * These types are kept for backward compatibility with existing campaigns
 * that were created using the old email builder. The design-format-converter
 * utility can convert these legacy formats to Unlayer format.
 * 
 * @see lib/utils/design-format-converter.ts for conversion utilities
 * @see components/unlayer-email-builder for the new email editor
 */

// Block types for the visual email builder

export type BlockType = 'text' | 'image' | 'button' | 'divider' | 'spacer' | 'columns' | 'social-links' | 'header' | 'footer';

// Base block interface
export interface BaseBlock {
  id: string;
  type: BlockType;
}

// Text block
export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string; // HTML content with variables
  styles: {
    fontSize: number;
    color: string;
    textAlign: 'left' | 'center' | 'right';
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    lineHeight: number;
  };
}

// Image block
export interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string;
  alt: string;
  linkUrl?: string;
  width: number | 'full';
  align: 'left' | 'center' | 'right';
  borderRadius?: number;
}

// Button block
export interface ButtonBlock extends BaseBlock {
  type: 'button';
  text: string;
  url: string;
  styles: {
    backgroundColor: string;
    textColor: string;
    borderRadius: number;
    paddingVertical: number;
    paddingHorizontal: number;
    fontSize: number;
  };
}

// Divider block
export interface DividerBlock extends BaseBlock {
  type: 'divider';
  styles: {
    color: string;
    thickness: number;
    width: number; // percentage
    style?: 'solid' | 'dashed' | 'dotted';
  };
}

// Spacer block
export interface SpacerBlock extends BaseBlock {
  type: 'spacer';
  height: number;
}

// Column definition
export interface Column {
  width: string; // e.g., '50%', '33.33%'
  blocks: Block[];
}

// Columns block
export interface ColumnsBlock extends BaseBlock {
  type: 'columns';
  columns: Column[];
  gap: number;
  verticalAlign: 'top' | 'middle' | 'bottom';
}

// Social link definition
export interface SocialLink {
  platform: 'facebook' | 'twitter' | 'instagram' | 'linkedin' | 'youtube' | 'tiktok' | 'website';
  url: string;
  enabled: boolean;
}

// Social links block
export interface SocialLinksBlock extends BaseBlock {
  type: 'social-links';
  links: SocialLink[];
  styles: {
    iconSize: number;
    iconColor: string;
    iconBackgroundColor: string;
    iconBorderRadius: number;
    spacing: number;
    align: 'left' | 'center' | 'right';
  };
}

// Header block
export interface HeaderBlock extends BaseBlock {
  type: 'header';
  logoSrc: string;
  logoAlt: string;
  title: string;
  subtitle: string;
  styles: {
    backgroundColor: string;
    paddingVertical: number;
    paddingHorizontal: number;
    align: 'left' | 'center' | 'right';
    showLogo: boolean;
    logoHeight: number;
    showTitle: boolean;
    titleFontSize: number;
    titleColor: string;
    titleFontWeight: 'normal' | 'bold';
    showSubtitle: boolean;
    subtitleFontSize: number;
    subtitleColor: string;
  };
}

// Footer block
export interface FooterBlock extends BaseBlock {
  type: 'footer';
  companyName: string;
  address: string;
  showUnsubscribe: boolean;
  unsubscribeText: string;
  copyrightText: string;
  links: FooterLink[];
  styles: {
    backgroundColor: string;
    textColor: string;
    linkColor: string;
    paddingVertical: number;
    paddingHorizontal: number;
    fontSize: number;
    align: 'left' | 'center' | 'right';
    showCopyright: boolean;
    showAddress: boolean;
  };
}

// Footer link definition
export interface FooterLink {
  label: string;
  url: string;
  enabled: boolean;
}

// Union type for all blocks
export type Block = TextBlock | ImageBlock | ButtonBlock | DividerBlock | SpacerBlock | ColumnsBlock | SocialLinksBlock | HeaderBlock | FooterBlock;

// Global styles for the email
export interface GlobalStyles {
  backgroundColor: string;
  contentBackgroundColor: string;
  contentWidth: number;
  fontFamily: string;
  padding: number;
}

// Email builder state
export interface EmailBuilderState {
  blocks: Block[];
  globalStyles: GlobalStyles;
  metadata: {
    lastSaved: string | null;
    version: number;
  };
}

// Default global styles (ORA design system)
export const DEFAULT_GLOBAL_STYLES: GlobalStyles = {
  backgroundColor: '#F5F3F0', // ORA cream
  contentBackgroundColor: '#FAFAFA', // ORA white
  contentWidth: 600,
  fontFamily: 'Poppins, Arial, sans-serif',
  padding: 20,
};

// Default block styles
export const DEFAULT_TEXT_STYLES: TextBlock['styles'] = {
  fontSize: 16,
  color: '#2C2C2C', // ORA charcoal
  textAlign: 'left',
  fontWeight: 'normal',
  fontStyle: 'normal',
  lineHeight: 1.5,
};

export const DEFAULT_BUTTON_STYLES: ButtonBlock['styles'] = {
  backgroundColor: '#B8956B', // ORA gold
  textColor: '#FFFFFF',
  borderRadius: 8,
  paddingVertical: 12,
  paddingHorizontal: 24,
  fontSize: 16,
};

export const DEFAULT_DIVIDER_STYLES: DividerBlock['styles'] = {
  color: '#E8E4DF', // ORA sand
  thickness: 1,
  width: 100,
  style: 'solid',
};

export const DEFAULT_SOCIAL_LINKS_STYLES: SocialLinksBlock['styles'] = {
  iconSize: 32,
  iconColor: '#FFFFFF',
  iconBackgroundColor: '#B8956B', // ORA gold
  iconBorderRadius: 50, // Circular by default
  spacing: 12,
  align: 'center',
};

export const DEFAULT_HEADER_STYLES: HeaderBlock['styles'] = {
  backgroundColor: '#FFFFFF',
  paddingVertical: 24,
  paddingHorizontal: 20,
  align: 'center',
  showLogo: true,
  logoHeight: 60,
  showTitle: true,
  titleFontSize: 28,
  titleColor: '#2C2C2C', // ORA charcoal
  titleFontWeight: 'bold',
  showSubtitle: true,
  subtitleFontSize: 14,
  subtitleColor: '#6B6B6B', // ORA graphite
};

export const DEFAULT_FOOTER_STYLES: FooterBlock['styles'] = {
  backgroundColor: '#F5F3F0', // ORA cream
  textColor: '#6B6B6B', // ORA graphite
  linkColor: '#B8956B', // ORA gold
  paddingVertical: 24,
  paddingHorizontal: 20,
  fontSize: 12,
  align: 'center',
  showCopyright: true,
  showAddress: true,
};

export const DEFAULT_FOOTER_LINKS: FooterLink[] = [
  { label: 'Privacy Policy', url: '', enabled: true },
  { label: 'Terms of Service', url: '', enabled: true },
  { label: 'Contact Us', url: '', enabled: false },
];

export const DEFAULT_SOCIAL_LINKS: SocialLink[] = [
  { platform: 'facebook', url: '', enabled: true },
  { platform: 'twitter', url: '', enabled: true },
  { platform: 'instagram', url: '', enabled: true },
  { platform: 'linkedin', url: '', enabled: false },
  { platform: 'youtube', url: '', enabled: false },
  { platform: 'tiktok', url: '', enabled: false },
  { platform: 'website', url: '', enabled: false },
];

// Template variable definitions
export const TEMPLATE_VARIABLES = [
  { name: '{firstName}', description: "Guest's first name", example: 'John' },
  { name: '{lastName}', description: "Guest's last name", example: 'Doe' },
  { name: '{email}', description: "Guest's email address", example: 'john.doe@example.com' },
  { name: '{companyName}', description: "Guest's company", example: 'Acme Corp' },
  { name: '{jobTitle}', description: "Guest's job title", example: 'Software Engineer' },
  { name: '{eventName}', description: 'Name of the event', example: 'Annual Conference 2026' },
  { name: '{eventLocation}', description: 'Event location', example: 'Grand Ballroom, NYC' },
  { name: '{eventDate}', description: 'Event date', example: 'Saturday, March 15, 2026' },
  { name: '{rsvpLink}', description: 'RSVP link for the guest', example: 'https://example.com/rsvp/abc123' },
  { name: '{badgeLink}', description: 'Badge download link', example: 'https://example.com/badge/abc123' },
  { name: '{unsubscribeLink}', description: 'Unsubscribe link', example: 'https://example.com/unsubscribe/abc123' },
] as const;

// Helper to create a new block with defaults
export function createBlock(type: BlockType, id: string): Block {
  switch (type) {
    case 'text':
      return {
        id,
        type: 'text',
        content: '<p>Enter your text here...</p>',
        styles: { ...DEFAULT_TEXT_STYLES },
      };
    case 'image':
      return {
        id,
        type: 'image',
        src: '',
        alt: 'Image',
        width: 'full',
        align: 'center',
      };
    case 'button':
      return {
        id,
        type: 'button',
        text: 'Click Here',
        url: '{rsvpLink}',
        styles: { ...DEFAULT_BUTTON_STYLES },
      };
    case 'divider':
      return {
        id,
        type: 'divider',
        styles: { ...DEFAULT_DIVIDER_STYLES },
      };
    case 'spacer':
      return {
        id,
        type: 'spacer',
        height: 20,
      };
    case 'columns':
      return {
        id,
        type: 'columns',
        columns: [
          { width: '50%', blocks: [] },
          { width: '50%', blocks: [] },
        ],
        gap: 20,
        verticalAlign: 'top',
      };
    case 'social-links':
      return {
        id,
        type: 'social-links',
        links: DEFAULT_SOCIAL_LINKS.map(link => ({ ...link })),
        styles: { ...DEFAULT_SOCIAL_LINKS_STYLES },
      };
    case 'header':
      return {
        id,
        type: 'header',
        logoSrc: '',
        logoAlt: 'Logo',
        title: '{eventName}',
        subtitle: '{eventDate} • {eventLocation}',
        styles: { ...DEFAULT_HEADER_STYLES },
      };
    case 'footer':
      return {
        id,
        type: 'footer',
        companyName: '{companyName}',
        address: '123 Main Street, City, State 12345',
        showUnsubscribe: true,
        unsubscribeText: 'Unsubscribe from these emails',
        copyrightText: '© {year} All rights reserved.',
        links: DEFAULT_FOOTER_LINKS.map(link => ({ ...link })),
        styles: { ...DEFAULT_FOOTER_STYLES },
      };
  }
}

// Helper to create initial builder state
export function createInitialState(): EmailBuilderState {
  return {
    blocks: [],
    globalStyles: { ...DEFAULT_GLOBAL_STYLES },
    metadata: {
      lastSaved: null,
      version: 1,
    },
  };
}
