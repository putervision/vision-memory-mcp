import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  analyzeStorageHealth,
  cleanEmptyDirectories,
  repairStorageHealth,
} from '../../src/core/storage-health.js';
import { formatBytes } from '../../src/cli/commands/doctor.js';

describe('StorageHealth Module Unit Tests', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-health-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('formatBytes should format byte quantities accurately', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });

  it('analyzeStorageHealth should handle non-existent directories gracefully', () => {
    const nonExistent = path.join(tmpDir, 'does-not-exist');
    const report = analyzeStorageHealth(nonExistent);
    expect(report.exists).toBe(false);
    expect(report.totalBytes).toBe(0);
    expect(report.dataBytes).toBe(0);
    expect(report.wasteBytes).toBe(0);
    expect(report.wasteRatio).toBe(0);
    expect(report.isHealthy).toBe(true);
    expect(report.tables).toEqual([]);
  });

  it('cleanEmptyDirectories should recursively remove empty directories while preserving files', () => {
    const root = path.join(tmpDir, 'test-clean');
    const emptySub1 = path.join(root, 'level1', 'empty1');
    const emptySub2 = path.join(root, 'level1', 'empty2', 'deepEmpty');
    const nonEmptySub = path.join(root, 'level1', 'hasFile');

    fs.mkdirSync(emptySub1, { recursive: true });
    fs.mkdirSync(emptySub2, { recursive: true });
    fs.mkdirSync(nonEmptySub, { recursive: true });
    fs.writeFileSync(path.join(nonEmptySub, 'keep.txt'), 'keep me');

    const removed = cleanEmptyDirectories(root);
    expect(removed).toBeGreaterThanOrEqual(2);
    expect(fs.existsSync(emptySub1)).toBe(false);
    expect(fs.existsSync(emptySub2)).toBe(false);
    expect(fs.existsSync(nonEmptySub)).toBe(true);
    expect(fs.existsSync(path.join(nonEmptySub, 'keep.txt'))).toBe(true);
  });

  it('analyzeStorageHealth should analyze a structured lance directory correctly', () => {
    const dbDir = path.join(tmpDir, '.vision-memory-mcp');
    const tableDir = path.join(dbDir, 'visual_states.lance');
    const dataDir = path.join(tableDir, 'data');
    const indicesDir = path.join(tableDir, '_indices');
    const versionsDir = path.join(tableDir, '_versions');
    const txnsDir = path.join(tableDir, '_transactions');

    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(indicesDir, { recursive: true });
    fs.mkdirSync(versionsDir, { recursive: true });
    fs.mkdirSync(txnsDir, { recursive: true });

    // Write sample files
    fs.writeFileSync(path.join(dataDir, 'frag1.lance'), Buffer.alloc(1000));
    fs.writeFileSync(path.join(dataDir, 'frag2.lance'), Buffer.alloc(2000));

    // Stale index subdirectories
    const idx1 = path.join(indicesDir, 'uuid-1');
    fs.mkdirSync(idx1);
    fs.writeFileSync(path.join(idx1, 'index.idx'), Buffer.alloc(5000));

    const idx2 = path.join(indicesDir, 'uuid-2');
    fs.mkdirSync(idx2);
    fs.writeFileSync(path.join(idx2, 'index.idx'), Buffer.alloc(5000));

    // Versions
    fs.writeFileSync(path.join(versionsDir, '1.manifest'), Buffer.alloc(500));
    fs.writeFileSync(path.join(versionsDir, '2.manifest'), Buffer.alloc(500));

    // Txns
    fs.writeFileSync(path.join(txnsDir, '1.txn'), Buffer.alloc(200));

    const report = analyzeStorageHealth(dbDir);
    expect(report.exists).toBe(true);
    expect(report.dataBytes).toBe(3000);
    expect(report.dataFragmentCount).toBe(2);
    expect(report.indexBytes).toBe(10000);
    expect(report.indexDirCount).toBe(2);
    expect(report.versionBytes).toBe(1000);
    expect(report.versionFileCount).toBe(2);
    expect(report.txnBytes).toBe(200);
    expect(report.totalBytes).toBeGreaterThanOrEqual(14200);
    expect(report.wasteBytes).toBeGreaterThanOrEqual(11200);
    expect(report.tables).toHaveLength(1);
    expect(report.tables[0].name).toBe('visual_states');
  });

  it('repairStorageHealth should handle empty or non-existent database paths without error', async () => {
    const nonExistent = path.join(tmpDir, 'missing-db');
    const result = await repairStorageHealth(nonExistent);
    expect(result.freedBytes).toBe(0);
    expect(result.report.exists).toBe(false);
  });
});
