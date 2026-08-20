import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerAllTools } from '../../src/tools/handlers.js';
import { storage } from '../../src/core/storage.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Vision Memory Handlers Branch Matrix Suite', () => {
  let tmpDir: string;
  let imgPath: string;
  const registeredTools: Record<string, Function> = {};

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-matrix-'));
    imgPath = path.join(tmpDir, 'test.png');
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    fs.writeFileSync(imgPath, Buffer.from(pngBase64, 'base64'));

    await storage.init();

    const mockServer: any = {
      registerTool: (name: string, _opts: any, handler: Function) => {
        registeredTools[name] = handler;
      },
    };
    registerAllTools(mockServer);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should test manage_video with ingest, search, timeline, and error branches', async () => {
    // 1. Ingest
    const vidPath = path.join(tmpDir, 'test.webm');
    fs.writeFileSync(vidPath, Buffer.from('RIFF....WEBM'));
    const ingestRes = await registeredTools['manage_video']({
      action: 'ingest',
      file_path: vidPath,
      fps: 1,
      category: 'login_flow',
      tags: ['auth', 'ui'],
      source_agent: 'agent-1',
      trace_id: 'tr-1',
    });
    expect(ingestRes.content).toBeDefined();

    // 2. Search
    const searchRes = await registeredTools['manage_video']({
      action: 'search',
      query: 'login',
      category: 'login_flow',
      limit: 10,
    });
    expect(searchRes.content).toBeDefined();

    // 3. Search missing query error branch
    const searchErr = await registeredTools['manage_video']({ action: 'search' });
    expect(searchErr.isError).toBe(true);

    // 4. Timeline missing video_id error branch
    const timeErr = await registeredTools['manage_video']({ action: 'timeline' });
    expect(timeErr.isError).toBe(true);
  });

  it('should test manage_visual_spec capture, set, verify, list, export branches', async () => {
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const specName = `Spec_${Date.now()}`;

    // Set
    const setRes = await registeredTools['manage_visual_spec']({
      action: 'set',
      name: specName,
      screenshot: pngBase64,
      category: 'checkout',
      tags: ['ecommerce'],
    });
    expect(setRes.content).toBeDefined();

    // List
    const listRes = await registeredTools['manage_visual_spec']({ action: 'list' });
    expect(listRes.content).toBeDefined();

    // Verify with tolerance
    const verifyRes = await registeredTools['manage_visual_spec']({
      action: 'verify',
      name: specName,
      screenshot: pngBase64,
      tolerance: 5,
    });
    expect(verifyRes.content).toBeDefined();

    // Export
    const expOut = path.join(tmpDir, 'spec.json');
    const expRes = await registeredTools['manage_visual_spec']({
      action: 'export',
      name: specName,
      file_path: expOut,
    });
    expect(expRes.content).toBeDefined();
  });

  it('should test compare_states with structural and video comparison branches', async () => {
    // 1. Missing states
    const errRes = await registeredTools['compare_states']({});
    expect(errRes.content).toBeDefined();

    // 2. Identical state ID error branch
    const identRes = await registeredTools['compare_states']({
      state_a_id: 'state_1',
      state_b_id: 'state_1',
    });
    expect(identRes.content).toBeDefined();
  });

  it('should test undo_visual_mutation for both state and transition targets', async () => {
    const undoState = await registeredTools['undo_visual_mutation']({ target_type: 'state' });
    expect(undoState.content).toBeDefined();

    const undoTrans = await registeredTools['undo_visual_mutation']({ target_type: 'transition' });
    expect(undoTrans.content).toBeDefined();
  });
});
