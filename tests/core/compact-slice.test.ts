process.env.LANCEDB_PATH = './data/test-compact-slice-db';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NativeMcpServer as McpServer } from '../../src/transport/native-mcp.js';
import { storage } from '../../src/core/storage.js';
import { registerAllTools } from '../../src/tools/handlers.js';

const TEST_DB_PATH = path.resolve(process.cwd(), './data/test-compact-slice-db');

function getToolHandler(server: McpServer, name: string) {
  const tool = (server as any)._registeredTools[name];
  if (!tool) throw new Error(`Tool "${name}" is not registered on McpServer.`);
  return tool.handler || tool.cb || tool.execute || tool;
}

describe('Vision-Memory Compact Slice Export Contract', { timeout: 30000 }, () => {
  let server: McpServer;

  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }

    await storage.init(TEST_DB_PATH);
    server = new McpServer({ name: 'test-server', version: '1.2.1' });
    registerAllTools(server);

    // Seed a visual state via analyze_screenshot
    const samplePng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZSURBVHjP7cEBDQAAAMKg90t52gAAAAAAAAAAAD8D7gAB+e35AAAAAElFTkSuQmCC',
      'base64'
    );
    const ingestHandler = getToolHandler(server, 'analyze_screenshot');
    await ingestHandler({
      screenshot: samplePng.toString('base64'),
      description:
        'HUD overview with target reticle and navigational waypoints active in primary viewport',
      grounded_elements: [
        { id: 'hud_btn_1', role: 'button', label: 'Engage' },
        { id: 'hud_btn_2', role: 'button', label: 'Retreat' },
      ],
      git_branch: 'main',
    });
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
    try {
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    } catch {}
  });

  it('exports compact_slice conforming to VisualSlice contract (<1KB)', async () => {
    const contextHandler = getToolHandler(server, 'get_session_context');
    const result = await contextHandler({ format: 'compact_slice' });

    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);

    // Verify VisualSlice schema fields
    expect(payload.state_id).toBeDefined();
    expect(payload.layout_hash).toBeDefined();
    expect(payload.description_summary).toBeDefined();
    expect(payload.interactive_element_count).toBeGreaterThanOrEqual(0);
    expect(typeof payload.interactive_element_count).toBe('number');
    expect(payload.embedding_ref_ids).toBeDefined();
    expect(Array.isArray(payload.embedding_ref_ids)).toBe(true);

    // Invariant: no raw base64 image strings in compact slice
    expect(payload.screenshot).toBeUndefined();
    expect(payload.base64).toBeUndefined();

    // Payload size budget: must be under 1KB
    const jsonBytes = Buffer.byteLength(result.content[0].text, 'utf8');
    expect(jsonBytes).toBeLessThan(1024);
  });

  it('exports embedding centroids when include_centroids is requested', async () => {
    const contextHandler = getToolHandler(server, 'get_session_context');
    const result = await contextHandler({ format: 'compact_slice', include_centroids: true });

    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.embedding_centroids).toBeDefined();
    expect(Array.isArray(payload.embedding_centroids)).toBe(true);
    expect(payload.embedding_centroids.length).toBeGreaterThan(0);
  });
});
