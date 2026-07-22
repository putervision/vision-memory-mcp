process.env.LANCEDB_PATH = './data/test-snapshots-db';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { storage } from '../../src/core/storage.js';
import { saveSnapshot, diffSnapshots } from '../../src/core/snapshots.js';
import { VisualState } from '../../src/types.js';

const TEST_DB_PATH = path.resolve(process.cwd(), './data/test-snapshots-db');

describe('Snapshots Checkpointing and Diffing', () => {
  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });
    }

    await storage.init(TEST_DB_PATH);

    // Clear existing data
    try {
      await storage.deleteState("id != ''");
      await storage.deleteTransition("id != ''");
    } catch {}
  });

  afterAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });
    }
  });

  it('should save visual snapshot and diff snapshots correctly', async () => {
    const mockVector = new Array(512).fill(0.1);

    // 1. Create first state and save snapshot A
    const state1: VisualState = {
      id: 'state-1',
      dhash: '0'.repeat(64),
      ahash: '0'.repeat(64),
      vector: mockVector,
      description: 'First State Description',
      structured_data: '{}',
      accessibility_tree: '{}',
      thumbnail: '',
      original_dimensions: '{}',
      source_url: '',
      source_agent: '',
      trace_id: '',
      git_branch: 'main',
      tags: '[]',
      importance_score: 0.5,
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1,
      ttl: 0,
    };

    await storage.addState(state1);
    await saveSnapshot('snapshot-a', 'Initial snapshot');

    // 2. Add second state and drifted state-1 to database, then create snapshot-b manually
    const state2: VisualState = {
      id: 'state-2',
      dhash: '1'.repeat(64),
      ahash: '1'.repeat(64),
      vector: mockVector,
      description: 'Second State Description',
      structured_data: '{}',
      accessibility_tree: '{}',
      thumbnail: '',
      original_dimensions: '{}',
      source_url: '',
      source_agent: '',
      trace_id: '',
      git_branch: 'main',
      tags: '[]',
      importance_score: 0.5,
      created_at: Date.now() + 100,
      last_accessed: Date.now() + 100,
      access_count: 1,
      ttl: 0,
    };

    const state1Drifted: VisualState = {
      id: 'state-1-drifted',
      dhash: '01'.repeat(32),
      ahash: '01'.repeat(32),
      vector: mockVector,
      description: 'First State Description', // Same description to trigger visual drift detection
      structured_data: '{}',
      accessibility_tree: '{}',
      thumbnail: '',
      original_dimensions: '{}',
      source_url: '',
      source_agent: '',
      trace_id: '',
      git_branch: 'main',
      tags: '[]',
      importance_score: 0.5,
      created_at: Date.now() + 105,
      last_accessed: Date.now() + 105,
      access_count: 1,
      ttl: 0,
    };

    await storage.addState(state2);
    await storage.addState(state1Drifted);

    // Create snapshot-b containing the new states (state-2 and state-1-drifted)
    const snapB = {
      id: 'snap-b-id',
      name: 'snapshot-b',
      description: 'After additions and drift',
      git_branch: 'main',
      created_at: Date.now() + 200,
      state_ids: JSON.stringify(['state-2', 'state-1-drifted']),
    };
    await storage.addSnapshot(snapB);

    // 3. Diff A -> B
    const diff = await diffSnapshots('snapshot-a', 'snapshot-b');

    expect(diff.added_states).toHaveLength(1);
    expect(diff.added_states[0].id).toBe('state-2');

    expect(diff.modified_states).toHaveLength(1);
    expect(diff.modified_states[0].id).toBe('state-1');
    expect(diff.modified_states[0].hash_distance).toBe(32); // 0000... vs 0101... is distance 32

    expect(diff.removed_states).toHaveLength(0);
  });
});
