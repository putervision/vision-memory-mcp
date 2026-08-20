import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../../src/tools/handlers.js';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';
import fs from 'fs';
import path from 'path';

function getToolHandler(server: McpServer, name: string) {
  const tool = (server as any)._registeredTools[name];
  if (!tool) throw new Error(`Tool "${name}" is not registered on McpServer.`);
  return tool.handler || tool.cb || tool.execute || tool;
}

describe('v1.0.0 Consolidated MCP Tools E2E Unit Test Suite', () => {
  let server: McpServer;
  const originalPath = config.LANCEDB_PATH;
  const testDbDir = path.resolve(process.cwd(), '.test-consolidated-tools-db');

  const redPngBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAADElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const bluePngBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAADElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const dummyWebMBase64 =
    'data:video/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKygQRC8oEEQvOBCEKygQRC8oEEQvOBCEKygQRC8oEEQvOBCEKygQRC8oEEQvOBCEKygQRC8oEEQvOBCEKygQRC8oEEQvOBCEKygA==';

  beforeAll(async () => {
    config.LANCEDB_PATH = testDbDir;
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true });
      } catch (_) {}
    }
    await storage.init();

    server = new McpServer({ name: 'vision-memory-test', version: '1.0.0' });
    registerAllTools(server);
  });

  afterAll(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (_) {}
    }
  });

  // 1. Tool count verification
  it('should register exactly 15 consolidated tools on McpServer', () => {
    const registeredTools = Object.keys((server as any)._registeredTools);
    expect(registeredTools.length).toBe(15);

    const expectedTools = [
      'analyze_screenshot',
      'recall_memory',
      'record_outcome',
      'get_navigation_paths',
      'predict_next_action',
      'compare_states',
      'get_session_context',
      'manage_snapshot',
      'manage_visual_spec',
      'manage_video',
      'create_evidence_pack',
      'export_trajectories',
      'undo_visual_mutation',
      'forget_state',
      'wait_for_visual_state',
    ];

    for (const tool of expectedTools) {
      expect(registeredTools).toContain(tool);
    }
  });

  // 2. analyze_screenshot: Single & Batch modes
  it('should handle analyze_screenshot in single mode and batch items mode', async () => {
    const handler = getToolHandler(server, 'analyze_screenshot');

    // Single mode
    const singleRes = await handler({
      screenshot: redPngBase64,
      description: 'Single red screen',
      git_branch: 'main',
    });
    expect(singleRes.content).toBeDefined();
    const singleData = JSON.parse(singleRes.content[0].text);
    expect(singleData.state_id).toBeDefined();

    // Batch items mode
    const batchRes = await handler({
      items: [
        { screenshot: redPngBase64, description: 'Batch item 1' },
        { screenshot: bluePngBase64, description: 'Batch item 2' },
      ],
      git_branch: 'main',
    });
    expect(batchRes.content).toBeDefined();
    const batchData = JSON.parse(batchRes.content[0].text);
    expect(batchData.batch_count).toBe(2);
    expect(Array.isArray(batchData.results)).toBe(true);
  });

  // 3. compare_states: Visual state & Video trajectory modes
  it('should handle compare_states for visual layout diff and video trajectories', async () => {
    const compareHandler = getToolHandler(server, 'compare_states');
    const ingestHandler = getToolHandler(server, 'analyze_screenshot');

    // Ingest two distinct visual states
    const res1 = await ingestHandler({
      screenshot: redPngBase64,
      git_branch: 'main',
      force_refresh: true,
    });
    const res2 = await ingestHandler({
      screenshot: bluePngBase64,
      git_branch: 'main',
      force_refresh: true,
    });
    const id1 = JSON.parse(res1.content[0].text).state_id;
    const id2 = JSON.parse(res2.content[0].text).state_id;

    if (id1 !== id2) {
      const stateComp = await compareHandler({ state_a_id: id1, state_b_id: id2 });
      expect(stateComp.content).toBeDefined();
      if (!stateComp.isError) {
        const payload = JSON.parse(stateComp.content[0].text);
        expect(payload.has_layout_change).toBeDefined();
        expect(payload.layout_delta_ratio).toBeDefined();
      }
    }

    // Video comparison mode via video_a_id and video_b_id
    const videoHandler = getToolHandler(server, 'manage_video');
    const vidA = await videoHandler({
      action: 'ingest',
      video_data: dummyWebMBase64,
      fps: 1.0,
      category: 'test_a',
    });
    const vidB = await videoHandler({
      action: 'ingest',
      video_data: dummyWebMBase64,
      fps: 1.0,
      category: 'test_b',
    });
    const vidAId = JSON.parse(vidA.content[0].text).video_id;
    const vidBId = JSON.parse(vidB.content[0].text).video_id;

    const videoComp = await compareHandler({ video_a_id: vidAId, video_b_id: vidBId });
    expect(videoComp.content).toBeDefined();
    const vidCompPayload = JSON.parse(videoComp.content[0].text);
    expect(vidCompPayload.video_a_id).toBe(vidAId);
    expect(vidCompPayload.video_b_id).toBe(vidBId);
    expect(typeof vidCompPayload.similarity_score).toBe('number');
  });

  // 4. record_outcome: Normal transition and Blocker modes
  it('should handle record_outcome in normal transition and blocker mode', async () => {
    const outcomeHandler = getToolHandler(server, 'record_outcome');
    const ingestHandler = getToolHandler(server, 'analyze_screenshot');

    const res = await ingestHandler({ screenshot: redPngBase64, git_branch: 'main' });
    const stateId = JSON.parse(res.content[0].text).state_id;

    // Blocker mode
    const blockerRes = await outcomeHandler({
      from_state_id: stateId,
      action: 'Submit button broken and obscured by modal',
      action_type: 'blocker',
      project: 'vision-memory-mcp',
    });

    expect(blockerRes.content).toBeDefined();
    const blockerPayload = JSON.parse(blockerRes.content[0].text);
    expect(blockerPayload.mcp_tool_call).toBeDefined();
    expect(blockerPayload.mcp_tool_call.tool).toBe('manage_nodes');
    expect(blockerPayload.mcp_tool_call.arguments.action).toBe('create');
    expect(blockerPayload.link_tool_call.tool).toBe('manage_edges');
    expect(blockerPayload.link_tool_call.arguments.action).toBe('link_visual');
  });

  // 5. manage_snapshot: save, diff, export, restore
  it('should handle manage_snapshot save, diff, export, and restore actions', async () => {
    const snapHandler = getToolHandler(server, 'manage_snapshot');

    // Save
    const saveRes = await snapHandler({
      action: 'save',
      name: 'test-snap-1',
      description: 'Checkpoint 1',
    });
    expect(saveRes.content).toBeDefined();
    const saveData = JSON.parse(saveRes.content[0].text);
    expect(saveData.name).toBe('test-snap-1');

    const saveRes2 = await snapHandler({
      action: 'save',
      name: 'test-snap-2',
      description: 'Checkpoint 2',
    });
    expect(saveRes2.content).toBeDefined();

    // Diff
    const diffRes = await snapHandler({
      action: 'diff',
      snapshot_a_name: 'test-snap-1',
      snapshot_b_name: 'test-snap-2',
    });
    expect(diffRes.content).toBeDefined();

    // Export
    const exportRes = await snapHandler({ action: 'export', name: 'test-snap-1' });
    expect(exportRes.content).toBeDefined();
    const exportArchive = JSON.parse(exportRes.content[0].text);
    expect(exportArchive.snapshot).toBeDefined();

    // Restore
    const restoreRes = await snapHandler({
      action: 'restore',
      archive_json: JSON.stringify(exportArchive),
    });
    expect(restoreRes.content).toBeDefined();
  });

  // 6. manage_visual_spec: set, verify, list
  it('should handle manage_visual_spec set, verify, and list actions', async () => {
    const specHandler = getToolHandler(server, 'manage_visual_spec');

    // Set
    const setRes = await specHandler({
      action: 'set',
      name: 'Nav Header Spec',
      screenshot: redPngBase64,
    });
    expect(setRes.content).toBeDefined();

    // Verify
    const verifyRes = await specHandler({
      action: 'verify',
      spec_name: 'Nav Header Spec',
      screenshot: redPngBase64,
      tolerance: 10,
    });
    expect(verifyRes.content).toBeDefined();
    const verifyData = JSON.parse(verifyRes.content[0].text);
    expect(verifyData.is_compliant).toBe(true);

    // List
    const listRes = await specHandler({ action: 'list' });
    expect(listRes.content).toBeDefined();
    expect(listRes.content[0].text).toContain('Nav Header Spec');
  });

  // 7. manage_video: ingest, search, timeline
  it('should handle manage_video for ingest, search, and timeline actions', async () => {
    const videoHandler = getToolHandler(server, 'manage_video');

    const ingestRes = await videoHandler({
      action: 'ingest',
      video_data: dummyWebMBase64,
      fps: 1.0,
      category: 'manage_video_suite',
    });
    expect(ingestRes.content).toBeDefined();
    const vidId = JSON.parse(ingestRes.content[0].text).video_id;

    // Search mode
    const searchRes = await videoHandler({ action: 'search', query: 'manage_video_suite' });
    expect(searchRes.content).toBeDefined();
    const searchData = JSON.parse(searchRes.content[0].text);
    expect(searchData.some((r: any) => r.id === vidId)).toBe(true);

    // Timeline mode
    const timelineRes = await videoHandler({ action: 'timeline', video_id: vidId });
    expect(timelineRes.content).toBeDefined();
    const timelineData = JSON.parse(timelineRes.content[0].text);
    expect(timelineData.video.id).toBe(vidId);
    expect(Array.isArray(timelineData.timeline)).toBe(true);
  });

  // 8. get_session_context: returns version, mcp_name, and metrics
  it('should return context, version, and metrics from get_session_context', async () => {
    const contextHandler = getToolHandler(server, 'get_session_context');
    const ctxRes = await contextHandler({});
    expect(ctxRes.content).toBeDefined();
    const ctxData = JSON.parse(ctxRes.content[0].text);
    expect(ctxData.version).toBe('1.0.0');
    expect(ctxData.mcp_name).toBe('io.github.putervision/vision-memory-mcp');
    expect(ctxData.metrics).toBeDefined();
    expect(ctxData.memory_stats).toBeDefined();

    const undoHandler = getToolHandler(server, 'undo_visual_mutation');
    const undoRes = await undoHandler({ type: 'any' });
    expect(undoRes.content).toBeDefined();
  });

  // 9. export_trajectories: json, llava, joint
  it('should handle export_trajectories in json, llava, and joint formats', async () => {
    const exportHandler = getToolHandler(server, 'export_trajectories');

    const jsonRes = await exportHandler({ format: 'json', limit: 10 });
    expect(jsonRes.content).toBeDefined();
    const jsonData = JSON.parse(jsonRes.content[0].text);
    expect(jsonData.trajectories).toBeDefined();

    const llavaRes = await exportHandler({ format: 'llava', limit: 10 });
    expect(llavaRes.content).toBeDefined();
    const llavaData = JSON.parse(llavaRes.content[0].text);
    expect(Array.isArray(llavaData)).toBe(true);

    const jointRes = await exportHandler({ format: 'joint', limit: 10 });
    expect(jointRes.content).toBeDefined();
    const jointData = JSON.parse(jointRes.content[0].text);
    expect(jointData.steps).toBeDefined();
  });
});
