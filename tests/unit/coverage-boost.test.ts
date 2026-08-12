import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { config } from '../../src/config.js';
import { storage } from '../../src/core/storage.js';
import { logger } from '../../src/logger.js';
import { VERSION } from '../../src/utils/version.js';
import { handleCreateEvidencePack } from '../../src/tools/handlers.js';

describe('Coverage Boost Unit Test Suite', () => {
  const testDbDir = path.join(process.cwd(), '.test-coverage-boost-db');
  const originalPath = config.LANCEDB_PATH;

  beforeEach(async () => {
    config.LANCEDB_PATH = testDbDir;
    process.env.LANCEDB_PATH = testDbDir;
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

  it('should verify VERSION constant is 0.9.0', () => {
    expect(VERSION).toBe('0.9.0');
  });

  it('should handle empty keyframe state IDs in handleCreateEvidencePack', async () => {
    const pack = await handleCreateEvidencePack({
      keyframe_state_ids: [],
    });
    expect(pack).toBeDefined();
    expect(pack.keyframe_state_ids).toEqual([]);
    expect(pack.payload_hash).toBeDefined();
  });

  it('should return null when retrieving non-existent evidence pack', async () => {
    const res = await storage.getEvidencePack('non_existent_pack_id');
    expect(res).toBeNull();
  });

  it('should handle logger methods cleanly', () => {
    expect(() => logger.info('Test info log')).not.toThrow();
    expect(() => logger.warn('Test warn log')).not.toThrow();
    expect(() => logger.error('Test error log')).not.toThrow();
    expect(() => logger.debug('Test debug log')).not.toThrow();
  });
});
