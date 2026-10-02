process.env.LANCEDB_PATH = './data/test-thick-slice-db';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NativeMcpServer as McpServer } from '../../src/transport/native-mcp.js';
import { storage } from '../../src/core/storage.js';
import { registerAllTools } from '../../src/tools/handlers.js';

const TEST_DB_PATH = path.resolve(process.cwd(), './data/test-thick-slice-db');

function getToolHandler(server: McpServer, name: string) {
  const tool = (server as any)._registeredTools[name];
  if (!tool) throw new Error(`Tool "${name}" is not registered on McpServer.`);
  return tool.handler || tool.cb || tool.execute || tool;
}

describe('Thicker Visual Slice (<2KB Budget)', { timeout: 30000 }, () => {
  let server: McpServer;

  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }

    await storage.init(TEST_DB_PATH);
    server = new McpServer({ name: 'test-server', version: '1.4.0' });
    registerAllTools(server);

    const samplePng1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZSURBVHjP7cEBDQAAAMKg90t52gAAAAAAAAAAAD8D7gAB+e35AAAAAElFTkSuQmCC',
      'base64'
    );
    const samplePng2 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAADUExURQAAAP851ZcAAAAZdEVYdFNvZnR3YXJlAEFkb2JlIEltYWdlUmVhZHlxyWU8AAAAE0lEQVRYR+3BAQ0AAADCoPdPbQ8HFAAAuBsCNAABz4r7qQAAAABJRU5ErkJggg==',
      'base64'
    );

    const ingestHandler = getToolHandler(server, 'analyze_screenshot');

    // Ingest first state
    await ingestHandler({
      screenshot: samplePng1.toString('base64'),
      description: 'Initial login screen with username and password input boxes',
      accessibility_tree: JSON.stringify({
        role: 'dialog',
        children: [
          { role: 'textbox', name: 'Username', id: 'usr_in' },
          { role: 'button', name: 'Submit', id: 'submit_btn' },
        ],
      }),
      git_branch: 'main',
    });

    // Ingest second state with grounded elements
    await ingestHandler({
      screenshot: samplePng2.toString('base64'),
      force_refresh: true,
      description: 'Dashboard screen after successful login with navigation sidebar',
      accessibility_tree: JSON.stringify({
        role: 'main',
        children: [
          { role: 'heading', name: 'Welcome' },
          { role: 'button', name: 'Settings' },
          { role: 'link', name: 'Logout' },
        ],
      }),
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

  it('exports thick visual slice containing layout_changed, screen_centroids, ax_summary, and cache_tier within 2KB', async () => {
    const contextHandler = getToolHandler(server, 'get_session_context');
    const result = await contextHandler({ format: 'compact_slice' });

    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);

    // Verify mandatory thick slice contract fields
    expect(payload.state_id).toBeDefined();
    expect(payload.layout_hash).toBeDefined();
    expect(typeof payload.layout_changed).toBe('boolean');
    expect(payload.layout_changed).toBe(true); // Changed from state 1 to state 2
    expect(payload.description_summary).toBeDefined();
    expect(payload.interactive_element_count).toBeGreaterThanOrEqual(0);
    expect(payload.screen_centroids).toBeDefined();
    expect(Array.isArray(payload.screen_centroids)).toBe(true);
    expect(payload.ax_summary).toBeDefined();
    expect(typeof payload.ax_summary).toBe('string');
    expect(payload.cache_tier).toBeDefined();
    expect(['L1_exact', 'L2_near', 'L3_vector', 'L4_pending']).toContain(payload.cache_tier);

    // Invariant: strict 2KB payload budget (<2048 bytes)
    const jsonBytes = Buffer.byteLength(result.content[0].text, 'utf8');
    expect(jsonBytes).toBeLessThan(2048);
  });
});
