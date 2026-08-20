import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { registerAllTools } from '../../src/tools/handlers.js';
import { VERSION } from '../../src/utils/version.js';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';
import fs from 'fs';
import path from 'path';

describe('version and system metadata in vision-memory-mcp', () => {
  let toolMap: Map<string, Function>;
  const originalDbPath = config.LANCEDB_PATH;
  const testDbDir = path.resolve(process.cwd(), '.test-app-version-db');

  const mockServer = {
    registerTool: (name: string, config: any, handler: Function) => {
      toolMap.set(name, handler);
    },
  };

  beforeAll(async () => {
    config.LANCEDB_PATH = testDbDir;
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true });
      } catch (_) {}
    }
    await storage.init();
  });

  afterAll(async () => {
    config.LANCEDB_PATH = originalDbPath;
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (_) {}
    }
  });

  beforeEach(() => {
    toolMap = new Map();
    registerAllTools(mockServer as any);
  });

  it('should export correct VERSION constant', () => {
    expect(VERSION).toBe('1.0.0');
  });

  it('should return version and mcp_name in get_session_context tool', async () => {
    const handler = toolMap.get('get_session_context')!;
    expect(handler).toBeDefined();
    const res = await handler({});
    expect(res).toBeDefined();
    expect(res.content).toBeDefined();
    expect(res.content.length).toBe(1);

    const payload = JSON.parse(res.content[0].text);
    expect(payload.version).toBe(VERSION);
    expect(payload.mcp_name).toBe('io.github.putervision/vision-memory-mcp');
    expect(payload.metrics).toBeDefined();
  });
});
