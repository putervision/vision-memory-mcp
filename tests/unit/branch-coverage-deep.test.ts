import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { categorizeVideoFrames } from '../../src/core/video-categorizer.js';
import { resolveProjectRoot, getWorkspaceMemoryPaths } from '../../src/config.js';
import { registerProject, unregisterProject, getRegistry } from '../../src/core/registry.js';
import { registerAllTools } from '../../src/tools/handlers.js';
import { embeddings } from '../../src/core/embeddings.js';
import { storage } from '../../src/core/storage.js';
import os from 'os';
import fs from 'fs';
import path from 'path';

describe('Vision Memory Deep Branch Coverage Suite', () => {
  let tmpDir: string;
  let origEnvReg: string | undefined;
  const registeredTools: Record<string, Function> = {};

  beforeEach(async () => {
    origEnvReg = process.env.VISION_MEMORY_REGISTRY_PATH;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-branch-'));
    process.env.VISION_MEMORY_REGISTRY_PATH = path.join(tmpDir, 'projects.json');
    await storage.init();

    const mockServer: any = {
      registerTool: (name: string, _opts: any, handler: Function) => {
        registeredTools[name] = handler;
      },
    };
    registerAllTools(mockServer);
  });

  afterEach(() => {
    if (origEnvReg !== undefined) {
      process.env.VISION_MEMORY_REGISTRY_PATH = origEnvReg;
    } else {
      delete process.env.VISION_MEMORY_REGISTRY_PATH;
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('should test categorizeVideoFrames error fallbacks, tags, and transition creation', async () => {
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const validBuf = Buffer.from(pngBase64, 'base64');
    const corruptBuf = Buffer.from('not_a_valid_image');

    // Mock embedding error branch
    vi.spyOn(embeddings, 'generateImageEmbedding').mockRejectedValueOnce(new Error('CLIP offline'));

    const frames = [
      { frame_index: 0, timestamp_ms: 0, buffer: corruptBuf }, // triggers processImage catch
      { frame_index: 1, timestamp_ms: 500, buffer: validBuf }, // triggers CLIP embedding catch fallback
      { frame_index: 2, timestamp_ms: 1000, buffer: validBuf }, // triggers dHash dedup fast-path
    ];

    const res = await categorizeVideoFrames(
      frames,
      {
        category: 'workflow_test',
        source_agent: 'agent-007',
        trace_id: 'trace-1234',
        tags: ['custom_tag_1'],
      },
      'sample_run.mp4'
    );

    expect(res.timeline.length).toBe(2); // 1 corrupt skipped, 2 processed
    expect(res.states.length).toBe(1); // 1 unique state deduplicated
  });

  it('should test resolveProjectRoot and getWorkspaceMemoryPaths', () => {
    const root = resolveProjectRoot(tmpDir);
    expect(root).toBeDefined();

    const paths = getWorkspaceMemoryPaths(tmpDir);
    expect(paths.length).toBeGreaterThan(0);
  });

  it('should test global project registry operations', () => {
    // Rejection on homedir (no-op early return)
    registerProject('home', os.homedir());

    // Valid project registration
    const projDir = path.join(tmpDir, 'test-project');
    fs.mkdirSync(projDir, { recursive: true });
    registerProject('test-proj', projDir);

    const reg = getRegistry();
    expect(reg['test-proj']).toBe(projDir);

    unregisterProject(projDir);
  });

  it('should test handlers validation errors and missing argument branches', async () => {
    // predict_next_action missing state_id
    const resPredict = await registeredTools['predict_next_action']({});
    expect(resPredict.isError).toBe(true);

    // get_navigation_paths missing params
    const resNav = await registeredTools['get_navigation_paths']({});
    expect(resNav.content[0].text).toBeDefined();

    // create_evidence_pack valid creation
    const resEvidence = await registeredTools['create_evidence_pack']({ keyframe_state_ids: [] });
    expect(resEvidence.content[0].text).toBeDefined();

    // compare_states invalid params
    const resCompare = await registeredTools['compare_states']({});
    expect(resCompare.content[0].text).toBeDefined();

    // manage_visual_spec invalid action
    const resSpec = await registeredTools['manage_visual_spec']({ action: 'invalid_action' });
    expect(resSpec.isError).toBe(true);

    // manage_video invalid action
    const resVideo = await registeredTools['manage_video']({ action: 'invalid_action' });
    expect(resVideo.isError).toBe(true);

    // manage_snapshot invalid action
    const resSnap = await registeredTools['manage_snapshot']({ action: 'invalid_action' });
    expect(resSnap.isError).toBe(true);
  });
});
