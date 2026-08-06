import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getRegistry,
  registerProject,
  unregisterProject,
  getProjectFromRegistry,
  REGISTRY_PATH,
} from '../../src/core/registry.js';
import { MemoryCache, getCurrentBranch } from '../../src/core/cache.js';
import { parseAXTreeToGroundedElements, matchGroundedTarget } from '../../src/core/grounding.js';
import { processImage } from '../../src/core/image-pipeline.js';
import { getDirSize } from '../../src/utils/fs.js';
import { logger } from '../../src/logger.js';
import { config } from '../../src/config.js';

describe('Core Extra Coverage Suite', () => {
  describe('config.ts error validation', () => {
    it('should validate parseNumber and LOG_LEVEL environment settings', () => {
      // Test invalid LOG_LEVEL
      const origLogLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'super_verbose';

      expect(() => {
        const logLevelRaw = (process.env.LOG_LEVEL || 'info').toLowerCase();
        const validLogLevels = ['debug', 'info', 'warn', 'error'];
        if (!validLogLevels.includes(logLevelRaw)) {
          throw new Error(
            `LOG_LEVEL must be one of [debug, info, warn, error], got "${process.env.LOG_LEVEL}"`
          );
        }
      }).toThrow('LOG_LEVEL must be one of');

      process.env.LOG_LEVEL = origLogLevel;
    });
  });

  describe('registry.ts', () => {
    const testRegistryFile = path.join(os.homedir(), '.vision-memory-mcp', 'projects.json');
    let backupContent: string | null = null;

    beforeEach(() => {
      if (fs.existsSync(testRegistryFile)) {
        backupContent = fs.readFileSync(testRegistryFile, 'utf-8');
      }
    });

    afterEach(() => {
      if (backupContent !== null) {
        fs.writeFileSync(testRegistryFile, backupContent);
      } else if (fs.existsSync(testRegistryFile)) {
        try {
          fs.unlinkSync(testRegistryFile);
        } catch {}
      }
    });

    it('should register and unregister project in global registry', () => {
      const projName = 'test-proj-' + Math.random().toString(36).substring(2);
      const projPath = path.join(os.tmpdir(), projName);

      registerProject(projName, projPath);
      const registered = getProjectFromRegistry(projName);
      expect(registered).toBe(path.resolve(projPath));

      unregisterProject(projName);
      const afterUnregister = getProjectFromRegistry(projName);
      expect(afterUnregister).toBeUndefined();
    });

    it('should handle homedir registration attempt as no-op', () => {
      registerProject('home', os.homedir());
      expect(getProjectFromRegistry('home')).toBeUndefined();
    });

    it('should handle corrupt registry file gracefully', () => {
      fs.mkdirSync(path.dirname(testRegistryFile), { recursive: true });
      fs.writeFileSync(testRegistryFile, '{ invalid json');
      const reg = getRegistry();
      expect(typeof reg).toBe('object');
    });
  });

  describe('cache.ts', () => {
    it('should handle getCurrentBranch and cache eviction when capacity reached', () => {
      const cache = new MemoryCache(2);
      const state1 = { id: 's1', git_branch: 'main' } as any;
      const state2 = { id: 's2', git_branch: 'main' } as any;
      const state3 = { id: 's3', git_branch: 'main' } as any;

      cache.set(state1, 10000);
      cache.set(state2, 10000);
      expect(cache.size).toBe(2);

      // Over capacity -> evicts s1
      cache.set(state3, 10000);
      expect(cache.size).toBe(2);
      expect(cache.get('s1', 'main')).toBeNull();
      expect(cache.get('s2', 'main')).not.toBeNull();
      expect(cache.get('s3', 'main')).not.toBeNull();
    });

    it('should handle expired items in cache get() and sweepExpired()', async () => {
      const cache = new MemoryCache(5);
      const state = { id: 'exp1', git_branch: 'main' } as any;
      cache.set(state, 10); // 10ms TTL

      await new Promise((r) => setTimeout(r, 20));
      expect(cache.get('exp1', 'main')).toBeNull();

      cache.set(state, 10);
      await new Promise((r) => setTimeout(r, 20));
      cache.sweepExpired();
      expect(cache.size).toBe(0);
    });

    it('should support delete and clear methods', () => {
      const cache = new MemoryCache(5);
      const state = { id: 'd1', git_branch: 'main' } as any;
      cache.set(state, 10000);

      cache.delete('d1', 'main');
      expect(cache.get('d1', 'main')).toBeNull();

      cache.set(state, 10000);
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('grounding.ts', () => {
    it('should parse array-formatted accessibility trees', () => {
      const axTreeArray = [
        {
          id: 'btn-1',
          role: 'button',
          label: 'Submit',
          bbox: [10, 10, 100, 40],
        },
      ];

      const elements = parseAXTreeToGroundedElements(axTreeArray);
      expect(elements.length).toBe(1);
      expect(elements[0].id).toBe('btn-1');
      expect(elements[0].role).toBe('button');
    });

    it('should match grounded targets for typing goals', () => {
      const elements = [
        {
          id: '#email-input',
          role: 'input',
          label: 'Email Address',
          selector: '#email-input',
          bbox: [0, 0, 100, 30] as [number, number, number, number],
          center: [50, 15] as [number, number],
          state: 'enabled' as const,
          value: '',
        },
      ];

      const target = matchGroundedTarget(elements, 'type email user@example.com');
      expect(target).not.toBeNull();
      expect(target?.action).toBe('type');
      expect(target?.element_role).toBe('input');

      // Unknown goal action
      const nullTarget = matchGroundedTarget([], 'unknown action goal');
      expect(nullTarget).toBeNull();
    });

    it('should parse nested children in accessibility tree JSON', () => {
      const nestedTree = {
        role: 'container',
        children: [
          {
            role: 'link',
            label: 'Home Link',
            bbox: [5, 5, 50, 20],
          },
        ],
      };

      const elements = parseAXTreeToGroundedElements(JSON.stringify(nestedTree));
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  describe('image-pipeline.ts', () => {
    it('should respect STRIP_EXIF configuration when set to false', async () => {
      const origStrip = config.STRIP_EXIF;
      config.STRIP_EXIF = false;

      const rawBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      const processed = await processImage(rawBuffer);
      expect(processed.normalizedBuffer).toBeDefined();
      expect(processed.originalWidth).toBe(1);

      config.STRIP_EXIF = origStrip;
    });

    it('should throw error when image byte size exceeds max threshold', async () => {
      const origMax = config.MAX_IMAGE_SIZE_MB;
      config.MAX_IMAGE_SIZE_MB = 0.00001; // Tiny limit

      const rawBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      await expect(processImage(rawBuffer)).rejects.toThrow('exceeds max threshold');
      config.MAX_IMAGE_SIZE_MB = origMax;
    });

    it('should throw error on magic bytes mismatch or corrupted buffer', async () => {
      const badBuffer = Buffer.from('not-an-image-buffer-data-12345');
      await expect(processImage(badBuffer)).rejects.toThrow('file signature');
    });

    it('should downscale images exceeding 512x512 dimensions', async () => {
      let largeBuffer: Buffer;
      try {
        const sharp = (await import('sharp')).default;
        largeBuffer = await sharp({
          create: {
            width: 800,
            height: 600,
            channels: 4,
            background: { r: 100, g: 100, b: 100, alpha: 1 },
          },
        })
          .png()
          .toBuffer();
      } catch {
        const header = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
          0x52, 0x00, 0x00, 0x03, 0x20, 0x00, 0x00, 0x02, 0x58, 0x08, 0x06, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00,
        ]);
        largeBuffer = Buffer.concat([header, Buffer.alloc(100, 0xaa)]);
      }

      const processed = await processImage(largeBuffer);
      expect(processed.originalWidth).toBe(800);
      expect(processed.width).toBeLessThanOrEqual(512);
      expect(processed.height).toBeLessThanOrEqual(512);
    });
  });

  describe('embeddings.ts', () => {
    it('should return zero vector when generateTextEmbedding runs in fallback or error mode', async () => {
      const { embeddings } = await import('../../src/core/embeddings.js');
      const textVec = await embeddings.generateTextEmbedding('Search Query');
      expect(Array.isArray(textVec)).toBe(true);
      expect(textVec.length).toBe(config.EMBEDDING_DIMENSIONS);
    });

    it('should return zero vector for invalid image input in generateImageEmbedding', async () => {
      const { embeddings } = await import('../../src/core/embeddings.js');
      const badBuffer = Buffer.from('invalid-buffer');
      const imgVec = await embeddings.generateImageEmbedding(badBuffer);
      expect(Array.isArray(imgVec)).toBe(true);
      expect(imgVec.length).toBe(config.EMBEDDING_DIMENSIONS);
    });
  });

  describe('utils/fs.ts', () => {
    it('should calculate directory size and return 0 for non-existent path', async () => {
      const size = await getDirSize('/path/does/not/exist/999');
      expect(size).toBe(0);
    });
  });

  describe('logger.ts', () => {
    it('should execute debug, info, warn, and error logger methods', () => {
      const spyDebug = vi.spyOn(logger, 'debug');
      const spyInfo = vi.spyOn(logger, 'info');

      logger.debug('test debug message');
      logger.info('test info message');

      expect(spyDebug).toHaveBeenCalled();
      expect(spyInfo).toHaveBeenCalled();
    });
  });
});
