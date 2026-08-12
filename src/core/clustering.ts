import { VisualState } from '../types.js';
import { cosineSimilarity } from './embeddings.js';

export interface ScreenCluster {
  template_id: string;
  template_name: string;
  centroid_vector: number[];
  state_ids: string[];
  dhash_prefix?: string;
}

/**
 * Clusters visual states using vector similarity into abstract PageTemplates.
 * Uses dHash prefix bucketing to prune candidate cluster vector comparisons.
 */
export function clusterVisualStates(
  states: VisualState[],
  similarityThreshold = 0.85
): ScreenCluster[] {
  const clusters: ScreenCluster[] = [];

  for (const state of states) {
    if (!state.vector || state.vector.length === 0) continue;

    let assigned = false;
    const statePrefix = state.dhash ? state.dhash.slice(0, 16) : null;

    for (const cluster of clusters) {
      // Optional fast-path: if both have dHash prefixes and prefixes differ significantly, skip similarity
      if (statePrefix && cluster.dhash_prefix && statePrefix !== cluster.dhash_prefix) {
        let diffBits = 0;
        for (let i = 0; i < 16; i++) {
          if (statePrefix[i] !== cluster.dhash_prefix[i]) diffBits++;
          if (diffBits > 6) break;
        }
        if (diffBits > 6) continue;
      }

      const similarity = cosineSimilarity(state.vector, cluster.centroid_vector);
      if (similarity >= similarityThreshold) {
        cluster.state_ids.push(state.id);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      const templateId = `template_${state.id.slice(0, 8)}`;
      clusters.push({
        template_id: templateId,
        template_name: state.description
          ? `Template: ${state.description.slice(0, 30)}`
          : 'Screen Template',
        centroid_vector: [...state.vector],
        state_ids: [state.id],
        dhash_prefix: statePrefix ?? undefined,
      });
    }
  }

  return clusters;
}
