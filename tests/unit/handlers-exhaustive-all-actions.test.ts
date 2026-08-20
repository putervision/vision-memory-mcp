import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerAllTools,
  resolveImageInput,
  formatResponsePayload,
} from '../../src/tools/handlers.js';
import { storage } from '../../src/core/storage.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Vision Memory All 15 Handlers Exhaustive Actions Suite', () => {
  let tmpDir: string;
  let sampleImgPath: string;
  const registeredTools: Record<string, Function> = {};
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-handlers-'));
    sampleImgPath = path.join(tmpDir, 'screen.png');
    fs.writeFileSync(sampleImgPath, Buffer.from(pngBase64, 'base64'));

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
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('should test resolveImageInput and formatResponsePayload branches', async () => {
    // Valid base64
    const b64 = await resolveImageInput(pngBase64);
    expect(b64).toBe(pngBase64);

    // Valid file path
    const fromFile = await resolveImageInput(undefined, sampleImgPath);
    expect(fromFile).toBe(pngBase64);

    // Missing both
    await expect(resolveImageInput()).rejects.toThrow(
      'Either screenshot base64 or file_path must be provided'
    );

    // Forbidden path
    await expect(resolveImageInput(undefined, '/etc/passwd.png')).rejects.toThrow('restricted');

    // Invalid extension
    await expect(resolveImageInput(undefined, path.join(tmpDir, 'test.txt'))).rejects.toThrow(
      'Unsupported file extension'
    );

    // Non-existent file
    await expect(resolveImageInput(undefined, path.join(tmpDir, 'missing.png'))).rejects.toThrow(
      'does not exist'
    );

    // formatResponsePayload
    expect(formatResponsePayload({ a: 1 }, 'full')).toEqual({ a: 1 });
    expect(formatResponsePayload([{ a: 1 }], 'compact')).toBeDefined();
    expect(formatResponsePayload(null)).toBeNull();
  });

  it('should test analyze_screenshot single, batch, and grounding options', async () => {
    const res1 = await registeredTools['analyze_screenshot']({
      screenshot: pngBase64,
      description: 'Single Screenshot Test',
      accessibility_tree: JSON.stringify({
        role: 'WebArea',
        children: [{ role: 'button', name: 'Submit' }],
      }),
      grounding: true,
      format: 'full',
    });
    expect(res1.content).toBeDefined();

    const resBatch = await registeredTools['analyze_screenshot']({
      items: [
        {
          screenshot: pngBase64,
          description: 'Batch Screenshot Item 1',
        },
      ],
    });
    expect(resBatch.content).toBeDefined();
  });

  it('should test recall_memory with text query and image query', async () => {
    const textRecall = await registeredTools['recall_memory']({
      query: 'Login Page',
      limit: 5,
    });
    expect(textRecall.content).toBeDefined();

    const imgRecall = await registeredTools['recall_memory']({
      screenshot: pngBase64,
      limit: 3,
    });
    expect(imgRecall.content).toBeDefined();
  });

  it('should test record_outcome for actions and blockers', async () => {
    const resClick = await registeredTools['record_outcome']({
      action_type: 'click',
      action_description: 'Clicked sidebar navigation item',
      success: true,
    });
    expect(resClick.content).toBeDefined();

    const resBlocker = await registeredTools['record_outcome']({
      action_type: 'blocker',
      action_description: 'UI modal obstructed primary button',
      success: false,
    });
    expect(resBlocker.content).toBeDefined();
  });

  it('should test get_navigation_paths and predict_next_action', async () => {
    const navRes = await registeredTools['get_navigation_paths']({
      source_state_id: 'state-1',
      target_state_id: 'state-2',
    });
    expect(navRes.content).toBeDefined();

    const predRes = await registeredTools['predict_next_action']({
      current_state_id: 'state-1',
      goal: 'Click login button',
    });
    expect(predRes.content).toBeDefined();
  });

  it('should test compare_states and get_session_context', async () => {
    const compRes = await registeredTools['compare_states']({
      state_a_id: 'state-1',
      state_b_id: 'state-2',
    });
    expect(compRes.content).toBeDefined();

    const sessRes = await registeredTools['get_session_context']({});
    expect(sessRes.content).toBeDefined();
  });

  it('should test manage_snapshot all actions: save, diff, export, restore', async () => {
    const snapName1 = `SnapA_${Date.now()}`;
    const snapName2 = `SnapB_${Date.now()}`;

    await registeredTools['manage_snapshot']({ action: 'save', name: snapName1 });
    await registeredTools['manage_snapshot']({ action: 'save', name: snapName2 });

    const diffRes = await registeredTools['manage_snapshot']({
      action: 'diff',
      snapshot_a_name: snapName1,
      snapshot_b_name: snapName2,
    });
    expect(diffRes.content).toBeDefined();

    const expRes = await registeredTools['manage_snapshot']({
      action: 'export',
      name: snapName1,
    });
    expect(expRes.content).toBeDefined();

    const archiveJson = expRes.content[0].text;
    const resRestore = await registeredTools['manage_snapshot']({
      action: 'restore',
      archive_json: archiveJson,
    });
    expect(resRestore.content).toBeDefined();
  });

  it('should test manage_visual_spec set, verify, and list actions', async () => {
    const specName = `SpecTest_${Date.now()}`;

    await registeredTools['manage_visual_spec']({
      action: 'set',
      name: specName,
      screenshot: pngBase64,
    });

    const verifyRes = await registeredTools['manage_visual_spec']({
      action: 'verify',
      name: specName,
      screenshot: pngBase64,
    });
    expect(verifyRes.content).toBeDefined();

    const listRes = await registeredTools['manage_visual_spec']({
      action: 'list',
    });
    expect(listRes.content).toBeDefined();
  });

  it('should test manage_video search and timeline actions', async () => {
    const searchRes = await registeredTools['manage_video']({
      action: 'search',
      query: 'auth login',
    });
    expect(searchRes.content).toBeDefined();

    const timeRes = await registeredTools['manage_video']({
      action: 'timeline',
      video_id: 'vid-mock-1',
    });
    expect(timeRes.content).toBeDefined();
  });

  it('should test create_evidence_pack and export_trajectories', async () => {
    const packRes = await registeredTools['create_evidence_pack']({
      name: 'Release 1.0 Proof Pack',
      task_ids: ['task-100'],
      state_ids: ['state-1'],
    });
    expect(packRes.content).toBeDefined();

    const jsonRes = await registeredTools['export_trajectories']({ format: 'json' });
    expect(jsonRes.content).toBeDefined();

    const llavaRes = await registeredTools['export_trajectories']({ format: 'llava' });
    expect(llavaRes.content).toBeDefined();

    const qwenRes = await registeredTools['export_trajectories']({ format: 'qwen2_vl' });
    expect(qwenRes.content).toBeDefined();

    const jointRes = await registeredTools['export_trajectories']({ format: 'joint' });
    expect(jointRes.content).toBeDefined();
  });

  it('should test undo_visual_mutation, forget_state, and wait_for_visual_state', async () => {
    const undoRes = await registeredTools['undo_visual_mutation']({ target_type: 'state' });
    expect(undoRes.content).toBeDefined();

    const forgetRes = await registeredTools['forget_state']({
      state_id: 'non_existent_state_id',
      purge_transitions: true,
    });
    expect(forgetRes.content).toBeDefined();

    const waitRes = await registeredTools['wait_for_visual_state']({
      expected_description: 'dashboard',
      timeout_ms: 100,
      poll_interval_ms: 50,
    });
    expect(waitRes.content).toBeDefined();
  });
});
