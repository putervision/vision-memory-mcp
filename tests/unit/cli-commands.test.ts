import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runInspect } from '../../src/cli/commands/inspect.js';
import { runMetrics } from '../../src/cli/commands/metrics.js';
import { runOptimize, runPrune, runExport, runImport } from '../../src/cli/commands/actions.js';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';

describe('CLI Commands Unit Suite', () => {
  const testDbDir = path.join(process.cwd(), '.test-cli-commands-db');
  const originalPath = config.LANCEDB_PATH;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    config.LANCEDB_PATH = testDbDir;
    process.env.LANCEDB_PATH = testDbDir;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await storage.init();
  });

  afterEach(async () => {
    logSpy.mockRestore();
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  it('should run inspect command', async () => {
    await storage.addState({
      id: 'inspect-state-1',
      dhash: '0000000000000000000000000000000000000000000000000000000000000000',
      ahash: '0000000000000000000000000000000000000000000000000000000000000000',
      vector: new Array(512).fill(0),
      description: 'Inspect Test Screen',
      structured_data: '{}',
      accessibility_tree: '',
      thumbnail: '',
      original_dimensions: '{}',
      source_url: '',
      source_agent: '',
      trace_id: '',
      git_branch: 'main',
      tags: '[]',
      importance_score: 1.0,
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1,
      ttl: 0,
    });

    await runInspect(['--limit', '5']);
    expect(logSpy).toHaveBeenCalled();
  });

  it('should run metrics command', async () => {
    await runMetrics();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Visual Memory Value & ROI Metrics')
    );
  });

  it('should run optimize command', async () => {
    await runOptimize();
  });

  it('should run prune command', async () => {
    await runPrune([]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Database pruned'));
  });

  it('should export and import visual memory data in JSON format', async () => {
    const tmpExport = path.join(testDbDir, 'export.json');
    await runExport(['--format', 'json', '--out', tmpExport]);

    expect(fs.existsSync(tmpExport)).toBe(true);

    await runImport(['import', tmpExport]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Import completed successfully'));
  });

  it('should export visual memory data in mermaid format', async () => {
    await runExport(['--format', 'mermaid']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('graph TD'));
  });
});
