import fs from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import crypto from 'crypto';
import { config, resolveProjectRoot } from '../config.js';
import { storage, escapeSql } from '../core/storage.js';
import { getCurrentBranch, memoryCache } from '../core/cache.js';
import { processImage } from '../core/image-pipeline.js';
import { calculateDHash, calculateAHash, hammingDistance } from '../core/hash.js';
import { embeddings, cosineSimilarity } from '../core/embeddings.js';
import { retrieveState, compressAccessibilityTree } from '../core/retrieval.js';
import { recordTransition, findNavigationPaths } from '../core/graph.js';
import { saveSnapshot, diffSnapshots, exportSnapshot, restoreSnapshot } from '../core/snapshots.js';
import { setVisualSpec, verifyVisualSpec } from '../core/visual-spec.js';
import { analyzeScreenshotWithLLM } from '../vision/analyzer.js';
import { metricsCollector } from '../core/metrics.js';
import { logger } from '../logger.js';
import { parseAXTreeToGroundedElements, matchGroundedTarget } from '../core/grounding.js';
import { getCachedDirSize } from '../utils/fs.js';
import { VisualState, ResponseFormat, WaitForVisualStateResult } from '../types.js';

export async function resolveImageInput(screenshot?: string, filePath?: string): Promise<string> {
  if (filePath) {
    const resolvedPath = path.resolve(filePath);
    const normalized = resolvedPath.toLowerCase();

    // Check system forbidden paths
    const forbidden = ['/etc', '/proc', '/sys', '/dev', '.ssh', '.aws', '.env'];
    for (const f of forbidden) {
      if (
        normalized.startsWith(f) ||
        normalized.includes(`/${f}/`) ||
        normalized.endsWith(`/${f}`)
      ) {
        throw new Error(`Access to sensitive file or path is restricted: ${filePath}`);
      }
    }

    // Strict mode check: must be inside project root
    if (config.STRICT_MODE) {
      const root = resolveProjectRoot();
      if (!resolvedPath.startsWith(root)) {
        throw new Error(`STRICT_MODE enabled: file_path must be within project root (${root}).`);
      }
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    const validExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
    if (!validExts.includes(ext)) {
      throw new Error(`Unsupported file extension "${ext}". Allowed: ${validExts.join(', ')}`);
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Specified image file does not exist: ${filePath}`);
    }

    const maxBytes = (config.MAX_IMAGE_SIZE_MB || 10) * 1024 * 1024;
    const stats = fs.statSync(resolvedPath);
    if (stats.size > maxBytes) {
      throw new Error(
        `Image file size (${(stats.size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of ${config.MAX_IMAGE_SIZE_MB} MB.`
      );
    }

    const buf = fs.readFileSync(resolvedPath);
    return buf.toString('base64');
  }
  if (screenshot && screenshot.trim().length > 0) {
    const maxBytes = (config.MAX_IMAGE_SIZE_MB || 10) * 1024 * 1024;
    const approxBytes = (screenshot.length * 3) / 4;
    if (approxBytes > maxBytes) {
      throw new Error(
        `Base64 screenshot size (${(approxBytes / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of ${config.MAX_IMAGE_SIZE_MB} MB.`
      );
    }
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
    const parsed = rawA ? JSON.parse(rawA) : {};
    objA =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? parsed
        : { value: parsed };
  } catch {
    objA = {};
  }
  try {
    const parsed = rawB ? JSON.parse(rawB) : {};
    objB =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? parsed
        : { value: parsed };
  } catch {
    objB = {};
  }

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

export async function handleWaitForVisualState(params: {
  target_state_id: string;
  timeout_ms?: number;
  poll_interval_ms?: number;
}): Promise<WaitForVisualStateResult> {
  const timeoutMs = params.timeout_ms ?? 10000;
  const pollIntervalMs = params.poll_interval_ms ?? 500;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const state = await storage.getState(params.target_state_id);
    if (state) {
      return {
        status: 'matched',
        elapsed_ms: Date.now() - startTime,
        state,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const finalCheck = await storage.getState(params.target_state_id);
  if (finalCheck) {
    return {
      status: 'matched',
      elapsed_ms: Date.now() - startTime,
      state: finalCheck,
    };
  }

  return {
    status: 'timeout',
    elapsed_ms: Date.now() - startTime,
    state: null,
  };
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
            db_size_mb:
              Math.round((getCachedDirSize(config.LANCEDB_PATH) / (1024 * 1024)) * 100) / 100,
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
            'Please execute state-memory-mcp:add_node to log a blocker node, and state-memory-mcp:link_visual_state to establish a blocked_by_visual_state relationship.',
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
          link_tool_call: {
            server: 'state-memory-mcp',
            tool: 'link_visual_state',
            arguments: {
              project: project || undefined,
              target_id: 'TARGET_TASK_OR_BLOCKER_ID',
              visual_state_id: state.id,
              relationship: 'blocked_by_visual_state',
              visual_description: state.description,
              source_url: state.source_url,
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
        const groundedElements = parseAXTreeToGroundedElements(currentState.accessibility_tree);
        const groundedTarget = matchGroundedTarget(
          groundedElements,
          params.goal_description || bestTransition.action
        );

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
          grounded_target: groundedTarget,
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
          try {
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
              source_url: item.source_url,
              tags: item.tags,
            };
            results.push(formatResponsePayload(resultObj, format));
          } catch (itemErr: any) {
            results.push({
              is_known: false,
              error: itemErr?.message || String(itemErr),
            });
          }
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
  server.registerTool(
    'set_visual_spec',
    {
      title: 'Set Visual Spec',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      description:
        'Set a screenshot or mockup design as a Visual Spec baseline for UI compliance testing.',
      inputSchema: z.object({
        name: z.string().describe('Name identifier for the visual spec.'),
        screenshot: z.string().optional().describe('Base64 encoded screenshot image.'),
        file_path: z.string().optional().describe('Absolute file path to mockup image.'),
      }),
    },
    async (params) => {
      try {
        const res = await setVisualSpec({
          name: params.name,
          screenshot: params.screenshot,
          filePath: params.file_path,
        });
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
  server.registerTool(
    'verify_visual_spec',
    {
      title: 'Verify Visual Spec',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Verify a live captured UI screenshot against a registered Visual Spec baseline.',
      inputSchema: z.object({
        spec_name: z.string().describe('Name identifier of the visual spec baseline.'),
        screenshot: z.string().optional().describe('Base64 encoded live screenshot image.'),
        file_path: z.string().optional().describe('Absolute file path to live screenshot image.'),
        tolerance: z
          .number()
          .optional()
          .describe('Optional dHash Hamming distance tolerance threshold (default: 8).'),
        sdd_requirement_id: z
          .string()
          .optional()
          .describe(
            'Optional state-memory-mcp SDD requirement node ID to link verification result.'
          ),
      }),
    },
    async (params) => {
      try {
        const res = await verifyVisualSpec({
          specName: params.spec_name,
          screenshot: params.screenshot,
          filePath: params.file_path,
          tolerance: params.tolerance,
          sddRequirementId: params.sdd_requirement_id,
        });
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
  server.registerTool(
    'get_visual_diff',
    {
      title: 'Get Visual Diff',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description: 'Calculate perceptual dHash diff and region deltas between two visual states.',
      inputSchema: z.object({
        state_id_a: z.string().describe('ID of the first visual state baseline.'),
        state_id_b: z.string().describe('ID of the second visual state target.'),
      }),
    },
    async (params) => {
      try {
        const stateA = await storage.getState(params.state_id_a);
        const stateB = await storage.getState(params.state_id_b);

        if (!stateA || !stateB) {
          throw new Error(
            `One or both visual states not found: ${params.state_id_a}, ${params.state_id_b}`
          );
        }

        const distance = hammingDistance(stateA.dhash, stateB.dhash);
        const similarity = 1 - Math.min(distance / 64, 1);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  state_id_a: params.state_id_a,
                  state_id_b: params.state_id_b,
                  dhash_distance: distance,
                  similarity_score: Math.round(similarity * 1000) / 1000,
                  has_layout_change: distance > 3,
                  layout_delta_ratio: Math.round((distance / 64) * 100) / 100,
                  description_a: stateA.description,
                  description_b: stateB.description,
                },
                null,
                2
              ),
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
  server.registerTool(
    'export_visual_trajectories',
    {
      title: 'Export Visual Trajectories',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Export multimodal visual state transition trajectories for local model fine-tuning.',
      inputSchema: z.object({
        git_branch: z.string().optional().describe('Optional git branch filter.'),
        limit: z
          .number()
          .optional()
          .describe('Maximum number of trajectories to export (default: 50).'),
        format: z
          .enum(['json', 'llava', 'qwen2_vl'])
          .optional()
          .describe('Fine-tuning dataset export format (json, llava, qwen2_vl)'),
      }),
    },
    async (params) => {
      try {
        const branch = params.git_branch || getCurrentBranch();
        const states = await storage.listStatesAll(
          `git_branch = '${escapeSql(branch)}'`,
          params.limit || 50
        );

        const exportFmt = params.format || 'json';

        if (exportFmt === 'llava') {
          const llavaDataset = states.map((s) => ({
            id: s.id,
            image: s.source_url || `state_${s.id}.webp`,
            conversations: [
              {
                from: 'human',
                value:
                  '<image>\nDescribe the layout, active elements, and status of this UI screenshot.',
              },
              {
                from: 'gpt',
                value: s.description || 'UI layout with interactive controls.',
              },
            ],
          }));
          return {
            content: [{ type: 'text', text: JSON.stringify(llavaDataset, null, 2) }],
          };
        }

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
              text: JSON.stringify(
                {
                  git_branch: branch,
                  total_trajectories: trajectories.length,
                  trajectories,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            { type: 'text', text: `Failed to export visual trajectories: ${error.message}` },
          ],
        };
      }
    }
  );

  // Tool: export_joint_trajectories
  server.registerTool(
    'export_joint_trajectories',
    {
      title: 'Export Joint Trajectories',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Export unified interleaved visual state transitions and workflow graph events correlated by session/trace ID.',
      inputSchema: z.object({
        trace_id: z.string().optional().describe('Optional trace ID / session ID filter'),
        limit: z.number().optional().describe('Maximum number of states to export (default: 50)'),
      }),
    },
    async (params) => {
      try {
        const states = await storage.listStatesAll('', params.limit || 50);
        const filteredStates = params.trace_id
          ? states.filter((s) => s.trace_id === params.trace_id)
          : states;

        const steps = filteredStates.map((s, idx) => {
          let groundedElements: any[] = [];
          if (s.grounded_elements) {
            try {
              groundedElements = JSON.parse(s.grounded_elements);
            } catch (_) {}
          }
          let parsedTags: string[] = [];
          if (s.tags) {
            try {
              parsedTags = JSON.parse(s.tags);
            } catch (_) {}
          }
          return {
            step_index: idx + 1,
            timestamp: s.created_at || Date.now(),
            iso_timestamp: new Date(s.created_at || Date.now()).toISOString(),
            source: 'vision_memory',
            session_id: s.trace_id || '',
            visual_state_id: s.id,
            description: s.description || '',
            source_url: s.source_url || '',
            importance_score: s.importance_score || 0.5,
            grounded_elements: groundedElements,
            tags: parsedTags,
          };
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  trace_id: params.trace_id || 'all',
                  total_steps: steps.length,
                  steps,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            { type: 'text', text: `Failed to export joint trajectories: ${error.message}` },
          ],
        };
      }
    }
  );

  // 17. Tool: get_metrics
  server.registerTool(
    'get_metrics',
    {
      title: 'Get Cache & Query Metrics',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Query cache-hit ratio, average visual similarity scores, and token-savings estimates.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const stats = metricsCollector.getStats();
        return {
          content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to get metrics: ${error.message}` }],
        };
      }
    }
  );

  // 18. Tool: export_snapshot
  server.registerTool(
    'export_snapshot',
    {
      title: 'Export Snapshot Archive',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Export a named visual snapshot as a full standalone JSON archive containing states, transitions, and metadata.',
      inputSchema: z.object({
        name: z.string().describe('Name or ID of visual snapshot checkpoint to export'),
      }),
    },
    async (params) => {
      try {
        const archive = await exportSnapshot(params.name);
        return {
          content: [{ type: 'text', text: JSON.stringify(archive, null, 2) }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to export snapshot: ${error.message}` }],
        };
      }
    }
  );

  // 19. Tool: restore_snapshot
  server.registerTool(
    'restore_snapshot',
    {
      title: 'Restore Snapshot Archive',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      description: 'Restore a visual memory snapshot from an exported archive JSON object.',
      inputSchema: z.object({
        archive_json: z.string().describe('JSON string of exported SnapshotArchive'),
      }),
    },
    async (params) => {
      try {
        const rawParsed = JSON.parse(params.archive_json);
        const SnapshotArchiveSchema = z.object({
          version: z.string().optional(),
          name: z.string().optional(),
          snapshot: z.object({
            id: z.string(),
            name: z.string(),
            git_branch: z.string().optional(),
            created_at: z.number().optional(),
            state_ids: z.string(),
          }),
          states: z.array(
            z.object({
              id: z.string(),
              dhash: z.string(),
              ahash: z.string(),
              vector: z.array(z.number()),
              description: z.string(),
            })
          ),
          transitions: z.array(z.any()).optional(),
        });

        const archive = SnapshotArchiveSchema.parse(rawParsed);
        const result = await restoreSnapshot(archive as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to restore snapshot: ${error.message}` }],
        };
      }
    }
  );

  // 20. Tool: forget_state
  server.registerTool(
    'forget_state',
    {
      title: 'Forget Visual State',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
      description:
        'Purge a specific visual state, its vector embeddings, and perceptual hashes from storage for privacy or memory reset.',
      inputSchema: z.object({
        state_id: z.string().describe('ID of visual state to purge'),
      }),
    },
    async (params) => {
      try {
        await storage.deleteState(params.state_id);
        memoryCache.clear();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, purged_state_id: params.state_id }),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to purge state: ${error.message}` }],
        };
      }
    }
  );

  // 21. Tool: wait_for_visual_state
  server.registerTool(
    'wait_for_visual_state',
    {
      title: 'Wait For Visual State',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Poll for a target visual state ID until it exists in memory or timeout occurs, avoiding spinning agent loops.',
      inputSchema: z.object({
        target_state_id: z.string().describe('Target visual state ID to wait for'),
        timeout_ms: z.number().optional().describe('Maximum timeout in ms (default: 10000)'),
        poll_interval_ms: z.number().optional().describe('Polling interval in ms (default: 500)'),
      }),
    },
    async (params) => {
      try {
        const res = await handleWaitForVisualState({
          target_state_id: params.target_state_id,
          timeout_ms: params.timeout_ms,
          poll_interval_ms: params.poll_interval_ms,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(res) }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to wait for visual state: ${error.message}` }],
        };
      }
    }
  );
}
