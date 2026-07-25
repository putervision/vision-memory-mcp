import { discoverSubGitRepos, discoverSubMemoryDatabases } from '../../utils/workspace.js';
import { storage } from '../../core/storage.js';

export async function runAudit(args: string[] = []): Promise<void> {
  const isJson = args.includes('--json');

  if (!isJson) {
    console.log('🔍 Running vision-memory-mcp workspace & database audit...\n');
  }

  // Initialize storage if needed
  try {
    await storage.init();
  } catch (err: any) {
    if (!isJson) {
      console.error('❌ Failed to initialize storage for audit:', err.message || err);
    }
  }

  const gitRepos = discoverSubGitRepos();
  const dbs = discoverSubMemoryDatabases();

  let totalStates = 0;
  let primaryStates = 0;
  let totalTransitions = 0;
  let totalSnapshots = 0;
  try {
    totalStates = await storage.countStatesAll();
    primaryStates = await storage.countStates();
    totalTransitions = await storage.countTransitionsAll();
    totalSnapshots = (await storage.listSnapshotsAll(10000)).length;
  } catch {}

  const auxStates = Math.max(0, totalStates - primaryStates);

  if (isJson) {
    console.log(
      JSON.stringify(
        {
          gitRepos,
          databases: dbs,
          stats: {
            totalStates,
            primaryStates,
            subdirectoryStates: auxStates,
            totalTransitions,
            totalSnapshots,
          },
        },
        null,
        2
      )
    );
    return;
  }

  // Human Readable Output
  console.log('📦 Git Repositories Audit:');
  if (gitRepos.length === 0) {
    console.log('  ⚠️  No Git repositories found in workspace.');
  } else {
    for (const repo of gitRepos) {
      const typeLabel = repo.isRoot ? '[Root]' : '[Sub-directory]';
      console.log(`  • ${typeLabel} ${repo.relativePath || '.'} -> branch: "${repo.branch}"`);
    }
  }

  console.log('\n🧠 Visual Memory Databases Audit:');
  if (dbs.length === 0) {
    console.log('  ⚠️  No LanceDB visual memory databases found.');
  } else {
    for (const db of dbs) {
      const typeLabel = db.isRoot ? '[Primary/Root]' : '[Sub-directory]';
      console.log(`  • ${typeLabel} ${db.relativePath} (${db.path})`);
    }
  }

  console.log('\n📊 Aggregated Visual Memory Statistics:');
  console.log(`  • Total Visual States (all DBs): ${totalStates}`);
  console.log(`  • Primary Database States: ${primaryStates}`);
  if (auxStates > 0) {
    console.log(`  • Sub-directory Database States: ${auxStates}`);
  }
  console.log(`  • Total State Transitions: ${totalTransitions}`);
  console.log(`  • Total Visual Snapshots: ${totalSnapshots}`);

  console.log('\n🎉 Audit complete.');
}
