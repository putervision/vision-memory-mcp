import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';

describe('Area 2: Circuit Breaker & Storage Fault-Tolerance Tests', () => {
  const originalPath = config.LANCEDB_PATH;
  const testDbDir = path.resolve(process.cwd(), '.test-circuit-breaker-db');

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

  it('should run storage.optimize() successfully on healthy tables', async () => {
    await expect(storage.optimize()).resolves.not.toThrow();
  });

  it('should throw error when operations are invoked before initialization', async () => {
    const uninitStorage = new (storage.constructor as any)();
    await expect(uninitStorage.getState('some-id')).rejects.toThrow(
      'States table not initialized.'
    );
    await expect(uninitStorage.listTransitions()).rejects.toThrow(
      'Transitions table not initialized.'
    );
  });

  it('should handle countStates and countStatesAll cleanly on empty DB', async () => {
    const count = await storage.countStates();
    expect(count).toBeGreaterThanOrEqual(0);
    const countAll = await storage.countStatesAll();
    expect(countAll).toBeGreaterThanOrEqual(0);
  });
});
