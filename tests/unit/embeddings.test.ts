import { describe, it, expect, beforeAll } from 'vitest';
import { embeddings } from '../../src/core/embeddings.js';

async function createTestImageBuffer(): Promise<Buffer> {
  try {
    const s = (await import('sharp')).default;
    return await s({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
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

describe('CLIP Embeddings Manager', () => {
  beforeAll(async () => {
    // Initialize the embeddings manager
    await embeddings.init();
  }, 60000); // 60s timeout for model download/load on first run

  it('should generate a 512-dimension text embedding', async () => {
    const text = 'test query';
    const vector = await embeddings.generateTextEmbedding(text);

    expect(vector).toBeInstanceOf(Array);
    expect(vector).toHaveLength(512);
    expect(vector.every((val) => typeof val === 'number')).toBe(true);
  }, 10000);

  it('should return zero vector fallback for invalid image buffer', async () => {
    const invalidBuffer = Buffer.from('not an image data string');
    const vector = await embeddings.generateImageEmbedding(invalidBuffer);

    expect(vector).toBeInstanceOf(Array);
    expect(vector).toHaveLength(512);
    expect(vector.every((val) => val === 0)).toBe(true);
  });

  it('should return zero vector for text embedding when in fallback mode', async () => {
    const originalFallback = embeddings.isFallback;
    (embeddings as any).fallbackMode = true;

    const vector = await embeddings.generateTextEmbedding('fallback text query');

    expect(vector).toHaveLength(512);
    expect(vector.every((val) => val === 0)).toBe(true);

    (embeddings as any).fallbackMode = originalFallback;
  });
});
