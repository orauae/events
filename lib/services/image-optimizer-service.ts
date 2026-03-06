// Image optimization service - simplified version without sharp dependency
// Images are passed through without optimization to avoid native dependency issues

export interface OptimizationResult {
  buffer: Buffer;
  mimeType: string;
  width: number | null;
  height: number | null;
  originalSize: number;
  optimizedSize: number;
  wasOptimized: boolean;
}

export interface ImageMetadata {
  width: number | null;
  height: number | null;
  format: string;
}

export const ImageOptimizerService = {
  /**
   * Pass through image without optimization
   * Sharp dependency removed to avoid native build issues on some platforms
   */
  async optimize(
    buffer: Buffer,
    mimeType: string
  ): Promise<OptimizationResult> {
    return {
      buffer,
      mimeType,
      width: null,
      height: null,
      originalSize: buffer.length,
      optimizedSize: buffer.length,
      wasOptimized: false,
    };
  },

  /**
   * Get basic image metadata (format only, dimensions not available without sharp)
   */
  async getMetadata(buffer: Buffer): Promise<ImageMetadata> {
    // Detect format from magic bytes
    const format = this.detectFormat(buffer);
    return {
      width: null,
      height: null,
      format,
    };
  },

  /**
   * Detect image format from buffer magic bytes
   */
  detectFormat(buffer: Buffer): string {
    if (buffer.length < 4) return 'unknown';
    
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'jpeg';
    }
    
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'png';
    }
    
    // GIF: 47 49 46 38
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      return 'gif';
    }
    
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer.length > 11 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return 'webp';
    }
    
    return 'unknown';
  },

  /**
   * Validate image file type
   */
  isValidImageType(mimeType: string): boolean {
    const validTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ];
    return validTypes.includes(mimeType);
  },

  /**
   * Get max file size for uploads (10MB)
   */
  getMaxUploadSize(): number {
    return 10 * 1024 * 1024; // 10MB
  },
};

export default ImageOptimizerService;
