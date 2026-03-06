/**
 * Design Format Converter
 * 
 * Converts legacy EmailBuilderState format to Unlayer design JSON format.
 * This enables backward compatibility with existing campaigns that use the old format.
 */

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
  HeaderBlock,
  FooterBlock,
} from '@/lib/types/email-builder';
import type { UnlayerDesignJson } from '@/components/unlayer-email-builder';

/**
 * Result of a design format conversion
 */
export interface ConversionResult {
  success: boolean;
  design: UnlayerDesignJson | null;
  error?: string;
}

/**
 * Detects if a design JSON is in the legacy EmailBuilderState format
 * 
 * Legacy format has:
 * - blocks: array of Block objects
 * - globalStyles: object with backgroundColor, contentBackgroundColor, etc.
 * - metadata: object with lastSaved and version
 * 
 * Unlayer format has:
 * - body: object with rows, values, etc.
 * - counters: object with element counters
 * - schemaVersion: number
 */
export function isLegacyFormat(design: unknown): design is EmailBuilderState {
  if (!design || typeof design !== 'object') {
    return false;
  }

  const obj = design as Record<string, unknown>;

  // Check for legacy format markers
  const hasBlocks = Array.isArray(obj.blocks);
  const hasGlobalStyles = obj.globalStyles && typeof obj.globalStyles === 'object';
  const hasMetadata = obj.metadata && typeof obj.metadata === 'object';

  // Check for Unlayer format markers (to exclude)
  const hasBody = obj.body && typeof obj.body === 'object';
  const hasCounters = obj.counters && typeof obj.counters === 'object';

  // It's legacy if it has legacy markers and doesn't have Unlayer markers
  return Boolean(hasBlocks && hasGlobalStyles && hasMetadata && !hasBody && !hasCounters);
}

/**
 * Detects if a design JSON is in the Unlayer format
 */
export function isUnlayerFormat(design: unknown): design is UnlayerDesignJson {
  if (!design || typeof design !== 'object') {
    return false;
  }

  const obj = design as Record<string, unknown>;

  // Check for Unlayer format markers
  const hasBody = obj.body && typeof obj.body === 'object';
  
  if (!hasBody) {
    return false;
  }

  const body = obj.body as Record<string, unknown>;
  const hasRows = Array.isArray(body.rows);
  const hasValues = body.values && typeof body.values === 'object';

  return Boolean(hasRows && hasValues);
}

// Counter for generating unique IDs
let idCounter = 0;

function generateId(prefix: string): string {
  idCounter++;
  return `${prefix}_${idCounter}`;
}

function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Converts a legacy TextBlock to Unlayer content
 */
function convertTextBlock(block: TextBlock): unknown {
  const { content, styles } = block;
  
  return {
    id: generateId('u_content_text'),
    type: 'text',
    values: {
      containerPadding: '10px',
      anchor: '',
      fontSize: `${styles.fontSize}px`,
      textAlign: styles.textAlign,
      lineHeight: `${styles.lineHeight * 100}%`,
      linkStyle: {
        inherit: true,
        linkColor: '#B8956B',
        linkHoverColor: '#A6845F',
        linkUnderline: true,
        linkHoverUnderline: true,
      },
      _meta: {
        htmlID: generateId('u_content_text'),
        htmlClassNames: 'u_content_text',
      },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
      text: content,
    },
  };
}

/**
 * Converts a legacy ImageBlock to Unlayer content
 */
function convertImageBlock(block: ImageBlock): unknown {
  const { src, alt, width, align, linkUrl, borderRadius } = block;
  
  return {
    id: generateId('u_content_image'),
    type: 'image',
    values: {
      containerPadding: '10px',
      anchor: '',
      src: {
        url: src || '',
        width: typeof width === 'number' ? width : 600,
        height: 'auto',
      },
      textAlign: align,
      altText: alt,
      action: linkUrl ? {
        name: 'web',
        values: {
          href: linkUrl,
          target: '_blank',
        },
      } : {
        name: 'web',
        values: {
          href: '',
          target: '_blank',
        },
      },
      _meta: {
        htmlID: generateId('u_content_image'),
        htmlClassNames: 'u_content_image',
      },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
      ...(borderRadius && { borderRadius: `${borderRadius}px` }),
    },
  };
}

/**
 * Converts a legacy ButtonBlock to Unlayer content
 */
function convertButtonBlock(block: ButtonBlock): unknown {
  const { text, url, styles } = block;
  
  return {
    id: generateId('u_content_button'),
    type: 'button',
    values: {
      containerPadding: '10px',
      anchor: '',
      href: {
        name: 'web',
        values: {
          href: url,
          target: '_blank',
        },
      },
      buttonColors: {
        color: styles.textColor,
        backgroundColor: styles.backgroundColor,
        hoverColor: styles.textColor,
        hoverBackgroundColor: styles.backgroundColor,
      },
      size: {
        autoWidth: true,
        width: '100%',
      },
      textAlign: 'center',
      lineHeight: '120%',
      padding: `${styles.paddingVertical}px ${styles.paddingHorizontal}px`,
      border: {},
      borderRadius: `${styles.borderRadius}px`,
      _meta: {
        htmlID: generateId('u_content_button'),
        htmlClassNames: 'u_content_button',
      },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
      text: `<span style="font-size: ${styles.fontSize}px; line-height: 120%;">${text}</span>`,
    },
  };
}

/**
 * Converts a legacy DividerBlock to Unlayer content
 */
function convertDividerBlock(block: DividerBlock): unknown {
  const { styles } = block;
  
  return {
    id: generateId('u_content_divider'),
    type: 'divider',
    values: {
      containerPadding: '10px',
      anchor: '',
      border: {
        borderTopWidth: `${styles.thickness}px`,
        borderTopStyle: styles.style || 'solid',
        borderTopColor: styles.color,
      },
      textAlign: 'center',
      width: `${styles.width}%`,
      _meta: {
        htmlID: generateId('u_content_divider'),
        htmlClassNames: 'u_content_divider',
      },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
    },
  };
}

/**
 * Converts a legacy SpacerBlock to Unlayer content (using empty row with padding)
 */
function convertSpacerBlock(block: SpacerBlock): unknown {
  return {
    id: generateId('u_content_html'),
    type: 'html',
    values: {
      containerPadding: `${block.height}px 0px`,
      anchor: '',
      html: '',
      _meta: {
        htmlID: generateId('u_content_html'),
        htmlClassNames: 'u_content_html',
      },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
    },
  };
}

/**
 * Converts a legacy SocialLinksBlock to Unlayer content
 */
function convertSocialLinksBlock(block: SocialLinksBlock): unknown {
  const { links, styles } = block;
  
  const enabledLinks = links.filter(link => link.enabled && link.url);
  
  const icons = enabledLinks.map(link => ({
    name: link.platform,
    url: link.url,
  }));

  return {
    id: generateId('u_content_social'),
    type: 'social',
    values: {
      containerPadding: '10px',
      anchor: '',
      icons: {
        iconType: 'circle',
        icons,
      },
      iconMargin: `${styles.spacing}px`,
      align: styles.align,
      _meta: {
        htmlID: generateId('u_content_social'),
        htmlClassNames: 'u_content_social',
      },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
    },
  };
}

/**
 * Converts a legacy HeaderBlock to Unlayer content (as multiple content items)
 */
function convertHeaderBlock(block: HeaderBlock): unknown[] {
  const { logoSrc, logoAlt, title, subtitle, styles } = block;
  const contents: unknown[] = [];

  if (styles.showLogo && logoSrc) {
    contents.push({
      id: generateId('u_content_image'),
      type: 'image',
      values: {
        containerPadding: '10px',
        src: {
          url: logoSrc,
          width: styles.logoHeight * 2,
          height: styles.logoHeight,
        },
        textAlign: styles.align,
        altText: logoAlt,
        _meta: {
          htmlID: generateId('u_content_image'),
          htmlClassNames: 'u_content_image',
        },
        selectable: true,
        draggable: true,
        duplicatable: true,
        deletable: true,
        hideable: true,
      },
    });
  }

  if (styles.showTitle && title) {
    contents.push({
      id: generateId('u_content_text'),
      type: 'text',
      values: {
        containerPadding: '10px',
        fontSize: `${styles.titleFontSize}px`,
        textAlign: styles.align,
        lineHeight: '140%',
        _meta: {
          htmlID: generateId('u_content_text'),
          htmlClassNames: 'u_content_text',
        },
        selectable: true,
        draggable: true,
        duplicatable: true,
        deletable: true,
        hideable: true,
        text: `<p style="font-weight: ${styles.titleFontWeight}; color: ${styles.titleColor};">${title}</p>`,
      },
    });
  }

  if (styles.showSubtitle && subtitle) {
    contents.push({
      id: generateId('u_content_text'),
      type: 'text',
      values: {
        containerPadding: '5px 10px',
        fontSize: `${styles.subtitleFontSize}px`,
        textAlign: styles.align,
        lineHeight: '140%',
        _meta: {
          htmlID: generateId('u_content_text'),
          htmlClassNames: 'u_content_text',
        },
        selectable: true,
        draggable: true,
        duplicatable: true,
        deletable: true,
        hideable: true,
        text: `<p style="color: ${styles.subtitleColor};">${subtitle}</p>`,
      },
    });
  }

  return contents;
}

/**
 * Converts a legacy FooterBlock to Unlayer content (as multiple content items)
 */
function convertFooterBlock(block: FooterBlock): unknown[] {
  const { companyName, address, showUnsubscribe, unsubscribeText, copyrightText, styles } = block;
  const contents: unknown[] = [];

  // Company name and address
  if (styles.showAddress && (companyName || address)) {
    contents.push({
      id: generateId('u_content_text'),
      type: 'text',
      values: {
        containerPadding: '10px',
        fontSize: `${styles.fontSize}px`,
        textAlign: styles.align,
        lineHeight: '150%',
        _meta: {
          htmlID: generateId('u_content_text'),
          htmlClassNames: 'u_content_text',
        },
        selectable: true,
        draggable: true,
        duplicatable: true,
        deletable: true,
        hideable: true,
        text: `<p style="color: ${styles.textColor};">${companyName}<br/>${address}</p>`,
      },
    });
  }

  // Unsubscribe link
  if (showUnsubscribe) {
    contents.push({
      id: generateId('u_content_text'),
      type: 'text',
      values: {
        containerPadding: '10px',
        fontSize: `${styles.fontSize}px`,
        textAlign: styles.align,
        lineHeight: '150%',
        _meta: {
          htmlID: generateId('u_content_text'),
          htmlClassNames: 'u_content_text',
        },
        selectable: true,
        draggable: true,
        duplicatable: true,
        deletable: true,
        hideable: true,
        text: `<p><a href="{unsubscribeLink}" style="color: ${styles.linkColor};">${unsubscribeText}</a></p>`,
      },
    });
  }

  // Copyright
  if (styles.showCopyright && copyrightText) {
    contents.push({
      id: generateId('u_content_text'),
      type: 'text',
      values: {
        containerPadding: '10px',
        fontSize: `${styles.fontSize}px`,
        textAlign: styles.align,
        lineHeight: '150%',
        _meta: {
          htmlID: generateId('u_content_text'),
          htmlClassNames: 'u_content_text',
        },
        selectable: true,
        draggable: true,
        duplicatable: true,
        deletable: true,
        hideable: true,
        text: `<p style="color: ${styles.textColor};">${copyrightText.replace('{year}', new Date().getFullYear().toString())}</p>`,
      },
    });
  }

  return contents;
}

/**
 * Converts a single legacy block to Unlayer content(s)
 */
function convertBlock(block: Block): unknown[] {
  switch (block.type) {
    case 'text':
      return [convertTextBlock(block)];
    case 'image':
      return [convertImageBlock(block)];
    case 'button':
      return [convertButtonBlock(block)];
    case 'divider':
      return [convertDividerBlock(block)];
    case 'spacer':
      return [convertSpacerBlock(block)];
    case 'social-links':
      return [convertSocialLinksBlock(block)];
    case 'header':
      return convertHeaderBlock(block);
    case 'footer':
      return convertFooterBlock(block);
    case 'columns':
      // Columns are handled separately as they create multi-column rows
      return [];
    default:
      return [];
  }
}

/**
 * Converts a legacy ColumnsBlock to an Unlayer row with multiple columns
 */
function convertColumnsBlock(block: ColumnsBlock): unknown {
  const { columns, verticalAlign } = block;
  
  const unlayerColumns = columns.map(column => {
    const contents: unknown[] = [];
    
    for (const innerBlock of column.blocks) {
      contents.push(...convertBlock(innerBlock));
    }

    return {
      id: generateId('u_column'),
      contents,
      values: {
        backgroundColor: '',
        padding: '0px',
        border: {},
        borderRadius: '0px',
        _meta: {
          htmlID: generateId('u_column'),
          htmlClassNames: 'u_column',
        },
      },
    };
  });

  return {
    id: generateId('u_row'),
    cells: columns.map(() => 1),
    columns: unlayerColumns,
    values: {
      displayCondition: null,
      columns: false,
      backgroundColor: '',
      columnsBackgroundColor: '',
      backgroundImage: {
        url: '',
        fullWidth: true,
        repeat: 'no-repeat',
        size: 'custom',
        position: 'center',
      },
      padding: '0px',
      anchor: '',
      hideDesktop: false,
      _meta: {
        htmlID: generateId('u_row'),
        htmlClassNames: 'u_row',
      },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
    },
  };
}

/**
 * Creates a single-column Unlayer row from content items
 */
function createSingleColumnRow(contents: unknown[]): unknown {
  return {
    id: generateId('u_row'),
    cells: [1],
    columns: [
      {
        id: generateId('u_column'),
        contents,
        values: {
          backgroundColor: '',
          padding: '0px',
          border: {},
          borderRadius: '0px',
          _meta: {
            htmlID: generateId('u_column'),
            htmlClassNames: 'u_column',
          },
        },
      },
    ],
    values: {
      displayCondition: null,
      columns: false,
      backgroundColor: '',
      columnsBackgroundColor: '',
      backgroundImage: {
        url: '',
        fullWidth: true,
        repeat: 'no-repeat',
        size: 'custom',
        position: 'center',
      },
      padding: '0px',
      anchor: '',
      hideDesktop: false,
      _meta: {
        htmlID: generateId('u_row'),
        htmlClassNames: 'u_row',
      },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
    },
  };
}

/**
 * Converts a legacy EmailBuilderState to Unlayer design JSON format
 */
export function convertLegacyToUnlayer(legacy: EmailBuilderState): ConversionResult {
  try {
    resetIdCounter();
    
    const { blocks, globalStyles } = legacy;
    const rows: unknown[] = [];

    // Convert each block to Unlayer format
    for (const block of blocks) {
      if (block.type === 'columns') {
        // Columns become multi-column rows
        rows.push(convertColumnsBlock(block as ColumnsBlock));
      } else {
        // Other blocks become single-column rows
        const contents = convertBlock(block);
        if (contents.length > 0) {
          rows.push(createSingleColumnRow(contents));
        }
      }
    }

    const design: UnlayerDesignJson = {
      counters: {
        u_column: idCounter,
        u_row: idCounter,
        u_content_text: idCounter,
        u_content_image: idCounter,
        u_content_button: idCounter,
        u_content_divider: idCounter,
        u_content_html: idCounter,
        u_content_social: idCounter,
      },
      body: {
        id: generateId('u_body'),
        rows,
        headers: [],
        footers: [],
        values: {
          backgroundColor: globalStyles.backgroundColor,
          backgroundImage: {
            url: '',
            fullWidth: true,
            repeat: 'no-repeat',
            center: true,
            cover: false,
          },
          contentWidth: `${globalStyles.contentWidth}px`,
          contentAlign: 'center',
          fontFamily: {
            label: 'Poppins',
            value: globalStyles.fontFamily,
            url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
          },
          preheaderText: '',
          linkStyle: {
            body: true,
            linkColor: '#B8956B',
            linkHoverColor: '#A6845F',
            linkUnderline: true,
            linkHoverUnderline: true,
          },
          _meta: {
            htmlID: 'u_body',
            htmlClassNames: 'u_body',
          },
        },
      },
      schemaVersion: 16,
    };

    return {
      success: true,
      design,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error';
    console.error('[DesignFormatConverter] Conversion failed:', errorMessage);
    
    return {
      success: false,
      design: null,
      error: errorMessage,
    };
  }
}

/**
 * Attempts to convert a design to Unlayer format if needed
 * Returns the original design if it's already in Unlayer format
 * Returns a converted design if it's in legacy format
 * Returns null with an error if conversion fails
 */
export function ensureUnlayerFormat(design: unknown): ConversionResult {
  // Already Unlayer format
  if (isUnlayerFormat(design)) {
    return {
      success: true,
      design: design as UnlayerDesignJson,
    };
  }

  // Legacy format - convert
  if (isLegacyFormat(design)) {
    return convertLegacyToUnlayer(design);
  }

  // Unknown format
  return {
    success: false,
    design: null,
    error: 'Unknown design format. Cannot convert to Unlayer format.',
  };
}

/**
 * Creates a blank Unlayer design with ORA brand styling
 */
export function createBlankUnlayerDesign(): UnlayerDesignJson {
  return {
    counters: {
      u_column: 1,
      u_row: 1,
      u_content_text: 0,
      u_content_image: 0,
      u_content_button: 0,
      u_content_divider: 0,
      u_content_html: 0,
      u_content_social: 0,
    },
    body: {
      id: 'u_body',
      rows: [],
      headers: [],
      footers: [],
      values: {
        backgroundColor: '#F5F3F0',
        backgroundImage: {
          url: '',
          fullWidth: true,
          repeat: 'no-repeat',
          center: true,
          cover: false,
        },
        contentWidth: '600px',
        contentAlign: 'center',
        fontFamily: {
          label: 'Poppins',
          value: "'Poppins', sans-serif",
          url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
        },
        preheaderText: '',
        linkStyle: {
          body: true,
          linkColor: '#B8956B',
          linkHoverColor: '#A6845F',
          linkUnderline: true,
          linkHoverUnderline: true,
        },
        _meta: {
          htmlID: 'u_body',
          htmlClassNames: 'u_body',
        },
      },
    },
    schemaVersion: 16,
  };
}
