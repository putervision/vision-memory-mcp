import fs from 'fs';
import path from 'path';
import * as lancedb from '@lancedb/lancedb';
import { logger } from '../logger.js';
import { cleanupLockFiles } from '../utils/fs.js';

export interface TableHealth {
  name: string;
  totalBytes: number;
  dataBytes: number;
  dataFragmentCount: number;
  indexBytes: number;
  indexDirCount: number;
  versionBytes: number;
  versionFileCount: number;
  txnBytes: number;
}

export interface StorageHealthReport {
  dbPath: string;
  exists: boolean;
  totalBytes: number;
  dataBytes: number;
  dataFragmentCount: number;
  indexBytes: number;
  indexDirCount: number;
  versionBytes: number;
  versionFileCount: number;
  txnBytes: number;
  wasteBytes: number;
  wasteRatio: number; // 0.0 to 1.0
  isHealthy: boolean;
  tables: TableHealth[];
}

/**
 * Clean up empty directories recursively within a directory.
 */
export function cleanEmptyDirectories(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let removedCount = 0;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = path.join(dir, entry.name);
        removedCount += cleanEmptyDirectories(subDir);
        try {
          if (fs.readdirSync(subDir).length === 0) {
            fs.rmdirSync(subDir);
            removedCount++;
          }
        } catch {
          // Concurrent removal or busy
        }
      }
    }
  } catch {
    // Directory unreadable
  }

  return removedCount;
}

/**
 * Calculates directory size and file count recursively.
 */
function getDirStats(dir: string): { size: number; files: number; dirs: number } {
  if (!fs.existsSync(dir)) return { size: 0, files: 0, dirs: 0 };
  let size = 0;
  let files = 0;
  let dirs = 0;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          dirs++;
          const sub = getDirStats(fullPath);
          size += sub.size;
          files += sub.files;
          dirs += sub.dirs;
        } else if (entry.isFile()) {
          files++;
          const stat = fs.statSync(fullPath);
          size += stat.size;
        }
      } catch {
        // Ignored
      }
    }
  } catch {
    // Ignored
  }

  return { size, files, dirs };
}

/**
 * Synchronous non-locking filesystem analysis of LanceDB storage health.
 */
export function analyzeStorageHealth(dbPath: string): StorageHealthReport {
  const resolved = path.resolve(dbPath);
  if (!fs.existsSync(resolved)) {
    return {
      dbPath: resolved,
      exists: false,
      totalBytes: 0,
      dataBytes: 0,
      dataFragmentCount: 0,
      indexBytes: 0,
      indexDirCount: 0,
      versionBytes: 0,
      versionFileCount: 0,
      txnBytes: 0,
      wasteBytes: 0,
      wasteRatio: 0,
      isHealthy: true,
      tables: [],
    };
  }

  const tables: TableHealth[] = [];
  let totalDataBytes = 0;
  let totalDataFragments = 0;
  let totalIndexBytes = 0;
  let totalIndexDirs = 0;
  let totalVersionBytes = 0;
  let totalVersionFiles = 0;
  let totalTxnBytes = 0;

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith('.lance')) continue;
      const tableName = entry.name.replace(/\.lance$/, '');
      const tableDir = path.join(resolved, entry.name);

      const dataDir = path.join(tableDir, 'data');
      const dataStats = getDirStats(dataDir);

      const indicesDir = path.join(tableDir, '_indices');
      let indexDirs = 0;
      let indexBytes = 0;
      if (fs.existsSync(indicesDir)) {
        try {
          const idxEntries = fs.readdirSync(indicesDir, { withFileTypes: true });
          for (const ie of idxEntries) {
            if (ie.isDirectory()) {
              indexDirs++;
              const is = getDirStats(path.join(indicesDir, ie.name));
              indexBytes += is.size;
            }
          }
        } catch {
          // Ignored
        }
      }

      const versionsDir = path.join(tableDir, '_versions');
      const versionStats = getDirStats(versionsDir);

      const txnsDir = path.join(tableDir, '_transactions');
      const txnStats = getDirStats(txnsDir);

      const tableTotal = getDirStats(tableDir).size;

      tables.push({
        name: tableName,
        totalBytes: tableTotal,
        dataBytes: dataStats.size,
        dataFragmentCount: dataStats.files,
        indexBytes,
        indexDirCount: indexDirs,
        versionBytes: versionStats.size,
        versionFileCount: versionStats.files,
        txnBytes: txnStats.size,
      });

      totalDataBytes += dataStats.size;
      totalDataFragments += dataStats.files;
      totalIndexBytes += indexBytes;
      totalIndexDirs += indexDirs;
      totalVersionBytes += versionStats.size;
      totalVersionFiles += versionStats.files;
      totalTxnBytes += txnStats.size;
    }
  } catch (err) {
    logger.debug(`Error analyzing storage directory ${resolved}:`, err);
  }

  const rootStats = getDirStats(resolved);
  const totalBytes = rootStats.size;
  const wasteBytes = Math.max(0, totalBytes - totalDataBytes);
  const wasteRatio = totalBytes > 0 ? wasteBytes / totalBytes : 0;

  const isHealthy =
    totalBytes < 50 * 1024 * 1024 ||
    (wasteRatio < 0.4 && totalIndexDirs < 50 && totalDataFragments < 500);

  return {
    dbPath: resolved,
    exists: true,
    totalBytes,
    dataBytes: totalDataBytes,
    dataFragmentCount: totalDataFragments,
    indexBytes: totalIndexBytes,
    indexDirCount: totalIndexDirs,
    versionBytes: totalVersionBytes,
    versionFileCount: totalVersionFiles,
    txnBytes: totalTxnBytes,
    wasteBytes,
    wasteRatio,
    isHealthy,
    tables,
  };
}

/**
 * Repairs LanceDB database bloat by compacting fragments, pruning old versions,
 * cleaning unverified index files, and removing orphaned empty directories.
 */
export async function repairStorageHealth(
  dbPath: string,
  options?: {
    cleanupOlderThan?: Date;
    deleteUnverified?: boolean;
    onProgress?: (message: string) => void;
  }
): Promise<{ freedBytes: number; report: StorageHealthReport }> {
  const beforeReport = analyzeStorageHealth(dbPath);
  if (!beforeReport.exists || beforeReport.totalBytes === 0) {
    return { freedBytes: 0, report: beforeReport };
  }

  const resolved = path.resolve(dbPath);
  const log = (msg: string) => {
    logger.info(`[StorageHealth] ${msg}`);
    options?.onProgress?.(msg);
  };

  log(`Beginning storage compaction and repair on: ${resolved}`);

  // 1. Clean stale locks
  try {
    cleanupLockFiles(resolved);
  } catch {
    // Ignored
  }

  // 2. Connect and run LanceDB optimize with cleanupOlderThan to prune versions and unreferenced files
  try {
    const db = await lancedb.connect(resolved);
    const tableNames = await db.tableNames();
    const optOptions = {
      cleanupOlderThan: options?.cleanupOlderThan ?? new Date(Date.now() + 10000),
      deleteUnverified: options?.deleteUnverified ?? true,
    };

    for (const tblName of tableNames) {
      try {
        log(`Optimizing and pruning table: ${tblName}...`);
        const table = await db.openTable(tblName);
        await table.optimize(optOptions);
      } catch (err: any) {
        log(`Warning: Failed to optimize table ${tblName}: ${err?.message || err}`);
      }
    }
  } catch (err: any) {
    log(`Warning: Could not connect to database for optimize: ${err?.message || err}`);
  }

  // 3. Remove all orphaned empty directories in _indices across all tables
  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.endsWith('.lance')) {
        const indicesDir = path.join(resolved, entry.name, '_indices');
        if (fs.existsSync(indicesDir)) {
          const removed = cleanEmptyDirectories(indicesDir);
          if (removed > 0) {
            log(`Cleaned up ${removed} empty index directories in ${entry.name}/_indices`);
          }
        }
      }
    }
  } catch {
    // Ignored
  }

  const afterReport = analyzeStorageHealth(resolved);
  const freedBytes = Math.max(0, beforeReport.totalBytes - afterReport.totalBytes);

  log(
    `Repair complete for ${resolved}: freed ${(freedBytes / (1024 * 1024)).toFixed(2)} MB (new total: ${(afterReport.totalBytes / (1024 * 1024)).toFixed(2)} MB)`
  );

  return { freedBytes, report: afterReport };
}
