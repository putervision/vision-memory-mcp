import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { storage, escapeSql } from '../../core/storage.js';
import { getCurrentBranch, memoryCache } from '../../core/cache.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { buildHtmlVisualizer } from './view.js';

export async function runOptimize() {
  await storage.init();
  await storage.optimize();
}

export async function runPrune(args: string[]) {
  await storage.init();
  const branch = getCurrentBranch();

  const states = await storage.listStates(
    `git_branch = '${escapeSql(branch)}'`,
    10000
  );
  const now = Date.now();
  let count = 0;

  for (const s of states) {
    // Check if expired
    const hasTtl = s.ttl > 0;
    const isExpired = hasTtl && now - s.created_at > s.ttl;
    // Or low access (e.g. accessed only once and older than 3 days)
    const isOldAndLowAccess =
      s.access_count <= 1 && now - s.created_at > 3 * 24 * 60 * 60 * 1000;

    if (isExpired || isOldAndLowAccess) {
      await storage.deleteState(s.id);
      memoryCache.delete(s.id, branch);
      count++;
    }
  }

  console.log(
    `✅ Database pruned. Removed ${count} stale or low-access states on branch "${branch}".`
  );
}

export async function runBackup(args: string[]) {
  const outIdx = args.indexOf('--out');
  const outFile =
    outIdx !== -1 ? args[outIdx + 1] : './backup/vision-memory-db.tar.gz';

  const dbPath = config.LANCEDB_PATH;
  if (!fs.existsSync(dbPath)) {
    console.error(`Error: Database path does not exist: ${dbPath}`);
    process.exit(1);
  }

  // Ensure output directory exists
  const outDir = path.dirname(outFile);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const dbDirName = path.basename(dbPath);
  const dbParentDir = path.dirname(dbPath);

  console.log(`📦 Backing up LanceDB folder "${dbPath}" to "${outFile}"...`);
  try {
    execFileSync('tar', ['-czf', outFile, '-C', dbParentDir, dbDirName]);
    console.log(`✅ Backup completed successfully: ${outFile}`);
  } catch (err: any) {
    console.error('Failed to create backup:', err.message);
    process.exit(1);
  }
}

export async function runRestore(args: string[]) {
  const inFile = args[1] === 'restore' ? args[2] : args[1];
  if (!inFile || inFile.startsWith('--')) {
    console.error('Error: Please specify the backup file to restore.');
    process.exit(1);
  }

  if (!fs.existsSync(inFile)) {
    console.error(`Error: Backup file does not exist: ${inFile}`);
    process.exit(1);
  }

  const dbPath = config.LANCEDB_PATH;
  const dbParentDir = path.dirname(dbPath);

  console.log(`📦 Restoring database from "${inFile}" to "${dbParentDir}"...`);
  try {
    if (fs.existsSync(dbPath)) {
      logger.info(`Cleaning up existing database directory at: ${dbPath}`);
      fs.rmSync(dbPath, { recursive: true, force: true });
    }
    execFileSync('tar', ['-xzf', inFile, '-C', dbParentDir]);
    console.log('✅ Database restored successfully.');
  } catch (err: any) {
    console.error('Failed to restore database:', err.message);
    process.exit(1);
  }
}

export async function runExport(args: string[]) {
  await storage.init();
  const branch = getCurrentBranch();

  const fmtIdx = args.indexOf('--format');
  const format = fmtIdx !== -1 ? args[fmtIdx + 1] : 'json';

  const outIdx = args.indexOf('--out');
  const outFile = outIdx !== -1 ? args[outIdx + 1] : undefined;

  const states = await storage.listStatesAll(
    `git_branch = '${escapeSql(branch)}'`,
    10000
  );
  const transitions = await storage.listTransitionsAll(
    `git_branch = '${escapeSql(branch)}'`,
    10000
  );

  let output = '';

  if (format === 'json') {
    output = JSON.stringify({ states, transitions }, null, 2);
  } else if (format === 'mermaid') {
    output = 'graph TD\n';
    for (const s of states) {
      const cleanDesc = s.description.replace(/"/g, '\\"');
      output += `  ${s.id}["${cleanDesc} (${s.id.slice(0, 8)})"]\n`;
    }
    for (const t of transitions) {
      const total = t.success_count + t.failure_count;
      const rate = total > 0 ? t.success_count / total : 1.0;
      output += `  ${t.from_state_id} -->|"${t.action} (${Math.round(rate * 100)}% success)"| ${t.to_state_id}\n`;
    }
  } else if (format === 'html') {
    const nodes = states.map((s) => ({
      id: s.id,
      label: s.description.slice(0, 30) + '...',
      val: s.access_count || 1,
      thumbnail: s.thumbnail,
      color: s.access_count > 5 ? '#00ffff' : '#ffffff',
    }));
    const links = transitions.map((t) => {
      const total = t.success_count + t.failure_count;
      const rate = total > 0 ? t.success_count / total : 1.0;
      return {
        source: t.from_state_id,
        target: t.to_state_id,
        label: `${t.action} (${Math.round(rate * 100)}% success)`,
        width: Math.max(1, Math.min(5, total / 2)),
        color: rate >= 0.8 ? '#00ff00' : rate >= 0.5 ? '#ffaa00' : '#ff0000',
      };
    });
    output = buildHtmlVisualizer(branch, nodes, links);
  } else {
    console.error(
      `Error: Unsupported format "${format}". Supported formats: json, mermaid, html`
    );
    process.exit(1);
  }

  if (outFile) {
    fs.writeFileSync(outFile, output, 'utf8');
    console.log(`✅ Exported visual memory graph to: ${outFile}`);
  } else {
    console.log(output);
  }
}

export async function runImport(args: string[]) {
  const inFile = args[1] === 'import' ? args[2] : args[1];
  if (!inFile || inFile.startsWith('--')) {
    console.error('Error: Please specify the JSON file to import.');
    process.exit(1);
  }

  if (!fs.existsSync(inFile)) {
    console.error(`Error: Import file does not exist: ${inFile}`);
    process.exit(1);
  }

  await storage.init();
  console.log(`📦 Importing visual memory data from "${inFile}"...`);
  try {
    const content = fs.readFileSync(inFile, 'utf8');
    const data = JSON.parse(content);

    if (!data.states || !data.transitions) {
      console.error(
        'Error: Invalid export file format. Expected "states" and "transitions" arrays.'
      );
      process.exit(1);
    }

    let statesCount = 0;
    let transitionsCount = 0;

    for (const state of data.states) {
      await storage.addState(state);
      statesCount++;
    }

    for (const trans of data.transitions) {
      await storage.addTransition(trans);
      transitionsCount++;
    }

    console.log(
      `✅ Import completed successfully. Imported ${statesCount} states and ${transitionsCount} transitions.`
    );
  } catch (err: any) {
    console.error('Failed to import data:', err.message);
    process.exit(1);
  }
}
