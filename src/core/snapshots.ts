import crypto from 'crypto';
import { storage, escapeSql } from './storage.js';
import { cosineSimilarity } from './embeddings.js';
import { getCurrentBranch } from './cache.js';
import { logger } from '../logger.js';
import { hammingDistance } from './hash.js';
import { VisualSnapshot, VisualState } from '../types.js';

/**
 * Save current visual states as a named checkpoint snapshot.
 */
export async function saveSnapshot(name: string, description?: string): Promise<VisualSnapshot> {
  const branch = getCurrentBranch();
  logger.info(`Saving visual snapshot: "${name}" on branch "${branch}"`);

  const existing = await storage.getSnapshotAll(name);
  if (existing) {
    throw new Error(`Snapshot with name "${name}" already exists.`);
  }

  // Fetch all visual states on the current branch
  const states = await storage.listStatesAll(`git_branch = '${escapeSql(branch)}'`, 10000);
  const stateIds = states.map((s) => s.id);

  const snapshot: VisualSnapshot = {
    id: crypto.randomUUID(),
    name,
    description: description ?? '',
    git_branch: branch,
    created_at: Date.now(),
    state_ids: JSON.stringify(stateIds),
  };

  await storage.addSnapshot(snapshot);
  return snapshot;
}

export interface SnapshotDiffResult {
  added_states: Array<{ id: string; description: string; source_url?: string }>;
  removed_states: Array<{
    id: string;
    description: string;
    source_url?: string;
  }>;
  modified_states: Array<{
    id: string;
    description: string;
    hash_distance: number;
    vector_similarity: number;
  }>;
}

/**
 * Diff two visual snapshots by name.
 */
export async function diffSnapshots(nameA: string, nameB: string): Promise<SnapshotDiffResult> {
  logger.info(`Diffing snapshots: "${nameA}" vs "${nameB}"`);

  const snapA = await storage.getSnapshotAll(nameA);
  const snapB = await storage.getSnapshotAll(nameB);

  if (!snapA) throw new Error(`Snapshot "${nameA}" not found.`);
  if (!snapB) throw new Error(`Snapshot "${nameB}" not found.`);

  const idsA: string[] = JSON.parse(snapA.state_ids);
  const idsB: string[] = JSON.parse(snapB.state_ids);

  // Fetch all states for both snapshots
  const statesA: VisualState[] = [];
  for (const id of idsA) {
    const s = await storage.getStateAll(id);
    if (s) statesA.push(s);
  }

  const statesB: VisualState[] = [];
  for (const id of idsB) {
    const s = await storage.getStateAll(id);
    if (s) statesB.push(s);
  }

  const added: SnapshotDiffResult['added_states'] = [];
  const removed: SnapshotDiffResult['removed_states'] = [];
  const modified: SnapshotDiffResult['modified_states'] = [];

  // Match states by ID first.
  // If a state exists in both but has different dhash, it is modified.
  const statesAMap = new Map(statesA.map((s) => [s.id, s]));
  const statesBMap = new Map(statesB.map((s) => [s.id, s]));

  // Also build mapping by description/source_url to detect visual drift on the same screen (renamed or re-ingested under different ID)
  const descAMap = new Map(statesA.map((s) => [s.description + '|' + (s.source_url || ''), s]));
  const descBMap = new Map(statesB.map((s) => [s.description + '|' + (s.source_url || ''), s]));

  // 1. Process deletions and modifications
  for (const stateA of statesA) {
    const stateBById = statesBMap.get(stateA.id);

    if (stateBById) {
      // Check if visual properties changed
      const dist = hammingDistance(stateA.dhash, stateBById.dhash);
      const similarity = cosineSimilarity(stateA.vector, stateBById.vector);
      if (dist > 0 || similarity < 0.999) {
        modified.push({
          id: stateA.id,
          description: stateA.description,
          hash_distance: dist,
          vector_similarity: similarity,
        });
      }
    } else {
      // Not found by ID. Check if found by description (visual drift)
      const key = stateA.description + '|' + (stateA.source_url || '');
      const stateBByDesc = descBMap.get(key);

      if (stateBByDesc) {
        const dist = hammingDistance(stateA.dhash, stateBByDesc.dhash);
        const similarity = cosineSimilarity(stateA.vector, stateBByDesc.vector);
        if (dist > 0 || similarity < 0.999) {
          modified.push({
            id: stateA.id,
            description: stateA.description,
            hash_distance: dist,
            vector_similarity: similarity,
          });
        }
      } else {
        removed.push({
          id: stateA.id,
          description: stateA.description,
          source_url: stateA.source_url,
        });
      }
    }
  }

  // 2. Process additions
  for (const stateB of statesB) {
    const stateAById = statesAMap.get(stateB.id);
    const key = stateB.description + '|' + (stateB.source_url || '');
    const stateAByDesc = descAMap.get(key);

    if (!stateAById && !stateAByDesc) {
      added.push({
        id: stateB.id,
        description: stateB.description,
        source_url: stateB.source_url,
      });
    }
  }

  return {
    added_states: added,
    removed_states: removed,
    modified_states: modified,
  };
}

/**
 * Export a visual snapshot as a full standalone archive payload.
 */
export async function exportSnapshot(
  idOrName: string
): Promise<import('../types.js').SnapshotArchive> {
  const snap = await storage.getSnapshotAll(idOrName);
  if (!snap) {
    throw new Error(`Snapshot "${idOrName}" not found.`);
  }

  const stateIds: string[] = JSON.parse(snap.state_ids);
  const states: VisualState[] = [];
  for (const id of stateIds) {
    const s = await storage.getStateAll(id);
    if (s) states.push(s);
  }

  const branch = snap.git_branch || getCurrentBranch();
  const transitions = await storage.listTransitionsAll(
    `git_branch = '${escapeSql(branch)}'`,
    10000
  );

  return {
    version: '0.6.1',
    exported_at: Date.now(),
    name: snap.name,
    description: snap.description,
    git_branch: snap.git_branch,
    snapshot: snap,
    states,
    transitions,
  };
}

/**
 * Restore a visual snapshot archive into the current visual memory database.
 */
export async function restoreSnapshot(archive: import('../types.js').SnapshotArchive): Promise<{
  restored_states: number;
  restored_transitions: number;
  snapshot_name: string;
}> {
  if (!archive || !archive.snapshot || !Array.isArray(archive.states)) {
    throw new Error('Invalid snapshot archive structure.');
  }

  let statesRestored = 0;
  for (const state of archive.states) {
    const existing = await storage.getState(state.id);
    if (!existing) {
      await storage.addState(state);
      statesRestored++;
    }
  }

  let transitionsRestored = 0;
  if (Array.isArray(archive.transitions)) {
    for (const trans of archive.transitions) {
      const existing = await storage.getTransition(trans.id);
      if (!existing) {
        await storage.addTransition(trans);
        transitionsRestored++;
      }
    }
  }

  const existingSnap = await storage.getSnapshot(archive.snapshot.name);
  if (!existingSnap) {
    await storage.addSnapshot(archive.snapshot);
  }

  return {
    restored_states: statesRestored,
    restored_transitions: transitionsRestored,
    snapshot_name: archive.snapshot.name,
  };
}
