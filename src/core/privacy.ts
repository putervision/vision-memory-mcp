import sharp from 'sharp';
import { logger } from '../logger.js';

export interface RedactionResult {
  redactedText: string;
  isRedacted: boolean;
  detectedTypes: string[];
}

const PII_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'Credit Card', regex: /\b(?:\d[ -]*?){13,16}\b/g },
  { name: 'Email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'OpenAI API Key', regex: /\bsk-[a-zA-Z0-9_\-]{32,}\b/g },
  { name: 'GitHub Token', regex: /\bghp_[a-zA-Z0-9]{36}\b/g },
  { name: 'Generic Secret Key', regex: /\b[A-Za-z0-9+/]{40}={0,2}\b/g },
];

/**
 * Detects sensitive PII patterns in string payloads and redacts them with mask markers.
 */
export function redactSensitiveText(input: string): RedactionResult {
  if (!input) return { redactedText: '', isRedacted: false, detectedTypes: [] };

  let redactedText = input;
  let isRedacted = false;
  const detectedTypes: string[] = [];

  for (const pattern of PII_PATTERNS) {
    const matches = redactedText.match(new RegExp(pattern.regex.source, 'g'));
    if (matches && matches.length > 0) {
      isRedacted = true;
      detectedTypes.push(pattern.name);
      redactedText = redactedText.replace(
        new RegExp(pattern.regex.source, 'g'),
        `[REDACTED_${pattern.name.toUpperCase().replace(/\s+/g, '_')}]`
      );
    }
  }

  return { redactedText, isRedacted, detectedTypes };
}

/**
 * Draws solid black mask rectangles over sensitive image regions (e.g. password input fields).
 */
export async function redactImageRegions(
  buffer: Buffer,
  bboxes: Array<[number, number, number, number]>
): Promise<Buffer> {
  if (!bboxes.length || !buffer) return buffer;

  try {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 512;
    const height = metadata.height || 512;

    const composites = bboxes.map(([x, y, w, h]) => {
      const rectW = Math.max(1, Math.min(w, width - x));
      const rectH = Math.max(1, Math.min(h, height - y));
      const svgRect = `<svg width="${rectW}" height="${rectH}"><rect width="${rectW}" height="${rectH}" fill="black"/></svg>`;
      return {
        input: Buffer.from(svgRect),
        left: Math.max(0, Math.min(x, width - 1)),
        top: Math.max(0, Math.min(y, height - 1)),
      };
    });

    return await sharp(buffer).composite(composites).toBuffer();
  } catch (err) {
    logger.error('Failed to redact image regions:', err);
    return buffer;
  }
}
