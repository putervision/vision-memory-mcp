import fs from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import crypto from 'crypto';
import { config } from '../config.js';
import { storage, escapeSql } from '../core/storage.js';
import { getCurrentBranch, memoryCache } from '../core/cache.js';
import { processImage } from '../core/image-pipeline.js';
import {
  calculateDHash,
  calculateAHash,
  hammingDistance,
} from '../core/hash.js';
import { embeddings, cosineSimilarity } from '../core/embeddings.js';
import { retrieveState } from '../core/retrieval.js';
import { recordTransition, findNavigationPaths } from '../core/graph.js';
import { saveSnapshot, diffSnapshots } from '../core/snapshots.js';
import { analyzeScreenshotWithLLM } from '../vision/analyzer.js';
import { logger } from '../logger.js';
import { VisualState } from '../types.js';

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

export function registerAllTools(server: McpServer): void {
  // 1. Tool: analyze_screenshot
  server.registerTool(
    'analyze_screenshot',
    {
      description:
        'Ingest a base64 screenshot, check visual state cache, and return details of the state (generating a new memory entry if not matched).',
      inputSchema: z.object({
        screenshot: z
          .string()
          .describe('Base64-encoded image string (required)'),
        description: z
          .string()
          .optional()
          .describe('Optional human/agent-provided description of the screen'),
        accessibility_tree: z
          .string()
          .optional()
          .describe('Optional JSON string representing the simplified AX tree'),
        source_url: z
          .string()
          .optional()
          .describe('Optional app/page path or URL where captured'),
        tags: z
          .array(z.string())
          .optional()
          .describe('Optional classification tags'),
        force_refresh: z
          .boolean()
          .optional()
          .describe('Bypass L1/L2 cache and force new ingestion'),
        git_branch: z
          .string()
          .optional()
          .describe('Override the active git branch'),
        trace_id: z
          .string()
          .optional()
          .describe(
            'Optional session_id or trace_id for correlation with state-memory-mcp'
          ),
      }),
    },
    async (params) => {
      try {
        const branch = params.git_branch ?? getCurrentBranch();

        // 1. Run tiered retrieval
        const retrieval = await retrieveState({
          screenshot: params.screenshot,
          strategy: 'thorough',
          forceRefresh: params.force_refresh,
          gitBranch: branch,
          accessibilityTree: params.accessibility_tree,
        });

        // 2. If it's a cache hit, return results
        if (retrieval.is_known && retrieval.state_id) {
          // If a new description is provided, update the existing record's description
          if (
            params.description &&
            params.description !== retrieval.description
          ) {
            await storage.updateState(retrieval.state_id, {
              description: params.description,
            });
            retrieval.description = params.description;
          }
          return {
            content: [
              { type: 'text', text: JSON.stringify(retrieval, null, 2) },
            ],
          };
        }

        // 3. Cache miss: Ingest new state
        logger.info('Cache miss: generating new state entry...');
        const processed = await processImage(params.screenshot);
        const dhash = await calculateDHash(processed.normalizedBuffer);
        const ahash = await calculateAHash(processed.normalizedBuffer);

        // Resolve description
        let finalDesc = params.description ?? '';
        if (!finalDesc) {
          // Trigger L4 vision LLM if enabled
          try {
            finalDesc = await analyzeScreenshotWithLLM(params.screenshot);
          } catch (err) {
            logger.warn('L4 Vision fallback failed or was disabled:', err);
            finalDesc = 'New visual state (pending analysis).';
          }
        }

        // Generate CLIP embedding
        const vector = await embeddings.generateImageEmbedding(
          processed.normalizedBuffer
        );

        const stateId = crypto.randomUUID();
        const newState: VisualState = {
          id: stateId,
          dhash,
          ahash,
          vector,
          description: finalDesc,
          structured_data: '{}',
          accessibility_tree: params.accessibility_tree ?? '{}',
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

        // Write to storage and cache
        await storage.addState(newState);
        memoryCache.set(newState);

        const result = {
          state_id: stateId,
          is_known: false,
          match_type: 'new',
          similarity_score: 0.0,
          description: finalDesc,
          related_states: retrieval.related_states || [],
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
      description:
        'Search visual memory by text description query or image query (or both) to locate relevant past states.',
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe('Text search description (e.g. "error dialog")'),
        screenshot: z
          .string()
          .optional()
          .describe('Base64 image to search visually'),
        strategy: z
          .enum(['fast', 'semantic', 'thorough'])
          .optional()
          .describe('Matching depth strategy'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('Maximum number of results to return'),
        include_transitions: z
          .boolean()
          .optional()
          .describe('Include outbound transitions in results'),
        git_branch: z
          .string()
          .optional()
          .describe('Override the active git branch'),
      }),
    },
    async (params) => {
      try {
        const branch = params.git_branch ?? getCurrentBranch();
        const limit = params.limit ?? 3;

        const retrieval = await retrieveState({
          screenshot: params.screenshot,
          query: params.query,
          strategy: params.strategy,
          limit,
          gitBranch: branch,
        });

        // Enforce limit on related states + main state formatting
        const results = [];

        if (retrieval.state_id) {
          let transitions: any[] = [];
          if (params.include_transitions) {
            transitions = await storage.listTransitions(
              `from_state_id = '${retrieval.state_id}'`
            );
          }

          results.push({
            state_id: retrieval.state_id,
            description: retrieval.description,
            similarity_score: retrieval.similarity_score,
            structured_data: retrieval.structured_data,
            accessibility_tree: retrieval.accessibility_tree,
            tags: retrieval.tags,
            source_url: retrieval.source_url,
            transitions: transitions.map((t) => ({
              action: t.action,
              to_state_id: t.to_state_id,
              success_rate:
                t.success_count + t.failure_count > 0
                  ? t.success_count / (t.success_count + t.failure_count)
                  : 1.0,
            })),
          });
        }

        if (retrieval.related_states) {
          for (const item of retrieval.related_states.slice(
            0,
            limit - results.length
          )) {
            let transitions: any[] = [];
            if (params.include_transitions) {
              transitions = await storage.listTransitions(
                `from_state_id = '${item.id}'`
              );
            }
            const s = await storage.getState(item.id);
            results.push({
              state_id: item.id,
              description: item.description,
              similarity_score: item.similarity,
              structured_data: s?.structured_data,
              tags: s ? JSON.parse(s.tags || '[]') : [],
              source_url: s?.source_url,
              transitions: transitions.map((t) => ({
                action: t.action,
                to_state_id: t.to_state_id,
                success_rate:
                  t.success_count + t.failure_count > 0
                    ? t.success_count / (t.success_count + t.failure_count)
                    : 1.0,
              })),
            });
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ memories: results }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        logger.error('Error in recall_memory tool:', error);
        return {
          isError: true,
          content: [
            { type: 'text', text: `Failed to recall memory: ${error.message}` },
          ],
        };
      }
    }
  );

  // 3. Tool: record_outcome
  server.registerTool(
    'record_outcome',
    {
      description:
        'Record an action outcome and transition between UI states to build the navigation graph.',
      inputSchema: z.object({
        from_state_id: z.string().describe('ID of the starting visual state'),
        to_state_id: z
          .string()
          .optional()
          .describe('ID of the resulting visual state'),
        to_screenshot: z
          .string()
          .optional()
          .describe(
            'Base64 image of state after action (auto-analyzed if provided)'
          ),
        action: z
          .string()
          .describe('Action text performed (e.g. "click submit")'),
        action_type: z
          .enum(['click', 'type', 'navigate', 'scroll', 'custom'])
          .optional()
          .describe('Type of action'),
        success: z.boolean().describe('Outcome of action'),
        duration_ms: z
          .number()
          .optional()
          .describe('Action execution time in ms'),
        notes: z.string().optional().describe('Execution notes or error logs'),
        trace_id: z
          .string()
          .optional()
          .describe(
            'Optional session_id or trace_id for correlation with state-memory-mcp'
          ),
      }),
    },
    async (params) => {
      try {
        let toStateId = params.to_state_id;

        // If to_screenshot is provided, resolve resulting state ID (auto-ingesting if cache miss)
        if (params.to_screenshot) {
          const branch = getCurrentBranch();
          const ingestResult = await retrieveState({
            screenshot: params.to_screenshot,
            strategy: 'semantic',
            gitBranch: branch,
          });

          if (ingestResult.is_known && ingestResult.state_id) {
            toStateId = ingestResult.state_id;
          } else {
            logger.info(
              'record_outcome: to_screenshot missed cache, auto-ingesting new visual state...'
            );
            const processed = await processImage(params.to_screenshot);
            const dhash = await calculateDHash(processed.normalizedBuffer);
            const ahash = await calculateAHash(processed.normalizedBuffer);

            let finalDesc = '';
            try {
              finalDesc = await analyzeScreenshotWithLLM(params.to_screenshot);
            } catch {
              finalDesc = `Resulting state after: ${params.action}`;
            }

            const vector = await embeddings.generateImageEmbedding(
              processed.normalizedBuffer
            );
            const newId = crypto.randomUUID();
            const newState: VisualState = {
              id: newId,
              dhash,
              ahash,
              vector,
              description: finalDesc,
              structured_data: '{}',
              accessibility_tree: '{}',
              thumbnail: processed.thumbnail,
              original_dimensions: JSON.stringify({
                width: processed.originalWidth,
                height: processed.originalHeight,
              }),
              source_url: '',
              source_agent: 'agent',
              trace_id: params.trace_id ?? '',
              git_branch: branch,
              tags: JSON.stringify(['action-result']),
              importance_score: 0.5,
              created_at: Date.now(),
              last_accessed: Date.now(),
              access_count: 1,
              ttl: 0,
            };

            await storage.addState(newState);
            memoryCache.set(newState);
            toStateId = newId;
          }
        }

        if (!toStateId) {
          throw new Error(
            'Either to_state_id or to_screenshot must be provided.'
          );
        }

        const transition = await recordTransition({
          fromStateId: params.from_state_id,
          toStateId,
          action: params.action,
          actionType: params.action_type,
          success: params.success,
          durationMs: params.duration_ms,
          notes: params.notes,
          traceId: params.trace_id,
        });

        const fromState = await storage.getState(params.from_state_id);
        const toState = await storage.getState(toStateId);

        const totalAttempts =
          transition.success_count + transition.failure_count;
        const successRate =
          totalAttempts > 0 ? transition.success_count / totalAttempts : 0;

        const result = {
          transition_id: transition.id,
          from_state: {
            id: params.from_state_id,
            description: fromState?.description ?? 'Unknown',
          },
          to_state: {
            id: toStateId,
            description: toState?.description ?? 'Unknown',
          },
          path_success_rate: successRate,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
      description:
        'Trace historical pathways from current state to a target state or state matching description.',
      inputSchema: z.object({
        from_state_id: z
          .string()
          .optional()
          .describe(
            'ID of starting state (defaults to most recently accessed state)'
          ),
        to_state_id: z.string().optional().describe('ID of target state'),
        to_description: z
          .string()
          .optional()
          .describe('Description match of target state'),
        max_hops: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('BFS search limit'),
      }),
    },
    async (params) => {
      try {
        let fromId = params.from_state_id;
        if (!fromId) {
          const branch = getCurrentBranch();
          const states = await storage.listStates(
            `git_branch = '${escapeSql(branch)}'`,
            1
          );
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

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
      description: 'Compare two states visually and structurally.',
      inputSchema: z.object({
        state_a_id: z.string().describe('ID of state A'),
        state_b_id: z.string().describe('ID of state B'),
      }),
    },
    async (params) => {
      try {
        const stateA = await storage.getState(params.state_a_id);
        const stateB = await storage.getState(params.state_b_id);

        if (!stateA)
          throw new Error(`State A (${params.state_a_id}) not found.`);
        if (!stateB)
          throw new Error(`State B (${params.state_b_id}) not found.`);

        const dist = hammingDistance(stateA.dhash, stateB.dhash);
        const similarity = cosineSimilarity(stateA.vector, stateB.vector);

        const result = {
          hash_distance: dist,
          vector_similarity: similarity,
          structural_diff:
            stateA.structured_data === stateB.structured_data
              ? 'Structured data is identical.'
              : 'Structured data differs.',
          description_diff: `State A: "${stateA.description}"\nState B: "${stateB.description}"`,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
      }),
    },
    async (params) => {
      try {
        const recentCount = params.include_recent ?? 5;
        const frequentCount = params.include_frequent ?? 3;
        const branch = getCurrentBranch();

        // 1. Recent states (sorted by created_at desc)
        const recentList = await storage.listStates(
          `git_branch = '${escapeSql(branch)}'`,
          100
        );
        recentList.sort((a, b) => b.created_at - a.created_at);
        const recent = recentList.slice(0, recentCount).map((s) => ({
          id: s.id,
          description: s.description,
          source_url: s.source_url,
          created_at: s.created_at,
        }));

        // 2. Frequent states (sorted by access_count desc)
        const frequentList = [...recentList];
        frequentList.sort((a, b) => b.access_count - a.access_count);
        const frequent = frequentList.slice(0, frequentCount).map((s) => ({
          id: s.id,
          description: s.description,
          access_count: s.access_count,
        }));

        // 3. Transitions
        const transitions = await storage.listTransitions(
          `git_branch = '${escapeSql(branch)}'`,
          50
        );
        const activeTransitions = transitions.map((t) => ({
          from: t.from_state_id,
          to: t.to_state_id,
          action: t.action,
          last_traversed: t.last_traversed,
        }));

        // 4. Memory stats
        const allStatesCount = await storage.countStates();
        const allTransCount = await storage.countTransitions();

        const result = {
          recent_states: recent,
          frequent_states: frequent,
          active_transitions: activeTransitions,
          memory_stats: {
            total_states: allStatesCount,
            total_transitions: allTransCount,
            db_size_mb:
              Math.round(
                (getDirSize(config.LANCEDB_PATH) / (1024 * 1024)) * 100
              ) / 100,
          },
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
      description:
        'Saves current visual memory states as a named checkpoint snapshot.',
      inputSchema: z.object({
        name: z.string().describe('Unique snapshot checkpoint name'),
        description: z
          .string()
          .optional()
          .describe('Notes describing snapshot context'),
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
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
      description:
        'Diff two snapshots to locate additions, deletions, or visual drift regressions.',
      inputSchema: z.object({
        snapshot_a_name: z.string().describe('Base snapshot name'),
        snapshot_b_name: z
          .string()
          .describe('Target snapshot name to compare against'),
      }),
    },
    async (params) => {
      try {
        const diff = await diffSnapshots(
          params.snapshot_a_name,
          params.snapshot_b_name
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(diff, null, 2) }],
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
      description:
        'Undo the last visual state ingestion or transition edge addition.',
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
          const list = await storage.listStates(
            `git_branch = '${escapeSql(branch)}'`,
            100
          );
          if (list.length === 0) return false;
          list.sort((a, b) => b.created_at - a.created_at);
          const target = list[0];
          await storage.deleteState(target.id);
          // Also clear from LRU cache
          memoryCache.delete(target.id, branch);
          revertedId = target.id;
          actionReverted = 'deleted_state';
          return true;
        };

        const undoTransition = async (): Promise<boolean> => {
          const list = await storage.listTransitions(
            `git_branch = '${escapeSql(branch)}'`,
            100
          );
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
          // 'any': compare most recent timestamp
          const stateList = await storage.listStates(
            `git_branch = '${escapeSql(branch)}'`,
            1
          );
          const transList = await storage.listTransitions(
            `git_branch = '${escapeSql(branch)}'`,
            1
          );

          const stateTime = stateList.length > 0 ? stateList[0].created_at : 0;
          const transTime =
            transList.length > 0 ? transList[0].last_traversed : 0;

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
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        logger.error('Error in undo_last_visual_mutation tool:', error);
        return {
          isError: true,
          content: [
            { type: 'text', text: `Failed to undo mutation: ${error.message}` },
          ],
        };
      }
    }
  );

  // 10. Tool: create_visual_blocker
  server.registerTool(
    'create_visual_blocker',
    {
      description:
        'Generates a structured visual blocker payload. The calling agent should use the output to call state-memory-mcp:add_node to log a blocker.',
      inputSchema: z.object({
        visual_state_id: z
          .string()
          .describe('ID of the visual state where the blocker occurred'),
        description: z
          .string()
          .describe('Description of the visual bug/blocker'),
        project: z
          .string()
          .optional()
          .describe(
            'The state-memory-mcp project name (defaults to the current folder name)'
          ),
      }),
    },
    async (params) => {
      try {
        const state = await storage.getState(params.visual_state_id);
        if (!state) {
          throw new Error(
            `Visual state with ID ${params.visual_state_id} not found.`
          );
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
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
}
