process.env.LANCEDB_PATH = './data/test-graph-db';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { storage } from '../../src/core/storage.js';
import { recordTransition, findNavigationPaths } from '../../src/core/graph.js';
import { VisualState } from '../../src/types.js';

const TEST_DB_PATH = path.resolve(process.cwd(), './data/test-graph-db');

describe('Graph Navigation and Transitions', () => {
  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }

    await storage.init(TEST_DB_PATH);

    try {
      await storage.deleteState("id != ''");
      await storage.deleteTransition("id != ''");
    } catch {}

    const mockVector = new Array(512).fill(0.1);

    const states: VisualState[] = [
      {
        id: 'state-a',
        dhash: '0'.repeat(64),
        ahash: '0'.repeat(64),
        vector: mockVector,
        description: 'Dashboard Screen',
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
      },
      {
        id: 'state-b',
        dhash: '1'.repeat(64),
        ahash: '1'.repeat(64),
        vector: mockVector,
        description: 'Settings Panel',
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
      },
      {
        id: 'state-c',
        dhash: '01'.repeat(32),
        ahash: '01'.repeat(32),
        vector: mockVector,
        description: 'Billing Section',
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
      },
    ];

    for (const s of states) {
      await storage.addState(s);
    }
  });

  afterAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it('should record transitions and update counters correctly', async () => {
    const t1 = await recordTransition({
      fromStateId: 'state-a',
      toStateId: 'state-b',
      action: 'click settings',
      success: true,
      durationMs: 500,
    });

    expect(t1.success_count).toBe(1);
    expect(t1.failure_count).toBe(0);
    expect(t1.duration_ms).toBe(500);

    const t2 = await recordTransition({
      fromStateId: 'state-a',
      toStateId: 'state-b',
      action: 'click settings',
      success: false,
      durationMs: 1500,
    });

    expect(t2.success_count).toBe(1);
    expect(t2.failure_count).toBe(1);
    expect(t2.duration_ms).toBe(1000);
  });

  it('should throw error when recording transition with missing fromState', async () => {
    await expect(
      recordTransition({
        fromStateId: 'non-existent-state-1',
        toStateId: 'state-b',
        action: 'click invalid',
        success: true,
      })
    ).rejects.toThrow('Starting state with ID "non-existent-state-1" does not exist in storage.');
  });

  it('should throw error when recording transition with missing toState', async () => {
    await expect(
      recordTransition({
        fromStateId: 'state-a',
        toStateId: 'non-existent-state-2',
        action: 'click invalid',
        success: true,
      })
    ).rejects.toThrow('Target state with ID "non-existent-state-2" does not exist in storage.');
  });

  it('should find navigation paths via BFS', async () => {
    await recordTransition({
      fromStateId: 'state-b',
      toStateId: 'state-c',
      action: 'click billing link',
      success: true,
      durationMs: 400,
    });

    const result = await findNavigationPaths({
      fromStateId: 'state-a',
      toStateId: 'state-c',
      maxHops: 3,
    });

    expect(result.paths.length).toBeGreaterThan(0);
    const topPath = result.paths[0];
    expect(topPath.steps).toHaveLength(2);
    expect(topPath.steps[0].state_id).toBe('state-a');
    expect(topPath.steps[0].action).toBe('click settings');
    expect(topPath.steps[1].state_id).toBe('state-b');
    expect(topPath.steps[1].action).toBe('click billing link');
  });

  it('should resolve navigation target using description parameter', async () => {
    const result = await findNavigationPaths({
      fromStateId: 'state-a',
      toDescription: 'Billing Section',
      maxHops: 3,
    });

    expect(result.paths).toBeDefined();
  });

  it('should store traceId in metadata when recording transition', async () => {
    const t = await recordTransition({
      fromStateId: 'state-a',
      toStateId: 'state-b',
      action: 'click profile',
      success: true,
      traceId: 'session-xyz',
    });

    const parsedMetadata = JSON.parse(t.metadata);
    expect(parsedMetadata.trace_id).toBe('session-xyz');
  });
});
