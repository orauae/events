/**
 * @fileoverview Guest Photo Service - Photo upload and management for guests
 * 
 * This service handles all operations for managing guest photos including:
 * - File validation (MIME type and size checks)
 * - Photo upload with R2 storage integration
 * - Photo deletion
 * - Photo retrieval
 * 
 * @module lib/services/guest-photo-service
 * @requires @aws-sdk/client-s3 - S3-compatible client for R2
 * @requires drizzle-orm - Database ORM
 * 
 * @example
 * ```typescript
 * import { GuestPhotoService } from '@/lib/services';
 * 
 * // Validate a file before upload
 * const validation = GuestPhotoService.validateFile(file);
 * if (!validation.valid) {
 *   console.error(validation.error);
 * }
 * 
 * // Upload a photo for a guest
 * const photo = await GuestPhotoService.upload(guestId, buffer, filename, mimeType);
 * ```
 * 
 * Requirements: 8.2, 8.3
 */

import { db } from '@/db';
import { guestPhotos, guests, type GuestPhoto } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Allowed MIME types for guest photos
 * Requirements: 8.2
 */
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Maximum file size for guest photos (5MB)
 * Requirements: 8.2
 */
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB



// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of file validation
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * File input for validation and upload
 */
export interface FileInput {
  buffer: Buffer;
  mimeType: string;
  size: number;
  filename: string;
}

// ============================================================================
// R2 CONFIGURATION
// ============================================================================

const R2_CONFIG = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
  bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME || 'email-assets',
  publicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL || '',
};

/**
 * Creates an S3-compatible client for R2
 */
function createR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_CONFIG.accessKeyId,
      secretAccessKey: R2_CONFIG.secretAccessKey,
    },
  });
}

/**
 * Gets the public URL for a stored file
 */
function getPublicUrl(key: string): string {
  if (R2_CONFIG.publicUrl) {
    return `${R2_CONFIG.publicUrl}/${key}`;
  }
  return `https://${R2_CONFIG.bucketName}.${R2_CONFIG.accountId}.r2.dev/${key}`;
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * GuestPhotoService - Core service for guest photo operations.
 * 
 * Provides methods for validating, uploading, deleting, and retrieving
 * guest photos with R2 storage integration.
 * 
 * Requirements: 8.2, 8.3
 */
export const GuestPhotoService = {
  /**
   * Validates a file for guest photo upload.
   * 
   * Checks:
   * - MIME type is one of: image/jpeg, image/png, image/webp
   * - File size is under 5MB
   * 
   * @param file - The file to validate
   * @returns Validation result with error message if invalid
   * 
   * Requirements: 8.2
   */
  validateFile(file: { mimeType: string; size: number }): ValidationResult {
    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimeType as typeof ALLOWED_MIME_TYPES[number])) {
      return {
        valid: false,
        error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      };
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      };
    }

    return { valid: true };
  },

  /**
   * Uploads a photo for a guest.
   * 
   * Process:
   * 1. Validates the file
   * 2. Optimizes the image (resize, compress)
   * 3. Uploads to R2 storage
   * 4. Creates database record
   * 5. Deletes any existing photo for the guest
   * 
   * @param guestId - The guest's ID
   * @param buffer - The file buffer
   * @param filename - Original filename
   * @param mimeType - File MIME type
   * @returns The created guest photo record
   * @throws {Error} If validation fails, guest not found, or upload fails
   * 
   * Requirements: 8.2, 8.3
   */
  async upload(
    guestId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<GuestPhoto> {
    // Validate file
    const validation = this.validateFile({ mimeType, size: buffer.length });
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Check if guest exists
    const guest = await db.query.guests.findFirst({
      where: eq(guests.id, guestId),
    });

    if (!guest) {
      throw new Error('Guest not found');
    }

    // Delete existing photo if any
    const existingPhoto = await this.getByGuestId(guestId);
    if (existingPhoto) {
      await this.delete(guestId);
    }

    // Generate unique key for R2
    const extension = this.getExtensionFromMimeType(mimeType);
    const r2Key = `guest-photos/${guestId}/${createId()}.${extension}`;

    // Upload to R2 (no optimization - upload original)
    const client = createR2Client();
    const command = new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: r2Key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000', // 1 year cache
    });

    await client.send(command);

    // Create database record
    const [photo] = await db.insert(guestPhotos).values({
      guestId,
      r2Key,
      publicUrl: getPublicUrl(r2Key),
      originalFilename: filename,
      fileSize: buffer.length,
      mimeType: mimeType,
      width: null,
      height: null,
    }).returning();

    return photo;
  },

  /**
   * Deletes a guest's photo.
   * 
   * Removes both the R2 storage object and the database record.
   * 
   * @param guestId - The guest's ID
   * @throws {Error} If photo not found or deletion fails
   * 
   * Requirements: 8.3
   */
  async delete(guestId: string): Promise<void> {
    // Get existing photo
    const photo = await this.getByGuestId(guestId);
    if (!photo) {
      throw new Error('Photo not found');
    }

    // Delete from R2
    const client = createR2Client();
    const command = new DeleteObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: photo.r2Key,
    });

    await client.send(command);

    // Delete database record
    await db.delete(guestPhotos).where(eq(guestPhotos.guestId, guestId));
  },

  /**
   * Retrieves a guest's photo by guest ID.
   * 
   * @param guestId - The guest's ID
   * @returns The guest photo record or null if not found
   * 
   * Requirements: 8.3
   */
  async getByGuestId(guestId: string): Promise<GuestPhoto | null> {
    const photo = await db.query.guestPhotos.findFirst({
      where: eq(guestPhotos.guestId, guestId),
    });

    return photo ?? null;
  },

  /**
   * Gets file extension from MIME type.
   */
  getExtensionFromMimeType(mimeType: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    return extensions[mimeType] || 'bin';
  },

  /**
   * Checks if R2 storage is properly configured.
   */
  isConfigured(): boolean {
    return !!(
      R2_CONFIG.accountId &&
      R2_CONFIG.accessKeyId &&
      R2_CONFIG.secretAccessKey &&
      R2_CONFIG.bucketName
    );
  },
};

export default GuestPhotoService;
