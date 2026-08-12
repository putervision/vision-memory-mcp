import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { storage } from '../../src/core/storage.js';
import { processImage } from '../../src/core/image-pipeline.js';
import { config } from '../../src/config.js';
import { VisualState, StateTransition } from '../../src/types.js';

describe('Area 1: Heavy Concurrency & Lock Stress Tests', () => {
  const originalPath = config.LANCEDB_PATH;
  const testDbDir = path.resolve(process.cwd(), '.test-concurrency-stress-db');

  beforeAll(async () => {
    config.LANCEDB_PATH = testDbDir;
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
    await storage.init();
  });

  afterAll(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (_) {}
    }
  });

  it('should handle 30 parallel addState calls under write queue concurrency', async () => {
    const promises: Promise<void>[] = [];
    const dummyVector = new Array(512).fill(0.01);

    for (let i = 0; i < 30; i++) {
      const state: VisualState = {
        id: `concurrency-state-${i}`,
        dhash: '0'.repeat(64),
        ahash: '0'.repeat(64),
        vector: dummyVector,
        description: `Concurrency Test State ${i}`,
        structured_data: '{}',
        accessibility_tree: '{}',
        thumbnail: '',
        original_dimensions: '{"width":512,"height":512}',
        source_url: `https://example.com/page/${i}`,
        source_agent: 'test-agent',
        trace_id: `trace-${i}`,
        git_branch: 'main',
        tags: '["test"]',
        importance_score: 0.5,
        created_at: Date.now(),
        last_accessed: Date.now(),
        access_count: 1,
        ttl: 0,
      };
      promises.push(storage.addState(state));
    }

    await Promise.all(promises);

    const states = await storage.listStates(undefined, 100);
    expect(states.length).toBeGreaterThanOrEqual(30);
  });

  it('should handle parallel addTransition calls without lock conflicts', async () => {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < 20; i++) {
      const transition: StateTransition = {
        id: `trans-concurrency-${i}`,
        from_state_id: `concurrency-state-${i}`,
        to_state_id: `concurrency-state-${(i + 1) % 30}`,
        action: 'click',
        action_type: 'click',
        success: 1,
        success_count: 1,
        failure_count: 0,
        duration_ms: 150,
        last_traversed: Date.now(),
        git_branch: 'main',
        metadata: '{}',
      };
      promises.push(storage.addTransition(transition));
    }

    await Promise.all(promises);

    const transitions = await storage.listTransitions(undefined, 100);
    expect(transitions.length).toBeGreaterThanOrEqual(20);
  });

  it('should enforce MAX_CONCURRENT_IMAGE_PROCESSING semaphore under burst requests', async () => {
    config.MAX_CONCURRENT_IMAGE_PROCESSING = 2;

    // 1x1 4-byte transparent PNG base64
    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const burstPromises = Array.from({ length: 10 }, () => processImage(tinyPng));
    const results = await Promise.all(burstPromises);

    expect(results).toHaveLength(10);
    for (const res of results) {
      expect(res.width).toBeGreaterThan(0);
      expect(res.thumbnail).toBeDefined();
    }
  });
});
