import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';
import {
  registerAllTools,
  resolveImageInput,
  handleWaitForVisualState,
} from '../../src/tools/handlers.js';

async function createTestPngBuffer(): Promise<Buffer> {
  try {
    const s = (await import('sharp')).default;
    return await s({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 100, g: 200, b: 100, alpha: 1 },
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

describe('Handlers Deep Coverage Suite', () => {
  const testDbDir = path.join(process.cwd(), '.test-handlers-deep-db');
  const originalPath = config.LANCEDB_PATH;
  let dummyBase64: string;
  let toolMap: Map<string, Function>;

  const mockServer = {
    registerTool: (name: string, config: any, handler: Function) => {
      toolMap.set(name, handler);
    },
  };

  beforeEach(async () => {
    toolMap = new Map();
    config.LANCEDB_PATH = testDbDir;
    process.env.LANCEDB_PATH = testDbDir;
    await storage.init();

    registerAllTools(mockServer as any);

    const buf = await createTestPngBuffer();
    dummyBase64 = buf.toString('base64');
  });

  afterAll(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (_) {}
    }
  });

  describe('resolveImageInput', () => {
    it('should throw error when neither screenshot nor file_path is provided', async () => {
      await expect(resolveImageInput()).rejects.toThrow(
        'Either screenshot base64 or file_path must be provided.'
      );
    });

    it('should throw error when sensitive/forbidden system path is provided', async () => {
      await expect(resolveImageInput(undefined, '/etc/passwd')).rejects.toThrow(
        'Access to sensitive file or path is restricted'
      );
    });
  });

  describe('analyze_screenshot detailed parameters', () => {
    it('should ingest screenshot with all parameters (force_refresh, description, source_url, tags, trace_id, git_branch, full response)', async () => {
      const tool = toolMap.get('analyze_screenshot');
      expect(tool).toBeDefined();

      const res = await tool!({
        screenshot: dummyBase64,
        description: 'Dashboard Homepage',
        source_url: 'https://app.test.com/dashboard',
        tags: ['dashboard', 'ui'],
        trace_id: 'trace-12345',
        git_branch: 'feature-branch',
        force_refresh: true,
        response_format: 'full',
        accessibility_tree: JSON.stringify({ role: 'main', label: 'Main Content' }),
      });

      expect(res.isError).toBeUndefined();
      expect(res.content[0].text).toContain('Dashboard Homepage');
    });

    it('should update state description on cache hit when new description is passed', async () => {
      const tool = toolMap.get('analyze_screenshot');

      // First call: ingest
      const firstRes = await tool!({
        screenshot: dummyBase64,
        description: 'Initial Description',
      });
      const firstData = JSON.parse(firstRes.content[0].text);

      // Second call: cache hit with updated description
      const secondRes = await tool!({
        screenshot: dummyBase64,
        description: 'Updated Description',
      });

      expect(secondRes.content[0].text).toContain('Updated Description');
    });
  });

  describe('handleWaitForVisualState', () => {
    it('should return matched when target state is present', async () => {
      const s1 = {
        id: 'wait-target-1',
        dhash: '0000000000000000000000000000000000000000000000000000000000000000',
        ahash: '0000000000000000000000000000000000000000000000000000000000000000',
        vector: new Array(512).fill(0),
        description: 'Target State',
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
      await storage.addState(s1);

      const res = await handleWaitForVisualState({
        target_state_id: 'wait-target-1',
        timeout_ms: 1000,
        poll_interval_ms: 100,
      });

      expect(res.status).toBe('matched');
      expect(res.state?.id).toBe('wait-target-1');
    });

    it('should return timeout when target state is absent', async () => {
      const res = await handleWaitForVisualState({
        target_state_id: 'absent-state-999',
        timeout_ms: 200,
        poll_interval_ms: 50,
      });

      expect(res.status).toBe('timeout');
      expect(res.state).toBeNull();
    });
  });

  describe('export_visual_trajectories formats', () => {
    it('should export visual trajectories in llava and qwen2_vl formats', async () => {
      const tool = toolMap.get('export_visual_trajectories');
      expect(tool).toBeDefined();

      const resLlava = await tool!({ format: 'llava' });
      expect(resLlava.content[0].text).toContain('[');

      const resQwen = await tool!({ format: 'qwen2_vl' });
      expect(resQwen.content[0].text).toContain('[');
    });
  });

  describe('undo_last_visual_mutation', () => {
    it('should undo mutation when a transition exists', async () => {
      const s1 = {
        id: 'undo-s1',
        dhash: '0000000000000000000000000000000000000000000000000000000000000000',
        ahash: '0000000000000000000000000000000000000000000000000000000000000000',
        vector: new Array(512).fill(0),
        description: 'Undo S1',
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
      await storage.addState(s1);

      const transition = {
        id: 'undo-t1',
        from_state_id: 'undo-s1',
        to_state_id: 'undo-s1',
        action: 'click',
        action_type: 'click',
        success: 1,
        success_count: 1,
        failure_count: 0,
        duration_ms: 100,
        last_traversed: Date.now(),
        git_branch: 'main',
        metadata: '{}',
      };
      await storage.addTransition(transition);

      const tool = toolMap.get('undo_last_visual_mutation');
      expect(tool).toBeDefined();

      const res = await tool!({});
      expect(res.content[0].text).toContain('reverted_id');
    });
  });
});
