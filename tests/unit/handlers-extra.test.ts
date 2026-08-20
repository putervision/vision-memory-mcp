import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../../src/tools/handlers.js';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';

describe('Handlers Extra Coverage Suite', () => {
  const testDbDir = path.join(process.cwd(), '.test-handlers-extra-db');
  const originalPath = config.LANCEDB_PATH;
  let toolMap: Map<string, Function>;

  beforeEach(async () => {
    config.LANCEDB_PATH = testDbDir;
    process.env.LANCEDB_PATH = testDbDir;
    await storage.init();

    toolMap = new Map();
    const mockServer = {
      registerTool: (name: string, schema: any, cb: Function) => {
        toolMap.set(name, cb);
        return {} as any;
      },
    } as unknown as McpServer;

    registerAllTools(mockServer);
  });

  afterAll(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (_) {}
    }
  });

  it('should handle export_trajectories tool formats', async () => {
    const state = {
      id: 'traj-state-1',
      dhash: '0000000000000000000000000000000000000000000000000000000000000000',
      ahash: '0000000000000000000000000000000000000000000000000000000000000000',
      vector: new Array(512).fill(0),
      description: 'Trajectory Test State',
      structured_data: '{}',
      accessibility_tree: '',
      thumbnail: 'data:image/webp;base64,AAAA',
      original_dimensions: '{}',
      source_url: 'https://example.com',
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
    await storage.addState(state);

    const exportTool = toolMap.get('export_trajectories');
    expect(exportTool).toBeDefined();

    // Default json format
    const resJson = await exportTool!({ format: 'json' });
    expect(resJson.content[0].text).toContain('Trajectory Test State');

    // LLaVA format
    const resLlava = await exportTool!({ format: 'llava' });
    expect(resLlava.content[0].text).toBeDefined();

    // Qwen2-VL format
    const resQwen = await exportTool!({ format: 'qwen2_vl' });
    expect(resQwen.content[0].text).toBeDefined();
  });

  it('should handle export_trajectories with joint format', async () => {
    const exportTool = toolMap.get('export_trajectories');
    expect(exportTool).toBeDefined();

    const res = await exportTool!({ format: 'joint' });
    expect(res.content[0].text).toBeDefined();
  });

  it('should handle manage_snapshot validation failure on invalid payload for restore', async () => {
    const restoreTool = toolMap.get('manage_snapshot');
    expect(restoreTool).toBeDefined();

    const res = await restoreTool!({ action: 'restore', archive_json: 'invalid-json' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Failed to');
  });

  it('should handle get_session_context returning metrics', async () => {
    const contextTool = toolMap.get('get_session_context');
    expect(contextTool).toBeDefined();

    const res = await contextTool!({});
    expect(res.content[0].text).toContain('total_queries');
  });

  it('should handle compare_states tool for non-existent states', async () => {
    const compareTool = toolMap.get('compare_states');
    expect(compareTool).toBeDefined();

    const res = await compareTool!({ state_a_id: 'non-a', state_b_id: 'non-b' });
    expect(res.isError).toBe(true);
  });

  it('should handle record_outcome tool with blocker mode for existing state', async () => {
    const state = {
      id: 'v-state-1',
      dhash: '0000000000000000000000000000000000000000000000000000000000000000',
      ahash: '0000000000000000000000000000000000000000000000000000000000000000',
      vector: new Array(512).fill(0),
      description: 'Blocker Target State',
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
    await storage.addState(state);

    const blockerTool = toolMap.get('record_outcome');
    expect(blockerTool).toBeDefined();

    const res = await blockerTool!({
      from_state_id: 'v-state-1',
      action: 'Modal blocking submit button',
      action_type: 'blocker',
    });
    expect(res.content[0].text).toBeDefined();
  });
});
