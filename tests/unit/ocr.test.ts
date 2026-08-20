import { describe, it, expect } from 'vitest';
import { extractTextFromImage, computeTextJaccardSimilarity } from '../../src/core/ocr.js';

describe('Local OCR Module', () => {
  it('should extract text tokens from image buffer', async () => {
    const mockBuffer = Buffer.from('User Login Form username password submit_button');
    const result = await extractTextFromImage(mockBuffer);
    expect(result.full_text).toContain('User');
    expect(result.full_text).toContain('Form');
    expect(result.tokens.length).toBeGreaterThan(0);
  });

  it('should compute Jaccard text similarity correctly', () => {
    const textA = 'Payment Succeeded Order #12345';
    const textB = 'Payment Succeeded Order #12345';
    const textC = 'Payment Failed Error #99999';

    expect(computeTextJaccardSimilarity(textA, textB)).toBe(1.0);
    const simAC = computeTextJaccardSimilarity(textA, textC);
    expect(simAC).toBeGreaterThan(0.0);
    expect(simAC).toBeLessThan(0.6);
  });

  it('should return empty result with engine: unavailable for binary image buffers', async () => {
    // PNG magic bytes
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const pngRes = await extractTextFromImage(pngBuffer);
    expect(pngRes.full_text).toBe('');
    expect(pngRes.tokens).toEqual([]);
    expect(pngRes.engine).toBe('unavailable');

    // JPEG magic bytes
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const jpegRes = await extractTextFromImage(jpegBuffer);
    expect(jpegRes.full_text).toBe('');
    expect(jpegRes.tokens).toEqual([]);
    expect(jpegRes.engine).toBe('unavailable');

    // Empty buffer
    const emptyRes = await extractTextFromImage(Buffer.alloc(0));
    expect(emptyRes.full_text).toBe('');
    expect(emptyRes.tokens).toEqual([]);
    expect(emptyRes.engine).toBe('unavailable');
  });
});
