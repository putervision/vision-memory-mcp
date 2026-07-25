import fs from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import crypto from 'crypto';
import { config } from '../config.js';
import { storage, escapeSql } from '../core/storage.js';
import { getCurrentBranch, memoryCache } from '../core/cache.js';
import { processImage } from '../core/image-pipeline.js';
import { calculateDHash, calculateAHash, hammingDistance } from '../core/hash.js';
import { embeddings, cosineSimilarity } from '../core/embeddings.js';
import { retrieveState, compressAccessibilityTree } from '../core/retrieval.js';
import { recordTransition, findNavigationPaths } from '../core/graph.js';
import { saveSnapshot, diffSnapshots } from '../core/snapshots.js';
import { setVisualSpec, verifyVisualSpec } from '../core/visual-spec.js';
import { analyzeScreenshotWithLLM } from '../vision/analyzer.js';
import { logger } from '../logger.js';
import { VisualState, ResponseFormat } from '../types.js';

function getDirSize(dirPath: string): number {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getDirSize(filePath);
      } else {
        size += stats.size;
      }
    } catch {
      // Ignore unreadable files
    }
  }
  return size;
}

export async function resolveImageInput(screenshot?: string, filePath?: string): Promise<string> {
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Specified image file does not exist: ${filePath}`);
    }
    const buf = fs.readFileSync(filePath);
    return buf.toString('base64');
  }
  if (screenshot && screenshot.trim().length > 0) {
    return screenshot;
  }
  throw new Error('Either screenshot base64 or file_path must be provided.');
}

export function formatResponsePayload(payload: any, format: ResponseFormat = 'compact'): any {
  if (format === 'full') return payload;

  if (Array.isArray(payload)) {
    return payload.map((item) => formatResponsePayload(item, format));
  }

  if (payload && typeof payload === 'object') {
    const compactObj: any = {};
    const strippedFields = new Set([
      'accessibility_tree',
      'structured_data',
      'vector',
      'dhash',
      'ahash',
      'thumbnail',
      'original_dimensions',
    ]);

    for (const [key, value] of Object.entries(payload)) {
      if (!strippedFields.has(key)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          compactObj[key] = formatResponsePayload(value, format);
        } else {
          compactObj[key] = value;
        }
      }
    }
    return compactObj;
  }

  return payload;
}

function computeStructuredDiff(
  rawA?: string,
  rawB?: string
): { added: Record<string, any>; removed: Record<string, any>; modified: Record<string, any> } {
  let objA: any = {};
  let objB: any = {};
  try {
    objA = rawA ? JSON.parse(rawA) : {};
  } catch {}
  try {
    objB = rawB ? JSON.parse(rawB) : {};
  } catch {}

  const keysA = new Set(Object.keys(objA));
  const keysB = new Set(Object.keys(objB));

  const added: Record<string, any> = {};
  const removed: Record<string, any> = {};
  const modified: Record<string, any> = {};

  for (const k of keysB) {
    if (!keysA.has(k)) {
      added[k] = objB[k];
    }
  }

  for (const k of keysA) {
    if (!keysB.has(k)) {
      removed[k] = objA[k];
    } else if (JSON.stringify(objA[k]) !== JSON.stringify(objB[k])) {
      modified[k] = { from: objA[k], to: objB[k] };
    }
  }

  return { added, removed, modified };
}

export function registerAllTools(server: McpServer): void {
  // 1. Tool: analyze_screenshot
  server.registerTool(
    'analyze_screenshot',
    {
      title: 'Analyze & Cache Screenshot',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      description:
        'Ingest a screenshot or file path, check visual state cache, and return details of the state (generating a new memory entry if not matched).',
      inputSchema: z.object({
        screenshot: z.string().optional().describe('Base64-encoded image string'),
        file_path: z
          .string()
          .optional()
          .describe(
            'Absolute path to a local image file. Use instead of screenshot to avoid base64 overhead'
          ),
        description: z
          .string()
          .optional()
          .describe('Optional human/agent-provided description of the screen'),
        accessibility_tree: z
          .string()
          .optional()
          .describe('Optional JSON string representing the simplified AX tree'),
        source_url: z.string().optional().describe('Optional app/page path or URL where captured'),
        tags: z.array(z.string()).optional().describe('Optional classification tags'),
        force_refresh: z
          .boolean()
          .optional()
          .describe('Bypass L1/L2 cache and force new ingestion'),
        git_branch: z.string().optional().describe('Override the active git branch'),
        trace_id: z
          .string()
          .optional()
          .describe('Optional session_id or trace_id for correlation with state-memory-mcp'),
        response_format: z
          .enum(['compact', 'full'])
          .optional()
          .describe(
            'Response verbosity. compact omits internal fields like hashes, vectors, AX trees. Default: compact'
          ),
      }),
    },
    async (params) => {
      try {
        const imageB64 = await resolveImageInput(params.screenshot, params.file_path);
        const format = params.response_format ?? 'compact';
        const branch = params.git_branch ?? getCurrentBranch();

        const axTree = params.accessibility_tree
          ? compressAccessibilityTree(params.accessibility_tree)
          : undefined;

        // 1. Run tiered retrieval
        const retrieval = await retrieveState({
          screenshot: imageB64,
          strategy: 'thorough',
          forceRefresh: params.force_refresh,
          gitBranch: branch,
          accessibilityTree: axTree,
        });

        // 2. If it's a cache hit, return results
        if (retrieval.is_known && retrieval.state_id) {
          if (params.description && params.description !== retrieval.description) {
            await storage.updateState(retrieval.state_id, {
              description: params.description,
            });
            retrieval.description = params.description;
          }
          const formatted = formatResponsePayload(retrieval, format);
          return {
            content: [{ type: 'text', text: JSON.stringify(formatted) }],
          };
        }

        // 3. Cache miss: Ingest new state
        logger.info('Cache miss: generating new state entry...');
        const processed = await processImage(imageB64);
        const dhash = await calculateDHash(processed.normalizedBuffer);
        const ahash = await calculateAHash(processed.normalizedBuffer);

        let finalDesc = params.description ?? '';
        if (!finalDesc) {
          try {
            finalDesc = await analyzeScreenshotWithLLM(imageB64);
          } catch (err) {
            logger.warn('L4 Vision fallback failed or was disabled:', err);
            finalDesc = 'New visual state (pending analysis).';
          }
        }

        const vector = await embeddings.generateImageEmbedding(processed.normalizedBuffer);
        const newId = crypto.randomUUID();
        const newState: VisualState = {
          id: newId,
          dhash,
          ahash,
          vector,
          description: finalDesc,
          structured_data: '{}',
          accessibility_tree: axTree ?? '{}',
          thumbnail: processed.thumbnail,
          original_dimensions: JSON.stringify({
            width: processed.originalWidth,
            height: processed.originalHeight,
          }),
          source_url: params.source_url ?? '',
          source_agent: 'agent',
          trace_id: params.trace_id ?? '',
          git_branch: branch,
          tags: JSON.stringify(params.tags ?? []),
          importance_score: 0.5,
          created_at: Date.now(),
          last_accessed: Date.now(),
          access_count: 1,
          ttl: 0,
        };

        await storage.addState(newState);
        memoryCache.set(newState);

        const resultObj = {
          state_id: newId,
          is_known: false,
          match_type: 'new',
          similarity_score: 0.0,
          description: finalDesc,
          thumbnail: processed.thumbnail,
          dimensions: {
            width: processed.originalWidth,
            height: processed.originalHeight,
          },
        };

        const formatted = formatResponsePayload(resultObj, format);
        return {
          content: [{ type: 'text', text: JSON.stringify(formatted) }],
        };
      } catch (error: any) {
        logger.error('Error in analyze_screenshot tool:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to analyze screenshot: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // 2. Tool: recall_memory
  server.registerTool(
    'recall_memory',
    {
      title: 'Search Visual Memory',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Search visual state memory using screenshot image, text query, or accessibility tree.',
      inputSchema: z.object({
        screenshot: z
          .string()
          .optional()
          .describe('Base64 image payload to search by visual appearance'),
        file_path: z.string().optional().describe('Absolute file path to search by local image'),
        query: z.string().optional().describe('Text query string for semantic vector search'),
        strategy: z
          .enum(['fast', 'semantic', 'thorough'])
          .optional()
          .describe('Retrieval strategy'),
        limit: z.number().int().min(1).max(20).optional().describe('Result count limit'),
        accessibility_tree: z.string().optional().describe('AX tree JSON for filtering'),
        git_branch: z.string().optional().describe('Branch scope filter'),
        response_format: z
          .enum(['compact', 'full'])
          .optional()
          .describe('Response format verbosity'),
      }),
    },
    async (params) => {
      try {
        const format = params.response_format ?? 'compact';
        let imageB64: string | undefined;
        if (params.screenshot || params.file_path) {
          imageB64 = await resolveImageInput(params.screenshot, params.file_path);
        }

        const axTree = params.accessibility_tree
          ? compressAccessibilityTree(params.accessibility_tree)
          : undefined;

        if (imageB64) {
          const result = await retrieveState({
            screenshot: imageB64,
            strategy: params.strategy ?? 'thorough',
            limit: params.limit,
            gitBranch: params.git_branch,
            accessibilityTree: axTree,
          });

          const formatted = formatResponsePayload(result, format);
          return {
            content: [{ type: 'text', text: JSON.stringify(formatted) }],
          };
        }

        if (params.query) {
          const result = await retrieveState({
            query: params.query,
            strategy: 'semantic',
            limit: params.limit,
            gitBranch: params.git_branch,
          });

          const formatted = formatResponsePayload(result, format);
          return {
            content: [{ type: 'text', text: JSON.stringify(formatted) }],
          };
        }

        throw new Error('At least one of screenshot, file_path, or query must be provided.');
      } catch (error: any) {
        logger.error('Error in recall_memory tool:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to recall memory: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // 3. Tool: record_outcome
  server.registerTool(
    'record_outcome',
    {
      title: 'Record Action Outcome',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      description:
        'Log an action transition between two visual states and update transition statistics.',
      inputSchema: z.object({
        from_state_id: z.string().describe('Source state ID'),
        to_state_id: z.string().describe('Destination state ID'),
        action: z.string().describe('Action description'),
        action_type: z
          .enum(['click', 'type', 'navigate', 'scroll', 'custom'])
          .optional()
          .describe('Category of UI action'),
        success: z.boolean().describe('Whether action succeeded'),
        duration_ms: z.number().optional().describe('Action duration in ms'),
        git_branch: z.string().optional().describe('Active git branch'),
        response_format: z.enum(['compact', 'full']).optional(),
      }),
    },
    async (params) => {
      try {
        const format = params.response_format ?? 'compact';
        const transition = await recordTransition({
          fromStateId: params.from_state_id,
          toStateId: params.to_state_id,
          action: params.action,
          actionType: params.action_type ?? 'custom',
          success: params.success,
          durationMs: params.duration_ms,
        });

        const formatted = formatResponsePayload(transition, format);
        return {
          content: [{ type: 'text', text: JSON.stringify(formatted) }],
        };
      } catch (error: any) {
        logger.error('Error in record_outcome tool:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to record outcome: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // 4. Tool: get_navigation_paths
  server.registerTool(
    'get_navigation_paths',
    {
      title: 'Find UI Navigation Path',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Trace historical pathways from current state to a target state or state matching description.',
      inputSchema: z.object({
        from_state_id: z
          .string()
          .optional()
          .describe('ID of starting state (defaults to most recently accessed state)'),
        to_state_id: z.string().optional().describe('ID of target state'),
        to_description: z.string().optional().describe('Description match of target state'),
        max_hops: z.number().int().min(1).max(10).optional().describe('BFS search limit'),
        response_format: z.enum(['compact', 'full']).optional(),
      }),
    },
    async (params) => {
      try {
        const format = params.response_format ?? 'compact';
        let fromId = params.from_state_id;
        if (!fromId) {
          const branch = getCurrentBranch();
          const states = await storage.listStates(`git_branch = '${escapeSql(branch)}'`, 1);
          if (states.length > 0) {
            fromId = states[0].id;
          }
        }

        if (!fromId) {
          throw new Error('Starting state could not be resolved.');
        }

        const result = await findNavigationPaths({
          fromStateId: fromId,
          toStateId: params.to_state_id,
          toDescription: params.to_description,
          maxHops: params.max_hops,
        });

        const formatted = formatResponsePayload(result, format);
        return {
          content: [{ type: 'text', text: JSON.stringify(formatted) }],
        };
      } catch (error: any) {
        logger.error('Error in get_navigation_paths tool:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to get navigation paths: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // 5. Tool: compare_states
  server.registerTool(
    'compare_states',
    {
      title: 'Compare Visual States',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description: 'Compare two states visually and structurally with key-level JSON diffs.',
      inputSchema: z.object({
        state_a_id: z.string().describe('ID of state A'),
        state_b_id: z.string().describe('ID of state B'),
        response_format: z.enum(['compact', 'full']).optional(),
      }),
    },
    async (params) => {
      try {
        const format = params.response_format ?? 'compact';
        if (params.state_a_id === params.state_b_id) {
          throw new Error('state_a_id and state_b_id must be different visual states.');
        }

        const stateA = await storage.getStateAll(params.state_a_id);
        const stateB = await storage.getStateAll(params.state_b_id);

        if (!stateA) throw new Error(`State A (${params.state_a_id}) not found.`);
        if (!stateB) throw new Error(`State B (${params.state_b_id}) not found.`);

        const dist = hammingDistance(stateA.dhash, stateB.dhash);
        const similarity = cosineSimilarity(stateA.vector, stateB.vector);

        const structuredDiff = computeStructuredDiff(
          stateA.structured_data,
          stateB.structured_data
        );

        const result = {
          state_a_id: params.state_a_id,
          state_b_id: params.state_b_id,
          hash_distance: dist,
          vector_similarity: similarity,
          structured_diff: structuredDiff,
          description_a: stateA.description,
          description_b: stateB.description,
          is_identical: dist === 0 && similarity > 0.99,
        };

        const formatted = formatResponsePayload(result, format);
        return {
          content: [{ type: 'text', text: JSON.stringify(formatted) }],
        };
      } catch (error: any) {
        logger.error('Error in compare_states tool:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to compare states: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // 6. Tool: get_session_context
  server.registerTool(
    'get_session_context',
    {
      title: 'Get Session Context',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Fetch aggregated visual context, listing recent/frequent states and active transitions.',
      inputSchema: z.object({
        include_recent: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('Count of recent states'),
        include_frequent: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('Count of frequent states'),
        response_format: z.enum(['compact', 'full']).optional(),
      }),
    },
    async (params) => {
      try {
        const format = params.response_format ?? 'compact';
        const recentCount = params.include_recent ?? 5;
        const frequentCount = params.include_frequent ?? 3;
        const branch = getCurrentBranch();

        const recentList = await storage.listStatesAll(`git_branch = '${escapeSql(branch)}'`, 100);
        recentList.sort((a, b) => b.created_at - a.created_at);
        const recent = recentList.slice(0, recentCount).map((s) => ({
          id: s.id,
          description: s.description,
          source_url: s.source_url,
          created_at: s.created_at,
        }));

        const frequentList = [...recentList];
        frequentList.sort((a, b) => b.access_count - a.access_count);
        const frequent = frequentList.slice(0, frequentCount).map((s) => ({
          id: s.id,
          description: s.description,
          access_count: s.access_count,
        }));

        const transitions = await storage.listTransitionsAll(
          `git_branch = '${escapeSql(branch)}'`,
          50
        );
        const activeTransitions = transitions.map((t) => ({
          from: t.from_state_id,
          to: t.to_state_id,
          action: t.action,
          last_traversed: t.last_traversed,
        }));

        const allStatesCount = await storage.countStatesAll();
        const allTransCount = await storage.countTransitionsAll();

        const result = {
          recent_states: recent,
          frequent_states: frequent,
          active_transitions: activeTransitions,
          memory_stats: {
            total_states: allStatesCount,
            total_transitions: allTransCount,
            db_size_mb: Math.round((getDirSize(config.LANCEDB_PATH) / (1024 * 1024)) * 100) / 100,
          },
        };

        const formatted = formatResponsePayload(result, format);
        return {
          content: [{ type: 'text', text: JSON.stringify(formatted) }],
        };
      } catch (error: any) {
        logger.error('Error in get_session_context tool:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to get session context: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // 7. Tool: save_visual_snapshot
  server.registerTool(
    'save_visual_snapshot',
    {
      title: 'Save Visual Checkpoint',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      description: 'Saves current visual memory states as a named checkpoint snapshot.',
      inputSchema: z.object({
        name: z.string().describe('Unique snapshot checkpoint name'),
        description: z.string().optional().describe('Notes describing snapshot context'),
      }),
    },
    async (params) => {
      try {
        const snap = await saveSnapshot(params.name, params.description);
        const stateCount = JSON.parse(snap.state_ids).length;

        const result = {
          snapshot_id: snap.id,
          name: snap.name,
          state_count: stateCount,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error: any) {
        logger.error('Error in save_visual_snapshot tool:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to save visual snapshot: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // 8. Tool: diff_visual_snapshots
  server.registerTool(
    'diff_visual_snapshots',
    {
      title: 'Diff Visual Checkpoints',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Diff two snapshots to locate additions, deletions, or visual drift regressions.',
      inputSchema: z.object({
        snapshot_a_name: z.string().describe('Base snapshot name'),
        snapshot_b_name: z.string().describe('Target snapshot name to compare against'),
      }),
    },
    async (params) => {
      try {
        const diff = await diffSnapshots(params.snapshot_a_name, params.snapshot_b_name);
        return {
          content: [{ type: 'text', text: JSON.stringify(diff) }],
        };
      } catch (error: any) {
        logger.error('Error in diff_visual_snapshots tool:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to diff snapshots: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // 9. Tool: undo_last_visual_mutation
  server.registerTool(
    'undo_last_visual_mutation',
    {
      title: 'Undo Visual Mutation',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
      description: 'Undo the last visual state ingestion or transition edge addition.',
      inputSchema: z.object({
        type: z
          .enum(['state', 'transition', 'any'])
          .optional()
          .describe('Type of mutation to revert'),
      }),
    },
    async (params) => {
      try {
        const type = params.type ?? 'any';
        const branch = getCurrentBranch();

        let revertedId = '';
        let actionReverted = '';

        const undoState = async (): Promise<boolean> => {
          const list = await storage.listStates(`git_branch = '${escapeSql(branch)}'`, 100);
          if (list.length === 0) return false;
          list.sort((a, b) => b.created_at - a.created_at);
          const target = list[0];
          await storage.deleteState(target.id);
          memoryCache.delete(target.id, branch);
          revertedId = target.id;
          actionReverted = 'deleted_state';
          return true;
        };

        const undoTransition = async (): Promise<boolean> => {
          const list = await storage.listTransitions(`git_branch = '${escapeSql(branch)}'`, 100);
          if (list.length === 0) return false;
          list.sort((a, b) => b.last_traversed - a.last_traversed);
          const target = list[0];
          await storage.deleteTransition(target.id);
          revertedId = target.id;
          actionReverted = 'deleted_transition';
          return true;
        };

        let undone = false;
        if (type === 'state') {
          undone = await undoState();
        } else if (type === 'transition') {
          undone = await undoTransition();
        } else {
          const stateList = await storage.listStates(`git_branch = '${escapeSql(branch)}'`, 1);
          const transList = await storage.listTransitions(`git_branch = '${escapeSql(branch)}'`, 1);

          const stateTime = stateList.length > 0 ? stateList[0].created_at : 0;
          const transTime = transList.length > 0 ? transList[0].last_traversed : 0;

          if (stateTime > transTime) {
            undone = await undoState();
          } else if (transTime > 0) {
            undone = await undoTransition();
          }
        }

        if (!undone) {
          throw new Error('No mutations found to revert.');
        }

        const result = {
          success: true,
          reverted_id: revertedId,
          action_reverted: actionReverted,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error: any) {
        logger.error('Error in undo_last_visual_mutation tool:', error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to undo mutation: ${error.message}` }],
        };
      }
    }
  );

  // 10. Tool: create_visual_blocker
  server.registerTool(
    'create_visual_blocker',
    {
      title: 'Create Visual Blocker',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Generates a structured visual blocker payload. The calling agent should use the output to call state-memory-mcp:add_node to log a blocker.',
      inputSchema: z.object({
        visual_state_id: z.string().describe('ID of the visual state where the blocker occurred'),
        description: z.string().describe('Description of the visual bug/blocker'),
        project: z
          .string()
          .optional()
          .describe('The state-memory-mcp project name (defaults to current project)'),
      }),
    },
    async (params) => {
      try {
        const state = await storage.getStateAll(params.visual_state_id);
        if (!state) {
          throw new Error(`Visual state with ID ${params.visual_state_id} not found.`);
        }

        const project = params.project ?? '';
        const title = `Visual Blocker: ${params.description.slice(0, 80)}`;
        const result = {
          instruction:
            'Please execute the state-memory-mcp:add_node tool with the following parameters to log this blocker.',
          mcp_tool_call: {
            server: 'state-memory-mcp',
            tool: 'add_node',
            arguments: {
              project: project || undefined,
              type: 'blocker',
              title,
              status: 'active',
              metadata: {
                vision_state_id: state.id,
                vision_description: state.description,
                source_url: state.source_url,
                git_branch: state.git_branch,
                bug_details: params.description,
              },
              tags: ['visual-regression', 'ui-bug'],
            },
          },
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error: any) {
        logger.error('Error in create_visual_blocker tool:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to create visual blocker: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // 11. Tool: predict_next_action
  server.registerTool(
    'predict_next_action',
    {
      title: 'Predict Next UI Action',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Predict the best next UI action from current visual state based on transition success rates and goal alignment.',
      inputSchema: z.object({
        current_state_id: z.string().describe('ID of current active visual state'),
        goal_description: z
          .string()
          .optional()
          .describe('Optional natural language goal description'),
        goal_state_id: z.string().optional().describe('Optional target visual state ID'),
      }),
    },
    async (params) => {
      try {
        const currentState = await storage.getStateAll(params.current_state_id);
        if (!currentState) {
          throw new Error(`Current state ID "${params.current_state_id}" not found.`);
        }

        const transitions = await storage.listTransitionsAll(
          `from_state_id = '${escapeSql(params.current_state_id)}' AND git_branch = '${escapeSql(currentState.git_branch)}'`,
          50
        );

        if (transitions.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  predicted_action: null,
                  confidence_score: 0.0,
                  reasoning: 'No outbound transitions logged for current state.',
                }),
              },
            ],
          };
        }

        let bestTransition = transitions[0];
        let maxScore = -1;

        for (const t of transitions) {
          const totalAttempts = t.success_count + t.failure_count;
          const successRate = totalAttempts > 0 ? t.success_count / totalAttempts : 0.5;
          let score = successRate;

          if (params.goal_state_id && t.to_state_id === params.goal_state_id) {
            score += 1.0;
          }

          if (params.goal_description) {
            if (t.action.toLowerCase().includes(params.goal_description.toLowerCase())) {
              score += 0.5;
            }
          }

          if (score > maxScore) {
            maxScore = score;
            bestTransition = t;
          }
        }

        const targetState = await storage.getStateAll(bestTransition.to_state_id);
        const result = {
          predicted_action: bestTransition.action,
          action_type: bestTransition.action_type,
          from_state_id: bestTransition.from_state_id,
          to_state_id: bestTransition.to_state_id,
          target_state_description: targetState?.description ?? '',
          confidence_score: Math.min(1.0, Math.round(maxScore * 100) / 100),
          historical_success_rate:
            bestTransition.success_count + bestTransition.failure_count > 0
              ? bestTransition.success_count /
                (bestTransition.success_count + bestTransition.failure_count)
              : 1.0,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error: any) {
        logger.error('Error in predict_next_action tool:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to predict next action: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // 12. Tool: batch_analyze_screenshots
  server.registerTool(
    'batch_analyze_screenshots',
    {
      title: 'Batch Analyze Screenshots',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      description: 'Process multiple screenshots or file paths in a single batch call.',
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              screenshot: z.string().optional(),
              file_path: z.string().optional(),
              description: z.string().optional(),
              accessibility_tree: z.string().optional(),
              source_url: z.string().optional(),
              tags: z.array(z.string()).optional(),
            })
          )
          .min(1)
          .max(20)
          .describe('List of 1 to 20 screenshot items to ingest/analyze'),
        git_branch: z.string().optional(),
        response_format: z.enum(['compact', 'full']).optional(),
      }),
    },
    async (params) => {
      try {
        const format = params.response_format ?? 'compact';
        const branch = params.git_branch ?? getCurrentBranch();
        const results = [];

        for (const item of params.items) {
          const imageB64 = await resolveImageInput(item.screenshot, item.file_path);
          const axTree = item.accessibility_tree
            ? compressAccessibilityTree(item.accessibility_tree)
            : undefined;

          const retrieval = await retrieveState({
            screenshot: imageB64,
            strategy: 'thorough',
            gitBranch: branch,
            accessibilityTree: axTree,
          });

          if (retrieval.is_known && retrieval.state_id) {
            results.push(formatResponsePayload(retrieval, format));
            continue;
          }

          const processed = await processImage(imageB64);
          const dhash = await calculateDHash(processed.normalizedBuffer);
          const ahash = await calculateAHash(processed.normalizedBuffer);

          let finalDesc = item.description ?? '';
          if (!finalDesc) {
            try {
              finalDesc = await analyzeScreenshotWithLLM(imageB64);
            } catch {
              finalDesc = 'New visual state (pending analysis).';
            }
          }

          const vector = await embeddings.generateImageEmbedding(processed.normalizedBuffer);
          const newId = crypto.randomUUID();
          const newState: VisualState = {
            id: newId,
            dhash,
            ahash,
            vector,
            description: finalDesc,
            structured_data: '{}',
            accessibility_tree: axTree ?? '{}',
            thumbnail: processed.thumbnail,
            original_dimensions: JSON.stringify({
              width: processed.originalWidth,
              height: processed.originalHeight,
            }),
            source_url: item.source_url ?? '',
            source_agent: 'agent',
            trace_id: '',
            git_branch: branch,
            tags: JSON.stringify(item.tags ?? []),
            importance_score: 0.5,
            created_at: Date.now(),
            last_accessed: Date.now(),
            access_count: 1,
            ttl: 0,
          };

          await storage.addState(newState);
          memoryCache.set(newState);

          const resultObj = {
            state_id: newId,
            is_known: false,
            match_type: 'new',
            similarity_score: 0.0,
            description: finalDesc,
            thumbnail: processed.thumbnail,
          };

          results.push(formatResponsePayload(resultObj, format));
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                batch_count: results.length,
                results,
              }),
            },
          ],
        };
      } catch (error: any) {
        logger.error('Error in batch_analyze_screenshots tool:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to batch analyze screenshots: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // set_visual_spec
  server.tool(
    'set_visual_spec',
    'Set a screenshot or mockup design as a Visual Spec baseline for UI compliance testing.',
    {
      name: z.string().describe('Name identifier for the visual spec.'),
      screenshot: z.string().optional().describe('Base64 encoded screenshot image.'),
      file_path: z.string().optional().describe('Absolute file path to mockup image.'),
    },
    async ({ name, screenshot, file_path }) => {
      try {
        const res = await setVisualSpec({ name, screenshot, filePath: file_path });
        return {
          content: [{ type: 'text', text: JSON.stringify(res) }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to set visual spec: ${error.message}` }],
        };
      }
    }
  );

  // verify_visual_spec
  server.tool(
    'verify_visual_spec',
    'Verify a live captured UI screenshot against a registered Visual Spec baseline.',
    {
      spec_name: z.string().describe('Name identifier of the visual spec baseline.'),
      screenshot: z.string().optional().describe('Base64 encoded live screenshot image.'),
      file_path: z.string().optional().describe('Absolute file path to live screenshot image.'),
      tolerance: z.number().optional().describe('Optional dHash Hamming distance tolerance threshold (default: 8).'),
    },
    async ({ spec_name, screenshot, file_path, tolerance }) => {
      try {
        const res = await verifyVisualSpec({ specName: spec_name, screenshot, filePath: file_path, tolerance });
        return {
          content: [{ type: 'text', text: JSON.stringify(res) }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to verify visual spec: ${error.message}` }],
        };
      }
    }
  );

  // get_visual_diff
  server.tool(
    'get_visual_diff',
    'Calculate perceptual dHash diff and region deltas between two visual states (Armstrong 2026, Section 7).',
    {
      state_id_a: z.string().describe('ID of the first visual state baseline.'),
      state_id_b: z.string().describe('ID of the second visual state target.'),
    },
    async ({ state_id_a, state_id_b }) => {
      try {
        const stateA = await storage.getState(state_id_a);
        const stateB = await storage.getState(state_id_b);

        if (!stateA || !stateB) {
          throw new Error(`One or both visual states not found: ${state_id_a}, ${state_id_b}`);
        }

        const distance = hammingDistance(stateA.dhash, stateB.dhash);
        const similarity = 1 - Math.min(distance / 64, 1);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                state_id_a,
                state_id_b,
                dhash_distance: distance,
                similarity_score: Math.round(similarity * 1000) / 1000,
                has_layout_change: distance > 3,
                layout_delta_ratio: Math.round((distance / 64) * 100) / 100,
                description_a: stateA.description,
                description_b: stateB.description,
              }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to calculate visual diff: ${error.message}` }],
        };
      }
    }
  );

  // export_visual_trajectories
  server.tool(
    'export_visual_trajectories',
    'Export multimodal visual state transition trajectories for local model fine-tuning.',
    {
      git_branch: z.string().optional().describe('Optional git branch filter.'),
      limit: z.number().optional().describe('Maximum number of trajectories to export (default: 50).'),
    },
    async ({ git_branch, limit }) => {
      try {
        const branch = git_branch || getCurrentBranch();
        const states = await storage.listStatesAll(`git_branch = '${escapeSql(branch)}'`, limit || 50);

        const trajectories = states.map((s, idx) => ({
          step: idx + 1,
          state_id: s.id,
          dhash: s.dhash,
          ahash: s.ahash,
          description: s.description,
          source_url: s.source_url,
          created_at: s.created_at,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                git_branch: branch,
                total_trajectories: trajectories.length,
                trajectories,
              }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to export visual trajectories: ${error.message}` }],
        };
      }
    }
  );
}

