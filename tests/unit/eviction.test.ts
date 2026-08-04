import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { evictionManager } from '../../src/core/eviction.js';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';

describe('EvictionManager Engine', () => {
  const testDbDir = path.join(process.cwd(), '.test-eviction-db');
  const originalPath = config.LANCEDB_PATH;

  beforeEach(async () => {
    config.LANCEDB_PATH = testDbDir;
    process.env.LANCEDB_PATH = testDbDir;
    await storage.init();
  });

  afterEach(async () => {
    evictionManager.stopAutoEviction();
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  it('should start and stop auto-eviction timer cleanly', () => {
    evictionManager.startAutoEviction(100000);
    // Calling start twice should be a no-op
    evictionManager.startAutoEviction(100000);

    evictionManager.stopAutoEviction();
    // Calling stop twice should be a no-op
    evictionManager.stopAutoEviction();
  });

  it('should run eviction sweep and purge expired states', async () => {
    // Add expired state (created in past with short TTL)
    await storage.addState({
      id: 'expired-state-1',
      dhash: '0000000000000000000000000000000000000000000000000000000000000000',
      ahash: '0000000000000000000000000000000000000000000000000000000000000000',
      vector: new Array(512).fill(0),
      description: 'Expired State',
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
      created_at: Date.now() - 10000,
      last_accessed: Date.now() - 10000,
      access_count: 1,
      ttl: 100, // 100ms TTL -> expired
    });

    const res = await evictionManager.runEvictionSweep();
    expect(res.expiredCount).toBe(1);

    const remaining = await storage.getState('expired-state-1');
    expect(remaining).toBeNull();
  });

  it('should batch delete multiple visual states via deleteStates', async () => {
    const baseState = {
      dhash: '0000000000000000000000000000000000000000000000000000000000000000',
      ahash: '0000000000000000000000000000000000000000000000000000000000000000',
      vector: new Array(512).fill(0),
      description: 'Batch State',
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

    await storage.addState({ ...baseState, id: 'batch-state-1' });
    await storage.addState({ ...baseState, id: 'batch-state-2' });

    expect(await storage.getState('batch-state-1')).not.toBeNull();
    expect(await storage.getState('batch-state-2')).not.toBeNull();

    await storage.deleteStates(['batch-state-1', 'batch-state-2']);

    expect(await storage.getState('batch-state-1')).toBeNull();
    expect(await storage.getState('batch-state-2')).toBeNull();
  });

  it('should handle errors in eviction sweep gracefully', async () => {
    vi.spyOn(storage, 'listStatesAll').mockRejectedValueOnce(new Error('Storage failure'));

    const res = await evictionManager.runEvictionSweep();
    expect(res.expiredCount).toBe(0);
    expect(res.evictedSizeCount).toBe(0);
  });
});
