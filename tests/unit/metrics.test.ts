import { describe, it, expect, beforeEach } from 'vitest';
import { metricsCollector } from '../../src/core/metrics.js';

describe('MetricsCollector', () => {
  beforeEach(() => {
    metricsCollector.reset();
  });

  it('should initialize with zero stats', () => {
    const stats = metricsCollector.getStats();
    expect(stats.total_queries).toBe(0);
    expect(stats.cache_hit_ratio).toBe(0);
    expect(stats.estimated_tokens_saved).toBe(0);
  });

  it('should track L1, L2, L3 hits and compute hit ratio and tokens saved', () => {
    metricsCollector.recordQuery('l1', 1.0);
    metricsCollector.recordQuery('l2', 0.95);
    metricsCollector.recordQuery('l3', 0.88);
    metricsCollector.recordQuery('l4');
    metricsCollector.recordQuery('miss');

    const stats = metricsCollector.getStats();

    expect(stats.total_queries).toBe(5);
    expect(stats.l1_exact_hits).toBe(1);
    expect(stats.l2_near_hits).toBe(1);
    expect(stats.l3_vector_hits).toBe(1);
    expect(stats.l4_llm_calls).toBe(1);
    expect(stats.cache_misses).toBe(1);
    expect(stats.cache_hit_ratio).toBe(0.6); // 3 hits / 5 queries = 0.6
    expect(stats.estimated_tokens_saved).toBe(3 * 1600);
    expect(stats.avg_similarity_score).toBeGreaterThan(0);
  });

  it('should maintain max history length for similarity scores', () => {
    for (let i = 0; i < 600; i++) {
      metricsCollector.recordQuery('l1', 0.9);
    }
    const stats = metricsCollector.getStats();
    expect(stats.total_queries).toBe(600);
    expect(stats.avg_similarity_score).toBe(0.9);
  });
});
