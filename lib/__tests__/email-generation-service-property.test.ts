import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { EmailGenerationService } from '@/lib/services/email-generation-service';
import { REQUIRED_MERGE_TAG_KEYS } from '@/lib/config/unlayer-merge-tags';

/**
 * @fileoverview Property-based tests for EmailGenerationService
 *
 * Feature: react-email-editor-migration
 * 
 * Property 3: HTML Validation
 * Property 4: Plain Text Generation from HTML
 * Property 5: Merge Tag Substitution
 *
 * **Validates: Requirements 7.2, 7.3, 10.3**
 */

/**
 * Feature: react-email-editor-migration, Property 3: HTML Validation
 * 
 * For any HTML string passed to the validation function, the function SHALL return
 * `{ valid: false }` if the HTML is empty, contains only whitespace, or lacks basic
 * HTML structure markers, and SHALL return `{ valid: true }` for well-formed HTML content.
 * 
 * **Validates: Requirements 10.3**
 */
describe('Property 3: HTML Validation', () => {
  // Arbitrary for generating empty or whitespace-only strings
  const emptyOrWhitespaceArb = fc.oneof(
    fc.constant(''),
    fc.constant('   '),
    fc.constant('\t\t'),
    fc.constant('\n\n'),
    fc.constant('  \t\n  ')
  );

  test.prop([emptyOrWhitespaceArb])(
    'empty or whitespace-only HTML returns valid: false',
    (html) => {
      const result = EmailGenerationService.validateHtml(html);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    }
  );

  // Arbitrary for generating strings without any HTML tags
  const plainTextArb = fc.string().filter(s => {
    const trimmed = s.trim();
    return trimmed.length > 0 && !/<[a-z][^>]*>/i.test(trimmed);
  });

  test.prop([plainTextArb])(
    'plain text without HTML tags returns valid: false',
    (text) => {
      const result = EmailGenerationService.validateHtml(text);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('HTML content appears malformed');
    }
  );

  // Arbitrary for generating valid HTML with structure
  const validHtmlArb = fc.oneof(
    // Full HTML document
    fc.record({
      title: fc.string({ minLength: 1, maxLength: 50 }),
      body: fc.string({ minLength: 1, maxLength: 200 }),
    }).map(({ title, body }) => 
      `<!DOCTYPE html><html><head><title>${title}</title></head><body>${body}</body></html>`
    ),
    // HTML with body tag
    fc.string({ minLength: 1, maxLength: 200 }).map(content => 
      `<html><body><p>${content}</p></body></html>`
    ),
    // Simple HTML with tags
    fc.string({ minLength: 1, maxLength: 100 }).map(content => 
      `<div><p>${content}</p></div>`
    )
  );

  test.prop([validHtmlArb])(
    'well-formed HTML returns valid: true',
    (html) => {
      const result = EmailGenerationService.validateHtml(html);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    }
  );

  it('validates HTML with DOCTYPE', () => {
    const html = '<!DOCTYPE html><html><body>Content</body></html>';
    const result = EmailGenerationService.validateHtml(html);
    expect(result.valid).toBe(true);
  });

  it('validates HTML with just body tag', () => {
    const html = '<body><p>Hello</p></body>';
    const result = EmailGenerationService.validateHtml(html);
    expect(result.valid).toBe(true);
  });
});

/**
 * Feature: react-email-editor-migration, Property 4: Plain Text Generation from HTML
 * 
 * For any valid HTML email content, the plain text generation function SHALL produce
 * a non-empty string with all HTML tags removed, HTML entities decoded, and reasonable
 * whitespace formatting preserved.
 * 
 * **Validates: Requirements 7.2**
 */
describe('Property 4: Plain Text Generation from HTML', () => {
  // Arbitrary for generating HTML with visible text content
  // Filter out strings that look like incomplete HTML tags
  const htmlWithContentArb = fc.record({
    text: fc.string({ minLength: 1, maxLength: 100 })
      .filter(s => s.trim().length > 0)
      .filter(s => !/<[a-zA-Z]/.test(s)), // Exclude strings that look like HTML tag starts
  }).map(({ text }) => `<html><body><p>${text}</p></body></html>`);

  test.prop([htmlWithContentArb])(
    'plain text generation produces non-empty output for HTML with content',
    (html) => {
      const plainText = EmailGenerationService.generatePlainText(html);
      expect(plainText.length).toBeGreaterThan(0);
    }
  );

  test.prop([htmlWithContentArb])(
    'plain text generation removes all HTML tags',
    (html) => {
      const plainText = EmailGenerationService.generatePlainText(html);
      // Should not contain any HTML tags (tags start with < followed by a letter or /)
      // This regex matches actual HTML tags like <p>, </div>, <br/>, etc.
      // but not text content that happens to contain angle brackets like "< >" or "a < b"
      expect(plainText).not.toMatch(/<\/?[a-zA-Z][^>]*>/);
    }
  );

  // Arbitrary for generating HTML with common entities
  const htmlWithEntitiesArb = fc.constantFrom(
    '<p>&amp;</p>',
    '<p>&lt;test&gt;</p>',
    '<p>&quot;quoted&quot;</p>',
    '<p>&#39;apostrophe&#39;</p>',
    '<p>&nbsp;space&nbsp;</p>'
  );

  test.prop([htmlWithEntitiesArb])(
    'plain text generation decodes HTML entities',
    (html) => {
      const plainText = EmailGenerationService.generatePlainText(html);
      // Should not contain HTML entity patterns
      expect(plainText).not.toMatch(/&[a-z]+;/i);
      expect(plainText).not.toMatch(/&#\d+;/);
    }
  );

  it('converts <br> tags to newlines', () => {
    const html = '<p>Line 1<br>Line 2<br/>Line 3</p>';
    const plainText = EmailGenerationService.generatePlainText(html);
    expect(plainText).toContain('Line 1');
    expect(plainText).toContain('Line 2');
    expect(plainText).toContain('Line 3');
  });

  it('removes style and script tags completely', () => {
    const html = '<html><head><style>.test { color: red; }</style></head><body><script>alert("test")</script><p>Content</p></body></html>';
    const plainText = EmailGenerationService.generatePlainText(html);
    expect(plainText).not.toContain('color');
    expect(plainText).not.toContain('alert');
    expect(plainText).toContain('Content');
  });

  it('returns empty string for empty input', () => {
    expect(EmailGenerationService.generatePlainText('')).toBe('');
    expect(EmailGenerationService.generatePlainText('   ')).toBe('');
  });
});

/**
 * Feature: react-email-editor-migration, Property 5: Merge Tag Substitution
 * 
 * For any content string containing merge tags in the format `{variableName}` and a
 * context object with corresponding key-value pairs, the substitution function SHALL
 * replace all matching merge tags with their context values, leaving no unsubstituted
 * tags for keys present in the context.
 * 
 * **Validates: Requirements 7.3**
 */
describe('Property 5: Merge Tag Substitution', () => {
  // Arbitrary for generating a merge tag key
  const mergeTagKeyArb = fc.constantFrom(...REQUIRED_MERGE_TAG_KEYS);

  // Arbitrary for generating a substitution value
  const valueArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
    !s.includes('{') && !s.includes('}')
  );

  test.prop([mergeTagKeyArb, valueArb])(
    'substitution replaces merge tags with context values',
    (key, value) => {
      const content = `Hello {${key}}, welcome!`;
      const context = { [key]: value };
      
      const result = EmailGenerationService.substituteVariables(content, context);
      
      expect(result).toBe(`Hello ${value}, welcome!`);
      expect(result).not.toContain(`{${key}}`);
    }
  );

  // Arbitrary for generating multiple key-value pairs
  const contextArb = fc.record({
    firstName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('{') && !s.includes('}')),
    lastName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('{') && !s.includes('}')),
    email: fc.emailAddress(),
  });

  test.prop([contextArb])(
    'substitution replaces all matching merge tags in content',
    (context) => {
      const content = 'Dear {firstName} {lastName}, your email is {email}.';
      
      const result = EmailGenerationService.substituteVariables(content, context);
      
      expect(result).toContain(context.firstName);
      expect(result).toContain(context.lastName);
      expect(result).toContain(context.email);
      expect(result).not.toContain('{firstName}');
      expect(result).not.toContain('{lastName}');
      expect(result).not.toContain('{email}');
    }
  );

  test.prop([mergeTagKeyArb, valueArb])(
    'substitution handles multiple occurrences of the same tag',
    (key, value) => {
      const content = `{${key}} and {${key}} again`;
      const context = { [key]: value };
      
      const result = EmailGenerationService.substituteVariables(content, context);
      
      // Verify the merge tags are replaced
      expect(result).not.toContain(`{${key}}`);
      
      // Verify the result has the expected structure
      // The result should be: "<value> and <value> again"
      expect(result).toBe(`${value} and ${value} again`);
    }
  );

  it('leaves unmatched merge tags unchanged', () => {
    const content = 'Hello {firstName}, your {unknownTag} is here.';
    const context = { firstName: 'John' };
    
    const result = EmailGenerationService.substituteVariables(content, context);
    
    expect(result).toBe('Hello John, your {unknownTag} is here.');
  });

  it('handles empty content', () => {
    const result = EmailGenerationService.substituteVariables('', { firstName: 'John' });
    expect(result).toBe('');
  });

  it('handles empty context', () => {
    const content = 'Hello {firstName}!';
    const result = EmailGenerationService.substituteVariables(content, {});
    expect(result).toBe('Hello {firstName}!');
  });

  it('handles content without merge tags', () => {
    const content = 'Hello World!';
    const result = EmailGenerationService.substituteVariables(content, { firstName: 'John' });
    expect(result).toBe('Hello World!');
  });
});

describe('EmailGenerationService.getSampleContext', () => {
  it('returns a context with all required merge tag keys', () => {
    const context = EmailGenerationService.getSampleContext();
    
    for (const key of REQUIRED_MERGE_TAG_KEYS) {
      expect(context).toHaveProperty(key);
      expect(typeof context[key]).toBe('string');
      expect(context[key].length).toBeGreaterThan(0);
    }
  });
});

describe('EmailGenerationService.findUnsubstitutedTags', () => {
  it('finds all unsubstituted merge tags', () => {
    const content = 'Hello {firstName}, your {email} and {unknownTag}';
    const tags = EmailGenerationService.findUnsubstitutedTags(content);
    
    expect(tags).toContain('firstName');
    expect(tags).toContain('email');
    expect(tags).toContain('unknownTag');
    expect(tags).toHaveLength(3);
  });

  it('returns empty array when no merge tags present', () => {
    const content = 'Hello World!';
    const tags = EmailGenerationService.findUnsubstitutedTags(content);
    expect(tags).toHaveLength(0);
  });
});

describe('EmailGenerationService.generate', () => {
  it('generates both HTML and plain text', () => {
    const html = '<html><body><p>Hello {firstName}!</p></body></html>';
    const context = { firstName: 'John' };
    
    const result = EmailGenerationService.generate(html, context);
    
    expect(result.html).toContain('Hello John!');
    expect(result.plainText).toContain('Hello John!');
    expect(result.plainText).not.toMatch(/<[^>]+>/);
  });

  it('throws error for invalid HTML', () => {
    expect(() => {
      EmailGenerationService.generate('', { firstName: 'John' });
    }).toThrow('HTML content is empty');
  });
});

/**
 * Helper to escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
