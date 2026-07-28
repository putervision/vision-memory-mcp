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
});
