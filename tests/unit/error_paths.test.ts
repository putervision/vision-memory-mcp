process.env.LANCEDB_PATH = './data/test-errors-db';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { processImage } from '../../src/core/image-pipeline.js';
import { escapeSql, StorageManager } from '../../src/core/storage.js';
import { MemoryCache } from '../../src/core/cache.js';

const TEST_DB_PATH = path.resolve(process.cwd(), './data/test-errors-db');

describe('Error Paths & Edge Case Suite', () => {
  beforeAll(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it('should throw Error when processImage receives corrupt or empty buffer', async () => {
    const garbageBuffer = Buffer.from('this is not a valid image payload');
    await expect(processImage(garbageBuffer)).rejects.toThrow(/magic bytes mismatch/i);
  });

  it('should handle special character SQL injection in escapeSql safely', () => {
    const maliciousInput = "admin' OR '1'='1'; DROP TABLE visual_states; -- `test` \\";
    const escaped = escapeSql(maliciousInput);
    expect(escaped).toContain("admin''");
    expect(escaped).toContain('\\\\');
    expect(escaped).toContain('\\`');
  });

  it('should safely return null for non-existent state in StorageManager', async () => {
    const storage = new StorageManager();
    await storage.init(TEST_DB_PATH);
    const nonExistent = await storage.getState('non-existent-uuid-1234');
    expect(nonExistent).toBeNull();
  });

  it('should return null for expired entries in MemoryCache', () => {
    const cache = new MemoryCache();
    const mockState: any = {
      id: 'state-expired-test',
      git_branch: 'main',
    };

    cache.set(mockState, 100); // 100ms TTL
    // Manually backdate insertedAt to simulate expiration
    const key = (cache as any).makeKey('state-expired-test', 'main');
    const entry = (cache as any).cache.get(key);
    if (entry) {
      entry.insertedAt = Date.now() - 1000;
    }

    const retrieved = cache.get('state-expired-test', 'main');
    expect(retrieved).toBeNull();
  });
});
