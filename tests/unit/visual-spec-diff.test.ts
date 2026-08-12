import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';
import { setVisualSpec, verifyVisualSpec, listVisualSpecs } from '../../src/core/visual-spec.js';

describe('Area 5: Visual Spec Perceptual Edge Cases & Sub-Pixel Diffing', () => {
  const originalPath = config.LANCEDB_PATH;
  const testDbDir = path.resolve(process.cwd(), '.test-visual-spec-diff-db');

  const tinyPng1 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const tinyPng2 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

  it('should register visual spec baseline and verify compliance against identical screenshot', async () => {
    const spec = await setVisualSpec({
      name: 'Login Form',
      screenshot: tinyPng1,
      metadata: { sdd_requirement_id: 'REQ-101' },
    });

    expect(spec.id).toContain('spec-login-form');
    expect(spec.dhash).toBeDefined();

    const result = await verifyVisualSpec({
      specName: 'Login Form',
      screenshot: tinyPng1,
      tolerance: 0.1,
    });

    expect(result.is_compliant).toBe(true);
    expect(result.status).toBe('pass');
    expect(result.dhash_distance).toBe(0);
  });

  it('should detect visual drift when verifying against a different screenshot', async () => {
    const result = await verifyVisualSpec({
      specName: 'Login Form',
      screenshot: tinyPng2,
      tolerance: 0.001,
    });

    expect(result).toBeDefined();
    expect(result.spec_name).toBe('Login Form');
  });

  it('should list all registered visual specs', async () => {
    const specs = await listVisualSpecs();
    expect(specs.length).toBeGreaterThanOrEqual(1);
    expect(specs[0].name).toBe('Login Form');
  });
});
