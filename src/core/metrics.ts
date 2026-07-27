import { MetricsStats } from '../types.js';

export class MetricsCollector {
  private startTime = Date.now();
  private totalQueries = 0;
  private l1Hits = 0;
  private l2Hits = 0;
  private l3Hits = 0;
  private l4Calls = 0;
  private cacheMisses = 0;
  private similarityScores: number[] = [];

  recordQuery(type: 'l1' | 'l2' | 'l3' | 'l4' | 'miss', similarityScore: number = 0.0): void {
    this.totalQueries++;
    if (similarityScore > 0) {
      this.similarityScores.push(similarityScore);
      if (this.similarityScores.length > 500) {
        this.similarityScores.shift();
      }
    }

    switch (type) {
      case 'l1':
        this.l1Hits++;
        break;
      case 'l2':
        this.l2Hits++;
        break;
      case 'l3':
        this.l3Hits++;
        break;
      case 'l4':
        this.l4Calls++;
        break;
      case 'miss':
        this.cacheMisses++;
        break;
    }
  }

  getStats(): MetricsStats {
    const hits = this.l1Hits + this.l2Hits + this.l3Hits;
    const hitRatio = this.totalQueries > 0 ? hits / this.totalQueries : 0.0;
    const tokensSaved = hits * 1600; // Average estimated tokens saved per vision model call bypass
    const avgScore =
      this.similarityScores.length > 0
        ? this.similarityScores.reduce((a, b) => a + b, 0) / this.similarityScores.length
        : 0.0;

    return {
      total_queries: this.totalQueries,
      l1_exact_hits: this.l1Hits,
      l2_near_hits: this.l2Hits,
      l3_vector_hits: this.l3Hits,
      l4_llm_calls: this.l4Calls,
      cache_misses: this.cacheMisses,
      cache_hit_ratio: Math.round(hitRatio * 1000) / 1000,
      estimated_tokens_saved: tokensSaved,
      avg_similarity_score: Math.round(avgScore * 1000) / 1000,
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  reset(): void {
    this.totalQueries = 0;
    this.l1Hits = 0;
    this.l2Hits = 0;
    this.l3Hits = 0;
    this.l4Calls = 0;
    this.cacheMisses = 0;
    this.similarityScores = [];
    this.startTime = Date.now();
  }
}

export const metricsCollector = new MetricsCollector();
