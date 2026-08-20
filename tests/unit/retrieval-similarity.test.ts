import { describe, it, expect } from 'vitest';
import { distanceToSimilarity } from '../../src/core/retrieval.js';

describe('Retrieval distanceToSimilarity Conversion', () => {
  it('should correctly convert cosine distances to similarity scores', () => {
    // Cosine distance d = 1 - cos(theta)
    // d = 0 -> cos = 1.0 -> similarity = 1.0
    expect(distanceToSimilarity(0)).toBe(1.0);

    // d = 0.15 -> cos = 0.85 -> similarity = 0.85 (L3 cache hit threshold)
    expect(distanceToSimilarity(0.15)).toBeCloseTo(0.85, 5);

    // d = 0.5 -> cos = 0.5 -> similarity = 0.5
    expect(distanceToSimilarity(0.5)).toBeCloseTo(0.5, 5);

    // d = 1.0 -> cos = 0.0 -> similarity = 0.0
    expect(distanceToSimilarity(1.0)).toBe(0.0);

    // d = 2.0 (fallback sentinel) -> similarity = 0.0 (clamped)
    expect(distanceToSimilarity(2.0)).toBe(0.0);

    // Out-of-bounds distances should be properly clamped [0, 1]
    expect(distanceToSimilarity(1.5)).toBe(0.0);
    expect(distanceToSimilarity(-0.2)).toBe(1.0);
  });
});
