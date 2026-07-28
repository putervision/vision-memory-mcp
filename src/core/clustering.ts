import { VisualState } from '../types.js';
import { cosineSimilarity } from './embeddings.js';

export interface ScreenCluster {
  template_id: string;
  template_name: string;
  centroid_vector: number[];
  state_ids: string[];
}

/**
 * Clusters visual states using vector similarity into abstract PageTemplates.
 */
export function clusterVisualStates(
  states: VisualState[],
  similarityThreshold = 0.85
): ScreenCluster[] {
  const clusters: ScreenCluster[] = [];

  for (const state of states) {
    if (!state.vector || state.vector.length === 0) continue;

    let assigned = false;
    for (const cluster of clusters) {
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
      });
    }
  }

  return clusters;
}
