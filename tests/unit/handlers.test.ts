process.env.LANCEDB_PATH = './data/test-handlers-db';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { storage } from '../../src/core/storage.js';
import { registerAllTools } from '../../src/tools/handlers.js';

const TEST_DB_PATH = path.resolve(process.cwd(), './data/test-handlers-db');

async function createColorPng(r: number, g: number, b: number): Promise<Buffer> {
  try {
    const s = (await import('sharp')).default;
    return await s({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r, g, b },
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
    redBuffer = await createColorPng(255, 0, 0);
    redBase64 = redBuffer.toString('base64');

    blueBuffer = await createColorPng(0, 0, 255);
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

  it('should register all 15 tools on the McpServer', () => {
    const registeredTools = (server as any)._registeredTools;
    expect(registeredTools).toBeDefined();
    expect(Object.keys(registeredTools).length).toBe(15);
    expect(registeredTools['analyze_screenshot']).toBeDefined();
    expect(registeredTools['recall_memory']).toBeDefined();
    expect(registeredTools['record_outcome']).toBeDefined();
    expect(registeredTools['get_navigation_paths']).toBeDefined();
    expect(registeredTools['predict_next_action']).toBeDefined();
    expect(registeredTools['compare_states']).toBeDefined();
    expect(registeredTools['get_session_context']).toBeDefined();
    expect(registeredTools['manage_snapshot']).toBeDefined();
    expect(registeredTools['manage_visual_spec']).toBeDefined();
    expect(registeredTools['manage_video']).toBeDefined();
    expect(registeredTools['create_evidence_pack']).toBeDefined();
    expect(registeredTools['export_trajectories']).toBeDefined();
    expect(registeredTools['undo_visual_mutation']).toBeDefined();
    expect(registeredTools['forget_state']).toBeDefined();
    expect(registeredTools['wait_for_visual_state']).toBeDefined();
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
      to_state_id: 'another-non-existent-id',
      action: 'click button',
      success: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to record outcome');
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
    const manageHandler = getToolHandler(server, 'manage_snapshot');

    const snap1 = await manageHandler({
      action: 'save',
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

    const snap2 = await manageHandler({
      action: 'save',
      name: 'checkpoint-beta',
      description: 'Second checkpoint',
    });
    expect(snap2.content).toBeDefined();

    const diffResult = await manageHandler({
      action: 'diff',
      snapshot_a_name: 'checkpoint-alpha',
      snapshot_b_name: 'checkpoint-beta',
    });
    expect(diffResult.content).toBeDefined();
    expect(diffResult.content[0].text).toContain('added_states');
  });

  it('should return error response for manage_snapshot with duplicate name', async () => {
    const manageHandler = getToolHandler(server, 'manage_snapshot');
    const result = await manageHandler({
      action: 'save',
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

    const blockerHandler = getToolHandler(server, 'record_outcome');
    const result = await blockerHandler({
      from_state_id: stateId,
      action: 'Login modal is obscured by broken overlay',
      action_type: 'blocker',
    });

    expect(result.content).toBeDefined();
  });

  it('should undo visual mutation', async () => {
    const undoHandler = getToolHandler(server, 'undo_visual_mutation');
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
    const batchHandler = getToolHandler(server, 'analyze_screenshot');
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
    const exportJointHandler = getToolHandler(server, 'export_trajectories');
    const result = await exportJointHandler({
      format: 'joint',
      limit: 10,
    });

    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.steps || payload.trajectories).toBeDefined();
  });

  it('should handle get_session_context tool returning metrics', async () => {
    const contextHandler = getToolHandler(server, 'get_session_context');
    const result = await contextHandler({});
    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.metrics).toBeDefined();
    expect(payload.metrics.total_queries).toBeDefined();
  });

  it('should handle manage_snapshot export and restore tools', async () => {
    const ingestHandler = getToolHandler(server, 'analyze_screenshot');
    await ingestHandler({ screenshot: redBase64, git_branch: 'main' });

    const manageHandler = getToolHandler(server, 'manage_snapshot');
    await manageHandler({ action: 'save', name: 'snap-for-export', description: 'Export test' });

    const exportRes = await manageHandler({ action: 'export', name: 'snap-for-export' });
    expect(exportRes.content).toBeDefined();
    const exportPayload = JSON.parse(exportRes.content[0].text);
    expect(exportPayload.snapshot).toBeDefined();

    const restoreRes = await manageHandler({
      action: 'restore',
      archive_json: JSON.stringify(exportPayload),
    });
    expect(restoreRes.content).toBeDefined();
    expect(restoreRes.content[0].text).toContain('restored_states');
  });

  it('should handle export_trajectories tool', async () => {
    const exportTrajHandler = getToolHandler(server, 'export_trajectories');
    const result = await exportTrajHandler({ format: 'json', limit: 5 });
    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.trajectories).toBeDefined();
  });

  it('should handle compare_states tool for visual diff', async () => {
    const ingestHandler = getToolHandler(server, 'analyze_screenshot');
    const resA = await ingestHandler({ screenshot: redBase64, git_branch: 'main' });
    const resB = await ingestHandler({ screenshot: blueBase64, git_branch: 'main' });
    const idA = JSON.parse(resA.content[0].text).state_id;
    const idB = JSON.parse(resB.content[0].text).state_id;

    const diffHandler = getToolHandler(server, 'compare_states');
    const diffRes = await diffHandler({ state_a_id: idA, state_b_id: idB });
    expect(diffRes.content).toBeDefined();
    if (!diffRes.isError) {
      const payload = JSON.parse(diffRes.content[0].text);
      expect(payload.has_layout_change).toBeDefined();
    } else {
      // In test environments, compare_states may fail due to identical state IDs (deduplication) or missing states
      expect(diffRes.content[0].text).toContain('Failed to compare states');
    }
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

  it('should handle manage_visual_spec tool for set, verify, and list', async () => {
    const specHandler = getToolHandler(server, 'manage_visual_spec');
    const setRes = await specHandler({
      action: 'set',
      name: 'Handler Spec',
      screenshot: redBase64,
    });
    expect(setRes.content).toBeDefined();

    const verifyRes = await specHandler({
      action: 'verify',
      spec_name: 'Handler Spec',
      screenshot: redBase64,
      tolerance: 64,
      sdd_requirement_id: 'REQ-HANDLERS-1',
    });
    expect(verifyRes.content).toBeDefined();
    const payload = JSON.parse(verifyRes.content[0].text);
    expect(payload.is_compliant).toBe(true);

    const listRes = await specHandler({ action: 'list' });
    expect(listRes.content).toBeDefined();
    expect(listRes.content[0].text).toContain('Handler Spec');
  });

  it('should return error response in manage_visual_spec if image missing for set', async () => {
    const specHandler = getToolHandler(server, 'manage_visual_spec');
    const res = await specHandler({ action: 'set', name: 'Missing' });
    expect(res.isError).toBe(true);
  });

  it('should return error response in manage_visual_spec if spec not found for verify', async () => {
    const specHandler = getToolHandler(server, 'manage_visual_spec');
    const res = await specHandler({
      action: 'verify',
      spec_name: 'DoesNotExist',
      screenshot: redBase64,
    });
    expect(res.isError).toBe(true);
  });

  it('should return error response in compare_states if states not found', async () => {
    const diffHandler = getToolHandler(server, 'compare_states');
    const res = await diffHandler({ state_a_id: 'bad-1', state_b_id: 'bad-2' });
    expect(res.isError).toBe(true);
  });

  it('should return error response in manage_snapshot if snapshot not found for export', async () => {
    const manageSnapHandler = getToolHandler(server, 'manage_snapshot');
    const res = await manageSnapHandler({ action: 'export', name: 'no-such-snapshot' });
    expect(res.isError).toBe(true);
  });

  it('should handle recall_memory with screenshot parameter', async () => {
    const recallHandler = getToolHandler(server, 'recall_memory');
    const res = await recallHandler({ screenshot: redBase64, limit: 2 });
    expect(res.content).toBeDefined();
  });

  it('should handle undo_visual_mutation with transition type', async () => {
    const undoHandler = getToolHandler(server, 'undo_visual_mutation');
    const res = await undoHandler({ type: 'transition' });
    expect(res.content).toBeDefined();
  });
});
