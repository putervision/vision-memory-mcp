import sharp from 'sharp';
import { storage } from '../core/storage.js';
import { memoryCache } from '../core/cache.js';
import { processImage } from '../core/image-pipeline.js';
import { BenchmarkResults, VisualState } from '../types.js';

async function generateSamplePng(): Promise<Buffer> {
  return await sharp({
    create: {
      width: 10,
      height: 10,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, index)] * 100) / 100;
}

export async function runBenchmark(
  concurrency = 10,
  totalRequests = 100
): Promise<BenchmarkResults> {
  console.log(`🚀 Starting vision-memory-mcp benchmark (Concurrency: ${concurrency}, Requests: ${totalRequests})...`);

  await storage.init();
  const sampleBuf = await generateSamplePng();
  const processed = await processImage(sampleBuf);

  const sampleState: VisualState = {
    id: 'benchmark-sample-state',
    dhash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ahash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    vector: new Array(512).fill(0.1),
    description: 'Benchmark synthetic visual state',
    structured_data: '{}',
    accessibility_tree: '{}',
    thumbnail: processed.thumbnail,
    original_dimensions: '{"width":10,"height":10}',
    source_url: 'http://benchmark.local',
    source_agent: 'benchmark',
    trace_id: 'benchmark-trace',
    git_branch: 'main',
    tags: '["benchmark"]',
    importance_score: 1.0,
    created_at: Date.now(),
    last_accessed: Date.now(),
    access_count: 10,
    ttl: 0,
  };

  await storage.addState(sampleState).catch(() => {});
  memoryCache.set(sampleState);

  const l1Latencies: number[] = [];
  const l2Latencies: number[] = [];
  const l3Latencies: number[] = [];

  const startTime = Date.now();

  const worker = async () => {
    while (l1Latencies.length + l2Latencies.length + l3Latencies.length < totalRequests) {
      // Benchmark L1 (In-Memory LRU)
      const t1 = performance.now();
      memoryCache.get('benchmark-sample-state', 'main');
      l1Latencies.push(performance.now() - t1);

      // Benchmark L2 (Perceptual Hash / Scalar Query)
      const t2 = performance.now();
      await storage.getState('benchmark-sample-state');
      l2Latencies.push(performance.now() - t2);

      // Benchmark L3 (Vector Search)
      const t3 = performance.now();
      await storage.searchVector(new Array(512).fill(0.1), 1);
      l3Latencies.push(performance.now() - t3);
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const durationSec = (Date.now() - startTime) / 1000;
  const totalOps = l1Latencies.length + l2Latencies.length + l3Latencies.length;
  const opsPerSec = Math.round(totalOps / Math.max(0.001, durationSec));

  const results: BenchmarkResults = {
    timestamp: new Date().toISOString(),
    concurrency_level: concurrency,
    l1_latency_ms: {
      p50: percentile(l1Latencies, 50),
      p95: percentile(l1Latencies, 95),
      p99: percentile(l1Latencies, 99),
    },
    l2_latency_ms: {
      p50: percentile(l2Latencies, 50),
      p95: percentile(l2Latencies, 95),
      p99: percentile(l2Latencies, 99),
    },
    l3_latency_ms: {
      p50: percentile(l3Latencies, 50),
      p95: percentile(l3Latencies, 95),
      p99: percentile(l3Latencies, 99),
    },
    ops_per_second: opsPerSec,
  };

  console.log('📊 Benchmark Complete Results:');
  console.log(JSON.stringify(results, null, 2));

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBenchmark(10, 100).catch(console.error);
}
