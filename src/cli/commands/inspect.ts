import { storage, escapeSql } from '../../core/storage.js';
import { getCurrentBranch } from '../../core/cache.js';

export async function runInspect(args: string[]) {
  await storage.init();
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 20;

  const branch = getCurrentBranch();
  console.log(
    `🔍 Inspecting visual states on branch: "${branch}" (limit ${limit})`
  );

  const states = await storage.listStates(
    `git_branch = '${escapeSql(branch)}'`,
    limit
  );
  if (states.length === 0) {
    console.log('No visual states stored.');
    process.exit(0);
  }

  console.log('\n' + '='.repeat(100));
  console.log(
    `| ${'ID'.padEnd(36)} | ${'Description'.padEnd(30)} | ${'Hits'.padEnd(6)} | ${'Branch'.padEnd(12)} |`
  );
  console.log('='.repeat(100));

  for (const s of states) {
    const desc =
      s.description.length > 28
        ? s.description.slice(0, 25) + '...'
        : s.description;
    console.log(
      `| ${s.id} | ${desc.padEnd(30)} | ${String(s.access_count).padEnd(6)} | ${s.git_branch.padEnd(12)} |`
    );
  }
  console.log('='.repeat(100) + '\n');
}
