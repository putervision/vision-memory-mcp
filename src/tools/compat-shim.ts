/**
 * Backward Compatibility Shim for vision-memory-mcp
 *
 * Maps legacy (v0.9) tool calls to the consolidated 15-tool interface in v1.0.
 */

export interface LegacyVisionToolMapping {
  tool: string;
  defaultArgs?: Record<string, any>;
  transformArgs?: (args: Record<string, any>) => Record<string, any>;
}

export const LEGACY_VISION_TOOL_MAP: Record<string, LegacyVisionToolMapping> = {
  batch_analyze_screenshots: {
    tool: 'analyze_screenshot',
    transformArgs: (args) => ({
      items:
        args.items ||
        (args.screenshot
          ? [
              {
                screenshot: args.screenshot,
                description: args.description,
                source_url: args.source_url,
              },
            ]
          : []),
    }),
  },
  get_visual_diff: {
    tool: 'compare_states',
    transformArgs: (args) => ({
      state_a_id: args.state_a_id,
      state_b_id: args.state_b_id,
      threshold: args.threshold,
    }),
  },
  compare_video_trajectories: {
    tool: 'compare_states',
    transformArgs: (args) => ({
      video_a_id: args.video_a_id,
      video_b_id: args.video_b_id,
    }),
  },
  create_visual_blocker: {
    tool: 'record_outcome',
    defaultArgs: { action_type: 'blocker' },
    transformArgs: (args) => ({
      action_type: 'blocker',
      description: args.description || args.reason || 'Visual Blocker',
      trace_id: args.trace_id,
      error_message: args.error_message || args.reason,
      from_state_id: args.from_state_id || args.state_id,
    }),
  },
  set_visual_spec: {
    tool: 'manage_visual_spec',
    defaultArgs: { action: 'set' },
    transformArgs: (args) => ({
      action: 'set',
      spec_id: args.spec_id,
      name: args.name,
      baseline_screenshot: args.baseline_screenshot,
      baseline_file_path: args.baseline_file_path,
      tolerance: args.tolerance,
      metadata: args.metadata,
      selectors: args.selectors,
    }),
  },
  verify_visual_spec: {
    tool: 'manage_visual_spec',
    defaultArgs: { action: 'verify' },
    transformArgs: (args) => ({
      action: 'verify',
      spec_id: args.spec_id,
      current_screenshot: args.current_screenshot,
      current_file_path: args.current_file_path,
    }),
  },
  list_visual_specs: {
    tool: 'manage_visual_spec',
    defaultArgs: { action: 'list' },
    transformArgs: (args) => ({
      action: 'list',
      limit: args.limit,
    }),
  },
  ingest_video: {
    tool: 'manage_video',
    defaultArgs: { action: 'ingest' },
    transformArgs: (args) => ({
      action: 'ingest',
      video_path: args.video_path,
      task_id: args.task_id,
      trace_id: args.trace_id,
      target_fps: args.target_fps,
      extract_frames: args.extract_frames,
    }),
  },
  search_video_memory: {
    tool: 'manage_video',
    defaultArgs: { action: 'search' },
    transformArgs: (args) => ({
      action: 'search',
      query: args.query,
      video_id: args.video_id,
      limit: args.limit,
    }),
  },
  get_video_timeline: {
    tool: 'manage_video',
    defaultArgs: { action: 'timeline' },
    transformArgs: (args) => ({
      action: 'timeline',
      video_id: args.video_id,
    }),
  },
  get_metrics: {
    tool: 'get_session_context',
    transformArgs: () => ({}),
  },
  get_version: {
    tool: 'get_session_context',
    transformArgs: () => ({}),
  },
  app_version: {
    tool: 'get_session_context',
    transformArgs: () => ({}),
  },
  export_visual_trajectories: {
    tool: 'export_trajectories',
    transformArgs: (args) => ({
      format: args.format || 'json',
      limit: args.limit,
      trace_id: args.trace_id,
    }),
  },
  export_joint_trajectories: {
    tool: 'export_trajectories',
    defaultArgs: { format: 'joint' },
    transformArgs: (args) => ({
      format: 'joint',
      limit: args.limit,
      trace_id: args.trace_id,
      session_id: args.session_id,
    }),
  },
  save_visual_snapshot: {
    tool: 'manage_snapshot',
    defaultArgs: { action: 'save' },
    transformArgs: (args) => ({
      action: 'save',
      snapshot_name: args.snapshot_name || args.name,
      description: args.description,
      metadata: args.metadata,
    }),
  },
  diff_visual_snapshots: {
    tool: 'manage_snapshot',
    defaultArgs: { action: 'diff' },
    transformArgs: (args) => ({
      action: 'diff',
      snapshot_a: args.snapshot_a || args.snapshot_id_a,
      snapshot_b: args.snapshot_b || args.snapshot_id_b,
    }),
  },
  export_snapshot: {
    tool: 'manage_snapshot',
    defaultArgs: { action: 'export' },
    transformArgs: (args) => ({
      action: 'export',
      snapshot_name: args.snapshot_name || args.name,
      output_path: args.output_path || args.file_path,
    }),
  },
  restore_snapshot: {
    tool: 'manage_snapshot',
    defaultArgs: { action: 'restore' },
    transformArgs: (args) => ({
      action: 'restore',
      snapshot_name: args.snapshot_name || args.name,
    }),
  },
  undo_last_visual_mutation: {
    tool: 'undo_visual_mutation',
    transformArgs: (args) => ({
      type: args.type || 'any',
      target_id: args.target_id || args.id,
    }),
  },
};

export function translateLegacyVisionCall(
  toolName: string,
  args: Record<string, any> = {}
): { tool: string; transformedArgs: Record<string, any> } {
  const mapping = LEGACY_VISION_TOOL_MAP[toolName];
  if (!mapping) {
    return { tool: toolName, transformedArgs: args };
  }

  process.stderr.write(
    `[DEPRECATED in vision-memory-mcp v1.0] Tool "${toolName}" is deprecated. Automatically routed to "${mapping.tool}".\n`
  );

  let transformed = { ...(mapping.defaultArgs || {}), ...args };
  if (mapping.transformArgs) {
    transformed = mapping.transformArgs(transformed);
  }

  return { tool: mapping.tool, transformedArgs: transformed };
}
