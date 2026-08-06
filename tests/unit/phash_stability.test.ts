import { describe, it, expect } from 'vitest';
import { calculateDHash, calculateAHash, hammingDistance } from '../../src/core/hash.js';
import { processImage } from '../../src/core/image-pipeline.js';

async function createPngFixture(): Promise<Buffer> {
  try {
    const s = (await import('sharp')).default;
    return await s({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
  } catch {
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZSURBVHjP7cEBDQAAAMKg90t52gAAAAAAAAAAAD8D7gAB+e35AAAAAElFTkSuQmCC',
      'base64'
    );
  }
}

describe('Perceptual Hash Stability Regression Suite', () => {
  it('should generate deterministic dHash and aHash strings for reference fixtures', async () => {
    const buf = await createPngFixture();
    const processed = await processImage(buf);

    const dhash1 = await calculateDHash(processed.normalizedBuffer);
    const dhash2 = await calculateDHash(processed.normalizedBuffer);
    const ahash1 = await calculateAHash(processed.normalizedBuffer);
    const ahash2 = await calculateAHash(processed.normalizedBuffer);

    expect(dhash1).toHaveLength(64);
    expect(ahash1).toHaveLength(64);
    expect(dhash1).toBe(dhash2);
    expect(ahash1).toBe(ahash2);
  });

  it('should return hammingDistance 0 for identical hashes', () => {
    const h1 = '1010101010101010101010101010101010101010101010101010101010101010';
    expect(hammingDistance(h1, h1)).toBe(0);
  });

  it('should correctly measure hammingDistance deltas', () => {
    const h1 = '0000000000000000000000000000000000000000000000000000000000000000';
    const h2 = '1111000000000000000000000000000000000000000000000000000000000000';
    expect(hammingDistance(h1, h2)).toBe(4);
  });
});
