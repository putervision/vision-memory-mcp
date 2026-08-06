import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';
import { registerAllTools } from '../../src/tools/handlers.js';

async function createTestPngBuffer(): Promise<Buffer> {
  try {
    const s = (await import('sharp')).default;
    return await s({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 },
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

describe('Handlers Edge Cases Suite', () => {
  const testDbDir = path.join(process.cwd(), '.test-handlers-edge-db');
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

  afterEach(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  it('should test analyze_screenshot error response when storage throws', async () => {
    const tool = toolMap.get('analyze_screenshot');
    expect(tool).toBeDefined();

    vi.spyOn(storage, 'addState').mockRejectedValueOnce(new Error('Mock storage failure'));

    const res = await tool!({ screenshot: dummyBase64 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Failed to analyze screenshot');
  });

  it('should test recall_memory error response when search query fails', async () => {
    const tool = toolMap.get('recall_memory');
    expect(tool).toBeDefined();

    vi.spyOn(storage, 'listStatesAll').mockRejectedValueOnce(new Error('Mock recall failure'));

    const res = await tool!({ query: 'search text' });
    expect(res.content[0].text).toBeDefined();
  });

  it('should test record_outcome error response when storage throws', async () => {
    const tool = toolMap.get('record_outcome');
    expect(tool).toBeDefined();

    vi.spyOn(storage, 'getStateAll').mockRejectedValueOnce(new Error('Mock state lookup error'));

    const res = await tool!({
      from_state_id: 's1',
      to_state_id: 's2',
      action: 'click',
      success: true,
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Failed to record outcome');
  });

  it('should test get_navigation_paths error response when search fails', async () => {
    const tool = toolMap.get('get_navigation_paths');
    expect(tool).toBeDefined();

    vi.spyOn(storage, 'listTransitionsAll').mockRejectedValueOnce(new Error('Nav error'));

    const res = await tool!({ from_state_id: 's1', to_state_id: 's2' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Failed to get navigation paths');
  });

  it('should test compare_states error response when state non-existent', async () => {
    const tool = toolMap.get('compare_states');
    expect(tool).toBeDefined();

    const res = await tool!({ state_a_id: 'non-a', state_b_id: 'non-b' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('not found');
  });

  it('should test save_visual_snapshot error path when storage throws', async () => {
    const tool = toolMap.get('save_visual_snapshot');
    expect(tool).toBeDefined();

    vi.spyOn(storage, 'addSnapshot').mockRejectedValueOnce(new Error('Snapshot write error'));

    const res = await tool!({ name: 'fail-snap' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Failed to save visual snapshot');
  });

  it('should test predict_next_action error response when listTransitions fails', async () => {
    const tool = toolMap.get('predict_next_action');
    expect(tool).toBeDefined();

    vi.spyOn(storage, 'listTransitionsAll').mockRejectedValueOnce(new Error('Prediction failure'));

    const res = await tool!({ current_state_id: 's1', target_goal: 'click button' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Failed to predict next action');
  });
});
