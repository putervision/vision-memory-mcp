import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { storage } from '../../src/core/storage.js';
import { retrieveState, compressAccessibilityTree } from '../../src/core/retrieval.js';
import { cosineSimilarity } from '../../src/core/embeddings.js';
import { hammingDistance } from '../../src/core/hash.js';
import {
  saveSnapshot,
  diffSnapshots,
  exportSnapshot,
  restoreSnapshot,
} from '../../src/core/snapshots.js';
import { VisualState } from '../../src/types.js';

describe('Vision Memory Storage, Retrieval & Snapshots Deep Branch Matrix', () => {
  const dummyBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  let tempDbDir: string;

  beforeEach(async () => {
    tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-storage-matrix-'));
    await storage.init(tempDbDir);
  });

  afterEach(async () => {
    if (fs.existsSync(tempDbDir)) {
      try {
        fs.rmSync(tempDbDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe('Embeddings & Hash distance edge cases', () => {
    it('should test cosineSimilarity with zero vectors, orthogonal vectors, and identical vectors', () => {
      expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
      expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
      expect(cosineSimilarity([0, 0, 0], [1, 0, 0])).toBe(0.0);
      expect(cosineSimilarity([], [])).toBe(0.0);
      expect(cosineSimilarity([1, 2], [1])).toBe(0.0);
    });

    it('should test hammingDistance with various hash lengths and edge cases', () => {
      expect(hammingDistance('0'.repeat(64), '0'.repeat(64))).toBe(0);
      expect(hammingDistance('0'.repeat(64), '1'.repeat(64))).toBe(64);
      expect(hammingDistance('0'.repeat(63) + '0', '0'.repeat(63) + '1')).toBe(1);
      expect(hammingDistance('0000', '00000000')).toBe(64);
    });
  });

  describe('Storage & Retrieval branch matrix', () => {
    it('should test addState, retrieveState, and AX tree compression', async () => {
      const now = Date.now();
      const state1: VisualState = {
        id: 'matrix-state-1',
        dhash: '0'.repeat(64),
        ahash: '0'.repeat(64),
        vector: new Array(512).fill(0.1),
        description: 'Matrix Test Screen 1',
        structured_data: JSON.stringify({ form: 'login' }),
        accessibility_tree: '',
        thumbnail: dummyBase64,
        original_dimensions: JSON.stringify({ width: 100, height: 100 }),
        source_url: 'http://localhost:3000/login',
        source_agent: 'test-agent',
        trace_id: 'trace-1',
        git_branch: 'main',
        tags: JSON.stringify(['auth', 'login']),
        importance_score: 0.9,
        created_at: now,
        last_accessed: now,
        access_count: 1,
        ttl: 0,
      };

      await storage.addState(state1);

      // Get state by ID
      const fetched = await storage.getState(state1.id);
      expect(fetched?.id).toBe(state1.id);

      // Retrieve state by image
      const retRes = await retrieveState({ screenshot: dummyBase64 });
      expect(retRes).toBeDefined();

      // Compress AX tree
      const comp1 = compressAccessibilityTree('');
      expect(comp1).toBe('{}');

      const treeObj = JSON.stringify({
        role: 'WebArea',
        children: [{ role: 'button', name: 'Submit' }],
      });
      const comp2 = compressAccessibilityTree(treeObj);
      expect(comp2).toContain('button');

      // Delete state
      await storage.deleteState(state1.id);
      const afterDelete = await storage.getState(state1.id);
      expect(afterDelete).toBeNull();
    });
  });

  describe('Snapshots branch matrix', () => {
    it('should test save, diff, export, and restore snapshots', async () => {
      const now = Date.now();
      const snapName1 = `snap-chk-1-${Date.now()}`;
      const snapName2 = `snap-chk-2-${Date.now()}`;

      // Save snapshot 1
      const snap1 = await saveSnapshot(snapName1, 'First checkpoint');
      expect(snap1.id).toBeDefined();

      // Save snapshot 2
      const snap2 = await saveSnapshot(snapName2, 'Second checkpoint');

      // Diff snapshots
      const diff = await diffSnapshots(snapName1, snapName2);
      expect(diff).toBeDefined();

      // Export snapshot
      const exported = await exportSnapshot(snapName1);
      expect(exported.snapshot.name).toBe(snapName1);

      // Restore snapshot
      const restoreRes = await restoreSnapshot(exported);
      expect(restoreRes.restored_states).toBeGreaterThanOrEqual(0);
    });
  });
});
