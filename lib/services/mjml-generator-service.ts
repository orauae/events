import type {
  EmailBuilderState,
  Block,
  TextBlock,
  ImageBlock,
  ButtonBlock,
  DividerBlock,
  SpacerBlock,
  ColumnsBlock,
  SocialLinksBlock,
  SocialLink,
  HeaderBlock,
  FooterBlock,
} from '../types/email-builder';

/**
 * MJML Generator Service
 * Converts email builder state to MJML markup for cross-client email rendering
 * 
 * @deprecated This service is kept for backward compatibility with campaigns
 * created using the legacy custom email builder. New campaigns should use
 * the Unlayer email editor which exports HTML directly.
 * 
 * For new campaigns:
 * - Use UnlayerEmailBuilder component from '@/components/unlayer-email-builder'
 * - Use EmailGenerationService from '@/lib/services/email-generation-service'
 *   for plain text generation and merge tag substitution
 * 
 * This service will continue to work for:
 * - Rendering existing campaigns with legacy EmailBuilderState format
 * - Preview functionality for legacy campaigns
 * 
 * @see lib/services/email-generation-service.ts for the new email generation service
 * @see components/unlayer-email-builder for the new email editor
 */
export const MJMLGeneratorService = {
  /**
   * Generate MJML from builder state
   */
  generate(state: EmailBuilderState): string {
    const { blocks, globalStyles } = state;
    
    return `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="${globalStyles.fontFamily}" />
      <mj-text font-size="16px" line-height="1.5" color="#2C2C2C" />
      <mj-section padding="0" />
    </mj-attributes>
    <mj-style>
      a { color: #B8956B; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </mj-style>
  </mj-head>
  <mj-body background-color="${globalStyles.backgroundColor}">
    <mj-section padding="${globalStyles.padding}px">
      <mj-column width="${globalStyles.contentWidth}px" background-color="${globalStyles.contentBackgroundColor}" padding="20px" border-radius="8px">
        ${blocks.map(block => this.blockToMJML(block)).join('\n        ')}
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`.trim();
  },

  /**
   * Convert a single block to MJML
   */
  blockToMJML(block: Block): string {
    switch (block.type) {
      case 'text':
        return this.textBlockToMJML(block);
      case 'image':
        return this.imageBlockToMJML(block);
      case 'button':
        return this.buttonBlockToMJML(block);
      case 'divider':
        return this.dividerBlockToMJML(block);
      case 'spacer':
        return this.spacerBlockToMJML(block);
      case 'columns':
        return this.columnsBlockToMJML(block);
      case 'social-links':
        return this.socialLinksBlockToMJML(block);
      case 'header':
        return this.headerBlockToMJML(block);
      case 'footer':
        return this.footerBlockToMJML(block);
      default:
        return '';
    }
  },

  /**
   * Text block to MJML
   */
  textBlockToMJML(block: TextBlock): string {
    const { content, styles } = block;
    return `<mj-text 
      font-size="${styles.fontSize}px" 
      color="${styles.color}" 
      align="${styles.textAlign}"
      font-weight="${styles.fontWeight}"
      font-style="${styles.fontStyle}"
      line-height="${styles.lineHeight}"
    >${content}</mj-text>`;
  },

  /**
   * Image block to MJML
   */
  imageBlockToMJML(block: ImageBlock): string {
    const { src, alt, linkUrl, width, align, borderRadius = 0 } = block;
    
    if (!src) {
      return `<mj-text align="center" color="#999">
        <em>[Image placeholder - upload an image]</em>
      </mj-text>`;
    }
    
    const widthAttr = width === 'full' ? 'width="100%"' : `width="${width}px"`;
    const hrefAttr = linkUrl ? `href="${linkUrl}"` : '';
    
    return `<mj-image 
      src="${src}" 
      alt="${alt}" 
      ${widthAttr}
      align="${align}"
      ${hrefAttr}
      border-radius="${borderRadius}px"
    />`;
  },

  /**
   * Button block to MJML
   */
  buttonBlockToMJML(block: ButtonBlock): string {
    const { text, url, styles } = block;
    return `<mj-button 
      href="${url}" 
      background-color="${styles.backgroundColor}" 
      color="${styles.textColor}"
      border-radius="${styles.borderRadius}px"
      padding="${styles.paddingVertical}px ${styles.paddingHorizontal}px"
      font-size="${styles.fontSize}px"
      font-weight="600"
    >${text}</mj-button>`;
  },

  /**
   * Divider block to MJML
   */
  dividerBlockToMJML(block: DividerBlock): string {
    const { styles } = block;
    return `<mj-divider 
      border-color="${styles.color}" 
      border-width="${styles.thickness}px"
      border-style="${styles.style || 'solid'}"
      width="${styles.width}%"
    />`;
  },

  /**
   * Spacer block to MJML
   */
  spacerBlockToMJML(block: SpacerBlock): string {
    return `<mj-spacer height="${block.height}px" />`;
  },

  /**
   * Columns block to MJML
   */
  columnsBlockToMJML(block: ColumnsBlock): string {
    const { columns, gap, verticalAlign } = block;
    
    const columnsContent = columns.map(col => {
      const blocksContent = col.blocks.map(b => this.blockToMJML(b)).join('\n          ');
      return `<mj-column width="${col.width}" vertical-align="${verticalAlign}" padding="0 ${gap / 2}px">
          ${blocksContent || '<mj-text><em>[Empty column]</em></mj-text>'}
        </mj-column>`;
    }).join('\n        ');
    
    return `<mj-section padding="0">
        ${columnsContent}
      </mj-section>`;
  },

  /**
   * Social links block to MJML
   */
  socialLinksBlockToMJML(block: SocialLinksBlock): string {
    const { links, styles } = block;
    const enabledLinks = links.filter(link => link.enabled && link.url);
    
    if (enabledLinks.length === 0) {
      return '';
    }

    // Map platform to social icon name used by mj-social-element
    const platformToIcon: Record<SocialLink['platform'], string> = {
      facebook: 'facebook',
      twitter: 'twitter',
      instagram: 'instagram',
      linkedin: 'linkedin',
      youtube: 'youtube',
      tiktok: 'web', // TikTok not natively supported, use web icon
      website: 'web',
    };

    const socialElements = enabledLinks.map(link => {
      const iconName = platformToIcon[link.platform];
      return `<mj-social-element 
        name="${iconName}" 
        href="${link.url}"
        icon-size="${styles.iconSize}px"
        color="${styles.iconColor}"
        background-color="${styles.iconBackgroundColor}"
        border-radius="${styles.iconBorderRadius}%"
        padding="0 ${styles.spacing / 2}px"
      />`;
    }).join('\n        ');

    return `<mj-social 
      align="${styles.align}"
      icon-size="${styles.iconSize}px"
      mode="horizontal"
      padding="10px 0"
    >
        ${socialElements}
      </mj-social>`;
  },

  /**
   * Header block to MJML
   */
  headerBlockToMJML(block: HeaderBlock): string {
    const { logoSrc, logoAlt, title, subtitle, styles } = block;
    const parts: string[] = [];

    if (styles.showLogo && logoSrc) {
      parts.push(`<mj-image 
        src="${logoSrc}" 
        alt="${logoAlt || 'Logo'}" 
        width="${styles.logoHeight * 2}px"
        align="${styles.align}"
        padding="0 0 10px 0"
      />`);
    }

    if (styles.showTitle && title) {
      parts.push(`<mj-text 
        font-size="${styles.titleFontSize}px" 
        color="${styles.titleColor}" 
        align="${styles.align}"
        font-weight="${styles.titleFontWeight}"
        padding="0 0 5px 0"
      >${title}</mj-text>`);
    }

    if (styles.showSubtitle && subtitle) {
      parts.push(`<mj-text 
        font-size="${styles.subtitleFontSize}px" 
        color="${styles.subtitleColor}" 
        align="${styles.align}"
        padding="0"
      >${subtitle}</mj-text>`);
    }

    if (parts.length === 0) {
      return '';
    }

    return `<mj-section 
      background-color="${styles.backgroundColor}" 
      padding="${styles.paddingVertical}px ${styles.paddingHorizontal}px"
    >
      <mj-column>
        ${parts.join('\n        ')}
      </mj-column>
    </mj-section>`;
  },

  /**
   * Footer block to MJML
   */
  footerBlockToMJML(block: FooterBlock): string {
    const { companyName, address, showUnsubscribe, unsubscribeText, copyrightText, links, styles } = block;
    const parts: string[] = [];
    const enabledLinks = links.filter(link => link.enabled);

    // Company name
    if (companyName) {
      parts.push(`<mj-text 
        font-size="${styles.fontSize + 2}px" 
        color="${styles.textColor}" 
        align="${styles.align}"
        font-weight="600"
        padding="0 0 5px 0"
      >${companyName}</mj-text>`);
    }

    // Address
    if (styles.showAddress && address) {
      parts.push(`<mj-text 
        font-size="${styles.fontSize}px" 
        color="${styles.textColor}" 
        align="${styles.align}"
        padding="0 0 10px 0"
      >${address}</mj-text>`);
    }

    // Footer links
    if (enabledLinks.length > 0) {
      const linksHtml = enabledLinks
        .map(link => `<a href="${link.url || '#'}" style="color: ${styles.linkColor}; text-decoration: none;">${link.label}</a>`)
        .join(' &bull; ');
      parts.push(`<mj-text 
        font-size="${styles.fontSize}px" 
        color="${styles.textColor}" 
        align="${styles.align}"
        padding="0 0 10px 0"
      >${linksHtml}</mj-text>`);
    }

    // Unsubscribe link
    if (showUnsubscribe) {
      parts.push(`<mj-text 
        font-size="${styles.fontSize}px" 
        color="${styles.textColor}" 
        align="${styles.align}"
        padding="0 0 10px 0"
      ><a href="{unsubscribeLink}" style="color: ${styles.linkColor}; text-decoration: none;">${unsubscribeText}</a></mj-text>`);
    }

    // Copyright
    if (styles.showCopyright && copyrightText) {
      const formattedCopyright = copyrightText.replace('{year}', new Date().getFullYear().toString());
      parts.push(`<mj-text 
        font-size="${styles.fontSize - 1}px" 
        color="${styles.textColor}" 
        align="${styles.align}"
        padding="0"
        css-class="footer-copyright"
      >${formattedCopyright}</mj-text>`);
    }

    if (parts.length === 0) {
      return '';
    }

    return `<mj-section 
      background-color="${styles.backgroundColor}" 
      padding="${styles.paddingVertical}px ${styles.paddingHorizontal}px"
    >
      <mj-column>
        ${parts.join('\n        ')}
      </mj-column>
    </mj-section>`;
  },

  /**
   * Generate plain text version from builder state
   */
  generatePlainText(state: EmailBuilderState): string {
    const lines: string[] = [];
    
    for (const block of state.blocks) {
      switch (block.type) {
        case 'text':
          // Strip HTML tags and decode entities
          const text = block.content
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();
          if (text) lines.push(text);
          break;
        case 'button':
          lines.push(`${block.text}: ${block.url}`);
          break;
        case 'divider':
          lines.push('---');
          break;
        case 'spacer':
          lines.push('');
          break;
        case 'social-links':
          const socialLinks = block.links
            .filter(link => link.enabled && link.url)
            .map(link => `${link.platform}: ${link.url}`)
            .join('\n');
          if (socialLinks) {
            lines.push('Follow us:');
            lines.push(socialLinks);
          }
          break;
        case 'header':
          if (block.styles.showTitle && block.title) {
            lines.push(block.title);
          }
          if (block.styles.showSubtitle && block.subtitle) {
            lines.push(block.subtitle);
          }
          break;
        case 'footer':
          if (block.companyName) {
            lines.push(block.companyName);
          }
          if (block.styles.showAddress && block.address) {
            lines.push(block.address);
          }
          const footerLinks = block.links
            .filter(link => link.enabled && link.url)
            .map(link => `${link.label}: ${link.url}`)
            .join('\n');
          if (footerLinks) {
            lines.push(footerLinks);
          }
          if (block.showUnsubscribe) {
            lines.push(`${block.unsubscribeText}: {unsubscribeLink}`);
          }
          if (block.styles.showCopyright && block.copyrightText) {
            lines.push(block.copyrightText.replace('{year}', new Date().getFullYear().toString()));
          }
          break;
        case 'columns':
          for (const col of block.columns) {
            for (const b of col.blocks) {
              if (b.type === 'text') {
                const colText = b.content.replace(/<[^>]*>/g, '').trim();
                if (colText) lines.push(colText);
              }
            }
          }
          break;
      }
    }
    
    return lines.join('\n\n');
  },

  /**
   * Substitute template variables with actual values
   */
  substituteVariables(
    content: string,
    context: Record<string, string>
  ): string {
    let result = content;
    for (const [key, value] of Object.entries(context)) {
      const pattern = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(pattern, value);
    }
    return result;
  },

  /**
   * Get sample context for preview
   */
  getSampleContext(): Record<string, string> {
    return {
      firstName: 'John',
      lastName: 'Doe',
      eventName: 'Annual Conference 2026',
      eventLocation: 'Grand Ballroom, New York City',
      eventDate: 'Saturday, March 15, 2026',
      rsvpLink: 'https://example.com/rsvp/sample',
      badgeLink: 'https://example.com/badge/sample',
    };
  },
};

export default MJMLGeneratorService;
