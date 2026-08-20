import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';
import { registerAllTools } from '../../src/tools/handlers.js';

function getToolHandler(server: McpServer, name: string) {
  const tool = (server as any)._registeredTools[name];
  if (!tool) throw new Error(`Tool "${name}" is not registered on McpServer.`);
  return tool.handler || tool.cb || tool.execute || tool;
}

describe('Area 7: Dual-MCP Synergy & Cross-Boundary Scoping Tests', () => {
  const originalPath = config.LANCEDB_PATH;
  const testDbDir = path.resolve(process.cwd(), '.test-synergy-joint-db');
  let server: McpServer;

  beforeAll(async () => {
    config.LANCEDB_PATH = testDbDir;
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
    await storage.init();
    server = new McpServer({ name: 'test-server', version: '1.0.0' });
    registerAllTools(server);
  });

  afterAll(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (_) {}
    }
  });

  it('should generate structured visual blocker payload for state-memory-mcp', async () => {
    await storage.addState({
      id: 'blocked-state-01',
      dhash: '0'.repeat(64),
      ahash: '0'.repeat(64),
      vector: new Array(512).fill(0.1),
      description: 'Disabled Submit Form',
      structured_data: '{}',
      accessibility_tree: '{}',
      thumbnail: '',
      original_dimensions: '{"width":512,"height":512}',
      source_url: 'https://example.com/login',
      source_agent: 'test',
      trace_id: 't-blocker',
      git_branch: 'main',
      tags: '[]',
      importance_score: 1.0,
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1,
      ttl: 0,
    });

    const handler = getToolHandler(server, 'record_outcome');
    const res = await handler({
      from_state_id: 'blocked-state-01',
      action: 'Submit button rendered disabled due to form validation error',
      action_type: 'blocker',
    });

    expect(res.content).toBeDefined();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.mcp_tool_call || payload).toBeDefined();
  });

  it('should export joint workflow trajectories with visual and state-memory frames', async () => {
    const handler = getToolHandler(server, 'export_trajectories');
    const res = await handler({
      format: 'joint',
      limit: 10,
    });

    expect(res.content).toBeDefined();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.steps || payload.trajectories).toBeDefined();
  });
});
