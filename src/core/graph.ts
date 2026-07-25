import { storage, transitionKey, escapeSql } from './storage.js';
import { getCurrentBranch } from './cache.js';
import { logger } from '../logger.js';
import { StateTransition, NavigationPath, NavigationStep } from '../types.js';

/**
 * Record a state transition with success/failure counters.
 */
export async function recordTransition(params: {
  fromStateId: string;
  toStateId: string;
  action: string;
  actionType?: string;
  success: boolean;
  durationMs?: number;
  notes?: string;
  traceId?: string;
}): Promise<StateTransition> {
  const branch = getCurrentBranch();
  const id = transitionKey(params.fromStateId, params.toStateId, params.action);
  const actionType = params.actionType ?? 'custom';
  const successVal = params.success ? 1 : 0;
  const duration = params.durationMs ?? 0;

  logger.debug(`Recording transition: ${id} (${params.fromStateId} -> ${params.toStateId})`);

  // Verify starting and target states exist in storage
  const fromState = await storage.getStateAll(params.fromStateId);
  if (!fromState) {
    throw new Error(`Starting state with ID "${params.fromStateId}" does not exist in storage.`);
  }
  const toState = await storage.getStateAll(params.toStateId);
  if (!toState) {
    throw new Error(`Target state with ID "${params.toStateId}" does not exist in storage.`);
  }

  // Check if transition already exists to update counters
  const existing = await storage.getTransition(id);

  let successCount = successVal;
  let failureCount = params.success ? 0 : 1;
  let avgDuration = duration;

  if (existing) {
    successCount = existing.success_count + successVal;
    failureCount = existing.failure_count + (params.success ? 0 : 1);
    const totalCount = successCount + failureCount;
    avgDuration = Math.round((existing.duration_ms * (totalCount - 1) + duration) / totalCount);
  }

  const transition: StateTransition = {
    id,
    from_state_id: params.fromStateId,
    to_state_id: params.toStateId,
    action: params.action,
    action_type: actionType,
    success: successVal,
    success_count: successCount,
    failure_count: failureCount,
    duration_ms: avgDuration,
    last_traversed: Date.now(),
    git_branch: branch,
    metadata: JSON.stringify({
      notes: params.notes ?? '',
      trace_id: params.traceId ?? '',
    }),
  };

  await storage.addTransition(transition);
  return transition;
}

/**
 * BFS path finding through explored UI states.
 */
export async function findNavigationPaths(params: {
  fromStateId: string;
  toStateId?: string;
  toDescription?: string;
  maxHops?: number;
}): Promise<{ paths: NavigationPath[]; failedPaths: any[] }> {
  const maxHops = params.maxHops ?? 5;
  const branch = getCurrentBranch();

  // Find target state IDs
  let targetStateIds: string[] = [];
  if (params.toStateId) {
    targetStateIds.push(params.toStateId);
  } else if (params.toDescription) {
    // Perform semantic search to find candidate states matching description
    logger.debug(`Semantic resolution of target description: "${params.toDescription}"`);
    try {
      const { retrieveState } = await import('./retrieval.js');
      const searchResult = await retrieveState({
        query: params.toDescription,
        limit: 3,
        strategy: 'semantic',
      });
      if (searchResult.state_id) {
        targetStateIds.push(searchResult.state_id);
      }
      if (searchResult.related_states) {
        searchResult.related_states.forEach((s) => targetStateIds.push(s.id));
      }
    } catch (err) {
      logger.error('Failed to resolve target description semantically:', err);
    }
  }

  if (targetStateIds.length === 0) {
    return { paths: [], failedPaths: [] };
  }

  // Load all transitions on active branch
  const transitions = await storage.listTransitionsAll(`git_branch = '${escapeSql(branch)}'`, 2000);

  // Build adjacency map
  const adj: Record<string, StateTransition[]> = {};
  for (const t of transitions) {
    if (!adj[t.from_state_id]) {
      adj[t.from_state_id] = [];
    }
    adj[t.from_state_id].push(t);
  }

  // Pre-populate state descriptions in batch to prevent N+1 database queries during BFS enrichment
  const stateCache = new Map<string, string>();
  const branchStates = await storage.listStatesAll(`git_branch = '${escapeSql(branch)}'`, 5000);
  for (const s of branchStates) {
    stateCache.set(s.id, s.description);
  }

  const getStateDesc = async (id: string): Promise<string> => {
    if (stateCache.has(id)) return stateCache.get(id)!;
    const s = await storage.getStateAll(id);
    const desc = s?.description ?? 'Unknown State';
    stateCache.set(id, desc);
    return desc;
  };

  const queue: Array<{
    currentId: string;
    path: string[];
    steps: Array<{
      state_id: string;
      action: string;
      success_rate: number;
      duration_ms: number;
    }>;
  }> = [{ currentId: params.fromStateId, path: [params.fromStateId], steps: [] }];

  const successfulPaths: NavigationPath[] = [];
  const failedPaths: any[] = [];

  while (queue.length > 0) {
    const curr = queue.shift()!;

    // Check if we reached target
    if (targetStateIds.includes(curr.currentId)) {
      // Build final NavigationStep list (enriching with descriptions)
      const enrichedSteps: NavigationStep[] = [];
      let totalSuccessRate = 1.0;
      let totalDuration = 0;

      for (const step of curr.steps) {
        const desc = await getStateDesc(step.state_id);
        enrichedSteps.push({
          state_id: step.state_id,
          description: desc,
          action: step.action,
          success_rate: step.success_rate,
        });
        totalSuccessRate *= step.success_rate;
        totalDuration += step.duration_ms;
      }

      successfulPaths.push({
        steps: enrichedSteps,
        total_success_rate: Math.round(totalSuccessRate * 100) / 100,
        avg_duration_ms: totalDuration,
      });

      continue;
    }

    // Stop traversing if path exceeds maxHops
    if (curr.path.length > maxHops) {
      continue;
    }

    const nextEdges = adj[curr.currentId] ?? [];
    for (const edge of nextEdges) {
      // Prevent loops
      if (curr.path.includes(edge.to_state_id)) {
        continue;
      }

      const totalAttempts = edge.success_count + edge.failure_count;
      const successRate = totalAttempts > 0 ? edge.success_count / totalAttempts : 1.0;

      // Handle low-success paths (log as failed paths if success rate < 0.5)
      if (successRate < 0.5) {
        failedPaths.push({
          steps: [
            ...curr.steps,
            {
              state_id: edge.from_state_id,
              action: edge.action,
              success_rate: successRate,
              duration_ms: edge.duration_ms,
            },
          ],
          failure_point: edge.to_state_id,
          error: `Low success rate: ${Math.round(successRate * 100)}%`,
        });
      }

      queue.push({
        currentId: edge.to_state_id,
        path: [...curr.path, edge.to_state_id],
        steps: [
          ...curr.steps,
          {
            state_id: edge.from_state_id,
            action: edge.action,
            success_rate: successRate,
            duration_ms: edge.duration_ms,
          },
        ],
      });
    }
  }

  // Sort paths: highest success rate first, then shortest duration
  successfulPaths.sort((a, b) => {
    if (b.total_success_rate !== a.total_success_rate) {
      return b.total_success_rate - a.total_success_rate;
    }
    return a.avg_duration_ms - b.avg_duration_ms;
  });

  return {
    paths: successfulPaths,
    failedPaths,
  };
}
