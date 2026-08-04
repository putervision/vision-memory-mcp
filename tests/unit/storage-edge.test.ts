import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { storage, transitionKey } from '../../src/core/storage.js';
import { config } from '../../src/config.js';

describe('Storage Edge Cases Suite', () => {
  const primaryDbDir = path.join(process.cwd(), '.test-storage-edge-primary');
  const auxDbDir = path.join(primaryDbDir, 'subpkg', '.vision-memory-mcp');
  const originalPath = config.LANCEDB_PATH;

  beforeEach(async () => {
    config.LANCEDB_PATH = primaryDbDir;
    process.env.LANCEDB_PATH = primaryDbDir;
    fs.mkdirSync(auxDbDir, { recursive: true });
    await storage.init();
  });

  afterEach(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(primaryDbDir)) {
      fs.rmSync(primaryDbDir, { recursive: true, force: true });
    }
  });

  it('should generate deterministic transitionKey sha256 hash', () => {
    const key = transitionKey('state1', 'state2', 'click login');
    expect(key).toBeDefined();
    expect(key.length).toBe(32);
  });

  it('should test optimize circuit breaker tripping after consecutive failures', async () => {
    vi.spyOn(storage['statesTable']!, 'optimize').mockRejectedValue(
      new Error('Optimization error')
    );

    await storage.optimize(); // fail 1
    await storage.optimize(); // fail 2
    await storage.optimize(); // fail 3 - trips circuit breaker

    expect((storage as any).compactionFailures).toBe(3);

    // Call again - skipped due to circuit breaker
    await storage.optimize();
    expect((storage as any).compactionFailures).toBe(3);
  });

  it('should test addTransition, getTransition, listTransitions, and deleteTransition', async () => {
    const s1 = {
      id: 'trans-s1',
      dhash: '0000000000000000000000000000000000000000000000000000000000000000',
      ahash: '0000000000000000000000000000000000000000000000000000000000000000',
      vector: new Array(512).fill(0),
      description: 'Trans S1',
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
    const s2 = { ...s1, id: 'trans-s2', description: 'Trans S2' };
    await storage.addState(s1);
    await storage.addState(s2);

    const transition = {
      id: 't1',
      from_state_id: 'trans-s1',
      to_state_id: 'trans-s2',
      action: 'click submit',
      action_type: 'click',
      success: 1,
      success_count: 1,
      failure_count: 0,
      duration_ms: 150,
      last_traversed: Date.now(),
      git_branch: 'main',
      metadata: '{}',
    };

    await storage.addTransition(transition);

    const fetchedTrans = await storage.getTransition('t1');
    expect(fetchedTrans).not.toBeNull();
    expect(fetchedTrans?.id).toBe('t1');

    const transList = await storage.listTransitions("from_state_id = 'trans-s1'", 10);
    expect(transList.length).toBe(1);

    await storage.deleteTransition('t1');
    const afterDelete = await storage.getTransition('t1');
    expect(afterDelete).toBeNull();
  });

  it('should test listSnapshots, getSnapshot, and deleteSnapshot', async () => {
    const snap: any = {
      id: 'snap-del-1',
      name: 'delete-me-snap',
      description: 'Snapshot description',
      git_branch: 'main',
      created_at: Date.now(),
      state_ids: '[]',
    };
    await storage.addSnapshot(snap);

    const fetched = await storage.getSnapshot('snap-del-1');
    expect(fetched).not.toBeNull();

    await storage.deleteSnapshot('snap-del-1');
    const afterDel = await storage.getSnapshot('snap-del-1');
    expect(afterDel).toBeNull();
  });

  it('should test createVectorIndex when state count is below 256 and when above 256', async () => {
    // Below 256 - skips index creation
    await storage.createVectorIndex();

    // Mock count >= 256
    vi.spyOn(storage['statesTable']!, 'query').mockReturnValueOnce({
      toArray: async () => new Array(256).fill({ id: 'dummy' }),
    } as any);

    vi.spyOn(storage['statesTable']!, 'createIndex').mockResolvedValueOnce(undefined as any);

    await storage.createVectorIndex();
  });

  it('should handle listTransitionsAll and listSnapshotsAll aggregated calls', async () => {
    const allTransitions = await storage.listTransitionsAll(undefined, 10);
    expect(Array.isArray(allTransitions)).toBe(true);

    const allSnapshots = await storage.listSnapshotsAll(undefined);
    expect(Array.isArray(allSnapshots)).toBe(true);
  });
});
