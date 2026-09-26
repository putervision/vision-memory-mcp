import { describe, it, expect, afterEach } from 'vitest';
import { canonicalJsonStringify } from '../../src/utils/canonical-json.js';
import { registerAllTools } from '../../src/tools/handlers.js';
import {
  registerProject,
  unregisterProject,
  getProjectFromRegistry,
} from '../../src/core/registry.js';
import fs from 'fs';
import path from 'path';

describe('Vision-Memory Canonical JSON, Legacy Compat, and Registry Coverage', () => {
  describe('canonicalJsonStringify', () => {
    it('serializes undefined, null, booleans, and numbers correctly', () => {
      expect(canonicalJsonStringify(undefined)).toBe('');
      expect(canonicalJsonStringify(null)).toBe('null');
      expect(canonicalJsonStringify(true)).toBe('true');
      expect(canonicalJsonStringify(false)).toBe('false');
      expect(canonicalJsonStringify(42)).toBe('42');
      expect(canonicalJsonStringify(-0)).toBe('0');
      expect(canonicalJsonStringify(3.1415926535)).toBe('3.141593');

      expect(() => canonicalJsonStringify(NaN)).toThrow('Invalid non-finite number');
      expect(() => canonicalJsonStringify(Infinity)).toThrow('Invalid non-finite number');
      expect(() => canonicalJsonStringify(-Infinity)).toThrow('Invalid non-finite number');
    });

    it('serializes arrays and handles undefined items', () => {
      expect(canonicalJsonStringify([])).toBe('[]');
      expect(canonicalJsonStringify(['a', undefined, 'b'])).toBe('["a",null,"b"]');
    });

    it('serializes objects with sorted keys and omits undefined properties', () => {
      const obj = { z: 10, a: 'apple', omitted: undefined, m: { y: 2, x: 1 } };
      expect(canonicalJsonStringify(obj)).toBe('{"a":"apple","m":{"x":1,"y":2},"z":10}');
    });

    it('handles fallback types', () => {
      const sym = Symbol('test');
      expect(canonicalJsonStringify(sym)).toBe(undefined as any);
    });
  });

  describe('Legacy Tool Compatibility in registerAllTools', () => {
    const originalEnv = process.env.VISION_MEMORY_COMPAT;

    afterEach(() => {
      process.env.VISION_MEMORY_COMPAT = originalEnv;
    });

    it('registers legacy compatibility tools when VISION_MEMORY_COMPAT is true', async () => {
      process.env.VISION_MEMORY_COMPAT = 'true';
      const registered: Record<string, { metadata: any; handler: any }> = {};

      const mockServer = {
        _registeredTools: registered,
        registerTool: (name: string, metadata: any, handler: any) => {
          registered[name] = { metadata, handler };
        },
      };

      registerAllTools(mockServer);

      // Verify legacy tools were registered
      expect(registered['batch_analyze_screenshots']).toBeDefined();
      expect(registered['get_metrics']).toBeDefined();

      // Invoke legacy tool that routes to analyze_screenshot
      if (registered['batch_analyze_screenshots']) {
        // Mock target tool
        registered['analyze_screenshot'] = {
          metadata: {},
          handler: async (args: any) => ({ content: [{ type: 'text', text: 'analyzed' }] }),
        };

        const res = await registered['batch_analyze_screenshots'].handler({
          items: [{ screenshot: 'abc', description: 'test' }],
        });
        expect(res.content[0].text).toBe('analyzed');
      }

      // Invoke legacy tool where target tool is missing
      if (registered['get_visual_diff']) {
        delete registered['compare_states'];
        const errRes = await registered['get_visual_diff'].handler({});
        expect(errRes.isError).toBe(true);
        expect(errRes.content[0].text).toContain('Target tool handler not found');
      }
    });
  });

  describe('Registry Operations & Fallbacks', () => {
    const tmpDir = path.join(process.cwd(), '.test-registry-coverage-db');
    const customRegPath = path.join(tmpDir, 'registry.json');
    const origRegPath = process.env.VISION_MEMORY_REGISTRY_PATH;

    afterEach(() => {
      if (origRegPath !== undefined) {
        process.env.VISION_MEMORY_REGISTRY_PATH = origRegPath;
      } else {
        delete process.env.VISION_MEMORY_REGISTRY_PATH;
      }
      if (fs.existsSync(tmpDir)) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
      }
    });

    it('registers and unregisters projects using custom registry path', () => {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      process.env.VISION_MEMORY_REGISTRY_PATH = customRegPath;

      registerProject('demo-project', '/tmp/demo');
      expect(getProjectFromRegistry('demo-project')).toBe('/tmp/demo');

      unregisterProject('demo-project');
      expect(getProjectFromRegistry('demo-project')).toBeUndefined();
    });

    it('exercises default registry path and backup writes', () => {
      delete process.env.VISION_MEMORY_REGISTRY_PATH;
      // Should handle register and unregister gracefully even if permission denied or default path
      registerProject('temp-test-proj', '/tmp/test');
      unregisterProject('temp-test-proj');
    });

    it('exercises getCurrentBranch resolution and fallback', async () => {
      const { getCurrentBranch } = await import('../../src/core/cache.js');
      const branch = getCurrentBranch();
      expect(typeof branch).toBe('string');
      expect(branch.length).toBeGreaterThan(0);
    });
  });
});
