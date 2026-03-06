/**
 * @fileoverview Guest Service - Core business logic for guest management
 * 
 * This service handles all CRUD operations for guests in the EventOS platform.
 * Guests are contacts that can be invited to events. The service supports:
 * - Individual guest creation and updates
 * - Bulk CSV import with email-based deduplication
 * - Search functionality across guest fields
 * 
 * @module lib/services/guest-service
 * @requires zod - Schema validation
 * @requires papaparse - CSV parsing
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { GuestService } from '@/lib/services';
 * 
 * // Create a new guest
 * const guest = await GuestService.create({
 *   firstName: 'Jane',
 *   lastName: 'Doe',
 *   email: 'jane@example.com',
 *   company: 'Acme Corp'
 * });
 * 
 * // Search for guests
 * const results = await GuestService.search('acme');
 * ```
 */

import { z } from 'zod';
import Papa from 'papaparse';
import { db } from '@/db';
import { guests, eventGuests, type Guest } from '@/db/schema';
import { eq, desc, or, ilike, sql, count, inArray } from 'drizzle-orm';

/**
 * Paginated result for guest queries
 */
export interface PaginatedGuests {
  data: Guest[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Result of a CSV import operation.
 * Provides detailed feedback on the import process.
 * 
 * @property created - Number of new guests created
 * @property updated - Number of existing guests updated (matched by email)
 * @property failed - Array of rows that failed with error details
 * @property photosFetched - Number of photos successfully fetched from URLs
 * @property photosFailed - Number of photo fetch failures
 * 
 * Requirements: 2.2, 2.5, 8.5
 */
export interface ImportResult {
  created: number;
  updated: number;
  failed: Array<{ row: number; error: string }>;
  photosFetched?: number;
  photosFailed?: number;
}

/**
 * Zod validation schema for guest creation input
 * Requirements: 2.1, 2.6
 */
export const createGuestSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address').toLowerCase(),
  mobile: z.string().trim().optional(),
  company: z.string().trim().optional(),
  jobTitle: z.string().trim().optional(),
});

/**
 * Zod validation schema for guest update input
 */
export const updateGuestSchema = createGuestSchema.partial();

export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;

/**
 * GuestService - Core service for guest/contact management.
 * 
 * Provides methods for managing the central guest database. Guests are
 * contacts that can be invited to multiple events. Key features:
 * - Email-based deduplication (each email is unique)
 * - CSV/Excel import with flexible column mapping
 * - Full-text search across name, email, and company
 * 
 * @remarks
 * Guests are separate from EventGuests. A Guest is a contact record,
 * while an EventGuest represents a guest's participation in a specific event.
 * 
 * Requirements: 2.1, 2.3, 2.4, 2.6
 */
export const GuestService = {
  /**
   * Creates a new guest in the database.
   * 
   * @param input - The guest creation data
   * @returns The newly created guest record
   * @throws {ZodError} If input validation fails
   * @throws {Error} If email already exists (unique constraint)
   * 
   * @example
   * ```typescript
   * const guest = await GuestService.create({
   *   firstName: 'John',
   *   lastName: 'Smith',
   *   email: 'john@company.com',
   *   company: 'Tech Corp',
   *   jobTitle: 'Engineer'
   * });
   * ```
   * 
   * Requirements: 2.1
   */
  async create(input: CreateGuestInput): Promise<Guest> {
    const validated = createGuestSchema.parse(input);

    const [guest] = await db.insert(guests).values({
      firstName: validated.firstName,
      lastName: validated.lastName,
      email: validated.email,
      mobile: validated.mobile ?? null,
      company: validated.company ?? null,
      jobTitle: validated.jobTitle ?? null,
    }).returning();

    return guest;
  },

  /**
   * Creates or updates a guest based on email address.
   * 
   * If a guest with the given email exists, their data is updated.
   * Otherwise, a new guest is created. This is the preferred method
   * for imports and integrations to avoid duplicates.
   * 
   * @param input - The guest data
   * @returns The created or updated guest record
   * 
   * @example
   * ```typescript
   * // Will create if new, update if exists
   * const guest = await GuestService.upsertByEmail({
   *   firstName: 'Jane',
   *   lastName: 'Doe',
   *   email: 'jane@example.com'
   * });
   * ```
   * 
   * Requirements: 2.3, 2.6
   */
  async upsertByEmail(input: CreateGuestInput): Promise<Guest> {
    const validated = createGuestSchema.parse(input);

    // Check if guest exists
    const existingGuest = await db.query.guests.findFirst({
      where: eq(guests.email, validated.email),
    });

    if (existingGuest) {
      // Update existing guest
      const [updated] = await db.update(guests)
        .set({
          firstName: validated.firstName,
          lastName: validated.lastName,
          mobile: validated.mobile ?? null,
          company: validated.company ?? null,
          jobTitle: validated.jobTitle ?? null,
          updatedAt: new Date(),
        })
        .where(eq(guests.email, validated.email))
        .returning();
      return updated;
    } else {
      // Create new guest
      const [created] = await db.insert(guests).values({
        firstName: validated.firstName,
        lastName: validated.lastName,
        email: validated.email,
        mobile: validated.mobile ?? null,
        company: validated.company ?? null,
        jobTitle: validated.jobTitle ?? null,
      }).returning();
      return created;
    }
  },

  /**
   * Get a guest by ID
   * Requirements: 2.1
   */
  async getById(id: string): Promise<Guest | null> {
    const guest = await db.query.guests.findFirst({
      where: eq(guests.id, id),
    });
    return guest ?? null;
  },

  /**
   * Get a guest by email
   * Requirements: 2.6
   */
  async getByEmail(email: string): Promise<Guest | null> {
    const guest = await db.query.guests.findFirst({
      where: eq(guests.email, email.toLowerCase()),
    });
    return guest ?? null;
  },

  /**
   * Searches guests by name, email, or company (case-insensitive).
   * 
   * @param query - The search term to match against guest fields
   * @returns Array of matching guests, ordered by creation date (newest first)
   * 
   * @remarks
   * - Empty query returns all guests
   * - Search is performed using PostgreSQL ILIKE for case-insensitivity
   * - Matches partial strings (e.g., "john" matches "Johnson")
   * 
   * @example
   * ```typescript
   * // Search by company
   * const techGuests = await GuestService.search('tech corp');
   * 
   * // Search by name
   * const johns = await GuestService.search('john');
   * ```
   * 
   * Requirements: 2.4
   */
  async search(query: string): Promise<Guest[]> {
    const searchTerm = query.toLowerCase().trim();
    
    if (!searchTerm) {
      return db.query.guests.findMany({
        orderBy: desc(guests.createdAt),
      });
    }

    // PostgreSQL uses ILIKE for case-insensitive search
    const searchPattern = `%${searchTerm}%`;
    return db.query.guests.findMany({
      where: or(
        ilike(guests.firstName, searchPattern),
        ilike(guests.lastName, searchPattern),
        ilike(guests.email, searchPattern),
        ilike(guests.company, searchPattern),
      ),
      orderBy: desc(guests.createdAt),
    });
  },

  /**
   * Search guests with pagination support
   * 
   * @param query - Search query string
   * @param page - Page number (1-indexed)
   * @param pageSize - Number of results per page
   * @returns Paginated guests result with total count
   */
  async searchPaginated(
    query: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedGuests> {
    const searchTerm = query.toLowerCase().trim();
    const offset = (page - 1) * pageSize;

    const whereCondition = searchTerm
      ? or(
          ilike(guests.firstName, `%${searchTerm}%`),
          ilike(guests.lastName, `%${searchTerm}%`),
          ilike(guests.email, `%${searchTerm}%`),
          ilike(guests.company, `%${searchTerm}%`)
        )
      : undefined;

    // Get total count
    const [countResult] = await db
      .select({ count: count() })
      .from(guests)
      .where(whereCondition);

    const total = countResult?.count ?? 0;

    // Get paginated data
    const data = await db.query.guests.findMany({
      where: whereCondition,
      orderBy: desc(guests.createdAt),
      limit: pageSize,
      offset,
    });

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },

  /**
   * Get all guests
   */
  async getAll(): Promise<Guest[]> {
    return db.query.guests.findMany({
      orderBy: desc(guests.createdAt),
    });
  },

  /**
   * Update a guest
   */
  async update(id: string, input: UpdateGuestInput): Promise<Guest> {
    const validated = updateGuestSchema.parse(input);

    const updateData: Partial<typeof guests.$inferInsert> = {};
    if (validated.firstName !== undefined) updateData.firstName = validated.firstName;
    if (validated.lastName !== undefined) updateData.lastName = validated.lastName;
    if (validated.email !== undefined) updateData.email = validated.email;
    if (validated.mobile !== undefined) updateData.mobile = validated.mobile;
    if (validated.company !== undefined) updateData.company = validated.company;
    if (validated.jobTitle !== undefined) updateData.jobTitle = validated.jobTitle;
    updateData.updatedAt = new Date();

    const [guest] = await db.update(guests)
      .set(updateData)
      .where(eq(guests.id, id))
      .returning();

    return guest;
  },

  /**
   * Delete a guest
   */
  async delete(id: string): Promise<void> {
    await db.delete(guests).where(eq(guests.id, id));
  },

  /**
   * Bulk delete guests by IDs.
   * Also removes any event-guest associations.
   *
   * @param ids - Array of guest IDs to delete
   * @returns Number of guests deleted
   */
  async bulkDelete(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    // Remove event-guest associations first
    await db.delete(eventGuests).where(inArray(eventGuests.guestId, ids));

    // Delete the guests
    const result = await db.delete(guests).where(inArray(guests.id, ids)).returning({ id: guests.id });
    return result.length;
  },

  /**
   * Imports guests from CSV data with automatic field mapping.
   * 
   * Parses CSV data, maps columns to guest fields, and performs
   * upsert operations based on email. Supports various column name
   * formats (e.g., "first_name", "firstName", "First Name").
   * 
   * Also supports photo_url column for bulk photo association.
   * Photos are fetched asynchronously after guest creation.
   * 
   * @param csvData - Raw CSV string data
   * @returns Import result with counts and error details
   * 
   * @remarks
   * Supported column names (case-insensitive):
   * - First name: firstname, first_name, first name, fname
   * - Last name: lastname, last_name, last name, lname
   * - Email: email, e-mail, email address
   * - Mobile: mobile, phone, mobile number, phone number
   * - Company: company, organization, organisation
   * - Job title: jobtitle, job_title, job title, title, position
   * - Photo URL: photo_url, photourl, photo, image_url, image, avatar_url, avatar
   * 
   * @example
   * ```typescript
   * const csvData = `First Name,Last Name,Email,Company,Photo URL
   * John,Doe,john@example.com,Acme Corp,https://example.com/john.jpg
   * Jane,Smith,jane@example.com,Tech Inc,`;
   * 
   * const result = await GuestService.importFromCSV(csvData);
   * console.log(`Created: ${result.created}, Updated: ${result.updated}`);
   * ```
   * 
   * Requirements: 2.2, 2.5, 8.5
   */
  async importFromCSV(csvData: string): Promise<ImportResult> {
    const result: ImportResult = {
      created: 0,
      updated: 0,
      failed: [],
      photosFetched: 0,
      photosFailed: 0,
    };

    // Parse CSV data
    const parseResult = Papa.parse<Record<string, string>>(csvData, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
    });

    // Handle parsing errors
    if (parseResult.errors.length > 0) {
      parseResult.errors.forEach((error) => {
        result.failed.push({
          row: error.row !== undefined ? error.row + 2 : 0, // +2 for 1-indexed and header row
          error: error.message,
        });
      });
    }

    // Track guests with photo URLs for async processing
    const guestsWithPhotos: Array<{ guestId: string; photoUrl: string; rowNumber: number }> = [];

    // Process each row
    for (let i = 0; i < parseResult.data.length; i++) {
      const row = parseResult.data[i];
      const rowNumber = i + 2; // +2 for 1-indexed and header row

      try {
        // Map CSV fields to guest schema (support various column name formats)
        const guestInput = mapRowToGuestInput(row);
        const photoUrl = getPhotoUrl(row);

        // Validate the input
        const validated = createGuestSchema.parse(guestInput);

        // Check if guest exists by email
        const existingGuest = await db.query.guests.findFirst({
          where: eq(guests.email, validated.email),
        });

        let guestId: string;

        if (existingGuest) {
          // Update existing guest
          await db.update(guests)
            .set({
              firstName: validated.firstName,
              lastName: validated.lastName,
              mobile: validated.mobile ?? null,
              company: validated.company ?? null,
              jobTitle: validated.jobTitle ?? null,
              updatedAt: new Date(),
            })
            .where(eq(guests.email, validated.email));
          guestId = existingGuest.id;
          result.updated++;
        } else {
          // Create new guest
          const [newGuest] = await db.insert(guests).values({
            firstName: validated.firstName,
            lastName: validated.lastName,
            email: validated.email,
            mobile: validated.mobile ?? null,
            company: validated.company ?? null,
            jobTitle: validated.jobTitle ?? null,
          }).returning();
          guestId = newGuest.id;
          result.created++;
        }

        // Track photo URL for async processing
        if (photoUrl) {
          guestsWithPhotos.push({ guestId, photoUrl, rowNumber });
        }
      } catch (error) {
        // Handle validation errors
        if (error instanceof z.ZodError) {
          const errorMessages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
          result.failed.push({
            row: rowNumber,
            error: errorMessages,
          });
        } else if (error instanceof Error) {
          result.failed.push({
            row: rowNumber,
            error: error.message,
          });
        } else {
          result.failed.push({
            row: rowNumber,
            error: 'Unknown error occurred',
          });
        }
      }
    }

    // Process photo URLs asynchronously (don't block import)
    if (guestsWithPhotos.length > 0) {
      const photoResults = await this.processPhotoUrls(guestsWithPhotos);
      result.photosFetched = photoResults.fetched;
      result.photosFailed = photoResults.failed;
    }

    return result;
  },

  /**
   * Processes photo URLs for imported guests.
   * Fetches images from URLs and uploads them to storage.
   * 
   * @param guestsWithPhotos - Array of guest IDs with their photo URLs
   * @returns Count of successful and failed photo fetches
   * 
   * Requirements: 8.5
   */
  async processPhotoUrls(
    guestsWithPhotos: Array<{ guestId: string; photoUrl: string; rowNumber: number }>
  ): Promise<{ fetched: number; failed: number }> {
    const { GuestPhotoService, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } = await import('./guest-photo-service');
    
    let fetched = 0;
    let failed = 0;

    // Process photos in parallel with a concurrency limit
    const CONCURRENCY_LIMIT = 5;
    const chunks: Array<typeof guestsWithPhotos> = [];
    
    for (let i = 0; i < guestsWithPhotos.length; i += CONCURRENCY_LIMIT) {
      chunks.push(guestsWithPhotos.slice(i, i + CONCURRENCY_LIMIT));
    }

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(async ({ guestId, photoUrl }) => {
          try {
            // Fetch the image from URL
            const response = await fetch(photoUrl, {
              headers: {
                'User-Agent': 'EventOS/1.0 (Photo Import)',
              },
            });

            if (!response.ok) {
              throw new Error(`Failed to fetch image: ${response.status}`);
            }

            // Check content type
            const contentType = response.headers.get('content-type') || '';
            const mimeType = contentType.split(';')[0].trim();
            
            if (!ALLOWED_MIME_TYPES.includes(mimeType as typeof ALLOWED_MIME_TYPES[number])) {
              throw new Error(`Invalid image type: ${mimeType}`);
            }

            // Get the image data
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Check file size
            if (buffer.length > MAX_FILE_SIZE) {
              throw new Error(`Image too large: ${(buffer.length / (1024 * 1024)).toFixed(1)}MB`);
            }

            // Extract filename from URL
            const urlPath = new URL(photoUrl).pathname;
            const filename = urlPath.split('/').pop() || 'photo.jpg';

            // Upload the photo
            await GuestPhotoService.upload(guestId, buffer, filename, mimeType);
            
            return true;
          } catch (error) {
            // Log error but don't fail the import
            console.error(`Failed to fetch photo for guest ${guestId}:`, error);
            throw error;
          }
        })
      );

      // Count results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          fetched++;
        } else {
          failed++;
        }
      }
    }

    return { fetched, failed };
  },
};

/**
 * Maps a CSV row to guest input, supporting various column name formats
 * Handles common variations like "first_name", "firstName", "First Name", etc.
 */
function mapRowToGuestInput(row: Record<string, string>): CreateGuestInput {
  return {
    firstName: getFieldValue(row, ['firstname', 'first_name', 'first name', 'fname']),
    lastName: getFieldValue(row, ['lastname', 'last_name', 'last name', 'lname']),
    email: getFieldValue(row, ['email', 'e-mail', 'email address', 'emailaddress']),
    mobile: getFieldValue(row, ['mobile', 'phone', 'mobile number', 'phone number', 'mobilenumber', 'phonenumber']) || undefined,
    company: getFieldValue(row, ['company', 'organization', 'organisation', 'company name', 'companyname']) || undefined,
    jobTitle: getFieldValue(row, ['jobtitle', 'job_title', 'job title', 'title', 'position', 'role']) || undefined,
  };
}

/**
 * Extracts photo URL from a CSV row
 * Supports various column name formats for photo URL
 * 
 * Requirements: 8.5
 */
function getPhotoUrl(row: Record<string, string>): string | undefined {
  const url = getFieldValue(row, [
    'photo_url',
    'photourl',
    'photo url',
    'photo',
    'image_url',
    'imageurl',
    'image url',
    'image',
    'avatar_url',
    'avatarurl',
    'avatar url',
    'avatar',
    'picture_url',
    'pictureurl',
    'picture url',
    'picture',
  ]);
  return url || undefined;
}

/**
 * Gets a field value from a row, trying multiple possible column names
 */
function getFieldValue(row: Record<string, string>, possibleNames: string[]): string {
  for (const name of possibleNames) {
    const value = row[name];
    if (value !== undefined && value !== null && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}

/**
 * Input for bulk guest import
 */
export interface BulkImportGuestInput {
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  company?: string;
  jobTitle?: string;
  photoUrl?: string;
}

/**
 * Options for bulk import
 */
export interface BulkImportOptions {
  duplicateHandling: 'skip' | 'update' | 'create_new';
  eventId?: string;
}

/**
 * Bulk imports guests from parsed data
 * 
 * @param guests - Array of guest data to import
 * @param options - Import options
 * @returns Import result with counts
 */
export async function bulkImportGuests(
  guestsData: BulkImportGuestInput[],
  options: BulkImportOptions
): Promise<ImportResult> {
  const result: ImportResult = {
    created: 0,
    updated: 0,
    failed: [],
    photosFetched: 0,
    photosFailed: 0,
  };

  const guestsWithPhotos: Array<{ guestId: string; photoUrl: string; rowNumber: number }> = [];

  for (let i = 0; i < guestsData.length; i++) {
    const guestData = guestsData[i];
    const rowNumber = i + 1;

    try {
      // Validate the input
      const validated = createGuestSchema.parse({
        firstName: guestData.firstName,
        lastName: guestData.lastName,
        email: guestData.email,
        mobile: guestData.mobile,
        company: guestData.company,
        jobTitle: guestData.jobTitle,
      });

      // Check if guest exists by email
      const existingGuest = await db.query.guests.findFirst({
        where: eq(guests.email, validated.email),
      });

      let guestId: string;

      if (existingGuest) {
        if (options.duplicateHandling === 'skip') {
          // Skip this guest
          continue;
        } else if (options.duplicateHandling === 'update') {
          // Update existing guest
          await db.update(guests)
            .set({
              firstName: validated.firstName,
              lastName: validated.lastName,
              mobile: validated.mobile ?? null,
              company: validated.company ?? null,
              jobTitle: validated.jobTitle ?? null,
              updatedAt: new Date(),
            })
            .where(eq(guests.email, validated.email));
          guestId = existingGuest.id;
          result.updated++;
        } else {
          // create_new - skip duplicate
          continue;
        }
      } else {
        // Create new guest
        const [newGuest] = await db.insert(guests).values({
          firstName: validated.firstName,
          lastName: validated.lastName,
          email: validated.email,
          mobile: validated.mobile ?? null,
          company: validated.company ?? null,
          jobTitle: validated.jobTitle ?? null,
        }).returning();
        guestId = newGuest.id;
        result.created++;
      }

      // Track photo URL for async processing
      if (guestData.photoUrl) {
        guestsWithPhotos.push({ guestId, photoUrl: guestData.photoUrl, rowNumber });
      }

      // If eventId is provided, add guest to event
      if (options.eventId) {
        try {
          // Check if guest is already in event
          const existingEventGuest = await db.query.eventGuests.findFirst({
            where: (eg, { and, eq: eqOp }) => and(
              eqOp(eg.eventId, options.eventId!),
              eqOp(eg.guestId, guestId)
            ),
          });
          
          if (!existingEventGuest) {
            await db.insert(eventGuests).values({
              eventId: options.eventId,
              guestId: guestId,
            });
          }
        } catch (err) {
          // Ignore event assignment errors
          console.error('Error assigning guest to event:', err);
        }
      }
    } catch (error) {
      // Handle validation errors
      if (error instanceof z.ZodError) {
        const errorMessages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
        result.failed.push({
          row: rowNumber,
          error: errorMessages,
        });
      } else if (error instanceof Error) {
        result.failed.push({
          row: rowNumber,
          error: error.message,
        });
      } else {
        result.failed.push({
          row: rowNumber,
          error: 'Unknown error occurred',
        });
      }
    }
  }

  // Process photo URLs asynchronously if any
  if (guestsWithPhotos.length > 0) {
    try {
      const photoResults = await GuestService.processPhotoUrls(guestsWithPhotos);
      result.photosFetched = photoResults.fetched;
      result.photosFailed = photoResults.failed;
    } catch (err) {
      console.error('Error processing photo URLs:', err);
    }
  }

  return result;
}

export default GuestService;
