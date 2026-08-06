import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { setVisualSpec, verifyVisualSpec } from '../../src/core/visual-spec.js';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';
import { MemoryCache, getCurrentBranch } from '../../src/core/cache.js';

async function createTestPngBuffer(): Promise<Buffer> {
  try {
    const s = (await import('sharp')).default;
    return await s({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 128, g: 128, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  } catch {
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZSURBVHjP7cEBDQAAAMKg90t52gAAAAAAAAAAAD8D7gAB+e35AAAAAElFTkSuQmCC',
      'base64'
    );
  }
}

describe('Retrieval & Visual-Spec Edge Cases Suite', () => {
  const testDbDir = path.join(process.cwd(), '.test-retrieval-edge-db');
  const originalPath = config.LANCEDB_PATH;
  let testFile: string;
  let base64Img: string;

  beforeEach(async () => {
    config.LANCEDB_PATH = testDbDir;
    process.env.LANCEDB_PATH = testDbDir;
    await storage.init();

    const buf = await createTestPngBuffer();
    base64Img = buf.toString('base64');
    testFile = path.join(testDbDir, 'test.png');
    fs.writeFileSync(testFile, buf);
  });

  afterEach(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testFile)) {
      try {
        fs.unlinkSync(testFile);
      } catch {}
    }
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  describe('visual-spec.ts error paths', () => {
    it('should throw error when setVisualSpec is called with non-existent filePath', async () => {
      await expect(
        setVisualSpec({ name: 'test', filePath: '/invalid/file/path/does/not/exist.png' })
      ).rejects.toThrow('File does not exist');
    });

    it('should throw error when setVisualSpec is called with no screenshot or filePath', async () => {
      await expect(setVisualSpec({ name: 'test' })).rejects.toThrow(
        'Either screenshot base64 or filePath must be provided'
      );
    });

    it('should register visual spec from filePath and verify against live screenshot', async () => {
      await setVisualSpec({ name: 'LoginSpec', filePath: testFile });

      const res = await verifyVisualSpec({
        specName: 'LoginSpec',
        filePath: testFile,
        tolerance: 5,
        sddRequirementId: 'REQ-101',
      });

      expect(res.is_compliant).toBe(true);
      expect(res.status).toBe('pass');
      expect(res.sdd_requirement_id).toBe('REQ-101');
    });

    it('should throw error when verifyVisualSpec is called for unregistered spec', async () => {
      await expect(
        verifyVisualSpec({ specName: 'UnregisteredSpec', screenshot: base64Img })
      ).rejects.toThrow('No visual spec baseline found');
    });
  });

  describe('cache.ts branch fallback lookup', () => {
    it('should find cache entry matching state id across branches when branch is unprovided', () => {
      const cache = new MemoryCache(5);
      const state = { id: 'branch-s1', git_branch: 'feature-branch' } as any;
      cache.set(state, 10000);

      const found = cache.get('branch-s1');
      expect(found).not.toBeNull();
      expect(found?.id).toBe('branch-s1');
    });
  });
});
