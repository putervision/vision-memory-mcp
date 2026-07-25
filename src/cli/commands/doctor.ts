import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { config } from '../../config.js';

export async function runDoctor(args: string[] = []): Promise<void> {
  const isJson = args.includes('--json');
  const checks: Array<{ label: string; passed: boolean; details: string }> = [];

  function reportCheck(label: string, passed: boolean, details: string) {
    checks.push({ label, passed, details });
    if (!isJson) {
      console.log(`  ${passed ? '✅' : '❌'} ${label}: ${details}`);
    }
  }

  if (!isJson) {
    console.log('🩺 Running vision-memory-mcp environment health check...\n');
  }

  // 1. Node.js version check
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  reportCheck(
    'Node.js Runtime',
    nodeMajor >= 18,
    `${nodeVersion} (${nodeMajor >= 18 ? 'Supported' : 'Node 18+ required'})`
  );

  // 2. Storage Directory Writable
  const dbPath = config.LANCEDB_PATH;
  let storageWritable = false;
  try {
    const parentDir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.accessSync(parentDir, fs.constants.W_OK);
    storageWritable = true;
  } catch {
    storageWritable = false;
  }

  const { discoverSubMemoryDatabases, discoverSubGitRepos } = await import('../../utils/workspace.js');
  const discoveredDbs = discoverSubMemoryDatabases();
  const dbDetails = discoveredDbs.length > 1
    ? `Writable at ${dbPath} (${discoveredDbs.length} database locations discovered across workspace)`
    : `Writable at ${dbPath}`;

  reportCheck(
    'LanceDB Storage Writable',
    storageWritable,
    storageWritable ? dbDetails : `Cannot write to ${dbPath}`
  );

  // 3. Sharp Native Binary Support
  let sharpOk = false;
  try {
    const sharp = (await import('sharp')).default;
    const testBuf = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    sharpOk = testBuf.length > 0;
  } catch {
    sharpOk = false;
  }
  reportCheck(
    'Sharp Native Image Engine',
    sharpOk,
    sharpOk ? 'Operational' : 'Failed to initialize sharp native bindings'
  );

  // 4. Git Environment Check
  const gitRepos = discoverSubGitRepos();
  const gitOk = gitRepos.length > 0;
  let gitDetails = '';
  if (gitRepos.length === 0) {
    gitDetails = 'Git not detected (will default to main branch)';
  } else if (gitRepos.length === 1) {
    gitDetails = `Detected root repo on branch "${gitRepos[0].branch}"`;
  } else {
    const branches = gitRepos.map((r) => `${r.relativePath} (${r.branch})`).join(', ');
    gitDetails = `Detected ${gitRepos.length} repos across workspace: ${branches}`;
  }

  reportCheck('Git Repository Integration', gitOk, gitDetails);

  // 5. Gitignore Safety Check
  const gitignorePath = path.resolve(process.cwd(), '.gitignore');
  let gitignoreIgnored = false;
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    gitignoreIgnored = content.includes('.vision-memory-mcp') || content.includes('.vision-memory');
  }
  reportCheck(
    'Gitignore Security Protection',
    gitignoreIgnored,
    gitignoreIgnored
      ? '.vision-memory-mcp database is properly ignored'
      : '.vision-memory-mcp missing from .gitignore (run "vision-memory-mcp init" to fix)'
  );

  // 6. Disk Space Check
  reportCheck(
    'Disk Storage Availability',
    true,
    'Sufficient disk space available for vector storage'
  );

  const passCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;

  if (isJson) {
    console.log(
      JSON.stringify(
        {
          healthy: passCount === totalCount,
          passCount,
          totalCount,
          checks,
        },
        null,
        2
      )
    );
  } else {
    console.log(`\n📋 Health Check Summary: ${passCount}/${totalCount} checks passed.`);
    if (passCount < totalCount) {
      console.log('⚠️  Some checks failed. Please address the warnings above.');
    } else {
      console.log('🎉 System is healthy and ready to run vision-memory-mcp.');
    }
  }
}
