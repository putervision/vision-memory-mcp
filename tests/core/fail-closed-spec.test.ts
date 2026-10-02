process.env.LANCEDB_PATH = './data/test-fail-closed-db';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NativeMcpServer as McpServer } from '../../src/transport/native-mcp.js';
import { storage } from '../../src/core/storage.js';
import { registerAllTools } from '../../src/tools/handlers.js';
import { setVisualSpec, verifyVisualSpec } from '../../src/core/visual-spec.js';
import { recordTransition } from '../../src/core/graph.js';
import { VisualState } from '../../src/types.js';

const TEST_DB_PATH = path.resolve(process.cwd(), './data/test-fail-closed-db');

function getToolHandler(server: McpServer, name: string) {
  const tool = (server as any)._registeredTools[name];
  if (!tool) throw new Error(`Tool "${name}" is not registered on McpServer.`);
  return tool.handler || tool.cb || tool.execute || tool;
}

describe('Fail-Closed Spec Gates & Modality Guard', { timeout: 30000 }, () => {
  let server: McpServer;

  // Solid white 64x64 PNG
  const whitePng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZSURBVHjP7cEBDQAAAMKg90t52gAAAAAAAAAAAD8D7gAB+e35AAAAAElFTkSuQmCC',
    'base64'
  );
  // Checkerboard / high frequency pattern PNG (guaranteed high hamming distance drift)
  const driftPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAADUExURQAAAP851ZcAAAAZdEVYdFNvZnR3YXJlAEFkb2JlIEltYWdlUmVhZHlxyWU8AAAAE0lEQVRYR+3BAQ0AAADCoPdPbQ8HFAAAuBsCNAABz4r7qQAAAABJRU5ErkJggg==',
    'base64'
  );

  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }

    await storage.init(TEST_DB_PATH);
    server = new McpServer({ name: 'test-server', version: '1.4.0' });
    registerAllTools(server);
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
    try {
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.rmSync(TEST_DB_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    } catch {}
  });

  it('emits fail-closed blocker record when visual spec verification fails', async () => {
    // 1. Register baseline spec
    await setVisualSpec({
      name: 'Primary Button Style',
      screenshot: whitePng.toString('base64'),
    });

    // 2. Verify with drifted screenshot and strict tolerance
    const verifyResult = await verifyVisualSpec({
      specName: 'Primary Button Style',
      screenshot: driftPng.toString('base64'),
      tolerance: 0,
      sddRequirementId: 'req_btn_contrast',
    });

    expect(verifyResult.is_compliant).toBe(false);
    expect(verifyResult.status).toBe('visual_drift_detected');
    expect(verifyResult.blocker).toBeDefined();
    expect(verifyResult.blocker?.severity).toBe('error');
    expect(verifyResult.blocker?.blocker_type).toBe('visual_regression');
    expect(verifyResult.blocker?.code).toBe('VISUAL_SPEC_VIOLATION');
    expect(verifyResult.blocker?.spec_name).toBe('Primary Button Style');
    expect(verifyResult.blocker?.dhash_distance).toBeGreaterThan(0);
  });

  it('throws WRONG_MODALITY error when a non-visual state is checked in recordTransition', async () => {
    const nonVisualState: VisualState = {
      id: 'audio_state_01',
      dhash: '0'.repeat(64),
      ahash: '0'.repeat(64),
      vector: new Array(512).fill(0),
      description: 'Audio spectrogram capture',
      structured_data: JSON.stringify({ modality: 'audio' }),
      accessibility_tree: '{}',
      thumbnail: '',
      original_dimensions: '{}',
      source_url: 'audio://mic',
      source_agent: 'agent',
      trace_id: '',
      git_branch: 'main',
      tags: '["audio"]',
      importance_score: 0.5,
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1,
      ttl: 0,
      modality: 'audio',
    };

    const visualState: VisualState = {
      id: 'vis_state_01',
      dhash: '1'.repeat(64),
      ahash: '1'.repeat(64),
      vector: new Array(512).fill(0.1),
      description: 'Standard visual screen',
      structured_data: '{}',
      accessibility_tree: '{}',
      thumbnail: 'data:image/webp;base64,...',
      original_dimensions: '{"width":1920,"height":1080}',
      source_url: 'https://app.test',
      source_agent: 'agent',
      trace_id: '',
      git_branch: 'main',
      tags: '["ui"]',
      importance_score: 0.5,
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1,
      ttl: 0,
      modality: 'visual',
    };

    await storage.addState(nonVisualState);
    await storage.addState(visualState);

    await expect(
      recordTransition({
        fromStateId: 'vis_state_01',
        toStateId: 'audio_state_01',
        action: 'listen',
        success: true,
      })
    ).rejects.toThrow(/WRONG_MODALITY/);
  });

  it('throws WRONG_MODALITY error in compare_states when comparing non-visual state', async () => {
    const compareHandler = getToolHandler(server, 'compare_states');
    const res = await compareHandler({
      state_a_id: 'vis_state_01',
      state_b_id: 'audio_state_01',
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('WRONG_MODALITY');
  });

  it('emits compliance redaction record on forget_state', async () => {
    const forgetHandler = getToolHandler(server, 'forget_state');
    const res = await forgetHandler({
      state_id: 'vis_state_01',
    });

    expect(res.isError).toBeUndefined();
    expect(res.content).toBeDefined();
    const payload = JSON.parse(res.content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.purged_state_id).toBe('vis_state_01');
    expect(payload.redaction_record).toBeDefined();
    expect(payload.redaction_record.event).toBe('state_purged');
    expect(payload.redaction_record.state_id).toBe('vis_state_01');
    expect(payload.redaction_record.audit_trail_id).toContain('audit_purge_');
    expect(payload.redaction_record.compliance_status).toBe('purged');
  });
});
