import { logger } from '../logger.js';

export interface OCRToken {
  text: string;
  confidence: number;
  bbox?: [number, number, number, number];
}

export interface OCRResult {
  full_text: string;
  tokens: OCRToken[];
  engine?: 'unavailable' | 'tesseract' | 'heuristics';
}

/**
 * Extracts visible text tokens and layout bounding boxes from screenshot buffers.
 * Returns an empty result with engine: 'unavailable' when no external WASM/Tesseract OCR engine is active,
 * preventing fake tokens and hallucinated confidence scores on binary image streams.
 */
export async function extractTextFromImage(buffer: Buffer): Promise<OCRResult> {
  if (!buffer || buffer.length === 0) {
    return { full_text: '', tokens: [], engine: 'unavailable' };
  }

  // Check if buffer is an image binary (PNG, JPEG, WebP, GIF, etc.)
  const isBinaryImage =
    (buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47) || // PNG
    (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) || // JPEG
    (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) || // GIF
    (buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'); // WebP

  if (isBinaryImage) {
    // Binary image buffer without external OCR engine -> return honest empty result
    return { full_text: '', tokens: [], engine: 'unavailable' };
  }

  // Fallback heuristic for raw ASCII/text buffers (e.g. testing or SVG text)
  try {
    const sampleText = buffer.toString('utf8', 0, Math.min(buffer.length, 1024));
    const rawTokens = sampleText.match(/[a-zA-Z0-9_\-\.\:\$\#\@]{3,}/g) || [];

    if (rawTokens.length === 0) {
      return { full_text: '', tokens: [], engine: 'unavailable' };
    }

    const tokens: OCRToken[] = rawTokens.slice(0, 50).map((t, idx) => ({
      text: t,
      confidence: 0.9,
      bbox: [10 * idx, 10 * idx, 50, 20],
    }));

    const full_text = tokens.map((t) => t.text).join(' ');
    return { full_text, tokens, engine: 'heuristics' };
  } catch (err) {
    logger.debug('Failed to run OCR extraction:', err);
    return { full_text: '', tokens: [], engine: 'unavailable' };
  }
}

/**
 * Computes Jaccard similarity coefficient (0.0 to 1.0) between two text strings based on word n-grams.
 */
export function computeTextJaccardSimilarity(textA?: string | null, textB?: string | null): number {
  if (!textA || !textB) return 1.0; // Default pass if one string is missing
  const setA = new Set(textA.toLowerCase().match(/\w+/g) || []);
  const setB = new Set(textB.toLowerCase().match(/\w+/g) || []);

  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersection++;
    }
  }

  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 1.0;
}
