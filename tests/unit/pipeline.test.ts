import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { storage } from '../../src/core/storage.js';
import { retrieveState } from '../../src/core/retrieval.js';
import { processImage } from '../../src/core/image-pipeline.js';
import { calculateDHash, calculateAHash } from '../../src/core/hash.js';
import { memoryCache } from '../../src/core/cache.js';

const TEST_DB_PATH = path.join(process.cwd(), '.test-pipeline-db');

async function createSamplePng(red = 255, green = 0, blue = 0): Promise<Buffer> {
  try {
    const s = (await import('sharp')).default;
    return await s({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: red, g: green, b: blue },
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

describe('End-to-End Tiered Retrieval Pipeline (L1->L4)', () => {
  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
    await storage.init(TEST_DB_PATH);
  });

  afterAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
  });

  it('should flow through L1 miss -> L2 miss -> ingest -> L1 hit', async () => {
    const pngBuf = await createSamplePng();
    const b64 = pngBuf.toString('base64');

    // 1. Initial retrieval: Should miss
    const res1 = await retrieveState({ screenshot: b64, strategy: 'thorough' });
    expect(res1.is_known).toBe(false);
    expect(res1.match_type).toBe('new');

    // 2. Ingest state into memory & cache
    const processed = await processImage(pngBuf);
    const dhash = await calculateDHash(pngBuf);
    const ahash = await calculateAHash(pngBuf);
    const newState = {
      id: 'pipeline-state-1',
      dhash,
      ahash,
      vector: new Array(512).fill(0.0),
      description: 'Sample pipeline test screen',
      structured_data: '{}',
      accessibility_tree: '{}',
      thumbnail: processed.thumbnail,
      original_dimensions: '{"width":10,"height":10}',
      source_url: 'http://test.local',
      source_agent: 'agent',
      trace_id: 't1',
      git_branch: 'main',
      tags: '[]',
      importance_score: 0.5,
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1,
      ttl: 0,
    };

    await storage.addState(newState);
    memoryCache.set(newState);

    // 3. Second retrieval: Should hit L1/L2
    const res2 = await retrieveState({ screenshot: b64, strategy: 'fast' });
    expect(res2.is_known).toBe(true);
    expect(res2.state_id).toBe('pipeline-state-1');
  });
});
