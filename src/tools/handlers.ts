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
import { setVisualSpec, verifyVisualSpec, listVisualSpecs } from '../core/visual-spec.js';
import { analyzeScreenshotWithLLM } from '../vision/analyzer.js';
import { metricsCollector } from '../core/metrics.js';
import { logger } from '../logger.js';
import { parseAXTreeToGroundedElements, matchGroundedTarget } from '../core/grounding.js';
import { probeVideo, extractKeyframes } from '../core/video-pipeline.js';
import { categorizeVideoFrames } from '../core/video-categorizer.js';
import { getCachedDirSize } from '../utils/fs.js';
import { redactUrl } from '../utils/redact.js';
import { VERSION } from '../utils/version.js';
import {
  VisualState,
  ResponseFormat,
  WaitForVisualStateResult,
  VideoMemoryRecord,
  EvidencePack,
} from '../types.js';
import { LEGACY_VISION_TOOL_MAP, translateLegacyVisionCall } from './compat-shim.js';
import { resolveVisionAction, generateVisionToolGuidance } from '../core/advisor.js';

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

export async function handleIngestVideo(params: {
  file_path?: string;
  video_data?: string;
  fps?: number;
  scene_threshold?: number;
  action_timestamps?: number[];
  category?: string;
  tags?: string[];
  source_agent?: string;
  trace_id?: string;
}) {
  const input = params.file_path || params.video_data;
  if (!input) {
    throw new Error('Either file_path or video_data base64 string must be provided.');
  }

  const probe = await probeVideo(input);
  const frames = await extractKeyframes(input, {
    fps: params.fps,
    scene_threshold: params.scene_threshold,
    action_timestamps: params.action_timestamps,
    category: params.category,
    tags: params.tags,
    source_agent: params.source_agent,
    trace_id: params.trace_id,
  });

  const catResult = await categorizeVideoFrames(
    frames,
    {
      category: params.category,
      tags: params.tags,
      source_agent: params.source_agent,
      trace_id: params.trace_id,
    },
    params.file_path || 'video_stream'
  );

  for (const s of catResult.states) {
    await storage.addState(s);
  }
  for (const t of catResult.transitions) {
    await storage.addTransition(t);
  }

  const videoId = `vid_${crypto.randomBytes(8).toString('hex')}`;
  const record: VideoMemoryRecord = {
    id: videoId,
    source_file: params.file_path || 'video_stream',
    file_format: probe.file_format,
    duration_ms: probe.duration_ms,
    fps: probe.fps,
    resolution: JSON.stringify({ width: probe.width, height: probe.height }),
    total_frames_extracted: frames.length,
    unique_states_count: catResult.unique_states_count,
    category: params.category || 'general',
    tags: JSON.stringify(params.tags || []),
    created_at: Date.now(),
    summary_description: catResult.summary_description,
    keyframe_timeline: JSON.stringify(catResult.timeline),
    trace_id: params.trace_id || '',
    git_branch: getCurrentBranch(),
  };

  await storage.saveVideoRecord(record);

  return {
    video_id: videoId,
    source_file: record.source_file,
    file_format: record.file_format,
    duration_ms: record.duration_ms,
    extracted_frames_count: frames.length,
    unique_states_count: catResult.unique_states_count,
    category: record.category,
    tags: params.tags || [],
    timeline: catResult.timeline,
    summary: catResult.summary_description,
    evidence_payload: {
      source_video_id: videoId,
      frame_range: catResult.timeline.map((t) => t.state_id),
      timestamps_ms: catResult.timeline.map((t) => t.timestamp_ms),
    },
  };
}

export async function handleSearchVideoMemory(params: {
  query: string;
  category?: string;
  limit?: number;
}) {
  const records = await storage.searchVideoRecords(params.query, params.limit || 20);
  if (!params.category) return records;
  return records.filter((r) => r.category === params.category);
}

export async function handleGetVideoTimeline(params: { video_id: string }) {
  const record = await storage.getVideoRecord(params.video_id);
  if (!record) {
    throw new Error(`Video memory record '${params.video_id}' not found.`);
  }

  const timelineEntries: Array<{
    frame_index: number;
    timestamp_ms: number;
    state: VisualState | null;
    dhash: string;
  }> = [];

  let rawTimeline: any[] = [];
  try {
    rawTimeline = JSON.parse(record.keyframe_timeline || '[]');
  } catch (_) {}

  for (const entry of rawTimeline) {
    const state = await storage.getState(entry.state_id);
    timelineEntries.push({
      frame_index: entry.frame_index,
      timestamp_ms: entry.timestamp_ms,
      state,
      dhash: entry.dhash,
    });
  }

  return {
    video: record,
    timeline: timelineEntries,
  };
}

export async function handleCompareVideoTrajectories(params: {
  video_a_id: string;
  video_b_id: string;
}) {
  const videoA = await storage.getVideoRecord(params.video_a_id);
  const videoB = await storage.getVideoRecord(params.video_b_id);

  if (!videoA) throw new Error(`Video A '${params.video_a_id}' not found.`);
  if (!videoB) throw new Error(`Video B '${params.video_b_id}' not found.`);

  let timelineA: any[] = [];
  let timelineB: any[] = [];
  try {
    timelineA = JSON.parse(videoA.keyframe_timeline || '[]');
    timelineB = JSON.parse(videoB.keyframe_timeline || '[]');
  } catch (_) {}

  const statesA = new Set(timelineA.map((t: any) => t.state_id));
  const statesB = new Set(timelineB.map((t: any) => t.state_id));

  let common = 0;
  for (const s of statesA) {
    if (statesB.has(s)) common++;
  }

  const totalUnique = new Set([...statesA, ...statesB]).size;
  const similarityScore = totalUnique > 0 ? Math.round((common / totalUnique) * 100) / 100 : 1.0;

  let divergencePoint: any = undefined;
  const maxLen = Math.max(timelineA.length, timelineB.length);
  for (let i = 0; i < maxLen; i++) {
    const itemA = timelineA[i];
    const itemB = timelineB[i];
    if (!itemA || !itemB || itemA.state_id !== itemB.state_id) {
      divergencePoint = {
        timestamp_a_ms: itemA?.timestamp_ms ?? 0,
        timestamp_b_ms: itemB?.timestamp_ms ?? 0,
        state_a_id: itemA?.state_id,
        state_b_id: itemB?.state_id,
        reason: !itemA
          ? 'Video A ended earlier than Video B'
          : !itemB
            ? 'Video B ended earlier than Video A'
            : `Frame state mismatch at index ${i}`,
      };
      break;
    }
  }

  return {
    video_a_id: params.video_a_id,
    video_b_id: params.video_b_id,
    similarity_score: similarityScore,
    common_states_count: common,
    divergence_point: divergencePoint,
    timeline_a_length: timelineA.length,
    timeline_b_length: timelineB.length,
  };
}

export async function handleCreateEvidencePack(params: {
  keyframe_state_ids: string[];
  source_video_id?: string;
  linked_state_memory_nodes?: {
    blocker_ids?: string[];
    decision_ids?: string[];
    observation_ids?: string[];
    task_ids?: string[];
  };
}): Promise<EvidencePack> {
  const stateIds = params.keyframe_state_ids ?? [];
  const timestampsMs: number[] = [];
  const dhashes: string[] = [];
  const clipFingerprints: number[][] = [];
  const ocrSnippets: string[] = [];

  for (const sId of stateIds) {
    const st = await storage.getState(sId);
    if (st) {
      dhashes.push(st.dhash);
      if (st.timestamp_ms) timestampsMs.push(st.timestamp_ms);
      if (st.vector) clipFingerprints.push(st.vector);
      if (st.ocr_text) ocrSnippets.push(st.ocr_text);
    }
  }

  const rawPayload = JSON.stringify({
    source_video_id: params.source_video_id ?? '',
    keyframe_state_ids: stateIds,
    timestamps_ms: timestampsMs,
    dhashes,
    linked: params.linked_state_memory_nodes ?? {},
  });

  const payloadHash = crypto.createHash('sha256').update(rawPayload).digest('hex');
  const packId = `pack_${payloadHash.slice(0, 16)}`;

  const pack: EvidencePack = {
    id: packId,
    created_at: Date.now(),
    source_video_id: params.source_video_id,
    keyframe_state_ids: stateIds,
    timestamps_ms: timestampsMs,
    dhashes,
    clip_fingerprints: clipFingerprints,
    ocr_snippets: ocrSnippets,
    linked_state_memory_nodes: params.linked_state_memory_nodes ?? {},
    payload_hash: payloadHash,
  };

  await storage.saveEvidencePack(pack);
  return pack;
}

export function registerAllTools(server: McpServer): void {
  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 1: analyze_screenshot
  // Ingests a single screenshot OR a batch of screenshots (via `items` array).
  // Absorbs the former `batch_analyze_screenshots` tool.
  // ═══════════════════════════════════════════════════════════════════════════
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
        'Ingest screenshot(s) via base64 or file path, check the visual state cache, and return state details. ' +
        'On cache miss, generates perceptual hashes (dHash/aHash), CLIP embeddings, and persists a new visual state entry. ' +
        'Use this tool AFTER capturing a screenshot and BEFORE invoking vision LLMs to avoid redundant token spend. ' +
        'For batch ingestion, pass an `items` array instead of a single screenshot/file_path.',
      inputSchema: z.object({
        screenshot: z.string().optional().describe('Base64-encoded image string (single mode)'),
        file_path: z
          .string()
          .optional()
          .describe(
            'Absolute path to a local image file (single mode). Use instead of screenshot to avoid base64 overhead'
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
          .optional()
          .describe(
            'Batch mode: array of 1–20 screenshot items to ingest/analyze. When provided, screenshot/file_path params are ignored.'
          ),
      }),
    },
    async (params) => {
      try {
        const format = params.response_format ?? 'compact';
        const branch = params.git_branch ?? getCurrentBranch();

        // ── Batch mode ──────────────────────────────────────────────────────
        if (params.items && params.items.length > 0) {
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
                source_url: item.source_url ? redactUrl(item.source_url) : '',
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

              results.push(
                formatResponsePayload(
                  {
                    state_id: newId,
                    is_known: false,
                    match_type: 'new',
                    similarity_score: 0.0,
                    description: finalDesc,
                    source_url: item.source_url ? redactUrl(item.source_url) : undefined,
                    tags: item.tags,
                  },
                  format
                )
              );
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
                text: JSON.stringify({ batch_count: results.length, results }),
              },
            ],
          };
        }

        // ── Single mode ─────────────────────────────────────────────────────
        const imageB64 = await resolveImageInput(params.screenshot, params.file_path);

        const axTree = params.accessibility_tree
          ? compressAccessibilityTree(params.accessibility_tree)
          : undefined;

        const retrieval = await retrieveState({
          screenshot: imageB64,
          strategy: 'thorough',
          forceRefresh: params.force_refresh,
          gitBranch: branch,
          accessibilityTree: axTree,
        });

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
          source_url: params.source_url ? redactUrl(params.source_url) : '',
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 2: recall_memory
  // Pure read-only search — never writes to the database.
  // ═══════════════════════════════════════════════════════════════════════════
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
        'Search visual state memory by screenshot image, text query, or accessibility tree. ' +
        'Read-only — never creates or modifies states. Use analyze_screenshot to ingest new states.',
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 3: record_outcome
  // Logs UI action transitions. Also supports action_type 'blocker' to
  // generate a structured visual blocker payload (absorbs create_visual_blocker).
  // ═══════════════════════════════════════════════════════════════════════════
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
        'Log an action transition between two visual states and update transition statistics. ' +
        'Call this after every click/type/scroll/navigate action. ' +
        'When action_type is "blocker", generates a structured visual blocker payload for state-memory-mcp ' +
        'instead of recording a transition (from_state_id becomes the visual_state_id of the blocker).',
      inputSchema: z.object({
        from_state_id: z
          .string()
          .describe('Source state ID (or blocker visual_state_id when action_type is "blocker")'),
        to_state_id: z
          .string()
          .optional()
          .describe('Destination state ID (not required when action_type is "blocker")'),
        action: z
          .string()
          .describe('Action description (or blocker description when action_type is "blocker")'),
        action_type: z
          .enum(['click', 'type', 'navigate', 'scroll', 'custom', 'blocker'])
          .optional()
          .describe('Category of UI action. Use "blocker" to create a visual blocker payload.'),
        success: z
          .boolean()
          .optional()
          .describe('Whether action succeeded (default: true, ignored for blockers)'),
        duration_ms: z.number().optional().describe('Action duration in ms'),
        git_branch: z.string().optional().describe('Active git branch'),
        project: z
          .string()
          .optional()
          .describe('state-memory-mcp project name (only used when action_type is "blocker")'),
        response_format: z.enum(['compact', 'full']).optional(),
      }),
    },
    async (params) => {
      try {
        const format = params.response_format ?? 'compact';

        // ── Blocker mode (absorbs create_visual_blocker) ────────────────
        if (params.action_type === 'blocker') {
          const state = await storage.getStateAll(params.from_state_id);
          if (!state) {
            throw new Error(`Visual state with ID ${params.from_state_id} not found.`);
          }

          const project = params.project ?? '';
          const title = `Visual Blocker: ${params.action.slice(0, 80)}`;
          const result = {
            instruction:
              'Please execute state-memory-mcp:manage_nodes (action: "create") to log a blocker node, and state-memory-mcp:manage_edges (action: "link_visual") to establish a blocked_by_visual_state relationship.',
            mcp_tool_call: {
              server: 'state-memory-mcp',
              tool: 'manage_nodes',
              arguments: {
                action: 'create',
                project: project || undefined,
                type: 'blocker',
                title,
                status: 'active',
                metadata: {
                  vision_state_id: state.id,
                  vision_description: state.description,
                  source_url: state.source_url,
                  git_branch: state.git_branch,
                  bug_details: params.action,
                },
                tags: ['visual-regression', 'ui-bug'],
              },
            },
            link_tool_call: {
              server: 'state-memory-mcp',
              tool: 'manage_edges',
              arguments: {
                action: 'link_visual',
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
        }

        // ── Normal transition mode ──────────────────────────────────────
        if (!params.to_state_id) {
          throw new Error('to_state_id is required for non-blocker action types.');
        }

        const transition = await recordTransition({
          fromStateId: params.from_state_id,
          toStateId: params.to_state_id,
          action: params.action,
          actionType: params.action_type ?? 'custom',
          success: params.success ?? true,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 4: get_navigation_paths
  // ═══════════════════════════════════════════════════════════════════════════
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
        'Trace historical pathways from current state to a target state or state matching description via BFS over the transition graph.',
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 5: compare_states
  // Absorbs get_visual_diff (perceptual diff) and compare_video_trajectories
  // (video keyframe trajectory comparison) into one unified comparison tool.
  // ═══════════════════════════════════════════════════════════════════════════
  server.registerTool(
    'compare_states',
    {
      title: 'Compare Visual States or Video Trajectories',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Compare two visual states structurally (dHash, CLIP vector, JSON diff, layout delta) or two video trajectories ' +
        '(keyframe similarity, divergence point). Provide state_a_id/state_b_id for state comparison, or ' +
        'video_a_id/video_b_id for video trajectory comparison.',
      inputSchema: z.object({
        state_a_id: z.string().optional().describe('ID of visual state A (state comparison mode)'),
        state_b_id: z.string().optional().describe('ID of visual state B (state comparison mode)'),
        video_a_id: z.string().optional().describe('First video ID (video comparison mode)'),
        video_b_id: z.string().optional().describe('Second video ID (video comparison mode)'),
        response_format: z.enum(['compact', 'full']).optional(),
      }),
    },
    async (params) => {
      try {
        const format = params.response_format ?? 'compact';

        // ── Video trajectory comparison mode ────────────────────────────
        if (params.video_a_id && params.video_b_id) {
          const res = await handleCompareVideoTrajectories({
            video_a_id: params.video_a_id,
            video_b_id: params.video_b_id,
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
          };
        }

        // ── Visual state comparison mode ────────────────────────────────
        if (!params.state_a_id || !params.state_b_id) {
          throw new Error(
            'Provide either state_a_id + state_b_id (state comparison) or video_a_id + video_b_id (video comparison).'
          );
        }

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

        // Includes fields from former get_visual_diff
        const result = {
          state_a_id: params.state_a_id,
          state_b_id: params.state_b_id,
          hash_distance: dist,
          vector_similarity: similarity,
          has_layout_change: dist > 3,
          layout_delta_ratio: Math.round((dist / 64) * 100) / 100,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 6: get_session_context
  // ═══════════════════════════════════════════════════════════════════════════
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
        'Fetch aggregated visual context: recent states, frequently accessed states, active transitions, and memory stats. ' +
        'Call this at session start to orient before performing UI actions.',
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
          version: VERSION,
          mcp_name: 'io.github.putervision/vision-memory-mcp',
          metrics: metricsCollector.getStats(),
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 7: manage_snapshot
  // Consolidates save_visual_snapshot, diff_visual_snapshots, export_snapshot,
  // and restore_snapshot into one tool with an action discriminator.
  // ═══════════════════════════════════════════════════════════════════════════
  server.registerTool(
    'manage_snapshot',
    {
      title: 'Manage Visual Snapshots',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      description:
        'Manage visual memory snapshots. Actions: ' +
        '"save" creates a named checkpoint of current states; ' +
        '"diff" compares two snapshots for visual drift/regression; ' +
        '"export" serializes a snapshot to a portable JSON archive; ' +
        '"restore" imports a snapshot from an exported archive.',
      inputSchema: z.object({
        action: z
          .enum(['save', 'diff', 'export', 'restore'])
          .describe('Snapshot operation to perform'),
        name: z.string().optional().describe('Snapshot name (required for save, export)'),
        description: z
          .string()
          .optional()
          .describe('Notes describing snapshot context (used with save)'),
        state_memory_snapshot_id: z
          .string()
          .optional()
          .describe('Optional state-memory snapshot ID to correlate'),
        state_memory_milestone_id: z
          .string()
          .optional()
          .describe('Optional state-memory milestone ID to correlate'),
        snapshot_a_name: z.string().optional().describe('Base snapshot name (required for diff)'),
        snapshot_b_name: z
          .string()
          .optional()
          .describe('Target snapshot name to compare against (required for diff)'),
        archive_json: z
          .string()
          .optional()
          .describe('JSON string of exported SnapshotArchive (required for restore)'),
      }),
    },
    async (params) => {
      try {
        switch (params.action) {
          case 'save': {
            if (!params.name) throw new Error('name is required for save action.');
            const snap = await saveSnapshot(params.name, params.description, {
              state_memory_snapshot_id: params.state_memory_snapshot_id,
              state_memory_milestone_id: params.state_memory_milestone_id,
            });
            const stateCount = JSON.parse(snap.state_ids).length;
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    snapshot_id: snap.id,
                    name: snap.name,
                    state_count: stateCount,
                    state_memory_snapshot_id: snap.state_memory_snapshot_id,
                    state_memory_milestone_id: snap.state_memory_milestone_id,
                  }),
                },
              ],
            };
          }
          case 'diff': {
            if (!params.snapshot_a_name || !params.snapshot_b_name)
              throw new Error('snapshot_a_name and snapshot_b_name are required for diff action.');
            const diff = await diffSnapshots(params.snapshot_a_name, params.snapshot_b_name);
            return {
              content: [{ type: 'text', text: JSON.stringify(diff) }],
            };
          }
          case 'export': {
            if (!params.name) throw new Error('name is required for export action.');
            const archive = await exportSnapshot(params.name);
            return {
              content: [{ type: 'text', text: JSON.stringify(archive, null, 2) }],
            };
          }
          case 'restore': {
            if (!params.archive_json)
              throw new Error('archive_json is required for restore action.');
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
            const archiveData = SnapshotArchiveSchema.parse(rawParsed);
            const result = await restoreSnapshot(archiveData as any);
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }
          default:
            throw new Error(`Unknown snapshot action: ${params.action}`);
        }
      } catch (error: any) {
        logger.error('Error in manage_snapshot tool:', error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to manage snapshot: ${error.message}` }],
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 8: undo_visual_mutation (renamed from undo_last_visual_mutation)
  // ═══════════════════════════════════════════════════════════════════════════
  server.registerTool(
    'undo_visual_mutation',
    {
      title: 'Undo Visual Mutation',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
      description:
        'Revert the most recent visual state ingestion or transition edge addition on the current git branch.',
      inputSchema: z.object({
        type: z
          .enum(['state', 'transition', 'any'])
          .optional()
          .describe(
            'Type of mutation to revert (default: any — reverts the most recent of either)'
          ),
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
        logger.error('Error in undo_visual_mutation tool:', error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to undo mutation: ${error.message}` }],
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 9: predict_next_action
  // ═══════════════════════════════════════════════════════════════════════════
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
        'Predict the best next UI action from the current visual state based on transition success rates, ' +
        'goal alignment, and grounded AX tree element targeting.',
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 9: manage_visual_spec
  // Consolidates set_visual_spec, verify_visual_spec, and list_visual_specs.
  // ═══════════════════════════════════════════════════════════════════════════
  server.registerTool(
    'manage_visual_spec',
    {
      title: 'Manage Visual Specs',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      description:
        'Manage Visual Spec baseline contracts (Visual SDD). Actions: ' +
        '"set" registers a screenshot or design mockup as baseline, ' +
        '"verify" tests a live UI screenshot against a baseline, ' +
        '"list" returns all registered visual specs.',
      inputSchema: z.object({
        action: z
          .enum(['set', 'verify', 'list'])
          .describe("Action to perform: 'set', 'verify', or 'list'"),
        name: z.string().optional().describe("Spec name (required for 'set' or 'verify')"),
        spec_name: z.string().optional().describe("Alternative spec name alias (for 'verify')"),
        screenshot: z
          .string()
          .optional()
          .describe("Base64 encoded screenshot image (for 'set' or 'verify')"),
        file_path: z
          .string()
          .optional()
          .describe("Absolute file path to image (for 'set' or 'verify')"),
        tolerance: z
          .number()
          .optional()
          .describe("dHash Hamming distance tolerance threshold for 'verify' (default: 8)"),
        sdd_requirement_id: z
          .string()
          .optional()
          .describe("Optional state-memory-mcp SDD requirement node ID for 'verify'"),
      }),
    },
    async (params) => {
      try {
        if (params.action === 'set') {
          const specName = params.name || params.spec_name;
          if (!specName) throw new Error("Parameter 'name' is required for action 'set'.");
          const res = await setVisualSpec({
            name: specName,
            screenshot: params.screenshot,
            filePath: params.file_path,
          });
          return { content: [{ type: 'text', text: JSON.stringify(res) }] };
        }
        if (params.action === 'verify') {
          const specName = params.spec_name || params.name;
          if (!specName)
            throw new Error("Parameter 'spec_name' (or 'name') is required for action 'verify'.");
          const res = await verifyVisualSpec({
            specName,
            screenshot: params.screenshot,
            filePath: params.file_path,
            tolerance: params.tolerance,
            sddRequirementId: params.sdd_requirement_id,
          });
          return { content: [{ type: 'text', text: JSON.stringify(res) }] };
        }
        if (params.action === 'list') {
          const specs = await listVisualSpecs();
          return { content: [{ type: 'text', text: JSON.stringify(specs, null, 2) }] };
        }
        throw new Error(`Unknown visual spec action: ${(params as any).action}`);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to manage visual spec: ${error.message}` }],
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 13: export_trajectories
  // Consolidates export_visual_trajectories + export_joint_trajectories.
  // ═══════════════════════════════════════════════════════════════════════════
  server.registerTool(
    'export_trajectories',
    {
      title: 'Export Visual Trajectories',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Export visual state transition trajectories. ' +
        'Formats: "json" (raw state steps), "llava" / "qwen2_vl" (VLM fine-tuning datasets), ' +
        '"joint" (interleaved workflow events correlated by session/trace ID for state-memory-mcp).',
      inputSchema: z.object({
        format: z
          .enum(['json', 'llava', 'qwen2_vl', 'joint'])
          .optional()
          .describe('Export format (default: json)'),
        git_branch: z.string().optional().describe('Optional git branch filter'),
        trace_id: z
          .string()
          .optional()
          .describe('Optional trace ID / session ID filter (used with joint format)'),
        limit: z.number().optional().describe('Maximum number of states to export (default: 50)'),
      }),
    },
    async (params) => {
      try {
        const exportFmt = params.format || 'json';

        // ── Joint format (formerly export_joint_trajectories) ───────────
        if (exportFmt === 'joint') {
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
        }

        // ── Visual trajectory formats (json, llava, qwen2_vl) ──────────
        const branch = params.git_branch || getCurrentBranch();
        const states = await storage.listStatesAll(
          `git_branch = '${escapeSql(branch)}'`,
          params.limit || 50
        );

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
          content: [{ type: 'text', text: `Failed to export trajectories: ${error.message}` }],
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 10: manage_video
  // Consolidates ingest_video and query_video_memory (search + timeline).
  // ═══════════════════════════════════════════════════════════════════════════
  server.registerTool(
    'manage_video',
    {
      title: 'Manage Video Memory',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      description:
        'Manage WebM, MP4, and GIF video recordings in visual memory. Actions: ' +
        '"ingest" extracts keyframes, deduplicates, and builds sequence transitions; ' +
        '"search" queries stored video recordings by keyword/category/tags; ' +
        '"timeline" retrieves the chronological keyframe timeline for a specific video_id.',
      inputSchema: z.object({
        action: z
          .enum(['ingest', 'search', 'timeline'])
          .describe("Action to perform: 'ingest', 'search', or 'timeline'"),
        file_path: z
          .string()
          .optional()
          .describe("Absolute file path to video file (for 'ingest')"),
        video_data: z.string().optional().describe("Base64 encoded video buffer (for 'ingest')"),
        fps: z
          .number()
          .optional()
          .describe("Frame sampling rate per second for 'ingest' (default: 1.0)"),
        scene_threshold: z
          .number()
          .optional()
          .describe('Scene change detection threshold 0.0-1.0 (default: 0.2)'),
        category: z
          .string()
          .optional()
          .describe('Video category (e.g. playwright_test, bug_repro)'),
        tags: z.array(z.string()).optional().describe('Array of classification tags'),
        source_agent: z.string().optional().describe('Source agent identifier'),
        trace_id: z.string().optional().describe('Trace or session correlation ID'),
        query: z.string().optional().describe("Search query string (required for 'search')"),
        video_id: z
          .string()
          .optional()
          .describe("Video record ID to retrieve timeline (required for 'timeline')"),
        limit: z.number().optional().describe('Max search results (default: 20)'),
      }),
    },
    async (params) => {
      try {
        if (params.action === 'ingest') {
          const res = await handleIngestVideo({
            file_path: params.file_path,
            video_data: params.video_data,
            fps: params.fps,
            scene_threshold: params.scene_threshold,
            category: params.category,
            tags: params.tags,
            source_agent: params.source_agent,
            trace_id: params.trace_id,
          });
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
        }
        if (params.action === 'search') {
          if (!params.query) throw new Error("Parameter 'query' is required for action 'search'.");
          const res = await handleSearchVideoMemory({
            query: params.query,
            category: params.category,
            limit: params.limit,
          });
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
        }
        if (params.action === 'timeline') {
          if (!params.video_id)
            throw new Error("Parameter 'video_id' is required for action 'timeline'.");
          const res = await handleGetVideoTimeline({ video_id: params.video_id });
          return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
        }
        throw new Error(`Unknown video action: ${(params as any).action}`);
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to manage video: ${error.message}` }],
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 11: create_evidence_pack
  // ═══════════════════════════════════════════════════════════════════════════
  server.registerTool(
    'create_evidence_pack',
    {
      title: 'Create Evidence Pack',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      description:
        'Package keyframe IDs, dHash/CLIP fingerprints, OCR snippets, and linked state-memory node IDs ' +
        'into an immutable, cryptographically hashable evidence pack for compliance and audit trails.',
      inputSchema: z.object({
        keyframe_state_ids: z.array(z.string()).describe('Array of keyframe visual state IDs'),
        source_video_id: z.string().optional().describe('Optional source video ID'),
        linked_state_memory_nodes: z
          .object({
            blocker_ids: z.array(z.string()).optional(),
            decision_ids: z.array(z.string()).optional(),
            observation_ids: z.array(z.string()).optional(),
            task_ids: z.array(z.string()).optional(),
          })
          .optional()
          .describe('State memory node IDs linked to this visual evidence pack'),
      }),
    },
    async (params) => {
      try {
        const res = await handleCreateEvidencePack(params);
        const primaryTargetId =
          params.linked_state_memory_nodes?.task_ids?.[0] ||
          params.linked_state_memory_nodes?.decision_ids?.[0] ||
          params.linked_state_memory_nodes?.blocker_ids?.[0] ||
          params.linked_state_memory_nodes?.observation_ids?.[0];

        const stateMemoryToolCalls = {
          instruction:
            'Please execute state-memory-mcp:manage_nodes (action: "create", type: "artifact") to register this cryptographic visual evidence pack in your state graph ledger.',
          mcp_tool_call: {
            server: 'state-memory-mcp',
            tool: 'manage_nodes',
            arguments: {
              action: 'create',
              type: 'artifact',
              title: `Visual Evidence Pack: ${res.id}`,
              status: 'current',
              metadata: {
                evidence_pack_id: res.id,
                payload_hash: res.payload_hash,
                source_video_id: res.source_video_id,
                keyframe_count: res.keyframe_state_ids.length,
                created_at: res.created_at,
              },
              tags: ['evidence-pack', 'multimodal-proof', 'audit-trail'],
            },
          },
          ...(primaryTargetId
            ? {
                link_tool_call: {
                  server: 'state-memory-mcp',
                  tool: 'manage_edges',
                  arguments: {
                    action: 'add',
                    source_id: primaryTargetId,
                    target_id: 'NEW_ARTIFACT_ID_OR_EVIDENCE_PACK_ID',
                    type: 'produces',
                  },
                },
              }
            : {}),
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { ...res, state_memory_tool_calls: stateMemoryToolCalls },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to create evidence pack: ${error.message}` }],
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 14: forget_state
  // ═══════════════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Tool 15: wait_for_visual_state
  // ═══════════════════════════════════════════════════════════════════════════
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
        'Poll for a target visual state ID until it exists in memory or timeout occurs. ' +
        'Use this to avoid agent spin-loops when waiting for asynchronous screenshots.',
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Legacy Tool Compatibility Layer (v0.9 -> v1.0)
  // Activated when VISION_MEMORY_COMPAT=true
  // ═══════════════════════════════════════════════════════════════════════════
  if (process.env.VISION_MEMORY_COMPAT === 'true') {
    for (const [legacyName, mapping] of Object.entries(LEGACY_VISION_TOOL_MAP)) {
      server.registerTool(
        legacyName,
        {
          title: `[Deprecated] ${legacyName}`,
          annotations: {
            readOnlyHint: [
              'get_metrics',
              'get_version',
              'app_version',
              'get_video_timeline',
              'list_visual_specs',
              'diff_visual_snapshots',
              'search_video_memory',
            ].includes(legacyName),
            destructiveHint: false,
            openWorldHint: false,
          },
          description: `[DEPRECATED in vision-memory-mcp v1.0] Legacy alias for ${mapping.tool}. Please migrate to ${mapping.tool}.`,
          inputSchema: z.record(z.any()) as any,
        },
        async (args: any) => {
          const { tool, transformedArgs } = translateLegacyVisionCall(legacyName, args);
          const targetTool = (server as any)._registeredTools?.[tool];
          if (!targetTool) {
            return {
              isError: true,
              content: [
                { type: 'text', text: `Target tool handler not found for legacy tool: ${tool}` },
              ],
            };
          }
          return await targetTool.handler(transformedArgs);
        }
      );
    }
  }
}
