import crypto from 'crypto';
import { processImage } from './image-pipeline.js';
import { calculateDHash, calculateAHash, hammingDistance } from './hash.js';
import { embeddings } from './embeddings.js';
import {
  ExtractedFrame,
  KeyframeTimelineEntry,
  StateTransition,
  VideoCategorizationResult,
  VideoIngestOptions,
  VisualState,
} from '../types.js';
import { logger } from '../logger.js';

/**
 * Categorizes and deduplicates extracted video frames, generating visual states,
 * perceptual dHash clusters, CLIP embeddings, and transition sequence graphs.
 */
export async function categorizeVideoFrames(
  frames: ExtractedFrame[],
  options: VideoIngestOptions = {},
  sourceFile: string = 'video.mp4'
): Promise<VideoCategorizationResult> {
  const states: VisualState[] = [];
  const transitions: StateTransition[] = [];
  const timeline: KeyframeTimelineEntry[] = [];

  let previousStateId: string | null = null;
  let previousDHash: string | null = null;
  let previousTimestamp = 0;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    let processed;
    try {
      processed = await processImage(frame.buffer);
    } catch (err) {
      logger.warn(`Skipping unprocessable frame index ${frame.frame_index}:`, err);
      continue;
    }

    const dhash = await calculateDHash(processed.normalizedBuffer);
    const ahash = await calculateAHash(processed.normalizedBuffer);

    // Check dHash deduplication fast-path against previous frame
    let currentStateId: string;
    let isNewState = true;

    if (previousDHash && hammingDistance(dhash, previousDHash) <= 3 && previousStateId) {
      // Reuse existing state node for contiguous unchanged/near-identical frames
      currentStateId = previousStateId;
      isNewState = false;
      logger.debug(
        `Frame ${frame.frame_index} dHash match (dist <= 3). Reusing state ${currentStateId}`
      );
    } else {
      // Generate CLIP vector embedding for new unique visual state
      let vector: number[] = [];
      try {
        vector = await embeddings.generateImageEmbedding(processed.normalizedBuffer);
      } catch (err) {
        logger.warn(
          'Failed to generate CLIP embedding for frame, using empty vector fallback:',
          err
        );
      }

      currentStateId = crypto.randomUUID();

      const now = Date.now();
      const categoryTag = options.category ?? 'video_ingest';

      const newState: VisualState = {
        id: currentStateId,
        dhash,
        ahash,
        vector,
        description: `Video frame ${frame.frame_index} [${options.category ?? 'general'}] at ${Math.round(frame.timestamp_ms / 1000)}s from ${sourceFile}`,
        structured_data: JSON.stringify({
          source_video: sourceFile,
          frame_index: frame.frame_index,
          timestamp_ms: frame.timestamp_ms,
          category: options.category ?? 'general',
        }),
        accessibility_tree: JSON.stringify({
          role: 'video_frame',
          timestamp_ms: frame.timestamp_ms,
        }),
        process_name: 'video-ingest-pipeline',
        window_title: `Frame ${frame.frame_index} @ ${frame.timestamp_ms}ms`,
        thumbnail: processed.thumbnail,
        original_dimensions: JSON.stringify({
          width: processed.originalWidth,
          height: processed.originalHeight,
        }),
        source_url: sourceFile,
        source_agent: options.source_agent ?? 'video_pipeline',
        trace_id: options.trace_id ?? '',
        git_branch: 'main',
        tags: JSON.stringify(options.tags ?? [categoryTag, 'video_frame']),
        importance_score: 0.7,
        created_at: now,
        last_accessed: now,
        access_count: 1,
        ttl: 0,
      };

      states.push(newState);
      previousDHash = dhash;
    }

    // Build timeline entry
    timeline.push({
      frame_index: frame.frame_index,
      timestamp_ms: frame.timestamp_ms,
      state_id: currentStateId,
      dhash,
      is_keyframe: isNewState,
    });

    // Create StateTransition edge between consecutive frames if state changed
    if (previousStateId && previousStateId !== currentStateId) {
      const durationMs = frame.timestamp_ms - previousTimestamp;
      const transitionId = `${previousStateId}:${currentStateId}:video_step`;

      transitions.push({
        id: transitionId,
        from_state_id: previousStateId,
        to_state_id: currentStateId,
        action: `Video timeline step from t=${previousTimestamp}ms to t=${frame.timestamp_ms}ms`,
        action_type: 'navigate',
        success: 1,
        success_count: 1,
        failure_count: 0,
        duration_ms: Math.max(1, durationMs),
        last_traversed: Date.now(),
        git_branch: 'main',
        metadata: JSON.stringify({
          source_video: sourceFile,
          from_timestamp_ms: previousTimestamp,
          to_timestamp_ms: frame.timestamp_ms,
        }),
      });
    }

    previousStateId = currentStateId;
    previousTimestamp = frame.timestamp_ms;
  }

  const uniqueStatesCount = states.length;
  const summaryDescription = `Ingested ${frames.length} frames from ${sourceFile}, resulting in ${uniqueStatesCount} unique visual state nodes and ${transitions.length} temporal transitions.`;

  return {
    states,
    transitions,
    timeline,
    summary_description: summaryDescription,
    unique_states_count: uniqueStatesCount,
  };
}
