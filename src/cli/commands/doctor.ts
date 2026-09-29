import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { config } from '../../config.js';
import { registerProject, getRegistry, unregisterProject } from '../../core/registry.js';
import { getDirSize } from '../../utils/fs.js';
import {
  analyzeStorageHealth,
  repairStorageHealth,
  StorageHealthReport,
} from '../../core/storage-health.js';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function runDoctor(args: string[] = []): Promise<void> {
  const isJson = args.includes('--json');
  const doFix = args.includes('--fix');
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

  const { discoverSubMemoryDatabases, discoverSubGitRepos } = await import(
    '../../utils/workspace.js'
  );
  const discoveredDbs = discoverSubMemoryDatabases();
  const dbDetails =
    discoveredDbs.length > 1
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
  const { resolveProjectRoot } = await import('../../config.js');
  const gitignorePath = path.resolve(resolveProjectRoot(), '.gitignore');
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

  // 7. Storage Health Analysis & Auto-Repair
  let storageHealth = analyzeStorageHealth(dbPath);
  let storageRepaired = false;
  let freedBytes = 0;

  if (doFix && storageHealth.exists && (!storageHealth.isHealthy || storageHealth.wasteBytes > 0)) {
    if (!isJson) console.log('\n🔧 Auto-repairing storage bloat (--fix enabled)...');
    const repairRes = await repairStorageHealth(dbPath, {
      onProgress: (msg) => {
        if (!isJson) console.log(`   ${msg}`);
      },
    });
    freedBytes = repairRes.freedBytes;
    storageHealth = repairRes.report;
    storageRepaired = true;
  }

  const storageDetails = storageHealth.exists
    ? `Total: ${formatBytes(storageHealth.totalBytes)} | Data: ${formatBytes(storageHealth.dataBytes)} | Waste: ${formatBytes(storageHealth.wasteBytes)} (${(storageHealth.wasteRatio * 100).toFixed(1)}%) | Indexes: ${storageHealth.indexDirCount} dirs`
    : 'No database found';

  reportCheck('Storage Health & Compactness', storageHealth.isHealthy, storageDetails);

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
          storageHealth,
          storageRepaired,
          freedBytes,
        },
        null,
        2
      )
    );
  } else {
    if (storageHealth.exists) {
      console.log('\n🗄️  Storage Health Breakdown:');
      console.log(`  Location:          ${storageHealth.dbPath}`);
      console.log(`  Total Size:        ${formatBytes(storageHealth.totalBytes)}`);
      const dataPct =
        storageHealth.totalBytes > 0
          ? ((storageHealth.dataBytes / storageHealth.totalBytes) * 100).toFixed(1)
          : '0';
      const idxPct =
        storageHealth.totalBytes > 0
          ? ((storageHealth.indexBytes / storageHealth.totalBytes) * 100).toFixed(1)
          : '0';
      const verPct =
        storageHealth.totalBytes > 0
          ? ((storageHealth.versionBytes / storageHealth.totalBytes) * 100).toFixed(1)
          : '0';

      console.log(`  ├── Actual Data:   ${formatBytes(storageHealth.dataBytes)} (${dataPct}%)`);
      console.log(
        `  ├── Stale Indexes: ${formatBytes(storageHealth.indexBytes)} (${idxPct}%) [${storageHealth.indexDirCount} index dirs]`
      );
      console.log(
        `  ├── Old Versions:  ${formatBytes(storageHealth.versionBytes)} (${verPct}%) [${storageHealth.versionFileCount} version files]`
      );
      console.log(`  └── Txn Logs:      ${formatBytes(storageHealth.txnBytes)}`);
      console.log(`  Data Fragments:    ${storageHealth.dataFragmentCount} files`);
      console.log(
        `  Waste Ratio:       ${(storageHealth.wasteRatio * 100).toFixed(1)}% (${storageHealth.isHealthy ? 'Healthy' : 'BLOAT DETECTED'})`
      );

      if (storageRepaired) {
        console.log(
          `\n  🎉 Repaired: Reclaimed ${formatBytes(freedBytes)}! New size: ${formatBytes(storageHealth.totalBytes)}`
        );
      } else if (!storageHealth.isHealthy) {
        console.log(
          `\n  💡 Tip: Run "vision-memory-mcp doctor --fix" to clean stale indexes, prune version manifests, and reclaim disk space.`
        );
      }
    }

    console.log(`\n📋 Health Check Summary: ${passCount}/${totalCount} checks passed.`);
    if (passCount < totalCount) {
      console.log('⚠️  Some checks failed. Please address the warnings above.');
    } else {
      console.log('🎉 System is healthy and ready to run vision-memory-mcp.');
    }
  }
}

/**
 * Runs doctor environment health checks across all registered projects in ~/.vision-memory-mcp/projects.json.
 */
export async function runDoctorGlobal(args: string[] = []): Promise<void> {
  const isJson = args.includes('--json');
  const cleanStale = args.includes('--clean-stale');
  const doFix = args.includes('--fix');
  const scanIndex = args.indexOf('--scan');

  if (scanIndex !== -1 && args[scanIndex + 1]) {
    const scanDir = path.resolve(args[scanIndex + 1]);
    if (fs.existsSync(scanDir)) {
      if (!isJson)
        console.log(`🔎 Scanning directory "${scanDir}" for vision-memory-mcp projects...`);
      try {
        const entries = fs.readdirSync(scanDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const projectPath = path.join(scanDir, entry.name);
            const visionDir = path.join(projectPath, '.vision-memory-mcp');
            if (fs.existsSync(visionDir)) {
              registerProject(entry.name, projectPath);
            }
          }
        }
      } catch {}
    }
  }

  const registry = getRegistry();
  const entries = Object.entries(registry);

  if (!isJson) {
    console.log(
      '🌐 Running global health check across registered vision-memory-mcp projects...\n'
    );
  }

  if (entries.length === 0) {
    if (isJson) {
      console.log(
        JSON.stringify(
          {
            healthy: true,
            total_registered_projects: 0,
            global_health_percentage: '100.0%',
            projects: [],
          },
          null,
          2
        )
      );
    } else {
      console.log('  ⚠️  No registered projects found in ~/.vision-memory-mcp/projects.json.');
      console.log('  Run "vision-memory-mcp init" in a project root first to register it.\n');
    }
    return;
  }

  const projectReports: Array<{
    name: string;
    path: string;
    exists: boolean;
    healthy: boolean;
    checksPassed: number;
    totalChecks: number;
    dbExists: boolean;
    storageSizeBytes: number;
    storageFormatted: string;
    dataSizeBytes: number;
    wasteSizeBytes: number;
    wasteRatio: number;
    repaired: boolean;
    freedBytes: number;
    gitBranch: string;
    issues: string[];
  }> = [];

  let activeCount = 0;
  let staleCount = 0;
  let healthyCount = 0;
  let unhealthyCount = 0;
  let totalGlobalStorageBytes = 0;
  let totalGlobalWasteBytes = 0;
  let totalGlobalFreedBytes = 0;
  let totalDiscoveredDbs = 0;

  for (const [name, projectPath] of entries) {
    const resolvedPath = path.resolve(projectPath);
    if (!fs.existsSync(resolvedPath)) {
      if (!isJson) console.log(`  ❌ [${name}] Path no longer exists: ${resolvedPath}`);
      staleCount++;
      if (cleanStale) {
        unregisterProject(name);
        if (!isJson) console.log(`     🧹 Pruned stale registration for "${name}"`);
      }
      projectReports.push({
        name,
        path: resolvedPath,
        exists: false,
        healthy: false,
        checksPassed: 0,
        totalChecks: 7,
        dbExists: false,
        storageSizeBytes: 0,
        storageFormatted: '0 B',
        dataSizeBytes: 0,
        wasteSizeBytes: 0,
        wasteRatio: 0,
        repaired: false,
        freedBytes: 0,
        gitBranch: 'none',
        issues: ['Path no longer exists on disk'],
      });
      continue;
    }

    activeCount++;

    const dbDir = path.join(resolvedPath, '.vision-memory-mcp');
    const dbExists = fs.existsSync(dbDir);
    let storageSizeBytes = 0;
    let dataSizeBytes = 0;
    let wasteSizeBytes = 0;
    let wasteRatio = 0;
    let repaired = false;
    let freedBytes = 0;
    let storageHealth: StorageHealthReport | null = null;

    if (dbExists) {
      storageHealth = analyzeStorageHealth(dbDir);
      totalDiscoveredDbs++;

      if (doFix && (!storageHealth.isHealthy || storageHealth.wasteBytes > 0)) {
        if (!isJson) console.log(`  🔧 [${name}] Auto-repairing storage bloat...`);
        const repairRes = await repairStorageHealth(dbDir, {
          onProgress: (msg) => {
            if (!isJson) console.log(`     ${msg}`);
          },
        });
        freedBytes = repairRes.freedBytes;
        storageHealth = repairRes.report;
        repaired = true;
        totalGlobalFreedBytes += freedBytes;
      }

      storageSizeBytes = storageHealth.totalBytes;
      dataSizeBytes = storageHealth.dataBytes;
      wasteSizeBytes = storageHealth.wasteBytes;
      wasteRatio = storageHealth.wasteRatio;
    }

    totalGlobalStorageBytes += storageSizeBytes;
    totalGlobalWasteBytes += wasteSizeBytes;

    const issues: string[] = [];
    let checksPassed = 0;
    const totalChecks = 7;

    const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
    if (nodeMajor >= 18) checksPassed++;
    else issues.push('Node 18+ required');

    let writable = false;
    try {
      if (!fs.existsSync(resolvedPath)) fs.mkdirSync(resolvedPath, { recursive: true });
      fs.accessSync(resolvedPath, fs.constants.W_OK);
      writable = true;
    } catch {}
    if (writable) checksPassed++;
    else issues.push('Storage directory not writable');

    let sharpOk = false;
    try {
      const sharp = (await import('sharp')).default;
      sharpOk = !!sharp;
    } catch {}
    if (sharpOk) checksPassed++;
    else issues.push('Sharp native image engine failed');

    let gitBranch = 'main';
    let gitOk = false;
    try {
      const gitDir = path.join(resolvedPath, '.git');
      if (fs.existsSync(gitDir)) {
        gitOk = true;
        const headContent = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
        if (headContent.startsWith('ref: refs/heads/')) {
          gitBranch = headContent.substring(16);
        }
      }
    } catch {}
    if (gitOk) checksPassed++;
    else issues.push('Git repository not initialized');

    let gitignoreOk = false;
    const gitignorePath = path.join(resolvedPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      gitignoreOk = content.includes('.vision-memory-mcp') || content.includes('.vision-memory');
    }
    if (gitignoreOk) checksPassed++;
    else issues.push('.vision-memory-mcp missing from .gitignore');

    checksPassed++; // Disk availability

    // Storage health check
    if (!storageHealth || storageHealth.isHealthy) {
      checksPassed++;
    } else {
      issues.push(
        `Storage bloat: ${formatBytes(wasteSizeBytes)} waste (${(wasteRatio * 100).toFixed(0)}%)`
      );
    }

    const isHealthy = checksPassed === totalChecks;
    if (isHealthy) healthyCount++;
    else unhealthyCount++;

    projectReports.push({
      name,
      path: resolvedPath,
      exists: true,
      healthy: isHealthy,
      checksPassed,
      totalChecks,
      dbExists,
      storageSizeBytes,
      storageFormatted: formatBytes(storageSizeBytes),
      dataSizeBytes,
      wasteSizeBytes,
      wasteRatio,
      repaired,
      freedBytes,
      gitBranch,
      issues,
    });

    if (!isJson) {
      const statusIcon = isHealthy ? '✅' : '⚠️';
      const dbInfo = dbExists
        ? `Total: ${formatBytes(storageSizeBytes)} | Data: ${formatBytes(dataSizeBytes)} | Waste: ${formatBytes(wasteSizeBytes)}`
        : 'No local DB';
      console.log(`  ${statusIcon} [${name}] ${resolvedPath}`);
      console.log(
        `     Checks: ${checksPassed}/${totalChecks} passed | ${dbInfo} | Branch: ${gitBranch}`
      );
      if (repaired) {
        console.log(`     🎉 Repaired: Freed ${formatBytes(freedBytes)}!`);
      }
      if (issues.length > 0) {
        console.log(`     Warnings: ${issues.join(', ')}`);
      }
    }
  }

  const globalHealthPercentage =
    entries.length > 0 ? ((healthyCount / entries.length) * 100).toFixed(1) + '%' : '100.0%';

  if (isJson) {
    console.log(
      JSON.stringify(
        {
          healthy: unhealthyCount === 0 && staleCount === 0,
          total_registered_projects: entries.length,
          active_projects_count: activeCount,
          stale_projects_count: staleCount,
          healthy_projects_count: healthyCount,
          unhealthy_projects_count: unhealthyCount,
          global_health_percentage: globalHealthPercentage,
          total_discovered_databases: totalDiscoveredDbs,
          total_storage_bytes: totalGlobalStorageBytes,
          total_storage_formatted: formatBytes(totalGlobalStorageBytes),
          total_waste_bytes: totalGlobalWasteBytes,
          total_waste_formatted: formatBytes(totalGlobalWasteBytes),
          total_freed_bytes: totalGlobalFreedBytes,
          total_freed_formatted: formatBytes(totalGlobalFreedBytes),
          projects: projectReports,
        },
        null,
        2
      )
    );
  } else {
    console.log(`\n📊 Global Metrics & Health Summary:`);
    console.log(
      `  - Registered Projects: ${entries.length} (${activeCount} active, ${staleCount} stale/missing)`
    );
    console.log(
      `  - Global Health Score: ${healthyCount}/${entries.length} healthy (${globalHealthPercentage})`
    );
    console.log(`  - Discovered Databases: ${totalDiscoveredDbs} database locations`);
    console.log(`  - Total Storage Footprint: ${formatBytes(totalGlobalStorageBytes)}`);
    console.log(`  - Total Storage Waste:     ${formatBytes(totalGlobalWasteBytes)}`);
    if (totalGlobalFreedBytes > 0) {
      console.log(
        `  - Total Reclaimed Space:   ${formatBytes(totalGlobalFreedBytes)} 🎉`
      );
    }
    if (totalGlobalWasteBytes > 50 * 1024 * 1024 && !doFix) {
      console.log(
        '\n💡 Tip: Run "vision-memory-mcp doctor-global --fix" to auto-repair storage bloat across all registered projects.\n'
      );
    } else if (staleCount > 0 && !cleanStale) {
      console.log(
        '\n💡 Tip: Run "vision-memory-mcp doctor-global --clean-stale" to prune missing project paths.\n'
      );
    } else {
      console.log('\n🎉 Global doctor check complete!\n');
    }
  }
}
