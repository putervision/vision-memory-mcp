import { describe, it, expect } from 'vitest';
import { checkAndRunSchemaMigrations, CURRENT_SCHEMA_VERSION } from '../../src/core/migrations.js';
import { evictionManager } from '../../src/core/eviction.js';

describe('Schema Migrations and Eviction Module', () => {
  it('should run schema migration checks without throwing', async () => {
    await expect(checkAndRunSchemaMigrations()).resolves.not.toThrow();
  });

  it('should run eviction sweep without throwing', async () => {
    const result = await evictionManager.runEvictionSweep();
    expect(result).toBeDefined();
    expect(result.expiredCount).toBeGreaterThanOrEqual(0);
  });
});
