import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  ImportService,
  columnMappingSchema,
  importOptionsSchema,
  DEFAULT_BATCH_SIZE,
  MAX_ROWS,
  type ColumnMapping,
  type ImportOptions,
} from '../services/import-service';
import { db } from '@/db';
import { guests, eventGuests, events } from '@/db/schema';
import { eq, like } from 'drizzle-orm';

describe('ImportService', () => {
  const TEST_PREFIX = `import_test_${Date.now()}_`;
  let testEventId: string;

  beforeAll(async () => {
    // Create test event
    const [event] = await db.insert(events).values({
      name: `${TEST_PREFIX}Event`,
      type: 'Conference',
      description: 'Test event for import service tests',
      startDate: new Date('2025-06-01'),
      endDate: new Date('2025-06-02'),
      location: 'Test Location',
      hostName: 'Test Host',
      hostEmail: `${TEST_PREFIX}host@example.com`,
    }).returning();
    testEventId = event.id;
  });

  beforeEach(async () => {
    // Clean up test guests before each test
    await db.delete(eventGuests).where(eq(eventGuests.eventId, testEventId));
    await db.delete(guests).where(like(guests.email, `%${TEST_PREFIX}%`));
  });

  afterAll(async () => {
    // Clean up all test data
    await db.delete(eventGuests).where(eq(eventGuests.eventId, testEventId));
    await db.delete(guests).where(like(guests.email, `%${TEST_PREFIX}%`));
    await db.delete(events).where(eq(events.id, testEventId));
  });

  describe('Validation Schemas', () => {
    describe('columnMappingSchema', () => {
      it('should accept valid column mapping', () => {
        const mapping = {
          firstName: 'First Name',
          lastName: 'Last Name',
          email: 'Email',
        };

        const result = columnMappingSchema.parse(mapping);
        expect(result.firstName).toBe('First Name');
        expect(result.lastName).toBe('Last Name');
        expect(result.email).toBe('Email');
      });

      it('should accept partial mapping', () => {
        const mapping = {
          email: 'Email Address',
        };

        const result = columnMappingSchema.parse(mapping);
        expect(result.email).toBe('Email Address');
        expect(result.firstName).toBeUndefined();
      });

      it('should accept empty mapping', () => {
        const result = columnMappingSchema.parse({});
        expect(result).toEqual({});
      });
    });

    describe('importOptionsSchema', () => {
      it('should accept valid import options', () => {
        const options = {
          eventId: 'event-123',
          duplicateHandling: 'update' as const,
          batchSize: 50,
          validateOnly: false,
        };

        const result = importOptionsSchema.parse(options);
        expect(result.eventId).toBe('event-123');
        expect(result.duplicateHandling).toBe('update');
        expect(result.batchSize).toBe(50);
      });

      it('should apply defaults', () => {
        const result = importOptionsSchema.parse({});
        expect(result.duplicateHandling).toBe('update');
        expect(result.batchSize).toBe(100);
        expect(result.validateOnly).toBe(false);
      });

      it('should reject invalid duplicate handling', () => {
        expect(() => importOptionsSchema.parse({
          duplicateHandling: 'invalid',
        })).toThrow();
      });

      it('should reject batch size out of range', () => {
        expect(() => importOptionsSchema.parse({
          batchSize: 0,
        })).toThrow();

        expect(() => importOptionsSchema.parse({
          batchSize: 1001,
        })).toThrow();
      });
    });
  });

  describe('File Type Detection', () => {
    it('should detect CSV files', () => {
      expect(ImportService.detectFileType('guests.csv')).toBe('csv');
      expect(ImportService.detectFileType('GUESTS.CSV')).toBe('csv');
    });

    it('should detect XLSX files', () => {
      expect(ImportService.detectFileType('guests.xlsx')).toBe('xlsx');
      expect(ImportService.detectFileType('GUESTS.XLSX')).toBe('xlsx');
    });

    it('should detect XLS files', () => {
      expect(ImportService.detectFileType('guests.xls')).toBe('xls');
    });

    it('should default to CSV for unknown extensions', () => {
      expect(ImportService.detectFileType('guests.txt')).toBe('csv');
      expect(ImportService.detectFileType('guests')).toBe('csv');
    });
  });

  describe('CSV Parsing', () => {
    it('should parse valid CSV content', () => {
      const csvContent = `First Name,Last Name,Email
John,Doe,john@example.com
Jane,Smith,jane@example.com`;

      const result = ImportService.parseCSV(csvContent);

      expect(result.headers).toEqual(['first name', 'last name', 'email']);
      expect(result.rows).toHaveLength(2);
      expect(result.totalRows).toBe(2);
      expect(result.fileType).toBe('csv');
    });

    it('should handle headers with different cases', () => {
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

    it('should handle empty CSV', () => {
      const csvContent = `First Name,Last Name,Email`;

      const result = ImportService.parseCSV(csvContent);

      expect(result.headers).toEqual(['first name', 'last name', 'email']);
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('Column Mapping Auto-Detection', () => {
    it('should auto-detect common column names', () => {
      const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Company'];
      
      const mapping = ImportService.autoDetectColumnMapping(headers);

      expect(mapping.firstName).toBe('First Name');
      expect(mapping.lastName).toBe('Last Name');
      expect(mapping.email).toBe('Email');
      expect(mapping.mobile).toBe('Phone');
      expect(mapping.company).toBe('Company');
    });

    it('should detect alternative column names', () => {
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
  });

  describe('Column Mapping Validation', () => {
    it('should validate complete mapping', () => {
      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
      };

      const result = ImportService.validateColumnMapping(mapping);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require firstName', () => {
      const mapping: ColumnMapping = {
        lastName: 'Last Name',
        email: 'Email',
      };

      const result = ImportService.validateColumnMapping(mapping);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('First name column is required');
    });

    it('should require lastName', () => {
      const mapping: ColumnMapping = {
        firstName: 'First Name',
        email: 'Email',
      };

      const result = ImportService.validateColumnMapping(mapping);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Last name column is required');
    });

    it('should require email', () => {
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

  describe('Row Mapping', () => {
    it('should map row data using column mapping', () => {
      const row = {
        'first name': 'John',
        'last name': 'Doe',
        'email': 'john@example.com',
        'phone': '123-456-7890',
        'company': 'Acme Inc',
      };

      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
        mobile: 'Phone',
        company: 'Company',
      };

      const result = ImportService.mapRow(row, mapping);

      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.email).toBe('john@example.com');
      expect(result.mobile).toBe('123-456-7890');
      expect(result.company).toBe('Acme Inc');
    });

    it('should handle missing columns', () => {
      const row = {
        'first name': 'John',
        'last name': 'Doe',
        'email': 'john@example.com',
      };

      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
        mobile: 'Phone', // Not in row
      };

      const result = ImportService.mapRow(row, mapping);

      expect(result.firstName).toBe('John');
      expect(result.mobile).toBe('');
    });
  });

  describe('Row Validation', () => {
    it('should validate valid rows', () => {
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

    it('should reject files exceeding MAX_ROWS', () => {
      const parseResult = {
        headers: ['first name', 'last name', 'email'],
        rows: [],
        totalRows: MAX_ROWS + 1,
        fileType: 'csv' as const,
      };

      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
      };

      const result = ImportService.validateRows(parseResult, mapping);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].error).toContain('exceeds maximum row limit');
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

  describe('Batch Processing', () => {
    it('should process batch and create new guests', async () => {
      const rows = [
        { 'first name': 'John', 'last name': 'Doe', 'email': `${TEST_PREFIX}john@example.com` },
        { 'first name': 'Jane', 'last name': 'Smith', 'email': `${TEST_PREFIX}jane@example.com` },
      ];

      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
      };

      const options: ImportOptions = {
        duplicateHandling: 'skip',
      };

      const result = await ImportService.processBatch(rows, mapping, options, 2);

      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify guests were created
      const john = await db.query.guests.findFirst({
        where: eq(guests.email, `${TEST_PREFIX}john@example.com`),
      });
      expect(john).not.toBeNull();
      expect(john!.firstName).toBe('John');
    });

    it('should skip duplicates when duplicateHandling is skip', async () => {
      // Create existing guest
      await db.insert(guests).values({
        firstName: 'Existing',
        lastName: 'User',
        email: `${TEST_PREFIX}existing@example.com`,
      });

      const rows = [
        { 'first name': 'New', 'last name': 'User', 'email': `${TEST_PREFIX}existing@example.com` },
      ];

      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
      };

      const options: ImportOptions = {
        duplicateHandling: 'skip',
      };

      const result = await ImportService.processBatch(rows, mapping, options, 2);

      expect(result.successCount).toBe(1);

      // Verify guest was NOT updated
      const guest = await db.query.guests.findFirst({
        where: eq(guests.email, `${TEST_PREFIX}existing@example.com`),
      });
      expect(guest!.firstName).toBe('Existing');
    });

    it('should update duplicates when duplicateHandling is update', async () => {
      // Create existing guest
      await db.insert(guests).values({
        firstName: 'Existing',
        lastName: 'User',
        email: `${TEST_PREFIX}update@example.com`,
      });

      const rows = [
        { 'first name': 'Updated', 'last name': 'Name', 'email': `${TEST_PREFIX}update@example.com` },
      ];

      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
      };

      const options: ImportOptions = {
        duplicateHandling: 'update',
      };

      const result = await ImportService.processBatch(rows, mapping, options, 2);

      expect(result.successCount).toBe(1);

      // Verify guest was updated
      const guest = await db.query.guests.findFirst({
        where: eq(guests.email, `${TEST_PREFIX}update@example.com`),
      });
      expect(guest!.firstName).toBe('Updated');
      expect(guest!.lastName).toBe('Name');
    });

    it('should report validation errors', async () => {
      const rows = [
        { 'first name': '', 'last name': 'Doe', 'email': `${TEST_PREFIX}invalid@example.com` },
      ];

      const mapping: ColumnMapping = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
      };

      const options: ImportOptions = {
        duplicateHandling: 'skip',
      };

      const result = await ImportService.processBatch(rows, mapping, options, 2);

      expect(result.errorCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(2);
    });
  });

  describe('Constants', () => {
    it('should have correct DEFAULT_BATCH_SIZE', () => {
      expect(DEFAULT_BATCH_SIZE).toBe(100);
    });

    it('should have correct MAX_ROWS', () => {
      expect(MAX_ROWS).toBe(100000);
    });
  });
});
