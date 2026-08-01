process.env.LANCEDB_PATH = './data/test-handlers-db';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { storage } from '../../src/core/storage.js';
import { registerAllTools } from '../../src/tools/handlers.js';

const TEST_DB_PATH = path.resolve(process.cwd(), './data/test-handlers-db');

function getToolHandler(server: McpServer, name: string) {
  const tool = (server as any)._registeredTools[name];
  if (!tool) throw new Error(`Tool "${name}" is not registered on McpServer.`);
  return tool.handler || tool.cb || tool.execute || tool;
}

describe('MCP Tool Handlers', { timeout: 30000 }, () => {
  let server: McpServer;
  let redBuffer: Buffer;
  let redBase64: string;
  let blueBuffer: Buffer;
  let blueBase64: string;

  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }

    await storage.init(TEST_DB_PATH);
    server = new McpServer({ name: 'test-server', version: '0.3.0' });
    registerAllTools(server);

    // Create test image buffers
    redBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    redBase64 = redBuffer.toString('base64');

    blueBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .png()
      .toBuffer();
    blueBase64 = blueBuffer.toString('base64');
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
    try {
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    } catch {}
  });

  it('should register all tools on the McpServer', () => {
    const registeredTools = (server as any)._registeredTools;
    expect(registeredTools).toBeDefined();
    expect(Object.keys(registeredTools).length).toBeGreaterThanOrEqual(20);
    expect(registeredTools['analyze_screenshot']).toBeDefined();
    expect(registeredTools['recall_memory']).toBeDefined();
    expect(registeredTools['record_outcome']).toBeDefined();
    expect(registeredTools['get_navigation_paths']).toBeDefined();
    expect(registeredTools['compare_states']).toBeDefined();
    expect(registeredTools['get_session_context']).toBeDefined();
    expect(registeredTools['save_visual_snapshot']).toBeDefined();
    expect(registeredTools['diff_visual_snapshots']).toBeDefined();
    expect(registeredTools['undo_last_visual_mutation']).toBeDefined();
    expect(registeredTools['create_visual_blocker']).toBeDefined();
    expect(registeredTools['predict_next_action']).toBeDefined();
    expect(registeredTools['batch_analyze_screenshots']).toBeDefined();
    expect(registeredTools['set_visual_spec']).toBeDefined();
    expect(registeredTools['verify_visual_spec']).toBeDefined();
    expect(registeredTools['get_visual_diff']).toBeDefined();
    expect(registeredTools['export_visual_trajectories']).toBeDefined();
    expect(registeredTools['get_metrics']).toBeDefined();
    expect(registeredTools['export_snapshot']).toBeDefined();
    expect(registeredTools['restore_snapshot']).toBeDefined();
  });

  it('should ingest a screenshot and return a visual state', async () => {
    const handler = getToolHandler(server, 'analyze_screenshot');
    const result = await handler({
      screenshot: redBase64,
      description: 'Solid Red Screen',
      git_branch: 'main',
    });

    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.state_id).toBeDefined();
    expect(payload.description).toBe('Solid Red Screen');
  });

  it('should return error response when analyze_screenshot receives invalid base64', async () => {
    const handler = getToolHandler(server, 'analyze_screenshot');
    const result = await handler({
      screenshot: '!!!invalid-base64-content!!!',
      git_branch: 'main',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/invalid image/i);
  });

  it('should recall visual states by text query', async () => {
    const handler = getToolHandler(server, 'recall_memory');
    const result = await handler({
      query: 'Solid Red',
      git_branch: 'main',
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].text).toBeDefined();
  });

  it('should return error response when record_outcome starting from_state_id is invalid', async () => {
    const handler = getToolHandler(server, 'record_outcome');
    const result = await handler({
      from_state_id: 'non-existent-state-id',
      action: 'click button',
      success: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('does not exist in storage');
  });

  it('should return error response when compare_states state_a_id equals state_b_id', async () => {
    const handler = getToolHandler(server, 'compare_states');
    const result = await handler({
      state_a_id: 'same-id',
      state_b_id: 'same-id',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('must be different visual states');
  });

  it('should retrieve session context statistics', async () => {
    const handler = getToolHandler(server, 'get_session_context');
    const result = await handler({
      include_recent: true,
      include_frequent: true,
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain('memory_stats');
  });

  it('should save and diff visual snapshots', async () => {
    const saveHandler = getToolHandler(server, 'save_visual_snapshot');
    const diffHandler = getToolHandler(server, 'diff_visual_snapshots');

    const snap1 = await saveHandler({
      name: 'checkpoint-alpha',
      description: 'First checkpoint',
    });
    expect(snap1.content).toBeDefined();

    // Re-ingest blue screen to change state list
    const ingestHandler = getToolHandler(server, 'analyze_screenshot');
    await ingestHandler({
      screenshot: blueBase64,
      description: 'Solid Blue Screen',
      git_branch: 'main',
    });

    const snap2 = await saveHandler({
      name: 'checkpoint-beta',
      description: 'Second checkpoint',
    });
    expect(snap2.content).toBeDefined();

    const diffResult = await diffHandler({
      snapshot_a_name: 'checkpoint-alpha',
      snapshot_b_name: 'checkpoint-beta',
    });
    expect(diffResult.content).toBeDefined();
    expect(diffResult.content[0].text).toContain('added_states');
  });

  it('should return error response for save_visual_snapshot with duplicate name', async () => {
    const saveHandler = getToolHandler(server, 'save_visual_snapshot');
    const result = await saveHandler({
      name: 'checkpoint-alpha',
      description: 'Duplicate checkpoint',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already exists');
  });

  it('should create visual blocker observations', async () => {
    const ingestHandler = getToolHandler(server, 'analyze_screenshot');
    const ingestRes = await ingestHandler({
      screenshot: redBase64,
      git_branch: 'main',
    });
    const stateId = JSON.parse(ingestRes.content[0].text).state_id;

    const blockerHandler = getToolHandler(server, 'create_visual_blocker');
    const result = await blockerHandler({
      visual_state_id: stateId,
      description: 'Login modal is obscured by broken overlay',
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain('add_node');
  });

  it('should undo last visual mutation', async () => {
    const undoHandler = getToolHandler(server, 'undo_last_visual_mutation');
    const result = await undoHandler({
      type: 'state',
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].text).toBeDefined();
  });

  it('should analyze screenshot from local file_path', async () => {
    const tmpFilePath = path.join(TEST_DB_PATH, 'temp_test_image.png');
    const imgBuf = Buffer.from(redBase64, 'base64');
    fs.writeFileSync(tmpFilePath, imgBuf);

    const ingestHandler = getToolHandler(server, 'analyze_screenshot');
    const result = await ingestHandler({
      file_path: tmpFilePath,
      description: 'Image from disk file',
      git_branch: 'main',
      response_format: 'compact',
    });

    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.state_id).toBeDefined();
    expect(payload.vector).toBeUndefined(); // compact format strips vector
  });

  it('should predict next action from transition history', async () => {
    const ingestHandler = getToolHandler(server, 'analyze_screenshot');
    const resA = await ingestHandler({ screenshot: redBase64, git_branch: 'main' });
    const resB = await ingestHandler({ screenshot: blueBase64, git_branch: 'main' });
    const idA = JSON.parse(resA.content[0].text).state_id;
    const idB = JSON.parse(resB.content[0].text).state_id;

    const recordHandler = getToolHandler(server, 'record_outcome');
    await recordHandler({
      from_state_id: idA,
      to_state_id: idB,
      action: "click 'submit'",
      success: true,
    });

    const predictHandler = getToolHandler(server, 'predict_next_action');
    const predResult = await predictHandler({
      current_state_id: idA,
      goal_description: 'submit form',
    });

    expect(predResult.content).toBeDefined();
    const payload = JSON.parse(predResult.content[0].text);
    expect(payload.predicted_action).toBe("click 'submit'");
  });

  it('should batch analyze screenshots', async () => {
    const batchHandler = getToolHandler(server, 'batch_analyze_screenshots');
    const batchRes = await batchHandler({
      items: [
        { screenshot: redBase64, description: 'Batch Red Screen' },
        { screenshot: blueBase64, description: 'Batch Blue Screen' },
      ],
      git_branch: 'main',
      response_format: 'compact',
    });

    expect(batchRes.content).toBeDefined();
    const payload = JSON.parse(batchRes.content[0].text);
    expect(payload.batch_count).toBe(2);
    expect(payload.results.length).toBe(2);
  });

  it('should wait for visual state and return matched state', async () => {
    const ingestHandler = getToolHandler(server, 'analyze_screenshot');
    const ingestRes = await ingestHandler({ screenshot: redBase64, git_branch: 'main' });
    const stateId = JSON.parse(ingestRes.content[0].text).state_id;

    const waitHandler = getToolHandler(server, 'wait_for_visual_state');
    const result = await waitHandler({
      target_state_id: stateId,
      timeout_ms: 1000,
      poll_interval_ms: 100,
    });

    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe('matched');
    expect(payload.state.id).toBe(stateId);
  });

  it('should timeout when waiting for non-existent visual state', async () => {
    const waitHandler = getToolHandler(server, 'wait_for_visual_state');
    const result = await waitHandler({
      target_state_id: 'non-existent-state-12345',
      timeout_ms: 200,
      poll_interval_ms: 50,
    });

    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe('timeout');
    expect(payload.state).toBeNull();
  });

  it('should export joint trajectories payload', async () => {
    const exportJointHandler = getToolHandler(server, 'export_joint_trajectories');
    const result = await exportJointHandler({
      limit: 10,
    });

    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.steps).toBeDefined();
  });

  it('should handle get_metrics tool', async () => {
    const metricsHandler = getToolHandler(server, 'get_metrics');
    const result = await metricsHandler({});
    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.total_queries).toBeDefined();
  });

  it('should handle export_snapshot and restore_snapshot tools', async () => {
    const ingestHandler = getToolHandler(server, 'analyze_screenshot');
    await ingestHandler({ screenshot: redBase64, git_branch: 'main' });

    const saveSnapHandler = getToolHandler(server, 'save_visual_snapshot');
    await saveSnapHandler({ name: 'snap-for-export', description: 'Export test' });

    const exportSnapHandler = getToolHandler(server, 'export_snapshot');
    const exportRes = await exportSnapHandler({ name: 'snap-for-export' });
    expect(exportRes.content).toBeDefined();
    const exportPayload = JSON.parse(exportRes.content[0].text);
    expect(exportPayload.snapshot).toBeDefined();

    const restoreSnapHandler = getToolHandler(server, 'restore_snapshot');
    const restoreRes = await restoreSnapHandler({ archive_json: JSON.stringify(exportPayload) });
    expect(restoreRes.content).toBeDefined();
    expect(restoreRes.content[0].text).toContain('restored_states');
  });

  it('should handle export_visual_trajectories tool', async () => {
    const exportTrajHandler = getToolHandler(server, 'export_visual_trajectories');
    const result = await exportTrajHandler({ format: 'json', limit: 5 });
    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.trajectories).toBeDefined();
  });

  it('should handle get_visual_diff tool', async () => {
    const ingestHandler = getToolHandler(server, 'analyze_screenshot');
    const resA = await ingestHandler({ screenshot: redBase64, git_branch: 'main' });
    const resB = await ingestHandler({ screenshot: blueBase64, git_branch: 'main' });
    const idA = JSON.parse(resA.content[0].text).state_id;
    const idB = JSON.parse(resB.content[0].text).state_id;

    const diffHandler = getToolHandler(server, 'get_visual_diff');
    const diffRes = await diffHandler({ state_id_a: idA, state_id_b: idB });
    expect(diffRes.content).toBeDefined();
    const payload = JSON.parse(diffRes.content[0].text);
    expect(payload.dhash_distance).toBeDefined();
  });

  it('should handle forget_state tool', async () => {
    const ingestHandler = getToolHandler(server, 'analyze_screenshot');
    const ingestRes = await ingestHandler({ screenshot: redBase64, git_branch: 'main' });
    const stateId = JSON.parse(ingestRes.content[0].text).state_id;

    const forgetHandler = getToolHandler(server, 'forget_state');
    const forgetRes = await forgetHandler({ state_id: stateId });
    expect(forgetRes.content).toBeDefined();
    expect(forgetRes.content[0].text).toContain('purged_state_id');
  });

  it('should handle set_visual_spec and verify_visual_spec tools', async () => {
    const setSpecHandler = getToolHandler(server, 'set_visual_spec');
    const setRes = await setSpecHandler({
      name: 'Handler Spec',
      screenshot: redBase64,
    });
    expect(setRes.content).toBeDefined();

    const verifySpecHandler = getToolHandler(server, 'verify_visual_spec');
    const verifyRes = await verifySpecHandler({
      spec_name: 'Handler Spec',
      screenshot: redBase64,
      tolerance: 64,
      sdd_requirement_id: 'REQ-HANDLERS-1',
    });
    expect(verifyRes.content).toBeDefined();
    const payload = JSON.parse(verifyRes.content[0].text);
    expect(payload.is_compliant).toBe(true);
  });

  it('should return error response in set_visual_spec if image missing', async () => {
    const setSpecHandler = getToolHandler(server, 'set_visual_spec');
    const res = await setSpecHandler({ name: 'Missing' });
    expect(res.isError).toBe(true);
  });

  it('should return error response in verify_visual_spec if spec not found', async () => {
    const verifySpecHandler = getToolHandler(server, 'verify_visual_spec');
    const res = await verifySpecHandler({ spec_name: 'DoesNotExist', screenshot: redBase64 });
    expect(res.isError).toBe(true);
  });

  it('should return error response in get_visual_diff if states not found', async () => {
    const diffHandler = getToolHandler(server, 'get_visual_diff');
    const res = await diffHandler({ state_id_a: 'bad-1', state_id_b: 'bad-2' });
    expect(res.isError).toBe(true);
  });

  it('should return error response in export_snapshot if snapshot not found', async () => {
    const exportSnapHandler = getToolHandler(server, 'export_snapshot');
    const res = await exportSnapHandler({ name: 'no-such-snapshot' });
    expect(res.isError).toBe(true);
  });

  it('should handle recall_memory with screenshot parameter', async () => {
    const recallHandler = getToolHandler(server, 'recall_memory');
    const res = await recallHandler({ screenshot: redBase64, limit: 2 });
    expect(res.content).toBeDefined();
  });

  it('should handle undo_last_visual_mutation with transition type', async () => {
    const undoHandler = getToolHandler(server, 'undo_last_visual_mutation');
    const res = await undoHandler({ type: 'transition' });
    expect(res.content).toBeDefined();
  });
});
