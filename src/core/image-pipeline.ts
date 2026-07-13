import sharp from 'sharp';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface ProcessedImage {
  normalizedBuffer: Buffer;          // 512-aligned WebP/PNG buffer
  thumbnail: string;                 // Base64 WebP, 64x64px
  width: number;                     // 512-aligned width
  height: number;                    // 512-aligned height
  originalWidth: number;
  originalHeight: number;
  originalSize: number;              // in bytes
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
    throw new Error(`Image size (${(originalSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum limit of ${config.MAX_IMAGE_SIZE_MB}MB.`);
  }

  // 2. Load with sharp and get metadata
  const image = sharp(buffer);
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

  // 3. Compute 512-aligned dimensions
  // Align to nearest multiple of 512, minimum of 512
  const width = Math.max(512, Math.round(originalWidth / 512) * 512);
  const height = Math.max(512, Math.round(originalHeight / 512) * 512);

  logger.debug(`Normalizing image from ${originalWidth}x${originalHeight} to 512-aligned ${width}x${height}`);

  // 4. Resize and normalize image
  const normalizedBuffer = await image
    .clone()
    .resize(width, height, { fit: 'fill' }) // fill to ensure exact dimensions
    .toFormat('webp')
    .toBuffer();

  // 5. Generate 64x64 WebP thumbnail
  const thumbBuffer = await image
    .clone()
    .resize(config.THUMBNAIL_SIZE, config.THUMBNAIL_SIZE, { fit: 'fill' })
    .toFormat('webp')
    .toBuffer();

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
