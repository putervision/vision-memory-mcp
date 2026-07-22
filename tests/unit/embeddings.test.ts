import { describe, it, expect, beforeAll } from 'vitest';
import { embeddings } from '../../src/core/embeddings.js';
import sharp from 'sharp';

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

  it('should generate a 512-dimension image embedding', async () => {
    // Create a dummy image buffer
    const buffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const vector = await embeddings.generateImageEmbedding(buffer);

    expect(vector).toBeInstanceOf(Array);
    expect(vector).toHaveLength(512);
    expect(vector.every((val) => typeof val === 'number')).toBe(true);
  }, 15000);
});
