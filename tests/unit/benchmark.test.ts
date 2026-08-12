import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runBenchmark } from '../../src/cli/benchmark.js';
import { config } from '../../src/config.js';

describe('Benchmark Suite', () => {
  const originalPath = config.LANCEDB_PATH;
  const testDbDir = path.resolve(process.cwd(), '.test-benchmark-suite-db');

  beforeAll(async () => {
    config.LANCEDB_PATH = testDbDir;
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (_) {}
    }
  });

  it('should run benchmark performance suite and return p50, p95, p99 latency metrics', async () => {
    const results = await runBenchmark(2, 6);

    expect(results).toBeDefined();
    expect(results.concurrency_level).toBe(2);
    expect(results.ops_per_second).toBeGreaterThan(0);
    expect(results.l1_latency_ms.p50).toBeGreaterThanOrEqual(0);
    expect(results.l2_latency_ms.p50).toBeGreaterThanOrEqual(0);
    expect(results.l3_latency_ms.p50).toBeGreaterThanOrEqual(0);
  });
});
