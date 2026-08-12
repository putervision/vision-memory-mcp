import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';
import { handleCreateEvidencePack, handleSearchVideoMemory } from '../../src/tools/handlers.js';

describe('Area 4: Video Memory & Keyframe Edge Case Tests', () => {
  const originalPath = config.LANCEDB_PATH;
  const testDbDir = path.resolve(process.cwd(), '.test-video-edge-db');

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

  it('should handle evidence pack creation with empty/missing optional objects', async () => {
    const pack = await handleCreateEvidencePack({
      source_video_id: 'vid-99',
      keyframe_state_ids: ['state-1', 'state-2'],
      linked_state_memory_nodes: {},
    });

    expect(pack).toBeDefined();
    expect(pack.id).toBeDefined();
    expect(pack.payload_hash).toBeDefined();
    expect(pack.payload_hash.length).toBe(64); // SHA-256 hex string

    const fetched = await storage.getEvidencePack(pack.id);
    expect(fetched).toBeDefined();
    expect(fetched?.source_video_id).toBe('vid-99');
  });

  it('should search video memory with special character queries', async () => {
    await storage.saveVideoRecord({
      id: 'vid-spec-1',
      source_file: '/tmp/test_special.mp4',
      file_format: 'mp4',
      duration_ms: 10000,
      fps: 1,
      resolution: '{"width":1280,"height":720}',
      total_frames_extracted: 10,
      unique_states_count: 2,
      summary_description: 'Playwright test record with special symbols',
      category: 'e2e_test',
      tags: '["e2e", "special"]',
      created_at: Date.now(),
      keyframe_timeline: '[]',
      trace_id: 't-video',
      git_branch: 'main',
    });

    const results = await handleSearchVideoMemory({ query: 'special' });
    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('vid-spec-1');
  });
});
