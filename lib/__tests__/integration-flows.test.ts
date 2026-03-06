/**
 * @fileoverview Integration Tests for Admin Email Campaign Management
 * 
 * Tests the following integration flows:
 * - Webhook processing (bounce categorization, payload validation)
 * - Import wizard flow (file parsing, column mapping, row validation)
 * - Link tracking utilities (UTM parameters, URL generation)
 * 
 * These tests focus on unit-level integration testing that doesn't require
 * database setup, avoiding Neon HTTP driver eventual consistency issues.
 * 
 * Requirements: 3, 4, 6, 8, 12
 */

import { describe, it, expect } from 'vitest';
import { WebhookService } from '../services/webhook-service';
import { ImportService, type ColumnMapping } from '../services/import-service';
import { LinkTrackingService } from '../services/link-tracking-service';

// ============================================================================
// WEBHOOK PROCESSING FLOW
// ============================================================================
describe('Integration: Webhook Processing Flow', () => {
  describe('Bounce Categorization', () => {
    it('should categorize hard bounces correctly', () => {
      const hardBouncePatterns = [
        'Mailbox does not exist',
        'User unknown',
        'Invalid email address',
        'Address rejected',
        'Recipient rejected',
        '550 User not found',
        '551 User not local',
        '553 Invalid address',
        '554 Transaction failed',
      ];

      hardBouncePatterns.forEach(pattern => {
        const result = WebhookService.categorizeBounce(pattern);
        expect(result.type).toBe('hard');
        expect(result.isUndeliverable).toBe(true);
      });
    });

    it('should categorize soft bounces correctly', () => {
      const softBouncePatterns = [
        'Mailbox full, try again later',
        'Over quota',
        'Temporarily unavailable',
        'Try again later',
        'Rate limit exceeded',
        'Too many connections',
        'Connection timeout',
        'Service unavailable',
        '421 Try again later',
        '450 Mailbox busy',
        '451 Local error',
        '452 Insufficient storage',
      ];

      softBouncePatterns.forEach(pattern => {
        const result = WebhookService.categorizeBounce(pattern);
        expect(result.type).toBe('soft');
        expect(result.isUndeliverable).toBe(false);
      });
    });

    it('should respect explicit type from provider', () => {
      const explicitHard = WebhookService.categorizeBounce('Unknown error', 'hard');
      expect(explicitHard.type).toBe('hard');
      expect(explicitHard.isUndeliverable).toBe(true);

      const explicitSoft = WebhookService.categorizeBounce('Unknown error', 'soft');
      expect(explicitSoft.type).toBe('soft');
      expect(explicitSoft.isUndeliverable).toBe(false);
    });

    it('should default to soft bounce for unknown patterns', () => {
      const result = WebhookService.categorizeBounce('Some random error message');
      expect(result.type).toBe('soft');
      expect(result.isUndeliverable).toBe(false);
    });
  });

  describe('Webhook Payload Validation', () => {
    it('should validate correct webhook payloads', () => {
      const validPayload = {
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: {
          email_id: 'test-123',
          to: ['test@example.com'],
          created_at: new Date().toISOString(),
        },
      };

      const result = WebhookService.validatePayload(validPayload);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('email.delivered');
    });

    it('should reject invalid webhook payloads', () => {
      const invalidPayload = {
        type: 'invalid.type',
        data: {},
      };

      const result = WebhookService.validatePayload(invalidPayload);
      expect(result).toBeNull();
    });

    it('should validate all supported event types', () => {
      const eventTypes = [
        'email.sent',
        'email.delivered',
        'email.delivery_delayed',
        'email.bounced',
        'email.complained',
        'email.opened',
        'email.clicked',
      ];

      eventTypes.forEach(type => {
        const payload = {
          type,
          created_at: new Date().toISOString(),
          data: {
            email_id: 'test-123',
            to: ['test@example.com'],
            created_at: new Date().toISOString(),
          },
        };

        const result = WebhookService.validatePayload(payload);
        expect(result).not.toBeNull();
        expect(result?.type).toBe(type);
      });
    });
  });
});


// ============================================================================
// IMPORT WIZARD FLOW
// ============================================================================
describe('Integration: Import Wizard Flow', () => {
  describe('File Type Detection', () => {
    it('should detect CSV files correctly', () => {
      expect(ImportService.detectFileType('guests.csv')).toBe('csv');
      expect(ImportService.detectFileType('GUESTS.CSV')).toBe('csv');
      expect(ImportService.detectFileType('data.CSV')).toBe('csv');
    });

    it('should detect Excel files correctly', () => {
      expect(ImportService.detectFileType('guests.xlsx')).toBe('xlsx');
      expect(ImportService.detectFileType('guests.xls')).toBe('xls');
      expect(ImportService.detectFileType('DATA.XLSX')).toBe('xlsx');
    });

    it('should default to CSV for unknown extensions', () => {
      expect(ImportService.detectFileType('guests.txt')).toBe('csv');
      expect(ImportService.detectFileType('guests')).toBe('csv');
      expect(ImportService.detectFileType('data.json')).toBe('csv');
    });
  });

  describe('CSV Parsing', () => {
    it('should parse valid CSV content with headers', () => {
      const csvContent = `First Name,Last Name,Email
John,Doe,john@example.com
Jane,Smith,jane@example.com`;

      const result = ImportService.parseCSV(csvContent);

      expect(result.headers).toEqual(['first name', 'last name', 'email']);
      expect(result.rows).toHaveLength(2);
      expect(result.totalRows).toBe(2);
      expect(result.fileType).toBe('csv');
    });

    it('should normalize headers to lowercase', () => {
      const csvContent = `FIRST NAME,Last Name,EMAIL
John,Doe,john@example.com`;

      const result = ImportService.parseCSV(csvContent);

      expect(result.headers).toEqual(['first name', 'last name', 'email']);
    });

    it('should skip empty lines', () => {
      const csvContent = `First Name,Last Name,Email
John,Doe,john@example.com

Jane,Smith,jane@example.com
`;

      const result = ImportService.parseCSV(csvContent);

      expect(result.rows).toHaveLength(2);
    });

    it('should handle CSV with only headers', () => {
      const csvContent = `First Name,Last Name,Email`;

      const result = ImportService.parseCSV(csvContent);

      expect(result.headers).toEqual(['first name', 'last name', 'email']);
      expect(result.rows).toHaveLength(0);
    });

    it('should handle CSV with special characters in values', () => {
      const csvContent = `First Name,Last Name,Email
"John, Jr.",Doe,john@example.com
Jane,"Smith-Jones",jane@example.com`;

      const result = ImportService.parseCSV(csvContent);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]['first name']).toBe('John, Jr.');
      expect(result.rows[1]['last name']).toBe('Smith-Jones');
    });
  });

  describe('Column Mapping Auto-Detection', () => {
    it('should auto-detect standard column names', () => {
      const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Company'];
      
      const mapping = ImportService.autoDetectColumnMapping(headers);

      expect(mapping.firstName).toBe('First Name');
      expect(mapping.lastName).toBe('Last Name');
      expect(mapping.email).toBe('Email');
      expect(mapping.mobile).toBe('Phone');
      expect(mapping.company).toBe('Company');
    });

    it('should detect alternative column name variations', () => {
      const headers = ['fname', 'surname', 'e-mail', 'mobile number', 'organization'];
      
      const mapping = ImportService.autoDetectColumnMapping(headers);

      expect(mapping.firstName).toBe('fname');
      expect(mapping.lastName).toBe('surname');
      expect(mapping.email).toBe('e-mail');
      expect(mapping.mobile).toBe('mobile number');
      expect(mapping.company).toBe('organization');
    });

    it('should handle case-insensitive matching', () => {
      const headers = ['FIRSTNAME', 'LASTNAME', 'EMAIL'];
      
      const mapping = ImportService.autoDetectColumnMapping(headers);

      expect(mapping.firstName).toBe('FIRSTNAME');
      expect(mapping.lastName).toBe('LASTNAME');
      expect(mapping.email).toBe('EMAIL');
    });

    it('should return empty mapping for unrecognized headers', () => {
      const headers = ['Column A', 'Column B', 'Column C'];
      
      const mapping = ImportService.autoDetectColumnMapping(headers);

      expect(mapping.firstName).toBeUndefined();
      expect(mapping.lastName).toBeUndefined();
      expect(mapping.email).toBeUndefined();
    });

    it('should detect job title variations', () => {
      const headers = ['First Name', 'Last Name', 'Email', 'Job Title'];
      const mapping = ImportService.autoDetectColumnMapping(headers);
      expect(mapping.jobTitle).toBe('Job Title');

      const headers2 = ['First Name', 'Last Name', 'Email', 'Position'];
      const mapping2 = ImportService.autoDetectColumnMapping(headers2);
      expect(mapping2.jobTitle).toBe('Position');
    });
  });

  describe('Column Mapping Validation', () => {
    it('should validate complete mapping with all required fields', () => {
      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
      };

      const result = ImportService.validateColumnMapping(mapping);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require firstName column', () => {
      const mapping: ColumnMapping = {
        lastName: 'Last Name',
        email: 'Email',
      };

      const result = ImportService.validateColumnMapping(mapping);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('First name column is required');
    });

    it('should require lastName column', () => {
      const mapping: ColumnMapping = {
        firstName: 'First Name',
        email: 'Email',
      };

      const result = ImportService.validateColumnMapping(mapping);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Last name column is required');
    });

    it('should require email column', () => {
      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
      };

      const result = ImportService.validateColumnMapping(mapping);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Email column is required');
    });

    it('should report all missing required fields', () => {
      const mapping: ColumnMapping = {};

      const result = ImportService.validateColumnMapping(mapping);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });
  });

  describe('Row Validation', () => {
    it('should validate rows with valid data', () => {
      const parseResult = {
        headers: ['first name', 'last name', 'email'],
        rows: [
          { 'first name': 'John', 'last name': 'Doe', 'email': 'john@example.com' },
          { 'first name': 'Jane', 'last name': 'Smith', 'email': 'jane@example.com' },
        ],
        totalRows: 2,
        fileType: 'csv' as const,
      };

      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
      };

      const result = ImportService.validateRows(parseResult, mapping);

      expect(result.isValid).toBe(true);
      expect(result.validRows).toBe(2);
      expect(result.invalidRows).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid email addresses', () => {
      const parseResult = {
        headers: ['first name', 'last name', 'email'],
        rows: [
          { 'first name': 'John', 'last name': 'Doe', 'email': 'not-an-email' },
        ],
        totalRows: 1,
        fileType: 'csv' as const,
      };

      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
      };

      const result = ImportService.validateRows(parseResult, mapping);

      expect(result.isValid).toBe(false);
      expect(result.invalidRows).toBe(1);
      expect(result.errors.some(e => e.column === 'email')).toBe(true);
    });

    it('should detect missing required fields', () => {
      const parseResult = {
        headers: ['first name', 'last name', 'email'],
        rows: [
          { 'first name': '', 'last name': 'Doe', 'email': 'john@example.com' },
        ],
        totalRows: 1,
        fileType: 'csv' as const,
      };

      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
      };

      const result = ImportService.validateRows(parseResult, mapping);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.column === 'firstName')).toBe(true);
    });

    it('should warn about duplicate emails in file', () => {
      const parseResult = {
        headers: ['first name', 'last name', 'email'],
        rows: [
          { 'first name': 'John', 'last name': 'Doe', 'email': 'john@example.com' },
          { 'first name': 'Johnny', 'last name': 'Doe', 'email': 'john@example.com' },
        ],
        totalRows: 2,
        fileType: 'csv' as const,
      };

      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
      };

      const result = ImportService.validateRows(parseResult, mapping);

      expect(result.warnings.some(w => w.error === 'Duplicate email in file')).toBe(true);
    });

    it('should include preview of first 100 rows', () => {
      const rows = [];
      for (let i = 0; i < 150; i++) {
        rows.push({
          'first name': `User${i}`,
          'last name': `Test${i}`,
          'email': `user${i}@example.com`,
        });
      }

      const parseResult = {
        headers: ['first name', 'last name', 'email'],
        rows,
        totalRows: 150,
        fileType: 'csv' as const,
      };

      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
      };

      const result = ImportService.validateRows(parseResult, mapping);

      expect(result.preview).toHaveLength(100);
    });
  });
});

// ============================================================================
// LINK TRACKING UTILITIES
// ============================================================================
describe('Integration: Link Tracking Utilities', () => {
  describe('UTM Parameter Building', () => {
    it('should build URL with all UTM parameters', () => {
      const result = LinkTrackingService.buildUrlWithUTM(
        'https://example.com/page',
        {
          utmSource: 'email',
          utmMedium: 'campaign',
          utmCampaign: 'test-campaign',
          utmContent: 'cta-button',
        }
      );

      expect(result).toContain('utm_source=email');
      expect(result).toContain('utm_medium=campaign');
      expect(result).toContain('utm_campaign=test-campaign');
      expect(result).toContain('utm_content=cta-button');
    });

    it('should preserve existing query parameters', () => {
      const result = LinkTrackingService.buildUrlWithUTM(
        'https://example.com/page?existing=param&foo=bar',
        { utmSource: 'email' }
      );

      expect(result).toContain('existing=param');
      expect(result).toContain('foo=bar');
      expect(result).toContain('utm_source=email');
    });

    it('should handle partial UTM parameters', () => {
      const result = LinkTrackingService.buildUrlWithUTM(
        'https://example.com',
        { utmSource: 'email', utmCampaign: 'newsletter' }
      );

      expect(result).toContain('utm_source=email');
      expect(result).toContain('utm_campaign=newsletter');
      expect(result).not.toContain('utm_medium');
      expect(result).not.toContain('utm_content');
    });

    it('should return original URL for invalid URLs', () => {
      const result = LinkTrackingService.buildUrlWithUTM(
        'not-a-valid-url',
        { utmSource: 'email' }
      );

      expect(result).toBe('not-a-valid-url');
    });

    it('should handle empty UTM parameters', () => {
      const result = LinkTrackingService.buildUrlWithUTM(
        'https://example.com/page',
        {}
      );

      expect(result).toBe('https://example.com/page');
    });
  });

  describe('Link Label Extraction', () => {
    it('should extract text content from anchor tag', () => {
      const label = LinkTrackingService.extractLinkLabel(
        '<a href="https://example.com">Click here</a>'
      );
      expect(label).toBe('Click here');
    });

    it('should extract title attribute if no text content', () => {
      const label = LinkTrackingService.extractLinkLabel(
        '<a href="https://example.com" title="Visit our site"><img src="logo.png"/></a>'
      );
      expect(label).toBe('Visit our site');
    });

    it('should return null for anchor with no text or title', () => {
      const label = LinkTrackingService.extractLinkLabel(
        '<a href="https://example.com"><img src="logo.png"/></a>'
      );
      expect(label).toBeNull();
    });

    it('should truncate long labels to 100 characters', () => {
      const longText = 'A'.repeat(150);
      const label = LinkTrackingService.extractLinkLabel(
        `<a href="https://example.com">${longText}</a>`
      );
      expect(label?.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(label?.endsWith('...')).toBe(true);
    });

    it('should trim whitespace from extracted labels', () => {
      const label = LinkTrackingService.extractLinkLabel(
        '<a href="https://example.com">  Click here  </a>'
      );
      expect(label).toBe('Click here');
    });
  });

  describe('Tracking URL Generation', () => {
    it('should generate tracking URL with email parameter', () => {
      const url = LinkTrackingService.generateTrackingUrl(
        'link123',
        'https://myapp.com',
        'user@example.com'
      );

      expect(url).toBe('https://myapp.com/track/link123?email=user%40example.com');
    });

    it('should include campaign message ID when provided', () => {
      const url = LinkTrackingService.generateTrackingUrl(
        'link123',
        'https://myapp.com',
        'user@example.com',
        'msg456'
      );

      expect(url).toBe('https://myapp.com/track/link123?email=user%40example.com&mid=msg456');
    });

    it('should properly encode special characters in email', () => {
      const url = LinkTrackingService.generateTrackingUrl(
        'link123',
        'https://myapp.com',
        'user+test@example.com'
      );

      expect(url).toContain('email=user%2Btest%40example.com');
    });

    it('should handle base URLs with trailing slash', () => {
      const url = LinkTrackingService.generateTrackingUrl(
        'link123',
        'https://myapp.com/',
        'user@example.com'
      );

      expect(url).toContain('/track/link123');
      expect(url).toContain('email=user%40example.com');
    });
  });

  describe('Tracking Link Personalization', () => {
    it('should add email parameter to tracking links', () => {
      const content = '<a href="https://myapp.com/track/abc123">Click here</a>';
      
      const result = LinkTrackingService.personalizeTrackingLinks(
        content,
        'https://myapp.com',
        'user@example.com'
      );

      expect(result).toContain('email=user%40example.com');
      expect(result).toContain('/track/abc123');
    });

    it('should add both email and message ID parameters', () => {
      const content = '<a href="https://myapp.com/track/abc123">Click here</a>';
      
      const result = LinkTrackingService.personalizeTrackingLinks(
        content,
        'https://myapp.com',
        'user@example.com',
        'msg456'
      );

      expect(result).toContain('email=user%40example.com');
      expect(result).toContain('mid=msg456');
    });

    it('should handle multiple tracking links', () => {
      const content = `
        <a href="https://myapp.com/track/link1">Link 1</a>
        <a href="https://myapp.com/track/link2">Link 2</a>
      `;
      
      const result = LinkTrackingService.personalizeTrackingLinks(
        content,
        'https://myapp.com',
        'user@example.com'
      );

      const matches = result.match(/email=user%40example\.com/g);
      expect(matches).toHaveLength(2);
    });

    it('should preserve non-tracking links', () => {
      const content = `
        <a href="https://myapp.com/track/abc123">Tracked</a>
        <a href="https://example.com/page">Not tracked</a>
      `;
      
      const result = LinkTrackingService.personalizeTrackingLinks(
        content,
        'https://myapp.com',
        'user@example.com'
      );

      expect(result).toContain('https://example.com/page');
      expect(result).not.toContain('example.com/page?email=');
    });

    it('should handle single quotes in href attributes', () => {
      const content = "<a href='https://myapp.com/track/abc123'>Click here</a>";
      
      const result = LinkTrackingService.personalizeTrackingLinks(
        content,
        'https://myapp.com',
        'user@example.com'
      );

      expect(result).toContain('email=user%40example.com');
      expect(result).toContain("href='");
    });

    it('should not modify content without tracking links', () => {
      const content = '<a href="https://example.com">External link</a>';
      
      const result = LinkTrackingService.personalizeTrackingLinks(
        content,
        'https://myapp.com',
        'user@example.com'
      );

      expect(result).toBe(content);
    });
  });

  describe('Regex Escaping', () => {
    it('should escape special regex characters', () => {
      const escaped = LinkTrackingService.escapeRegExp('https://example.com/path?query=value');
      expect(escaped).toContain('\\.');
      expect(escaped).toContain('\\?');
    });

    it('should handle strings without special characters', () => {
      const escaped = LinkTrackingService.escapeRegExp('simple-string');
      expect(escaped).toBe('simple-string');
    });

    it('should escape all special regex characters', () => {
      const specialChars = '.*+?^${}()|[]\\';
      const escaped = LinkTrackingService.escapeRegExp(specialChars);
      // Each special character should be escaped
      expect(escaped).not.toBe(specialChars);
    });
  });
});
