import { config } from '../config.js';
import { logger } from '../logger.js';
import { storage, escapeSql } from './storage.js';
import { embeddings } from './embeddings.js';
import { memoryCache, getCurrentBranch } from './cache.js';
import { hammingDistance } from './hash.js';
import { processImage, ProcessedImage } from './image-pipeline.js';
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

function compareAccessTrees(tree1?: string, tree2?: string): boolean {
  if (!tree1 || !tree2) return true; // If one is missing, assume they match or ignore AX check
  const trimmed1 = tree1.trim();
  const trimmed2 = tree2.trim();
  if (trimmed1 === '' || trimmed1 === '{}' || trimmed2 === '' || trimmed2 === '{}') {
    return true; // Neutral match if either state lacks accessibility tree details
  }
  try {
    const t1 = JSON.stringify(JSON.parse(trimmed1));
    const t2 = JSON.stringify(JSON.parse(trimmed2));
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
      // Compute hashes
      const { calculateDHash, calculateAHash } = await import('./hash.js');
      dhash = await calculateDHash(imageBuffer);
      ahash = await calculateAHash(imageBuffer);
      logger.debug(`Computed hashes: dhash=${dhash}, ahash=${ahash}`);
    } catch (error) {
      logger.error('Failed to process incoming screenshot:', error);
      throw error;
    }
  }

  // Handle Text-Only Query (requires L3 vector search on description/structured data)
  if (!params.screenshot && params.query) {
    logger.debug(`Text-only query: "${params.query}"`);
    const queryVector = await embeddings.generateTextEmbedding(params.query);
    // Search database
    const branchFilter = `git_branch = '${escapeSql(branch)}'`;
    let matches = await storage.searchVector(queryVector, limit, branchFilter);
    // If no matches on current branch, fallback to other branches
    if (matches.length === 0) {
      matches = await storage.searchVector(queryVector, limit);
    }

    const related = matches.map((m) => ({
      id: m.id,
      description: m.description,
      similarity: distanceToSimilarity((m as any)._distance ?? 2),
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
      // Retrieve states for hash comparison
      // Filter by active branch first, then fallback to others
      let allStates = await storage.listStates(`git_branch = '${escapeSql(branch)}'`, 1000);
      if (allStates.length === 0) {
        allStates = await storage.listStates(undefined, 1000);
      }

      let bestMatch: VisualState | null = null;
      let minDistance = 64;

      for (const state of allStates) {
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
          memoryCache.set(bestMatch, config.TTL_DEFAULT_MS);

          return {
            state_id: bestMatch.id,
            is_known: true,
            match_type: 'exact_hash',
            similarity_score: 1 - minDistance / 64,
            description: bestMatch.description,
            structured_data: bestMatch.structured_data,
            accessibility_tree: bestMatch.accessibility_tree,
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
      let vectorMatches = await storage.searchVector(vector, limit, branchFilter);
      if (vectorMatches.length === 0) {
        vectorMatches = await storage.searchVector(vector, limit);
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
    // This will be called from analyze_screenshot tool, but we register that it missed L1-L3
  }

  return {
    state_id: '',
    is_known: false,
    match_type: 'new',
    similarity_score: 0.0,
    description: '',
  };
}
