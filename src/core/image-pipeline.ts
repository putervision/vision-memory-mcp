import sharp from 'sharp';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface ProcessedImage {
  normalizedBuffer: Buffer; // 512-aligned WebP/PNG buffer
  thumbnail: string; // Base64 WebP, 64x64px
  width: number; // 512-aligned width
  height: number; // 512-aligned height
  originalWidth: number;
  originalHeight: number;
  originalSize: number; // in bytes
}

/**
 * Validates magic byte signatures for supported image formats.
 */
export function validateImageMagicBytes(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 4) return false;

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return true;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // WebP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return true;
  }

  // GIF: GIF87a or GIF89a
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return true;
  }

  // BMP: BM (42 4D)
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return true;
  }

  return false;
}

/**
 * Validates and processes an incoming base64 or buffer screenshot.
 * Normalizes it to 512-aligned dimensions and generates a 64x64 WebP thumbnail.
 */
export async function processImage(input: string | Buffer): Promise<ProcessedImage> {
  let buffer: Buffer;

  // 1. Decode base64 if needed
  if (typeof input === 'string') {
    // Strip data URL prefix if present
    const base64Data = input.replace(/^data:image\/\w+;base64,/, '');
    buffer = Buffer.from(base64Data, 'base64');
  } else {
    buffer = input;
  }

  const originalSize = buffer.length;
  const maxBytes = config.MAX_IMAGE_SIZE_MB * 1024 * 1024;
  if (originalSize > maxBytes) {
    throw new Error(
      `Image size (${(originalSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum limit of ${config.MAX_IMAGE_SIZE_MB}MB.`
    );
  }

  // 2. Validate magic bytes before feeding to sharp
  if (!validateImageMagicBytes(buffer)) {
    throw new Error('Unsupported or invalid image file signature (magic bytes mismatch).');
  }

  // 3. Load with sharp and enforce input pixel limit (decompression bomb protection)
  const image = sharp(buffer, { limitInputPixels: config.LIMIT_INPUT_PIXELS });
  let metadata: sharp.Metadata;
  try {
    metadata = await image.metadata();
  } catch (error) {
    logger.error('Failed to parse image metadata:', error);
    throw new Error('Invalid image format or corrupted buffer.');
  }

  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error('Invalid image dimensions (width or height is zero).');
  }

  // Check total pixels against limit
  if (originalWidth * originalHeight > config.LIMIT_INPUT_PIXELS) {
    throw new Error(
      `Image pixel count (${originalWidth}x${originalHeight}) exceeds maximum allowed limit (${config.LIMIT_INPUT_PIXELS}).`
    );
  }

  // 4. Compute normalized dimensions without forced upscaling
  let width = originalWidth;
  let height = originalHeight;

  if (originalWidth > 512 || originalHeight > 512) {
    const scale = Math.min(512 / originalWidth, 512 / originalHeight);
    width = Math.max(1, Math.round(originalWidth * scale));
    height = Math.max(1, Math.round(originalHeight * scale));
  }

  logger.debug(
    `Normalizing image from ${originalWidth}x${originalHeight} to normalized ${width}x${height}`
  );

  // 5. Resize and normalize image without upscaling stretch
  let normalizedPipeline = image
    .clone()
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .toFormat('webp');

  if (config.STRIP_EXIF) {
    normalizedPipeline = normalizedPipeline.withMetadata({ exif: {} });
  }

  const normalizedBuffer = await normalizedPipeline.toBuffer();

  // 6. Generate thumbnail
  let thumbPipeline = image
    .clone()
    .resize(config.THUMBNAIL_SIZE, config.THUMBNAIL_SIZE, { fit: 'fill' })
    .toFormat('webp');

  if (config.STRIP_EXIF) {
    thumbPipeline = thumbPipeline.withMetadata({ exif: {} });
  }

  const thumbBuffer = await thumbPipeline.toBuffer();
  const thumbnail = `data:image/webp;base64,${thumbBuffer.toString('base64')}`;

  return {
    normalizedBuffer,
    thumbnail,
    width,
    height,
    originalWidth,
    originalHeight,
    originalSize,
  };
}

