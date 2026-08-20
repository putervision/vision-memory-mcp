import { describe, it, expect } from 'vitest';
import {
  LEGACY_VISION_TOOL_MAP,
  translateLegacyVisionCall,
} from '../src/tools/compat-shim.js';

describe('Vision Memory Legacy Compatibility Shim', () => {
  it('should have all 19 legacy tools mapped in LEGACY_VISION_TOOL_MAP', () => {
    const legacyTools = Object.keys(LEGACY_VISION_TOOL_MAP);
    expect(legacyTools).toHaveLength(20);
    expect(legacyTools).toContain('batch_analyze_screenshots');
    expect(legacyTools).toContain('get_visual_diff');
    expect(legacyTools).toContain('compare_video_trajectories');
    expect(legacyTools).toContain('create_visual_blocker');
    expect(legacyTools).toContain('set_visual_spec');
    expect(legacyTools).toContain('verify_visual_spec');
    expect(legacyTools).toContain('list_visual_specs');
    expect(legacyTools).toContain('ingest_video');
    expect(legacyTools).toContain('search_video_memory');
    expect(legacyTools).toContain('get_video_timeline');
    expect(legacyTools).toContain('get_metrics');
    expect(legacyTools).toContain('get_version');
    expect(legacyTools).toContain('app_version');
    expect(legacyTools).toContain('export_visual_trajectories');
    expect(legacyTools).toContain('export_joint_trajectories');
    expect(legacyTools).toContain('save_visual_snapshot');
    expect(legacyTools).toContain('diff_visual_snapshots');
    expect(legacyTools).toContain('export_snapshot');
    expect(legacyTools).toContain('restore_snapshot');
  });

  it('should correctly translate batch_analyze_screenshots to analyze_screenshot', () => {
    const { tool, transformedArgs } = translateLegacyVisionCall('batch_analyze_screenshots', {
      items: [{ screenshot: 'abc', description: 'Screen A' }],
    });
    expect(tool).toBe('analyze_screenshot');
    expect(transformedArgs.items).toHaveLength(1);
  });

  it('should correctly translate create_visual_blocker to record_outcome', () => {
    const { tool, transformedArgs } = translateLegacyVisionCall('create_visual_blocker', {
      description: 'Button not clickable',
      from_state_id: 'vs_01',
    });
    expect(tool).toBe('record_outcome');
    expect(transformedArgs.action_type).toBe('blocker');
    expect(transformedArgs.description).toBe('Button not clickable');
  });

  it('should correctly translate set_visual_spec to manage_visual_spec', () => {
    const { tool, transformedArgs } = translateLegacyVisionCall('set_visual_spec', {
      spec_id: 'spec_1',
      name: 'Homepage Spec',
    });
    expect(tool).toBe('manage_visual_spec');
    expect(transformedArgs.action).toBe('set');
    expect(transformedArgs.spec_id).toBe('spec_1');
  });

  it('should correctly translate export_joint_trajectories to export_trajectories', () => {
    const { tool, transformedArgs } = translateLegacyVisionCall('export_joint_trajectories', {
      limit: 10,
    });
    expect(tool).toBe('export_trajectories');
    expect(transformedArgs.format).toBe('joint');
    expect(transformedArgs.limit).toBe(10);
  });

  it('should return untouched arguments for unknown tools', () => {
    const { tool, transformedArgs } = translateLegacyVisionCall('unknown_tool', { foo: 'bar' });
    expect(tool).toBe('unknown_tool');
    expect(transformedArgs).toEqual({ foo: 'bar' });
  });
});
