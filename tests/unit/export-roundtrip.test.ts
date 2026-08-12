import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';
import { saveSnapshot, diffSnapshots } from '../../src/core/snapshots.js';

describe('Area 6: Full Round-Trip Export & Checkpoint Fidelity Tests', () => {
  const originalPath = config.LANCEDB_PATH;
  const testDbDir = path.resolve(process.cwd(), '.test-export-roundtrip-db');

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

  it('should save visual snapshot and verify snapshot list and diff across checkpoints', async () => {
    await storage.addState({
      id: 'roundtrip-s1',
      dhash: '1'.repeat(64),
      ahash: '1'.repeat(64),
      vector: new Array(512).fill(0.1),
      description: 'Roundtrip S1',
      structured_data: '{}',
      accessibility_tree: '{}',
      thumbnail: '',
      original_dimensions: '{"width":512,"height":512}',
      source_url: 'https://example.com/s1',
      source_agent: 'test',
      trace_id: 't1',
      git_branch: 'main',
      tags: '[]',
      importance_score: 1.0,
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1,
      ttl: 0,
    });

    const snapA = await saveSnapshot('checkpoint-A', 'Initial baseline snapshot');
    expect(snapA.name).toBe('checkpoint-A');
    expect(snapA.state_ids).toBeDefined();

    const snapB = await saveSnapshot('checkpoint-B', 'Second snapshot checkpoint');
    expect(snapB.name).toBe('checkpoint-B');

    const snapshots = await storage.listSnapshotsAll();
    expect(snapshots.length).toBeGreaterThanOrEqual(2);

    const diff = await diffSnapshots('checkpoint-A', 'checkpoint-B');
    expect(diff).toBeDefined();
    expect(diff.added_states).toBeDefined();
    expect(diff.removed_states).toBeDefined();
    expect(diff.modified_states).toBeDefined();
  });
});
