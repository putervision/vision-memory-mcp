import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../../src/tools/handlers.js';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';

async function createTestPngBuffer(): Promise<Buffer> {
  try {
    const s = (await import('sharp')).default;
    return await s({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 0, g: 128, b: 255, alpha: 1 },
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

describe('Handlers Coverage Suite', () => {
  const testDbDir = path.join(process.cwd(), '.test-handlers-coverage-db');
  const originalPath = config.LANCEDB_PATH;
  let toolMap: Map<string, Function>;
  let dummyBase64: string;

  const mockServer = {
    registerTool: (name: string, schema: any, cb: Function) => {
      toolMap.set(name, cb);
      return {} as any;
    },
  } as unknown as McpServer;

  beforeEach(async () => {
    toolMap = new Map();
    config.LANCEDB_PATH = testDbDir;
    process.env.LANCEDB_PATH = testDbDir;
    await storage.init();

    registerAllTools(mockServer);

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

  it('should test analyze_screenshot with full response format and accessibility tree', async () => {
    const tool = toolMap.get('analyze_screenshot');
    expect(tool).toBeDefined();

    const axTree = JSON.stringify({
      role: 'button',
      label: 'Submit Order',
      id: 'submit-btn',
      bbox: [10, 10, 100, 40],
    });

    const res = await tool!({
      screenshot: dummyBase64,
      response_format: 'full',
      accessibility_tree: axTree,
    });

    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain('state_id');
  });

  it('should test recall_memory with image screenshot input', async () => {
    const tool = toolMap.get('recall_memory');
    expect(tool).toBeDefined();

    const res = await tool!({
      screenshot: dummyBase64,
      response_format: 'compact',
    });

    expect(res.content[0].text).toBeDefined();
  });

  it('should test get_navigation_paths resolving from_state_id automatically', async () => {
    const s1 = {
      id: 'nav-s1',
      dhash: '0000000000000000000000000000000000000000000000000000000000000000',
      ahash: '0000000000000000000000000000000000000000000000000000000000000000',
      vector: new Array(512).fill(0),
      description: 'Nav S1',
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

    const tool = toolMap.get('get_navigation_paths');
    expect(tool).toBeDefined();

    const res = await tool!({ to_state_id: 'nav-s1' });
    expect(res.content[0].text).toBeDefined();
  });

  it('should test compare_states with two valid distinct states', async () => {
    const s1 = {
      id: 'cmp-s1',
      dhash: '0000000000000000000000000000000000000000000000000000000000000000',
      ahash: '0000000000000000000000000000000000000000000000000000000000000000',
      vector: new Array(512).fill(0),
      description: 'State A',
      structured_data: '{"key":"valueA"}',
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
    const s2 = {
      id: 'cmp-s2',
      dhash: '1111111111111111111111111111111111111111111111111111111111111111',
      ahash: '1111111111111111111111111111111111111111111111111111111111111111',
      vector: new Array(512).fill(1),
      description: 'State B',
      structured_data: '{"key":"valueB"}',
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
    await storage.addState(s2);

    const tool = toolMap.get('compare_states');
    expect(tool).toBeDefined();

    const res = await tool!({ state_a_id: 'cmp-s1', state_b_id: 'cmp-s2' });
    expect(res.content[0].text).toContain('cmp-s1');
  });

  it('should test get_session_context tool', async () => {
    const tool = toolMap.get('get_session_context');
    expect(tool).toBeDefined();

    const res = await tool!({ include_recent: 3, include_frequent: 2 });
    expect(res.content[0].text).toContain('memory_stats');
  });

  it('should test analyze_screenshot in batch mode', async () => {
    const tool = toolMap.get('analyze_screenshot');
    expect(tool).toBeDefined();

    const res = await tool!({
      items: [{ screenshot: dummyBase64 }],
      response_format: 'compact',
    });
    expect(res.content[0].text).toContain('batch_count');
  });

  it('should test manage_visual_spec tool for set, verify, and list', async () => {
    const specTool = toolMap.get('manage_visual_spec');
    expect(specTool).toBeDefined();

    await specTool!({ action: 'set', name: 'Checkout Spec', screenshot: dummyBase64 });
    const verifyRes = await specTool!({
      action: 'verify',
      spec_name: 'Checkout Spec',
      screenshot: dummyBase64,
      tolerance: 0.1,
    });

    expect(verifyRes.content[0].text).toContain('Checkout Spec');

    const listRes = await specTool!({ action: 'list' });
    expect(listRes.content[0].text).toContain('Checkout Spec');
  });

  it('should test compare_states as visual diff tool', async () => {
    const s1 = {
      id: 'diff-s1',
      dhash: '0000000000000000000000000000000000000000000000000000000000000000',
      ahash: '0000000000000000000000000000000000000000000000000000000000000000',
      vector: new Array(512).fill(0),
      description: 'Diff S1',
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
    const s2 = {
      id: 'diff-s2',
      dhash: '1111111111111111111111111111111111111111111111111111111111111111',
      ahash: '1111111111111111111111111111111111111111111111111111111111111111',
      vector: new Array(512).fill(0),
      description: 'Diff S2',
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
    await storage.addState(s2);

    const tool = toolMap.get('compare_states');
    expect(tool).toBeDefined();

    const res = await tool!({ state_a_id: 'diff-s1', state_b_id: 'diff-s2' });
    expect(res.content[0].text).toContain('has_layout_change');
  });

  it('should test forget_state tool', async () => {
    const s1 = {
      id: 'forget-s1',
      dhash: '0000000000000000000000000000000000000000000000000000000000000000',
      ahash: '0000000000000000000000000000000000000000000000000000000000000000',
      vector: new Array(512).fill(0),
      description: 'Forget S1',
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

    const tool = toolMap.get('forget_state');
    expect(tool).toBeDefined();

    const res = await tool!({ state_id: 'forget-s1' });
    expect(res.content[0].text).toContain('purged');
  });

  it('should test manage_snapshot export and restore actions', async () => {
    const tool = toolMap.get('manage_snapshot');
    expect(tool).toBeDefined();

    await tool!({ action: 'save', name: 'snap-for-archive' });

    const exportRes = await tool!({ action: 'export', name: 'snap-for-archive' });
    expect(exportRes.content[0].text).toContain('snapshot');

    const restoreRes = await tool!({ action: 'restore', archive_json: exportRes.content[0].text });
    expect(restoreRes.content[0].text).toContain('restored_states');
  });

  it('should test wait_for_visual_state tool', async () => {
    const s1 = {
      id: 'wait-s1',
      dhash: '0000000000000000000000000000000000000000000000000000000000000000',
      ahash: '0000000000000000000000000000000000000000000000000000000000000000',
      vector: new Array(512).fill(0),
      description: 'Wait S1',
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

    const tool = toolMap.get('wait_for_visual_state');
    expect(tool).toBeDefined();

    const res = await tool!({
      target_state_id: 'wait-s1',
      timeout_ms: 1000,
      poll_interval_ms: 100,
    });
    expect(res.content[0].text).toContain('matched');
  });
});
