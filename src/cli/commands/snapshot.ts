import { storage, escapeSql } from '../../core/storage.js';
import { getCurrentBranch, memoryCache } from '../../core/cache.js';
import { saveSnapshot, diffSnapshots } from '../../core/snapshots.js';

export async function runSnapshot(args: string[]) {
  await storage.init();
  const action = args[1];

  if (action === 'save') {
    const name = args[2];
    if (!name) {
      console.error('Error: Please specify a snapshot name.');
      process.exit(1);
    }
    const desc = args[3] || '';
    const snap = await saveSnapshot(name, desc);
    console.log(
      `✅ Snapshot "${snap.name}" saved successfully with ID: ${snap.id}`
    );
  } else if (action === 'diff') {
    const nameA = args[2];
    const nameB = args[3];
    if (!nameA || !nameB) {
      console.error('Error: Please specify nameA and nameB to diff.');
      process.exit(1);
    }
    const diff = await diffSnapshots(nameA, nameB);
    console.log(`\nDiff Results: "${nameA}" -> "${nameB}"`);
    console.log('=======================================');
    console.log(`➕ Added: ${diff.added_states.length} states`);
    diff.added_states.forEach((s) =>
      console.log(`  - ${s.id}: "${s.description}"`)
    );
    console.log(`➖ Removed: ${diff.removed_states.length} states`);
    diff.removed_states.forEach((s) =>
      console.log(`  - ${s.id}: "${s.description}"`)
    );
    console.log(
      `📝 Modified (Visual drift): ${diff.modified_states.length} states`
    );
    diff.modified_states.forEach((s) =>
      console.log(
        `  - ${s.id}: "${s.description}" (visual distance: ${s.hash_distance}, vector similarity: ${s.vector_similarity.toFixed(4)})`
      )
    );
  } else if (action === 'list') {
    const list = await storage.listSnapshotsAll(1000);
    console.log('\nVisual Checkpoint Snapshots:');
    console.log('============================');
    list.forEach((s) =>
      console.log(
        `- "${s.name}" (ID: ${s.id}, Branch: ${s.git_branch}, Created: ${new Date(s.created_at).toISOString()})`
      )
    );
  } else {
    console.error(`Unknown snapshot action: ${action}`);
  }
}

export async function runUndo(args: string[]) {
  await storage.init();
  const typeIdx = args.indexOf('--type');
  const type = typeIdx !== -1 ? args[typeIdx + 1] : 'any';
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
    const stateList = await storage.listStates(
      `git_branch = '${escapeSql(branch)}'`,
      1
    );
    const transList = await storage.listTransitions(
      `git_branch = '${escapeSql(branch)}'`,
      1
    );

    const stateTime = stateList.length > 0 ? stateList[0].created_at : 0;
    const transTime = transList.length > 0 ? transList[0].last_traversed : 0;

    if (stateTime > transTime) {
      undone = await undoState();
    } else if (transTime > 0) {
      undone = await undoTransition();
    }
  }

  if (!undone) {
    console.error('No states or transitions found to revert.');
    process.exit(1);
  }

  console.log(`✅ Undo completed. Reverted (${actionReverted}): ${revertedId}`);
}
