import { describe, it, expect } from 'vitest';
import {
  resolveVisionAction,
  generateVisionToolGuidance,
  VISION_TOOL_ACTION_REGISTRY,
} from '../src/core/advisor.js';

describe('Vision Memory Self-Healing & API Schema Advisor', () => {
  it('should have documented actions for multi-action tools', () => {
    expect(VISION_TOOL_ACTION_REGISTRY.manage_snapshot).toBeDefined();
    expect(VISION_TOOL_ACTION_REGISTRY.manage_visual_spec).toBeDefined();
    expect(VISION_TOOL_ACTION_REGISTRY.manage_video).toBeDefined();
  });

  it('should resolve standard valid actions directly', () => {
    expect(resolveVisionAction('manage_snapshot', 'save', {}).action).toBe('save');
    expect(resolveVisionAction('manage_visual_spec', 'verify', {}).action).toBe('verify');
    expect(resolveVisionAction('manage_video', 'ingest', {}).action).toBe('ingest');
  });

  it('should resolve action aliases correctly (create -> save, register -> set, import -> ingest)', () => {
    expect(resolveVisionAction('manage_snapshot', 'create', {}).action).toBe('save');
    expect(resolveVisionAction('manage_snapshot', 'compare', {}).action).toBe('diff');
    expect(resolveVisionAction('manage_visual_spec', 'register', {}).action).toBe('set');
    expect(resolveVisionAction('manage_visual_spec', 'check', {}).action).toBe('verify');
    expect(resolveVisionAction('manage_video', 'import', {}).action).toBe('ingest');
    expect(resolveVisionAction('manage_video', 'find', {}).action).toBe('search');
  });

  it('should intelligently infer action when action parameter is omitted', () => {
    // manage_snapshot: snapshot_a & snapshot_b -> diff
    expect(resolveVisionAction('manage_snapshot', undefined, { snapshot_a: 'a', snapshot_b: 'b' }).action).toBe('diff');

    // manage_visual_spec: current_screenshot -> verify
    expect(resolveVisionAction('manage_visual_spec', undefined, { current_screenshot: 'base64...' }).action).toBe('verify');

    // manage_video: video_path -> ingest
    expect(resolveVisionAction('manage_video', undefined, { video_path: './test.webm' }).action).toBe('ingest');

    // manage_video: query -> search
    expect(resolveVisionAction('manage_video', undefined, { query: 'button' }).action).toBe('search');
  });

  it('should return rich structured self-healing guidance on invalid actions', () => {
    const res = resolveVisionAction('manage_snapshot', 'invalid_action_xyz', {});
    expect(res.action).toBeNull();
    expect(res.errorGuidance).toBeDefined();
    expect(res.errorGuidance?.isError).toBe(true);
    expect(res.errorGuidance?.supported_actions.save).toBeDefined();
    expect(res.errorGuidance?.self_healing_hint).toContain('Call "manage_snapshot" with one of the supported actions');
  });
});
