import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { LEGACY_VISION_TOOL_MAP } from '../src/tools/compat-shim.js';

describe('Vision Memory Prompt & Instruction Linter Suite', () => {
  const registeredVisionTools = new Set([
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
  ]);
  const legacyVisionTools = new Set(Object.keys(LEGACY_VISION_TOOL_MAP));

  const instructionFiles = [
    path.resolve(process.cwd(), '.agents/AGENTS.md'),
    path.resolve(process.cwd(), '.agents/skills/vision-memory-mcp/SKILL.md'),
    path.resolve(process.cwd(), '.agents/skills/video-ingest/SKILL.md'),
    path.resolve(process.cwd(), 'CLAUDE.md'),
    path.resolve(process.cwd(), '.windsurfrules'),
    path.resolve(process.cwd(), 'docs/api-reference.md'),
    path.resolve(process.cwd(), '../spc/.github/copilot-instructions.md'),
    path.resolve(process.cwd(), '../spc/.vscode/instructions.md'),
    path.resolve(process.cwd(), '../spc/CLAUDE.md'),
  ];

  const knownDualMemoryTypes = new Set([
    'visual_state',
    'visual_states',
    'renders_state',
    'blocked_by_visual_state',
    'verifies_visual_state',
    'save',
    'diff',
    'export',
    'restore',
    'set',
    'verify',
    'list',
    'ingest',
    'search',
    'timeline',
  ]);

  const dualMemoryStateTools = new Set([
    'manage_nodes',
    'manage_edges',
    'manage_sessions',
    'manage_tasks',
    'manage_snapshots',
    'manage_specs',
    'manage_database',
    'manage_data',
    'query_graph',
    'get_analytics',
    'get_events',
    'run_diagnostics',
    'use_blackboard',
  ]);

  it('should ensure all referenced vision tools in prompt files exist in tool registry or compat map', () => {
    for (const filePath of instructionFiles) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf-8');

      const matches = content.match(/`([a-z][a-z0-9_]{3,30})`/g) || [];
      for (const raw of matches) {
        const name = raw.replace(/`/g, '');
        const isToolPattern =
          name.startsWith('manage_') ||
          name.startsWith('get_') ||
          name.startsWith('compare_') ||
          name.startsWith('predict_') ||
          name.startsWith('record_') ||
          name.startsWith('analyze_') ||
          name.startsWith('recall_') ||
          name.startsWith('undo_') ||
          name.startsWith('forget_') ||
          name.startsWith('wait_') ||
          name.startsWith('create_') ||
          name.startsWith('export_') ||
          name.startsWith('batch_') ||
          name.startsWith('save_') ||
          name.startsWith('diff_') ||
          name.startsWith('set_') ||
          name.startsWith('verify_') ||
          name.startsWith('ingest_') ||
          name.startsWith('search_') ||
          name.startsWith('restore_');

        if (isToolPattern) {
          const isValid =
            registeredVisionTools.has(name) ||
            legacyVisionTools.has(name) ||
            knownDualMemoryTypes.has(name) ||
            dualMemoryStateTools.has(name);
          expect(
            isValid,
            `File ${filePath} references unknown vision tool or action "${name}". Must be in registered tools or legacy map.`
          ).toBe(true);
        }
      }
    }
  });
});
