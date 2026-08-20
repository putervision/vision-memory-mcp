/**
 * Dynamic Self-Healing & API Schema Advisor for vision-memory-mcp
 *
 * Provides runtime auto-correction, smart action inference, alias resolution,
 * and structured schema guidance when an AI agent makes an invalid or ambiguous call.
 */

export interface ActionMetadata {
  description: string;
  required?: string[];
  optional?: string[];
  example: Record<string, any>;
  aliases?: string[];
}

export interface ToolActionMetadata {
  tool: string;
  description: string;
  actions: Record<string, ActionMetadata>;
  inferAction?: (args: Record<string, any>) => string | null;
}

export const VISION_TOOL_ACTION_REGISTRY: Record<string, ToolActionMetadata> = {
  manage_snapshot: {
    tool: 'manage_snapshot',
    description: 'Visual state snapshots, perceptual regression diffs, and restore',
    actions: {
      save: {
        description: 'Save named visual snapshot checkpoint',
        optional: ['snapshot_name', 'description', 'metadata'],
        example: { action: 'save', snapshot_name: 'homepage_v1' },
        aliases: ['create', 'checkpoint', 'save_snapshot'],
      },
      diff: {
        description: 'Perceptually diff two snapshots and detect layout shifts',
        required: ['snapshot_a', 'snapshot_b'],
        optional: ['threshold', 'diff_mode'],
        example: { action: 'diff', snapshot_a: 'homepage_v1', snapshot_b: 'homepage_v2' },
        aliases: ['compare', 'diff_snapshots'],
      },
      export: {
        description: 'Export snapshot bundle to disk as tar.gz / json',
        optional: ['snapshot_name', 'output_path'],
        example: { action: 'export', snapshot_name: 'homepage_v1' },
        aliases: ['dump', 'export_snapshot'],
      },
      restore: {
        description: 'Restore visual state cache from a saved snapshot',
        required: ['snapshot_name'],
        example: { action: 'restore', snapshot_name: 'homepage_v1' },
        aliases: ['load', 'restore_snapshot'],
      },
    },
    inferAction: (args) => {
      if (args.snapshot_a && args.snapshot_b) return 'diff';
      if (args.snapshot_a_name && args.snapshot_b_name) return 'diff';
      if (args.output_path) return 'export';
      if (args.archive_json || args.restore) return 'restore';
      if (args.snapshot_name || args.name) return 'save';
      return null;
    },
  },

  manage_visual_spec: {
    tool: 'manage_visual_spec',
    description: 'Visual Spec-Driven Development (SDD) design contracts and verification',
    actions: {
      set: {
        description: 'Register or update a baseline visual design spec contract',
        required: ['spec_id', 'name'],
        optional: [
          'baseline_screenshot',
          'baseline_file_path',
          'tolerance',
          'selectors',
          'metadata',
        ],
        example: { action: 'set', spec_id: 'spec_nav', name: 'Navigation Bar Baseline' },
        aliases: ['create', 'register', 'set_spec'],
      },
      verify: {
        description: 'Verify live UI screenshot against registered visual spec contract',
        required: ['spec_id'],
        optional: ['current_screenshot', 'current_file_path', 'strict_bounding_box'],
        example: { action: 'verify', spec_id: 'spec_nav' },
        aliases: ['check', 'assert', 'verify_spec'],
      },
      list: {
        description: 'List all registered visual design spec baselines',
        optional: ['limit'],
        example: { action: 'list', limit: 20 },
        aliases: ['all', 'list_specs'],
      },
    },
    inferAction: (args) => {
      if (args.current_screenshot || args.current_file_path) return 'verify';
      if (args.spec_id && args.name) return 'set';
      if (args.spec_id) return 'verify';
      return 'list';
    },
  },

  manage_video: {
    tool: 'manage_video',
    description: 'Video recording ingestion, CLIP semantic search, and timeline keyframes',
    actions: {
      ingest: {
        description: 'Ingest WebM/MP4/GIF video recording and extract keyframes',
        required: ['video_path'],
        optional: ['task_id', 'trace_id', 'target_fps', 'extract_frames'],
        example: { action: 'ingest', video_path: './recording.webm' },
        aliases: ['import', 'process', 'ingest_video'],
      },
      search: {
        description: 'Semantic text search across ingested video keyframes',
        required: ['query'],
        optional: ['video_id', 'limit'],
        example: { action: 'search', query: 'login button click' },
        aliases: ['find', 'lookup', 'search_video'],
      },
      timeline: {
        description: 'Retrieve chronological keyframe timeline for a video recording',
        required: ['video_id'],
        example: { action: 'timeline', video_id: 'vid_01...' },
        aliases: ['keyframes', 'frames', 'get_timeline'],
      },
    },
    inferAction: (args) => {
      if (args.video_path) return 'ingest';
      if (args.query) return 'search';
      if (args.video_id) return 'timeline';
      return null;
    },
  },
};

export function resolveVisionAction(
  toolName: string,
  rawAction: any,
  args: Record<string, any> = {}
): { action: string | null; inferred: boolean; errorGuidance?: Record<string, any> } {
  const toolMeta = VISION_TOOL_ACTION_REGISTRY[toolName];
  if (!toolMeta) {
    return { action: typeof rawAction === 'string' ? rawAction : null, inferred: false };
  }

  // 1. If an explicit action string is passed, validate directly or via alias
  if (typeof rawAction === 'string' && rawAction.trim() !== '') {
    const normalized = rawAction.toLowerCase().trim();
    if (toolMeta.actions[normalized]) {
      return { action: normalized, inferred: false };
    }
    for (const [actionKey, actionDoc] of Object.entries(toolMeta.actions)) {
      if (actionDoc.aliases && actionDoc.aliases.includes(normalized)) {
        return { action: actionKey, inferred: true };
      }
    }
    // Explicit action was invalid
    const guidance = generateVisionToolGuidance(toolName, rawAction);
    return { action: null, inferred: false, errorGuidance: guidance };
  }

  // 2. Action omitted/null -> try smart inference from payload
  if (toolMeta.inferAction) {
    const inferred = toolMeta.inferAction(args);
    if (inferred && toolMeta.actions[inferred]) {
      return { action: inferred, inferred: true };
    }
  }

  const guidance = generateVisionToolGuidance(toolName, rawAction);
  return { action: null, inferred: false, errorGuidance: guidance };
}

export function generateVisionToolGuidance(
  toolName: string,
  attemptedAction?: any
): Record<string, any> {
  const toolMeta = VISION_TOOL_ACTION_REGISTRY[toolName];
  if (!toolMeta) {
    return {
      error: `Unknown tool: ${toolName}`,
      supported_tools: Object.keys(VISION_TOOL_ACTION_REGISTRY),
      hint: 'Please choose one of the supported vision-memory-mcp tools.',
    };
  }

  const supportedActionsSummary: Record<string, any> = {};
  for (const [actionName, actionDoc] of Object.entries(toolMeta.actions)) {
    supportedActionsSummary[actionName] = {
      description: actionDoc.description,
      required: actionDoc.required || [],
      optional: actionDoc.optional || [],
      example: actionDoc.example,
    };
  }

  return {
    isError: true,
    error: attemptedAction
      ? `Invalid action "${attemptedAction}" for tool "${toolName}".`
      : `Missing required parameter "action" for tool "${toolName}".`,
    tool: toolName,
    tool_description: toolMeta.description,
    supported_actions: supportedActionsSummary,
    self_healing_hint: `Call "${toolName}" with one of the supported actions. Example: ${JSON.stringify(
      Object.values(toolMeta.actions)[0]?.example || {}
    )}`,
  };
}
