import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';

describe('Storage Extra Coverage Suite', () => {
  const testDbDir = path.join(process.cwd(), '.test-storage-extra-db');
  const originalPath = config.LANCEDB_PATH;

  beforeEach(async () => {
    config.LANCEDB_PATH = testDbDir;
    process.env.LANCEDB_PATH = testDbDir;
    await storage.init();
  });

  afterEach(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  it('should support adding and updating states in storage', async () => {
    const state = {
      id: 'upsert-1',
      dhash: '0000000000000000000000000000000000000000000000000000000000000000',
      ahash: '0000000000000000000000000000000000000000000000000000000000000000',
      vector: new Array(512).fill(0),
      description: 'Initial Description',
      structured_data: '{}',
      accessibility_tree: '',
      thumbnail: '',
      original_dimensions: '{}',
      source_url: '',
      source_agent: '',
      trace_id: '',
      git_branch: 'main',
      tags: '[]',
      importance_score: 1.0,
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1,
      ttl: 0,
    };

    await storage.addState(state);
    let fetched = await storage.getState('upsert-1');
    expect(fetched?.description).toBe('Initial Description');

    await storage.updateState('upsert-1', { description: 'Updated Description' });
    fetched = await storage.getState('upsert-1');
    expect(fetched?.description).toBe('Updated Description');
  });

  it('should handle countStates and countTransitions', async () => {
    const statesCount = await storage.countStates();
    const transCount = await storage.countTransitions();

    expect(typeof statesCount).toBe('number');
    expect(typeof transCount).toBe('number');
  });

  it('should support optimize and vacuum storage calls', async () => {
    await expect(storage.optimize()).resolves.not.toThrow();
  });

  it('should handle searchVectorAll and listStateHashesAll', async () => {
    const state = {
      id: 'hash-test-1',
      dhash: '1111111111111111111111111111111111111111111111111111111111111111',
      ahash: '1111111111111111111111111111111111111111111111111111111111111111',
      vector: new Array(512).fill(0.1),
      description: 'Hash State',
      structured_data: '{}',
      accessibility_tree: '',
      thumbnail: '',
      original_dimensions: '{}',
      source_url: '',
      source_agent: '',
      trace_id: '',
      git_branch: 'main',
      tags: '[]',
      importance_score: 1.0,
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1,
      ttl: 0,
    };

    await storage.addState(state);

    const hashes = await storage.listStateHashesAll("git_branch = 'main'", 10);
    expect(hashes.length).toBeGreaterThan(0);
    expect(hashes.some((h) => h.id === 'hash-test-1')).toBe(true);

    const vecMatches = await storage.searchVectorAll(new Array(512).fill(0.1), 5);
    expect(vecMatches.length).toBeGreaterThan(0);
  });
});
