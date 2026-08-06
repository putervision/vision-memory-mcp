process.env.LANCEDB_PATH = './data/test-retrieval-db';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { storage } from '../../src/core/storage.js';
import { retrieveState, compressAccessibilityTree } from '../../src/core/retrieval.js';
import { calculateDHash, calculateAHash } from '../../src/core/hash.js';
import { VisualState } from '../../src/types.js';

const TEST_DB_PATH = path.resolve(process.cwd(), './data/test-retrieval-db');

async function createRedPng(): Promise<Buffer> {
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

describe('Tiered Retrieval Engine', () => {
  let redBuffer: Buffer;
  let dhashRed: string;
  let ahashRed: string;

  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }

    await storage.init(TEST_DB_PATH);

    try {
      await storage.deleteState("id != ''");
      await storage.deleteTransition("id != ''");
    } catch {}

    redBuffer = await createRedPng();

    dhashRed = await calculateDHash(redBuffer);
    ahashRed = await calculateAHash(redBuffer);

    const state: VisualState = {
      id: 'state-red',
      dhash: dhashRed,
      ahash: ahashRed,
      vector: new Array(512).fill(0.1),
      description: 'Solid Red Screen',
      structured_data: '{}',
      accessibility_tree: '{"nodes": []}',
      thumbnail: '',
      original_dimensions: '{"width":100,"height":100}',
      source_url: '',
      source_agent: '',
      trace_id: '',
      git_branch: 'main',
      tags: '["red","test"]',
      importance_score: 0.5,
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1,
      ttl: 0,
    };

    await storage.addState(state);
  });

  afterAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it('should hit cache using exact perceptual hash (L2 cache hit)', async () => {
    const result = await retrieveState({
      screenshot: redBuffer,
      strategy: 'fast',
      gitBranch: 'main',
    });

    expect(result.is_known).toBe(true);
    expect(result.state_id).toBe('state-red');
    expect(result.match_type).toBe('exact_hash');
    expect(result.description).toBe('Solid Red Screen');
  });

  it('should invalidate cache hit if accessibility trees differ', async () => {
    const result = await retrieveState({
      screenshot: redBuffer,
      strategy: 'thorough',
      gitBranch: 'main',
      accessibilityTree: '{"nodes": [{"id": 1}]}',
    });

    expect(result.is_known).toBe(false);
    expect(result.match_type).toBe('new');
  });

  it('should search states using semantic text vector search (L3 search)', async () => {
    const result = await retrieveState({
      query: 'Solid Red Screen',
      strategy: 'semantic',
      gitBranch: 'main',
    });

    expect(result.state_id).toBe('state-red');
    expect(result.match_type).toBe('vector_similar');
  });

  it('should compress accessibility trees cleanly', () => {
    const emptyComp = compressAccessibilityTree('');
    expect(emptyComp).toBe('{}');

    const tree = JSON.stringify({ role: 'button', name: 'Submit' });
    const compressed = compressAccessibilityTree(tree);
    expect(compressed).toContain('button');
  });
});
