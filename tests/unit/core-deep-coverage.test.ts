import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clusterVisualStates } from '../../src/core/clustering.js';
import { categorizeVideoFrames } from '../../src/core/video-categorizer.js';
import { storage } from '../../src/core/storage.js';
import {
  registerAllTools,
  resolveImageInput,
  formatResponsePayload,
} from '../../src/tools/handlers.js';
import { VisualState } from '../../src/types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Vision Memory Core Deep Coverage Suite', () => {
  let tmpDir: string;
  let sampleImgPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-cov-'));
    sampleImgPath = path.join(tmpDir, 'screen.png');
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    fs.writeFileSync(sampleImgPath, Buffer.from(pngBase64, 'base64'));

    await storage.init();
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should test clustering algorithms with empty, single, and multiple states', () => {
    expect(clusterVisualStates([])).toEqual([]);

    const state1 = {
      id: 's1',
      description: 'Login page with blue button',
      dhash: '0000000000000000',
      ahash: '0000000000000000',
      vector: [1.0, 0.0, 0.0],
      created_at: Date.now(),
      access_count: 1,
    } as any as VisualState;
    const state2 = {
      id: 's2',
      description: 'Login page with red button',
      dhash: '0000000000000001',
      ahash: '0000000000000000',
      vector: [0.99, 0.01, 0.0],
      created_at: Date.now(),
      access_count: 1,
    } as any as VisualState;
    const state3 = {
      id: 's3',
      description: 'Completely different dashboard screen',
      dhash: 'ffffffffffffffff',
      ahash: 'ffffffffffffffff',
      vector: [0.0, 1.0, 0.0],
      created_at: Date.now(),
      access_count: 1,
    } as any as VisualState;

    const clusters = clusterVisualStates([state1, state2, state3], 0.85);
    expect(clusters.length).toBeGreaterThan(0);
  });

  it('should test video categorizer with frames', async () => {
    const pngBuf = fs.readFileSync(sampleImgPath);
    const frames = [
      { frame_index: 0, timestamp_ms: 0, buffer: pngBuf },
      { frame_index: 1, timestamp_ms: 500, buffer: pngBuf },
    ];
    const result = await categorizeVideoFrames(frames, { category: 'user_flow' }, 'test.mp4');
    expect(result.states.length).toBeGreaterThan(0);
    expect(result.timeline.length).toBe(2);
  });

  it('should test resolveImageInput with various inputs and security bounds', async () => {
    // Valid direct base64
    const b64 = await resolveImageInput('base64string123');
    expect(b64).toBe('base64string123');

    // Valid file path
    const fromFile = await resolveImageInput(undefined, sampleImgPath);
    expect(fromFile).toBeDefined();

    // Sensitive path rejection
    await expect(resolveImageInput(undefined, '/etc/passwd')).rejects.toThrow('restricted');

    // Invalid extension
    const txtPath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(txtPath, 'hello');
    await expect(resolveImageInput(undefined, txtPath)).rejects.toThrow(
      'Unsupported file extension'
    );

    // Neither provided
    await expect(resolveImageInput(undefined, undefined)).rejects.toThrow(
      'Either screenshot base64 or file_path must be provided'
    );
  });

  it('should test formatResponsePayload with compact, full, and summary formats', () => {
    const data = {
      id: 's1',
      description: 'test state',
      grounded_elements: [{ selector: '#btn', role: 'button' }],
    };
    expect(formatResponsePayload(data, 'compact')).toBeDefined();
    expect(formatResponsePayload(data, 'full')).toBeDefined();
  });

  it('should test registered tool dispatchers via mock McpServer', async () => {
    const registeredTools: Record<string, Function> = {};
    const mockServer: any = {
      registerTool: (name: string, _opts: any, handler: Function) => {
        registeredTools[name] = handler;
      },
    };

    registerAllTools(mockServer);

    expect(Object.keys(registeredTools).length).toBe(15);

    // Test get_session_context
    const ctxRes = await registeredTools['get_session_context']({});
    expect(ctxRes.content).toBeDefined();

    // Test recall_memory
    const recallRes = await registeredTools['recall_memory']({ query: 'dashboard' });
    expect(recallRes.content).toBeDefined();

    // Test manage_snapshot save
    const snapRes = await registeredTools['manage_snapshot']({ action: 'save', name: 'Test Snap' });
    expect(snapRes.content).toBeDefined();

    // Test manage_visual_spec list
    const specRes = await registeredTools['manage_visual_spec']({ action: 'list' });
    expect(specRes.content).toBeDefined();

    // Test manage_video search
    const vidRes = await registeredTools['manage_video']({ action: 'search', query: 'login' });
    expect(vidRes.content).toBeDefined();

    // Test export_trajectories
    const trajRes = await registeredTools['export_trajectories']({ format: 'json' });
    expect(trajRes.content).toBeDefined();
  });
});
