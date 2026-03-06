/**
 * @fileoverview Import Service - Bulk guest import with CSV/Excel support
 * 
 * This service handles bulk guest imports with:
 * - CSV and Excel file parsing
 * - Column mapping with auto-detection
 * - Validation with detailed error reporting
 * - Batch processing for large files
 * - Progress tracking
 * - Resume interrupted imports
 * 
 * @module lib/services/import-service
 * @requires xlsx - Excel file parsing
 * @requires papaparse - CSV parsing
 * @requires zod - Schema validation
 * 
 * Requirements: 8
 */

import { z } from 'zod';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { db } from '@/db';
import { importJobs, guests, eventGuests, type ImportJob, type GuestTier } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

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
  tier?: string;
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
 * Import progress tracking
 */
export interface ImportProgress {
  jobId: string;
  status: ImportJob['status'];
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
 * Import options for batch processing
 */
export interface ImportOptions {
  eventId?: string;
  duplicateHandling: 'skip' | 'update' | 'create_new';
  batchSize?: number;
  validateOnly?: boolean;
}

/**
 * Import job result
 */
export interface ImportJobResult {
  jobId: string;
  status: ImportJob['status'];
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
  tier: z.string().optional(),
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
  tier: ['tier', 'guest_tier', 'guest tier', 'guesttier', 'vip', 'vip_status', 'vip status', 'level', 'guest level'],
};


/**
 * Valid tier values for normalization
 */
const VALID_TIER_VALUES: Record<string, GuestTier> = {
  regular: 'Regular',
  vip: 'VIP',
  vvip: 'VVIP',
};

// ============================================================================
// IMPORT SERVICE
// ============================================================================

/**
 * ImportService - Handles bulk guest imports from CSV/Excel files
 * 
 * Features:
 * - CSV and Excel file parsing
 * - Automatic column name detection
 * - Custom column mapping
 * - Validation with detailed error reporting
 * - Batch processing for large files
 * - Progress tracking
 * - Resume interrupted imports
 * 
 * Requirements: 8
 */
export const ImportService = {
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
  parseExcel(content: Buffer, fileType: ImportFileType, headerRowIndex: number = 0): FileParseResult {
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
      tier: mapping.tier ? row[mapping.tier.toLowerCase()] || '' : '',
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
        preview: [],
      };
    }

    // Track duplicate emails within the file
    const seenEmails = new Set<string>();

    // Valid tier values for validation
    const VALID_TIERS = ['regular', 'vip', 'vvip'];

    for (let i = 0; i < parseResult.rows.length; i++) {
      const rowNumber = i + 2; // +2 for 1-indexed and header row
      const row = parseResult.rows[i];
      const mappedRow = this.mapRow(row, mapping);
      const rowErrors: string[] = [];

      try {
        // Validate the row
        guestRowSchema.parse(mappedRow);

        // Validate tier value if provided
        const tierValue = mappedRow.tier?.trim();
        if (tierValue && !VALID_TIERS.includes(tierValue.toLowerCase())) {
          rowErrors.push(`tier: Invalid tier value '${tierValue}'. Must be Regular, VIP, or VVIP`);
          errors.push({
            row: rowNumber,
            column: 'tier',
            value: tierValue,
            error: `Invalid tier value '${tierValue}'. Must be Regular, VIP, or VVIP`,
          });
        }

        // Check for duplicate emails within the file
        const email = mappedRow.email.toLowerCase();
        if (seenEmails.has(email)) {
          warnings.push({
            row: rowNumber,
            column: 'email',
            value: email,
            error: 'Duplicate email in file',
          });
        } else {
          seenEmails.add(email);
        }

        if (rowErrors.length > 0) {
          invalidRows++;
        } else {
          validRows++;
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          error.issues.forEach(issue => {
            rowErrors.push(`${issue.path.join('.')}: ${issue.message}`);
            errors.push({
              row: rowNumber,
              column: issue.path.join('.'),
              value: mappedRow[issue.path[0] as string],
              error: issue.message,
            });
          });
        }
        invalidRows++;
      }

      // Add to preview (first 100 rows)
      if (i < 100) {
        preview.push({
          rowNumber,
          data: mappedRow,
          isValid: rowErrors.length === 0,
          errors: rowErrors,
        });
      }
    }

    return {
      isValid: invalidRows === 0,
      totalRows: parseResult.totalRows,
      validRows,
      invalidRows,
      errors,
      warnings,
      preview,
    };
  },


  /**
   * Creates a new import job
   * 
   * @param userId - ID of the user creating the import
   * @param fileName - Original file name
   * @param fileSize - File size in bytes
   * @param totalRows - Total number of rows to import
   * @param eventId - Optional event ID to assign guests to
   * @param columnMapping - Column mapping configuration
   * @returns Created import job
   */
  async createImportJob(
    userId: string,
    fileName: string,
    fileSize: number,
    totalRows: number,
    eventId?: string,
    columnMapping?: ColumnMapping
  ): Promise<ImportJob> {
    const [job] = await db.insert(importJobs).values({
      id: createId(),
      userId,
      fileName,
      fileSize,
      totalRows,
      eventId: eventId || null,
      columnMapping: columnMapping || null,
      status: 'pending',
      processedRows: 0,
      successCount: 0,
      errorCount: 0,
    }).returning();

    return job;
  },

  /**
   * Gets an import job by ID
   */
  async getImportJob(jobId: string): Promise<ImportJob | null> {
    const job = await db.query.importJobs.findFirst({
      where: eq(importJobs.id, jobId),
    });
    return job || null;
  },

  /**
   * Gets the progress of an import job
   */
  async getImportProgress(jobId: string): Promise<ImportProgress | null> {
    const job = await this.getImportJob(jobId);
    if (!job) return null;

    const percentComplete = job.totalRows 
      ? Math.round((job.processedRows / job.totalRows) * 100)
      : 0;

    // Estimate time remaining based on processing rate
    let estimatedTimeRemaining: number | undefined;
    if (job.startedAt && job.processedRows > 0 && job.status === 'processing') {
      const elapsedMs = Date.now() - job.startedAt.getTime();
      const rowsPerMs = job.processedRows / elapsedMs;
      const remainingRows = job.totalRows! - job.processedRows;
      estimatedTimeRemaining = Math.round(remainingRows / rowsPerMs / 1000); // in seconds
    }

    return {
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows || 0,
      processedRows: job.processedRows,
      successCount: job.successCount,
      errorCount: job.errorCount,
      percentComplete,
      estimatedTimeRemaining,
      startedAt: job.startedAt || undefined,
      completedAt: job.completedAt || undefined,
    };
  },

  /**
   * Updates the progress of an import job
   */
  async updateImportProgress(
    jobId: string,
    processedRows: number,
    successCount: number,
    errorCount: number
  ): Promise<void> {
    await db.update(importJobs)
      .set({
        processedRows,
        successCount,
        errorCount,
      })
      .where(eq(importJobs.id, jobId));
  },

  /**
   * Marks an import job as started
   */
  async startImportJob(jobId: string): Promise<void> {
    await db.update(importJobs)
      .set({
        status: 'processing',
        startedAt: new Date(),
      })
      .where(eq(importJobs.id, jobId));
  },

  /**
   * Marks an import job as completed
   */
  async completeImportJob(
    jobId: string,
    errorReportUrl?: string
  ): Promise<void> {
    await db.update(importJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        errorReportUrl: errorReportUrl || null,
      })
      .where(eq(importJobs.id, jobId));
  },

  /**
   * Marks an import job as failed
   */
  async failImportJob(jobId: string, errorReportUrl?: string): Promise<void> {
    await db.update(importJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorReportUrl: errorReportUrl || null,
      })
      .where(eq(importJobs.id, jobId));
  },

  /**
   * Cancels an import job
   */
  async cancelImportJob(jobId: string): Promise<void> {
    await db.update(importJobs)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
      })
      .where(eq(importJobs.id, jobId));
  },


  /**
   * Processes a batch of rows
   * 
   * @param rows - Rows to process
   * @param mapping - Column mapping
   * @param options - Import options
   * @param startRow - Starting row number for error reporting
   * @returns Batch processing result
   */
  async processBatch(
    rows: Record<string, string>[],
    mapping: ColumnMapping,
    options: ImportOptions,
    startRow: number
  ): Promise<{ successCount: number; errorCount: number; errors: RowValidationError[] }> {
    let successCount = 0;
    let errorCount = 0;
    const errors: RowValidationError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = startRow + i;
      const row = rows[i];
      const mappedRow = this.mapRow(row, mapping);

      try {
        // Validate the row
        const validated = guestRowSchema.parse(mappedRow);

        // Normalize tier value (default to 'Regular' if empty)
        const rawTier = mappedRow.tier?.trim();
        const tier: GuestTier = rawTier
          ? VALID_TIER_VALUES[rawTier.toLowerCase()] || 'Regular'
          : 'Regular';

        // Check if guest exists
        const existingGuest = await db.query.guests.findFirst({
          where: eq(guests.email, validated.email),
        });

        if (existingGuest) {
          // Handle duplicate based on options
          if (options.duplicateHandling === 'skip') {
            // Skip this row
            successCount++;
            continue;
          } else if (options.duplicateHandling === 'update') {
            // Update existing guest
            await db.update(guests)
              .set({
                firstName: validated.firstName,
                lastName: validated.lastName,
                mobile: validated.mobile || null,
                company: validated.company || null,
                jobTitle: validated.jobTitle || null,
                updatedAt: new Date(),
              })
              .where(eq(guests.id, existingGuest.id));

            // If event is specified, add to event if not already
            if (options.eventId) {
              await this.addGuestToEventIfNotExists(existingGuest.id, options.eventId, tier);
            }

            successCount++;
          } else {
            // create_new - create with different email (not recommended)
            // For now, treat as update
            await db.update(guests)
              .set({
                firstName: validated.firstName,
                lastName: validated.lastName,
                mobile: validated.mobile || null,
                company: validated.company || null,
                jobTitle: validated.jobTitle || null,
                updatedAt: new Date(),
              })
              .where(eq(guests.id, existingGuest.id));
            successCount++;
          }
        } else {
          // Create new guest
          const [newGuest] = await db.insert(guests).values({
            id: createId(),
            firstName: validated.firstName,
            lastName: validated.lastName,
            email: validated.email,
            mobile: validated.mobile || null,
            company: validated.company || null,
            jobTitle: validated.jobTitle || null,
          }).returning();

          // If event is specified, add guest to event
          if (options.eventId) {
            await this.addGuestToEventIfNotExists(newGuest.id, options.eventId, tier);
          }

          successCount++;
        }
      } catch (error) {
        errorCount++;
        if (error instanceof z.ZodError) {
          error.issues.forEach(issue => {
            errors.push({
              row: rowNumber,
              column: issue.path.join('.'),
              value: mappedRow[issue.path[0] as string],
              error: issue.message,
            });
          });
        } else if (error instanceof Error) {
          errors.push({
            row: rowNumber,
            error: error.message,
          });
        } else {
          errors.push({
            row: rowNumber,
            error: 'Unknown error occurred',
          });
        }
      }
    }

    return { successCount, errorCount, errors };
  },

  /**
   * Adds a guest to an event if they're not already added
   */
  async addGuestToEventIfNotExists(guestId: string, eventId: string, tier?: GuestTier): Promise<void> {
    const existing = await db.query.eventGuests.findFirst({
      where: and(
        eq(eventGuests.guestId, guestId),
        eq(eventGuests.eventId, eventId)
      ),
    });

    if (!existing) {
      await db.insert(eventGuests).values({
        id: createId(),
        guestId,
        eventId,
        qrToken: createId(),
        ...(tier ? { tier } : {}),
      });
    }
  },


  /**
   * Processes an import job with batch processing
   * 
   * @param jobId - Import job ID
   * @param parseResult - Parsed file data
   * @param mapping - Column mapping
   * @param options - Import options
   * @returns Import job result
   */
  async processImport(
    jobId: string,
    parseResult: FileParseResult,
    mapping: ColumnMapping,
    options: ImportOptions
  ): Promise<ImportJobResult> {
    const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    const allErrors: RowValidationError[] = [];
    let totalSuccess = 0;
    let totalErrors = 0;

    // Start the job
    await this.startImportJob(jobId);

    try {
      // Process in batches
      for (let i = 0; i < parseResult.rows.length; i += batchSize) {
        // Check if job was cancelled
        const job = await this.getImportJob(jobId);
        if (job?.status === 'cancelled') {
          return {
            jobId,
            status: 'cancelled',
            totalRows: parseResult.totalRows,
            successCount: totalSuccess,
            errorCount: totalErrors,
            errors: allErrors,
          };
        }

        const batch = parseResult.rows.slice(i, i + batchSize);
        const startRow = i + 2; // +2 for 1-indexed and header row

        const result = await this.processBatch(batch, mapping, options, startRow);
        
        totalSuccess += result.successCount;
        totalErrors += result.errorCount;
        allErrors.push(...result.errors);

        // Update progress
        await this.updateImportProgress(
          jobId,
          Math.min(i + batchSize, parseResult.rows.length),
          totalSuccess,
          totalErrors
        );
      }

      // Generate error report if there are errors
      let errorReportUrl: string | undefined;
      if (allErrors.length > 0) {
        errorReportUrl = await this.generateErrorReport(jobId, allErrors);
      }

      // Complete the job
      await this.completeImportJob(jobId, errorReportUrl);

      return {
        jobId,
        status: 'completed',
        totalRows: parseResult.totalRows,
        successCount: totalSuccess,
        errorCount: totalErrors,
        errors: allErrors,
        errorReportUrl,
      };
    } catch (error) {
      // Mark job as failed
      await this.failImportJob(jobId);
      throw error;
    }
  },

  /**
   * Resumes an interrupted import job
   * 
   * @param jobId - Import job ID
   * @param parseResult - Parsed file data
   * @param mapping - Column mapping
   * @param options - Import options
   * @returns Import job result
   */
  async resumeImport(
    jobId: string,
    parseResult: FileParseResult,
    mapping: ColumnMapping,
    options: ImportOptions
  ): Promise<ImportJobResult> {
    const job = await this.getImportJob(jobId);
    if (!job) {
      throw new Error('Import job not found');
    }

    if (job.status !== 'processing' && job.status !== 'pending') {
      throw new Error(`Cannot resume import with status: ${job.status}`);
    }

    const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    const allErrors: RowValidationError[] = [];
    let totalSuccess = job.successCount;
    let totalErrors = job.errorCount;
    const startIndex = job.processedRows;

    // Update status to processing if it was pending
    if (job.status === 'pending') {
      await this.startImportJob(jobId);
    }

    try {
      // Process remaining rows in batches
      for (let i = startIndex; i < parseResult.rows.length; i += batchSize) {
        // Check if job was cancelled
        const currentJob = await this.getImportJob(jobId);
        if (currentJob?.status === 'cancelled') {
          return {
            jobId,
            status: 'cancelled',
            totalRows: parseResult.totalRows,
            successCount: totalSuccess,
            errorCount: totalErrors,
            errors: allErrors,
          };
        }

        const batch = parseResult.rows.slice(i, i + batchSize);
        const startRow = i + 2; // +2 for 1-indexed and header row

        const result = await this.processBatch(batch, mapping, options, startRow);
        
        totalSuccess += result.successCount;
        totalErrors += result.errorCount;
        allErrors.push(...result.errors);

        // Update progress
        await this.updateImportProgress(
          jobId,
          Math.min(i + batchSize, parseResult.rows.length),
          totalSuccess,
          totalErrors
        );
      }

      // Generate error report if there are errors
      let errorReportUrl: string | undefined;
      if (allErrors.length > 0) {
        errorReportUrl = await this.generateErrorReport(jobId, allErrors);
      }

      // Complete the job
      await this.completeImportJob(jobId, errorReportUrl);

      return {
        jobId,
        status: 'completed',
        totalRows: parseResult.totalRows,
        successCount: totalSuccess,
        errorCount: totalErrors,
        errors: allErrors,
        errorReportUrl,
      };
    } catch (error) {
      // Mark job as failed
      await this.failImportJob(jobId);
      throw error;
    }
  },


  /**
   * Generates an error report CSV
   * 
   * @param jobId - Import job ID
   * @param errors - Array of validation errors
   * @returns URL to the error report (or data URL for now)
   */
  async generateErrorReport(
    jobId: string,
    errors: RowValidationError[]
  ): Promise<string> {
    // Generate CSV content
    const headers = ['Row', 'Column', 'Value', 'Error'];
    const rows = errors.map(e => [
      e.row.toString(),
      e.column || '',
      e.value || '',
      e.error,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    // For now, return a data URL. In production, this would upload to R2
    const base64 = Buffer.from(csvContent).toString('base64');
    return `data:text/csv;base64,${base64}`;
  },

  /**
   * Gets import jobs for a user
   * 
   * @param userId - User ID
   * @param limit - Maximum number of jobs to return
   * @returns Array of import jobs
   */
  async getImportJobsForUser(userId: string, limit = 10): Promise<ImportJob[]> {
    return db.query.importJobs.findMany({
      where: eq(importJobs.userId, userId),
      orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
      limit,
    });
  },

  /**
   * Gets import jobs for an event
   * 
   * @param eventId - Event ID
   * @param limit - Maximum number of jobs to return
   * @returns Array of import jobs
   */
  async getImportJobsForEvent(eventId: string, limit = 10): Promise<ImportJob[]> {
    return db.query.importJobs.findMany({
      where: eq(importJobs.eventId, eventId),
      orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
      limit,
    });
  },

  /**
   * Deletes an import job
   * 
   * @param jobId - Import job ID
   */
  async deleteImportJob(jobId: string): Promise<void> {
    await db.delete(importJobs).where(eq(importJobs.id, jobId));
  },

  /**
   * Gets statistics for import jobs
   */
  async getImportStats(userId?: string): Promise<{
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    totalRowsImported: number;
  }> {
    const whereClause = userId ? eq(importJobs.userId, userId) : undefined;

    const stats = await db
      .select({
        totalJobs: sql<number>`count(*)::int`,
        completedJobs: sql<number>`count(*) filter (where ${importJobs.status} = 'completed')::int`,
        failedJobs: sql<number>`count(*) filter (where ${importJobs.status} = 'failed')::int`,
        totalRowsImported: sql<number>`coalesce(sum(${importJobs.successCount}), 0)::int`,
      })
      .from(importJobs)
      .where(whereClause);

    return stats[0] || {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      totalRowsImported: 0,
    };
  },
};

export default ImportService;
