import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createId } from '@paralleldrive/cuid2';

// R2 Configuration
const R2_CONFIG = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
  bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME || 'email-assets',
  publicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL || '',
};

/**
 * Upload context type - determines the folder structure in R2
 */
export type UploadContext = 
  | 'campaign-image'      // Inline images for email builder
  | 'campaign-attachment' // Email attachments for campaigns
  | 'event-asset'         // Event-related assets (banners, etc.)
  | 'guest-photo'         // Guest profile photos
  | 'general';            // General uploads

/**
 * Upload options for customizing upload behavior
 */
export interface UploadOptions {
  /** The upload context determines the folder structure */
  context: UploadContext;
  /** Reference ID (campaignId, eventId, guestId, etc.) */
  referenceId: string;
  /** Custom cache control header */
  cacheControl?: string;
  /** Content disposition (inline or attachment) */
  contentDisposition?: 'inline' | 'attachment';
  /** Custom metadata to attach to the object */
  metadata?: Record<string, string>;
}

// Create S3-compatible client for R2
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
 * Get the folder path based on upload context
 */
function getContextPath(context: UploadContext, referenceId: string): string {
  switch (context) {
    case 'campaign-image':
      return `campaigns/${referenceId}/images`;
    case 'campaign-attachment':
      return `campaigns/${referenceId}/attachments`;
    case 'event-asset':
      return `events/${referenceId}/assets`;
    case 'guest-photo':
      return `guests/${referenceId}/photos`;
    case 'general':
    default:
      return `uploads/${referenceId}`;
  }
}

export interface UploadResult {
  key: string;
  publicUrl: string;
  size: number;
}

export const R2StorageService = {
  /**
   * Upload a file to R2 storage (legacy method for backward compatibility)
   */
  async upload(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    campaignId: string
  ): Promise<UploadResult> {
    return this.uploadWithOptions(buffer, filename, mimeType, {
      context: 'campaign-image',
      referenceId: campaignId,
    });
  },

  /**
   * Upload a file to R2 storage with full options
   */
  async uploadWithOptions(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    options: UploadOptions
  ): Promise<UploadResult> {
    const client = createR2Client();
    
    // Generate unique key with context-based path
    const extension = filename.split('.').pop() || 'bin';
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const contextPath = getContextPath(options.context, options.referenceId);
    const key = `${contextPath}/${createId()}-${sanitizedFilename}`;
    
    // Default cache control based on context
    const defaultCacheControl = options.context === 'campaign-attachment'
      ? 'private, max-age=3600' // 1 hour for attachments
      : 'public, max-age=31536000'; // 1 year for images
    
    const command = new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: options.cacheControl || defaultCacheControl,
      ContentDisposition: options.contentDisposition === 'attachment'
        ? `attachment; filename="${sanitizedFilename}"`
        : undefined,
      Metadata: options.metadata,
    });
    
    await client.send(command);
    
    return {
      key,
      publicUrl: this.getPublicUrl(key),
      size: buffer.length,
    };
  },

  /**
   * Delete a file from R2 storage
   */
  async delete(key: string): Promise<void> {
    const client = createR2Client();
    
    const command = new DeleteObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
    });
    
    await client.send(command);
  },

  /**
   * Get public URL for a stored file
   */
  getPublicUrl(key: string): string {
    // If custom domain is configured, use it
    if (R2_CONFIG.publicUrl) {
      return `${R2_CONFIG.publicUrl}/${key}`;
    }
    // Fallback to R2.dev URL
    return `https://${R2_CONFIG.bucketName}.${R2_CONFIG.accountId}.r2.dev/${key}`;
  },

  /**
   * Get a presigned URL for secure, temporary access to a file
   * Useful for private attachments that shouldn't be publicly accessible
   */
  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const client = createR2Client();
    
    const command = new GetObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
    });
    
    return getSignedUrl(client, command, { expiresIn });
  },

  /**
   * Check if R2 is properly configured
   */
  isConfigured(): boolean {
    return !!(
      R2_CONFIG.accountId &&
      R2_CONFIG.accessKeyId &&
      R2_CONFIG.secretAccessKey &&
      R2_CONFIG.bucketName
    );
  },

  /**
   * Get file extension from MIME type
   */
  getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'text/plain': 'txt',
      'text/csv': 'csv',
    };
    return mimeToExt[mimeType] || 'bin';
  },
};

export default R2StorageService;
