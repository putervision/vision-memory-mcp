import sharp, { Metadata } from 'sharp';
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

  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return true;
  }

  // BMP: 42 4D
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return true;
  }

  return false;
}

/**
 * Processes an input base64 or Buffer screenshot:
 * 1. Checks magic byte file signatures
 * 2. Enforces input pixel limits (decompression bomb protection)
 * 3. Aligns dimensions to 512x512 max scale preserving aspect ratio
 * 4. Extracts 64x64 WebP thumbnail base64
 */
export async function processImage(imageInput: string | Buffer): Promise<ProcessedImage> {
  let buffer: Buffer;
  if (typeof imageInput === 'string') {
    const cleanBase64 = imageInput.replace(/^data:image\/\w+;base64,/, '');
    buffer = Buffer.from(cleanBase64, 'base64');
  } else {
    buffer = imageInput;
  }

  // 1. Check max input buffer byte size
  const maxBytes = config.MAX_IMAGE_SIZE_MB * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new Error(
      `Image size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds max threshold of ${config.MAX_IMAGE_SIZE_MB} MB.`
    );
  }

  // 2. Validate magic bytes before feeding to sharp
  if (!validateImageMagicBytes(buffer)) {
    throw new Error('Unsupported or invalid image file signature (magic bytes mismatch).');
  }

  // 3. Load with sharp and enforce input pixel limit (decompression bomb protection)
  const image = sharp(buffer, { limitInputPixels: config.LIMIT_INPUT_PIXELS });
  let metadata: Metadata;
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
    originalSize: buffer.length,
  };
}
