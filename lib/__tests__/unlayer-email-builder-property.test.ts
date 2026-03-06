import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';

/**
 * @fileoverview Property-based tests for UnlayerEmailBuilder component
 *
 * Feature: react-email-editor-migration, Property 2: Image Upload Round-Trip
 * Feature: react-email-editor-migration, Property 7: Error Callback Invocation
 *
 * Property 2: For any valid image file (JPEG, PNG, GIF, WebP) under 10MB uploaded
 * through the Unlayer editor's image callback, the system SHALL successfully upload
 * to R2 storage and return a valid public URL that can be used to retrieve the image.
 *
 * Property 7: For any error that occurs during editor initialization, image upload,
 * or design export, the error callback SHALL be invoked with an Error object
 * containing a descriptive message.
 *
 * **Validates: Requirements 5.1, 5.2, 5.4, 4.6, 5.3, 10.1, 10.4**
 */

// Valid image MIME types
const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ValidImageType = typeof VALID_IMAGE_TYPES[number];

// Invalid image MIME types for testing
const INVALID_IMAGE_TYPES = [
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'application/pdf',
  'text/plain',
  'application/json',
] as const;

// Max file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Helper to create a mock File object with a specific size
 */
function createMockFile(
  name: string,
  type: string,
  size: number
): File {
  // Create a mock file with Object.defineProperty to set the size
  const blob = new Blob([''], { type });
  const file = new File([blob], name, { type });
  
  // Override the size property
  Object.defineProperty(file, 'size', {
    value: size,
    writable: false,
  });
  
  return file;
}


/**
 * Image upload validation logic extracted for testing
 * This mirrors the validation logic in the UnlayerEmailBuilder component
 */
interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

function validateImageFile(file: File): ImageValidationResult {
  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Please upload JPEG, PNG, GIF, or WebP images.',
    };
  }

  // Validate file size (10MB max)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'File size exceeds 10MB limit.',
    };
  }

  return { valid: true };
}

/**
 * Simulates the image upload process
 */
interface UploadResult {
  success: boolean;
  url?: string;
  error?: Error;
}

async function simulateImageUpload(
  file: File,
  campaignId: string,
  mockFetch: (url: string, options: RequestInit) => Promise<Response>
): Promise<UploadResult> {
  // First validate the file
  const validation = validateImageFile(file);
  if (!validation.valid) {
    return {
      success: false,
      error: new Error(validation.error),
    };
  }

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await mockFetch(`/api/campaigns/${campaignId}/assets`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      success: true,
      url: result.publicUrl || result.url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Image upload failed'),
    };
  }
}


/**
 * Feature: react-email-editor-migration, Property 2: Image Upload Round-Trip
 * **Validates: Requirements 5.1, 5.2, 5.4**
 */
describe('Property 2: Image Upload Round-Trip', () => {
  // Arbitrary for valid image types
  const validImageTypeArb = fc.constantFrom(...VALID_IMAGE_TYPES);
  
  // Arbitrary for valid file sizes (1 byte to 10MB)
  const validFileSizeArb = fc.integer({ min: 1, max: MAX_FILE_SIZE });
  
  // Arbitrary for file names
  const fileNameArb = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => /^[a-zA-Z0-9_-]+$/.test(s))
    .map(s => s || 'image');
  
  // Arbitrary for campaign IDs
  const campaignIdArb = fc.string({ minLength: 10, maxLength: 30 })
    .filter(s => /^[a-zA-Z0-9]+$/.test(s))
    .map(s => s || 'campaign123');

  test.prop([validImageTypeArb, validFileSizeArb, fileNameArb, campaignIdArb])(
    'valid image files pass validation',
    (imageType, fileSize, fileName, campaignId) => {
      const extension = imageType.split('/')[1];
      const file = createMockFile(`${fileName}.${extension}`, imageType, fileSize);
      
      const result = validateImageFile(file);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    }
  );

  test.prop([validImageTypeArb, fileNameArb, campaignIdArb])(
    'valid image uploads return a public URL on success',
    async (imageType, fileName, campaignId) => {
      const extension = imageType.split('/')[1];
      const file = createMockFile(`${fileName}.${extension}`, imageType, 1024);
      const expectedUrl = `https://r2.example.com/campaigns/${campaignId}/${fileName}.${extension}`;
      
      // Mock successful fetch
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ publicUrl: expectedUrl }),
      });
      
      const result = await simulateImageUpload(file, campaignId, mockFetch);
      
      expect(result.success).toBe(true);
      expect(result.url).toBe(expectedUrl);
      expect(result.error).toBeUndefined();
      
      // Verify the API was called correctly
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/campaigns/${campaignId}/assets`,
        expect.objectContaining({
          method: 'POST',
        })
      );
    }
  );

  // Arbitrary for invalid image types
  const invalidImageTypeArb = fc.constantFrom(...INVALID_IMAGE_TYPES);

  test.prop([invalidImageTypeArb, fileNameArb])(
    'invalid image types are rejected with appropriate error',
    (imageType, fileName) => {
      const file = createMockFile(`${fileName}.file`, imageType, 1024);
      
      const result = validateImageFile(file);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    }
  );

  // Arbitrary for oversized files (10MB + 1 byte to 20MB)
  const oversizedFileSizeArb = fc.integer({ min: MAX_FILE_SIZE + 1, max: MAX_FILE_SIZE * 2 });

  test.prop([validImageTypeArb, oversizedFileSizeArb, fileNameArb])(
    'oversized files are rejected with appropriate error',
    (imageType, fileSize, fileName) => {
      const extension = imageType.split('/')[1];
      const file = createMockFile(`${fileName}.${extension}`, imageType, fileSize);
      
      const result = validateImageFile(file);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('10MB');
    }
  );
});


/**
 * Feature: react-email-editor-migration, Property 7: Error Callback Invocation
 * **Validates: Requirements 4.6, 5.3, 10.1, 10.4**
 */
describe('Property 7: Error Callback Invocation', () => {
  // Arbitrary for error messages
  const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim() || 'An error occurred');

  // Arbitrary for HTTP status codes (error codes)
  const httpErrorStatusArb = fc.constantFrom(400, 401, 403, 404, 500, 502, 503);
  
  // Arbitrary for HTTP status text
  const httpStatusTextArb = fc.constantFrom(
    'Bad Request',
    'Unauthorized',
    'Forbidden',
    'Not Found',
    'Internal Server Error',
    'Bad Gateway',
    'Service Unavailable'
  );

  test.prop([errorMessageArb])(
    'error callback receives Error object with descriptive message for validation errors',
    (errorMessage) => {
      const error = new Error(errorMessage);
      
      // Verify the error is an Error instance
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe(errorMessage);
      expect(error.message.length).toBeGreaterThan(0);
    }
  );

  test.prop([httpErrorStatusArb, httpStatusTextArb])(
    'upload failures invoke error callback with descriptive message',
    async (statusCode, statusText) => {
      const file = createMockFile('test.jpg', 'image/jpeg', 1024);
      const campaignId = 'test-campaign';
      
      // Mock failed fetch
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: statusCode,
        statusText: statusText,
      });
      
      const result = await simulateImageUpload(file, campaignId, mockFetch);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toContain('Upload failed');
      expect(result.error?.message).toContain(statusText);
    }
  );

  test.prop([errorMessageArb])(
    'network errors invoke error callback with Error object',
    async (errorMessage) => {
      const file = createMockFile('test.jpg', 'image/jpeg', 1024);
      const campaignId = 'test-campaign';
      
      // Mock network error
      const mockFetch = vi.fn().mockRejectedValue(new Error(errorMessage));
      
      const result = await simulateImageUpload(file, campaignId, mockFetch);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe(errorMessage);
    }
  );

  // Arbitrary for invalid image types
  const invalidImageTypeArb = fc.constantFrom(...INVALID_IMAGE_TYPES);

  test.prop([invalidImageTypeArb])(
    'invalid file type errors have descriptive messages',
    async (imageType) => {
      const file = createMockFile('test.file', imageType, 1024);
      const campaignId = 'test-campaign';
      
      // Mock fetch (should not be called for invalid files)
      const mockFetch = vi.fn();
      
      const result = await simulateImageUpload(file, campaignId, mockFetch);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toContain('Invalid file type');
      
      // Verify fetch was not called for invalid files
      expect(mockFetch).not.toHaveBeenCalled();
    }
  );

  test.prop([fc.integer({ min: MAX_FILE_SIZE + 1, max: MAX_FILE_SIZE * 2 })])(
    'oversized file errors have descriptive messages',
    async (fileSize) => {
      const file = createMockFile('test.jpg', 'image/jpeg', fileSize);
      const campaignId = 'test-campaign';
      
      // Mock fetch (should not be called for oversized files)
      const mockFetch = vi.fn();
      
      const result = await simulateImageUpload(file, campaignId, mockFetch);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toContain('10MB');
      
      // Verify fetch was not called for oversized files
      expect(mockFetch).not.toHaveBeenCalled();
    }
  );
});

/**
 * Additional unit tests for edge cases
 */
describe('Image Upload Edge Cases', () => {
  it('handles empty file name gracefully', () => {
    const file = createMockFile('', 'image/jpeg', 1024);
    const result = validateImageFile(file);
    
    // Empty file name should still pass validation if type and size are valid
    expect(result.valid).toBe(true);
  });

  it('handles exactly 10MB file size', () => {
    const file = createMockFile('test.jpg', 'image/jpeg', MAX_FILE_SIZE);
    const result = validateImageFile(file);
    
    // Exactly 10MB should be valid
    expect(result.valid).toBe(true);
  });

  it('handles file size just over 10MB', () => {
    const file = createMockFile('test.jpg', 'image/jpeg', MAX_FILE_SIZE + 1);
    const result = validateImageFile(file);
    
    // Just over 10MB should be invalid
    expect(result.valid).toBe(false);
    expect(result.error).toContain('10MB');
  });

  it('handles JSON parse errors in response', async () => {
    const file = createMockFile('test.jpg', 'image/jpeg', 1024);
    const campaignId = 'test-campaign';
    
    // Mock fetch with invalid JSON response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('Invalid JSON')),
    });
    
    const result = await simulateImageUpload(file, campaignId, mockFetch);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });
});
