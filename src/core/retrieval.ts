import { config } from '../config.js';
import { logger } from '../logger.js';
import { storage, escapeSql } from './storage.js';
import { embeddings } from './embeddings.js';
import { memoryCache, getCurrentBranch } from './cache.js';
import { hammingDistance } from './hash.js';
import { processImage, ProcessedImage } from './image-pipeline.js';
import { metricsCollector } from './metrics.js';
import { parseAXTreeToGroundedElements } from './grounding.js';
import { VisualState, RetrievalStrategy, RetrievalResult } from '../types.js';

export function compressAccessibilityTree(treeJson: string): string {
  if (!treeJson || treeJson.trim() === '' || treeJson === '{}') return '{}';
  try {
    const parsed = JSON.parse(treeJson);
    const interactiveRoles = new Set([
      'button',
      'link',
      'textbox',
      'checkbox',
      'combobox',
      'menuitem',
      'tab',
      'heading',
      'form',
    ]);

    function filterNode(node: any): any {
      if (!node || typeof node !== 'object') return null;
      if (Array.isArray(node)) {
        const filteredArray = node.map(filterNode).filter(Boolean);
        return filteredArray.length > 0 ? filteredArray : null;
      }

      const role = (node.role || node.type || '').toLowerCase();
      const children = node.children ? filterNode(node.children) : undefined;
      const isInteractive = interactiveRoles.has(role);

      if (isInteractive || (children && (Array.isArray(children) ? children.length > 0 : true))) {
        const cleanNode: any = {};
        if (node.role) cleanNode.role = node.role;
        if (node.name || node.label || node.text)
          cleanNode.name = node.name || node.label || node.text;
        if (node.value !== undefined) cleanNode.value = node.value;
        if (node.disabled) cleanNode.disabled = node.disabled;
        if (node.checked !== undefined) cleanNode.checked = node.checked;
        if (children && children.length > 0) cleanNode.children = children;
        return cleanNode;
      }
      return null;
    }

    const compressed = filterNode(parsed);
    return compressed ? JSON.stringify(compressed) : '{}';
  } catch {
    return treeJson;
  }
}

function canonicalizeJson(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(canonicalizeJson);
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const res: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    res[k] = canonicalizeJson((obj as Record<string, unknown>)[k]);
  }
  return res;
}

function compareAccessTrees(tree1?: string, tree2?: string): boolean {
  if (!tree1 || !tree2) return true; // If one is missing, assume they match or ignore AX check
  const trimmed1 = tree1.trim();
  const trimmed2 = tree2.trim();
  if (trimmed1 === '' || trimmed1 === '{}' || trimmed2 === '' || trimmed2 === '{}') {
    return true; // Neutral match if either state lacks accessibility tree details
  }
  try {
    const t1 = JSON.stringify(canonicalizeJson(JSON.parse(trimmed1)));
    const t2 = JSON.stringify(canonicalizeJson(JSON.parse(trimmed2)));
    return t1 === t2;
  } catch {
    return trimmed1 === trimmed2;
  }
}

function distanceToSimilarity(dist: number): number {
  const similarity = 1 - dist / 2;
  return Math.max(0, Math.min(1, similarity));
}

/**
 * Tiered Retrieval Engine implementation.
 */
export async function retrieveState(params: {
  screenshot?: string | Buffer;
  query?: string;
  strategy?: RetrievalStrategy;
  limit?: number;
  forceRefresh?: boolean;
  gitBranch?: string;
  accessibilityTree?: string;
}): Promise<RetrievalResult> {
  const strategy = params.strategy ?? 'thorough';
  const limit = params.limit ?? 3;
  const forceRefresh = params.forceRefresh ?? false;
  const branch = params.gitBranch ?? getCurrentBranch();
  const accessibilityTree = params.accessibilityTree;

  logger.debug(
    `Retrieval request: strategy=${strategy}, branch=${branch}, forceRefresh=${forceRefresh}`
  );

  // 1. Process screenshot if provided
  let processed: ProcessedImage | null = null;
  let dhash = '';
  let ahash = '';
  let imageBuffer: Buffer | null = null;

  if (params.screenshot) {
    try {
      processed = await processImage(params.screenshot);
      imageBuffer = processed.normalizedBuffer;
    } catch (error) {
      logger.error('Failed to process incoming screenshot:', error);
      throw error;
    }
  }

  // Handle Text-Only Query (requires L3 vector search on description/structured data)
  if (!params.screenshot && params.query) {
    logger.debug(`Text-only query: "${params.query}"`);
    const queryVector = await embeddings.generateTextEmbedding(params.query);
    // Search database across primary and sub-directory databases
    const branchFilter = `git_branch = '${escapeSql(branch)}'`;
    let matches = await storage.searchVectorAll(queryVector, limit, branchFilter);
    // If no matches on current branch, fallback to other branches
    if (matches.length === 0) {
      matches = await storage.searchVectorAll(queryVector, limit);
    }

    const related = matches.map((m) => ({
      id: m.id,
      description: m.description,
      similarity: distanceToSimilarity((m as any)._distance ?? 2),
      source_subdir: (m as any).source_subdir,
    }));

    if (related.length > 0) {
      const topMatch = matches[0];
      const similarity = distanceToSimilarity((topMatch as any)._distance ?? 2);
      return {
        state_id: topMatch.id,
        is_known: similarity >= 0.85,
        match_type: 'vector_similar',
        similarity_score: similarity,
        description: topMatch.description,
        structured_data: topMatch.structured_data,
        accessibility_tree: topMatch.accessibility_tree,
        tags: JSON.parse(topMatch.tags || '[]'),
        source_url: topMatch.source_url,
        related_states: related.slice(1),
      };
    }

    return {
      state_id: '',
      is_known: false,
      match_type: 'new',
      similarity_score: 0.0,
      description: '',
    };
  }

  // If we have an image, run tiered retrieval
  if (processed && imageBuffer) {
    // === L1/L2: Hash Scanning (Fast Paths) ===
    if (!forceRefresh && strategy !== 'semantic') {
      // Lazy computation of perceptual hashes for L1/L2 match
      const { calculateDHash, calculateAHash } = await import('./hash.js');
      dhash = await calculateDHash(imageBuffer);
      ahash = await calculateAHash(imageBuffer);
      logger.debug(`Computed hashes lazily: dhash=${dhash}, ahash=${ahash}`);

      // Retrieve state hashes across primary and sub-directory databases (lightweight projection)
      let allStateHashes = await storage.listStateHashesAll(
        `git_branch = '${escapeSql(branch)}'`,
        1000
      );
      if (allStateHashes.length === 0) {
        allStateHashes = await storage.listStateHashesAll(undefined, 1000);
      }

      let bestMatch: (typeof allStateHashes)[0] | null = null;
      let minDistance = 64;

      for (const state of allStateHashes) {
        const dist = hammingDistance(dhash, state.dhash);
        if (dist < minDistance) {
          minDistance = dist;
          bestMatch = state;
        }
      }

      logger.debug(`Hamming match: minDistance=${minDistance}, bestState=${bestMatch?.id}`);

      // Check thresholds
      if (bestMatch && minDistance <= config.HASH_SIMILAR_THRESHOLD) {
        const isExact = minDistance <= config.HASH_EXACT_THRESHOLD;

        // Validate with AX Tree if provided
        const axMatches = compareAccessTrees(bestMatch.accessibility_tree, accessibilityTree);

        if (isExact && axMatches) {
          // L1 Check: Is it in the in-memory cache?
          const cached = memoryCache.get(bestMatch.id, branch);
          const matchType = cached ? 'exact_hash' : 'near_hash'; // count as exact if matches

          logger.info(
            `L1/L2 Cache Hit: id=${bestMatch.id}, matchType=${matchType}, distance=${minDistance}`
          );

          // Update access stats in DB asynchronously
          storage
            .updateState(bestMatch.id, {
              last_accessed: Date.now(),
              access_count: bestMatch.access_count + 1,
            })
            .catch((err) => logger.error('Failed to update state stats:', err));

          // Save back into cache to refresh TTL
          memoryCache.set(bestMatch as unknown as VisualState, config.TTL_DEFAULT_MS);
          const score = 1 - minDistance / 64;
          metricsCollector.recordQuery(cached ? 'l1' : 'l2', score);

          return {
            state_id: bestMatch.id,
            is_known: true,
            match_type: 'exact_hash',
            similarity_score: score,
            description: bestMatch.description,
            structured_data: bestMatch.structured_data,
            accessibility_tree: bestMatch.accessibility_tree,
            grounded_elements: parseAXTreeToGroundedElements(bestMatch.accessibility_tree),
            ocr_text: (bestMatch as any).ocr_text,
            tags: JSON.parse(bestMatch.tags || '[]'),
            source_url: bestMatch.source_url,
          };
        } else if (!axMatches) {
          logger.warn(
            `AX tree mismatch detected for hash hit (id=${bestMatch.id}). Invalidating exact match.`
          );
        }
      }
    }

    // === L3: CLIP Vector Search ===
    if (strategy !== 'fast') {
      const vector = await embeddings.generateImageEmbedding(imageBuffer);
      const branchFilter = `git_branch = '${escapeSql(branch)}'`;
      let vectorMatches = await storage.searchVectorAll(vector, limit, branchFilter);
      if (vectorMatches.length === 0) {
        vectorMatches = await storage.searchVectorAll(vector, limit);
      }

      if (vectorMatches.length > 0) {
        const topMatch = vectorMatches[0];
        const distance = (topMatch as any)._distance ?? 2;
        const similarity = distanceToSimilarity(distance);

        logger.debug(`CLIP Search Top Match: id=${topMatch.id}, similarity=${similarity}`);

        const related = vectorMatches.map((m) => ({
          id: m.id,
          description: m.description,
          similarity: distanceToSimilarity((m as any)._distance ?? 2),
        }));

        if (similarity >= 0.85 && !forceRefresh) {
          logger.info(`L3 Vector Hit: id=${topMatch.id}, similarity=${similarity.toFixed(4)}`);
          metricsCollector.recordQuery('l3', similarity);

          // Update stats
          storage
            .updateState(topMatch.id, {
              last_accessed: Date.now(),
              access_count: topMatch.access_count + 1,
            })
            .catch((err) => logger.error('Failed to update state stats:', err));

          return {
            state_id: topMatch.id,
            is_known: true,
            match_type: 'vector_similar',
            similarity_score: similarity,
            description: topMatch.description,
            structured_data: topMatch.structured_data,
            accessibility_tree: topMatch.accessibility_tree,
            tags: JSON.parse(topMatch.tags || '[]'),
            source_url: topMatch.source_url,
            related_states: related.slice(1),
          };
        }

        // Return new state with related candidates
        metricsCollector.recordQuery('miss', similarity);
        return {
          state_id: '',
          is_known: false,
          match_type: 'new',
          similarity_score: similarity,
          description: '',
          related_states: related,
        };
      }
    }
  }

  // L4: Fallback to Vision LLM if enabled (will be implemented in analyzer.ts)
  if (config.VISION_MODEL_ENABLED && strategy === 'thorough') {
    logger.info('L4 Vision LLM fallback analysis triggered...');
    metricsCollector.recordQuery('l4', 0.0);
  } else {
    metricsCollector.recordQuery('miss', 0.0);
  }

  return {
    state_id: '',
    is_known: false,
    match_type: 'new',
    similarity_score: 0.0,
    description: '',
  };
}
