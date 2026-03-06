/**
 * @fileoverview Import Parser - Client-safe CSV/Excel parsing utilities
 * 
 * This module provides client-side file parsing and validation for the import wizard.
 * It does NOT include any database operations and is safe to use in client components.
 * 
 * For server-side database operations, use import-service.ts
 * 
 * @module lib/services/import-parser
 * @requires xlsx - Excel file parsing
 * @requires papaparse - CSV parsing
 * @requires zod - Schema validation
 * 
 * Requirements: 8
 */

import '@/lib/utils/self-polyfill';
import { z } from 'zod';
import Papa from 'papaparse';
import { sanitizePhoneInput, validatePhoneNumber } from '@/lib/utils/phone-validation';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

/**
 * Supported file types for import
 */
export type ImportFileType = 'csv' | 'xlsx' | 'xls';

/**
 * Column mapping configuration
 * Maps source column names to guest field names
 */
export interface ColumnMapping {
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  company?: string;
  jobTitle?: string;
  photoUrl?: string;
}

/**
 * Validation error for a single row
 */
export interface RowValidationError {
  row: number;
  column?: string;
  value?: string;
  error: string;
}

/**
 * Phone validation warning for a single row
 */
export interface PhoneWarning {
  row: number;
  original: string;
  reason: string;
}

/**
 * Validation result for the entire file
 */
export interface ValidationResult {
  isValid: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: RowValidationError[];
  warnings: RowValidationError[];
  preview: ParsedRow[];
  /** Rows where phone numbers failed validation (record still imported, phone left blank) */
  phoneWarnings: PhoneWarning[];
}

/**
 * Parsed row from CSV/Excel
 */
export interface ParsedRow {
  rowNumber: number;
  data: Record<string, string>;
  isValid: boolean;
  errors: string[];
}

/**
 * Import options for batch processing
 */
export interface ImportOptions {
  eventId?: string;
  duplicateHandling: 'skip' | 'update' | 'create_new';
  batchSize?: number;
  validateOnly?: boolean;
}

/**
 * Import progress tracking
 */
export interface ImportProgress {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  percentComplete: number;
  estimatedTimeRemaining?: number;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Import job result
 */
export interface ImportJobResult {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: RowValidationError[];
  errorReportUrl?: string;
}

/**
 * File parse result
 */
export interface FileParseResult {
  headers: string[];
  rows: Record<string, string>[];
  rawRows: string[][];  // Raw rows for header selection UI
  totalRows: number;
  fileType: ImportFileType;
  headerRowIndex: number;  // Which row index was used as header (0-based)
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Schema for column mapping input
 */
export const columnMappingSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  mobile: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  photoUrl: z.string().optional(),
});

/**
 * Schema for import options
 */
export const importOptionsSchema = z.object({
  eventId: z.string().optional(),
  duplicateHandling: z.enum(['skip', 'update', 'create_new']).default('update'),
  batchSize: z.number().min(1).max(1000).default(100),
  validateOnly: z.boolean().default(false),
});

/**
 * Schema for guest row validation
 */
const guestRowSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address').toLowerCase(),
  mobile: z.string().trim().optional(),
  company: z.string().trim().optional(),
  jobTitle: z.string().trim().optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default batch size for processing
 */
export const DEFAULT_BATCH_SIZE = 100;

/**
 * Maximum file size (100MB)
 */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/**
 * Maximum rows per import (100,000)
 */
export const MAX_ROWS = 100000;

/**
 * Common column name mappings for auto-detection
 */
const COLUMN_NAME_MAPPINGS: Record<string, string[]> = {
  firstName: ['firstname', 'first_name', 'first name', 'fname', 'given name', 'givenname'],
  lastName: ['lastname', 'last_name', 'last name', 'lname', 'surname', 'family name', 'familyname'],
  email: ['email', 'e-mail', 'email address', 'emailaddress', 'mail'],
  mobile: ['mobile', 'phone', 'mobile number', 'phone number', 'mobilenumber', 'phonenumber', 'cell', 'telephone'],
  company: ['company', 'organization', 'organisation', 'company name', 'companyname', 'employer'],
  jobTitle: ['jobtitle', 'job_title', 'job title', 'title', 'position', 'role', 'designation'],
  photoUrl: ['photo', 'photo_url', 'photourl', 'photo url', 'image', 'image_url', 'imageurl', 'avatar', 'picture'],
};


// ============================================================================
// IMPORT PARSER
// ============================================================================

/**
 * ImportParser - Client-safe file parsing and validation
 * 
 * Features:
 * - CSV and Excel file parsing
 * - Automatic column name detection
 * - Custom column mapping
 * - Validation with detailed error reporting
 * 
 * Requirements: 8
 */
export const ImportParser = {
  /**
   * Detects the file type from the file name or content
   */
  detectFileType(fileName: string): ImportFileType {
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext === 'xlsx') return 'xlsx';
    if (ext === 'xls') return 'xls';
    return 'csv';
  },

  /**
   * Parses a file (CSV or Excel) and returns the data
   * 
   * @param fileContent - File content as Buffer or string
   * @param fileName - Original file name for type detection
   * @param headerRowIndex - Which row to use as headers (0-based, default 0)
   * @returns Parsed file data with headers and rows
   */
  async parseFile(
    fileContent: Buffer | string,
    fileName: string,
    headerRowIndex: number = 0
  ): Promise<FileParseResult> {
    const fileType = this.detectFileType(fileName);

    if (fileType === 'csv') {
      return this.parseCSV(fileContent as string, headerRowIndex);
    } else {
      return this.parseExcel(fileContent as Buffer, fileType, headerRowIndex);
    }
  },

  /**
   * Parses CSV content
   * @param content - CSV content as string
   * @param headerRowIndex - Which row to use as headers (0-based)
   */
  parseCSV(content: string, headerRowIndex: number = 0): FileParseResult {
    // First parse without headers to get raw data
    const rawParseResult = Papa.parse<string[]>(content, {
      header: false,
      skipEmptyLines: true,
    });
    
    const rawRows = rawParseResult.data;
    
    if (rawRows.length === 0) {
      return { headers: [], rows: [], rawRows: [], totalRows: 0, fileType: 'csv', headerRowIndex: 0 };
    }
    
    // Extract headers from specified row
    const headers = (rawRows[headerRowIndex] || []).map(h => String(h || '').trim().toLowerCase());
    
    // Convert remaining rows to objects (skip rows before and including header row)
    const rows: Record<string, string>[] = [];
    for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
      const rowData = rawRows[i];
      const row: Record<string, string> = {};
      
      headers.forEach((header, index) => {
        if (header) {
          row[header] = String(rowData[index] || '').trim();
        }
      });
      
      // Skip completely empty rows
      if (Object.values(row).some(v => v !== '')) {
        rows.push(row);
      }
    }

    return {
      headers,
      rows,
      rawRows,
      totalRows: rows.length,
      fileType: 'csv',
      headerRowIndex,
    };
  },

  /**
   * Parses Excel content (xlsx or xls)
   * @param content - Excel file content as Buffer
   * @param fileType - The Excel file type
   * @param headerRowIndex - Which row to use as headers (0-based)
   */
  async parseExcel(content: Buffer, fileType: ImportFileType, headerRowIndex: number = 0): Promise<FileParseResult> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(content, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON with headers (header: 1 returns array of arrays)
    const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
    });

    if (jsonData.length === 0) {
      return { headers: [], rows: [], rawRows: [], totalRows: 0, fileType, headerRowIndex: 0 };
    }

    // Store raw rows for header selection UI
    const rawRows: string[][] = jsonData.map(row => 
      (row as unknown[]).map(cell => String(cell || '').trim())
    );

    // Extract headers from specified row
    const headers = (jsonData[headerRowIndex] as string[]).map(h => 
      String(h || '').trim().toLowerCase()
    );
    
    // Convert remaining rows to objects (skip rows before and including header row)
    const rows: Record<string, string>[] = [];
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const rowData = jsonData[i] as unknown[];
      const row: Record<string, string> = {};
      
      headers.forEach((header, index) => {
        if (header) {
          row[header] = String(rowData[index] || '').trim();
        }
      });
      
      // Skip completely empty rows
      if (Object.values(row).some(v => v !== '')) {
        rows.push(row);
      }
    }

    return { headers, rows, rawRows, totalRows: rows.length, fileType, headerRowIndex };
  },


  /**
   * Auto-detects column mapping based on header names
   * 
   * @param headers - Array of column headers from the file
   * @returns Suggested column mapping
   */
  autoDetectColumnMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

    for (const [field, possibleNames] of Object.entries(COLUMN_NAME_MAPPINGS)) {
      for (const name of possibleNames) {
        const index = normalizedHeaders.indexOf(name);
        if (index !== -1) {
          mapping[field as keyof ColumnMapping] = headers[index];
          break;
        }
      }
    }

    return mapping;
  },

  /**
   * Validates the column mapping to ensure required fields are mapped
   * 
   * @param mapping - Column mapping to validate
   * @returns Validation result with any errors
   */
  validateColumnMapping(mapping: ColumnMapping): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!mapping.firstName) {
      errors.push('First name column is required');
    }
    if (!mapping.lastName) {
      errors.push('Last name column is required');
    }
    if (!mapping.email) {
      errors.push('Email column is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  /**
   * Maps a row using the column mapping
   */
  mapRow(row: Record<string, string>, mapping: ColumnMapping): Record<string, string> {
    return {
      firstName: mapping.firstName ? row[mapping.firstName.toLowerCase()] || '' : '',
      lastName: mapping.lastName ? row[mapping.lastName.toLowerCase()] || '' : '',
      email: mapping.email ? row[mapping.email.toLowerCase()] || '' : '',
      mobile: mapping.mobile ? row[mapping.mobile.toLowerCase()] || '' : '',
      company: mapping.company ? row[mapping.company.toLowerCase()] || '' : '',
      jobTitle: mapping.jobTitle ? row[mapping.jobTitle.toLowerCase()] || '' : '',
      photoUrl: mapping.photoUrl ? row[mapping.photoUrl.toLowerCase()] || '' : '',
    };
  },

  /**
   * Validates all rows in the parsed file
   * 
   * @param parseResult - Parsed file data
   * @param mapping - Column mapping to use
   * @returns Validation result with errors and preview
   */
  validateRows(
    parseResult: FileParseResult,
    mapping: ColumnMapping
  ): ValidationResult {
    const errors: RowValidationError[] = [];
    const warnings: RowValidationError[] = [];
    const phoneWarnings: PhoneWarning[] = [];
    const preview: ParsedRow[] = [];
    let validRows = 0;
    let invalidRows = 0;

    // Check row limit
    if (parseResult.totalRows > MAX_ROWS) {
      errors.push({
        row: 0,
        error: `File exceeds maximum row limit of ${MAX_ROWS.toLocaleString()} rows`,
      });
      return {
        isValid: false,
        totalRows: parseResult.totalRows,
        validRows: 0,
        invalidRows: parseResult.totalRows,
        errors,
        warnings,
        phoneWarnings,
        preview: [],
      };
    }

    // Validate each row
    for (let i = 0; i < parseResult.rows.length; i++) {
      const row = parseResult.rows[i];
      const mappedRow = this.mapRow(row, mapping);
      const rowNumber = i + 2; // Account for header row and 0-indexing
      const rowErrors: string[] = [];

      // ---- Phone number sanitization & validation ----
      if (mappedRow.mobile) {
        const phoneResult = validatePhoneNumber(mappedRow.mobile);
        if (phoneResult.isValid && phoneResult.sanitized) {
          // Store validated number (digits only, E.164 without +)
          mappedRow.mobile = phoneResult.sanitized;
        } else if (!phoneResult.isValid) {
          // Invalid phone – record the warning and blank out the field
          phoneWarnings.push({
            row: rowNumber,
            original: phoneResult.original,
            reason: phoneResult.reason ?? 'Invalid phone number',
          });
          mappedRow.mobile = ''; // still import the record, just without phone
        }
      }

      // Validate using schema
      const result = guestRowSchema.safeParse(mappedRow);
      
      if (!result.success) {
        result.error.issues.forEach(err => {
          const errorMessage = `${err.path.join('.')}: ${err.message}`;
          rowErrors.push(errorMessage);
          errors.push({
            row: rowNumber,
            column: err.path.join('.'),
            value: mappedRow[err.path[0] as string],
            error: err.message,
          });
        });
        invalidRows++;
      } else {
        validRows++;
      }

      // Check for potential duplicates (warning only)
      const emailValue = mappedRow.email?.toLowerCase();
      if (emailValue) {
        const duplicateIndex = preview.findIndex(
          p => p.data.email?.toLowerCase() === emailValue
        );
        if (duplicateIndex !== -1) {
          warnings.push({
            row: rowNumber,
            column: 'email',
            value: emailValue,
            error: `Duplicate email in file (same as row ${preview[duplicateIndex].rowNumber})`,
          });
        }
      }

      // Add to preview (first 100 rows only)
      if (preview.length < 100) {
        preview.push({
          rowNumber,
          data: mappedRow,
          isValid: rowErrors.length === 0,
          errors: rowErrors,
        });
      }
    }

    return {
      isValid: validRows > 0,
      totalRows: parseResult.totalRows,
      validRows,
      invalidRows,
      errors,
      warnings,
      phoneWarnings,
      preview,
    };
  },
};
