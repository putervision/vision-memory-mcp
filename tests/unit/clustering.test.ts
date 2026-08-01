import { describe, it, expect } from 'vitest';
import { clusterVisualStates } from '../../src/core/clustering.js';
import { VisualState } from '../../src/types.js';

describe('clusterVisualStates', () => {
  it('should return empty array for empty states', () => {
    const clusters = clusterVisualStates([]);
    expect(clusters).toEqual([]);
  });

  it('should skip states without vectors', () => {
    const states = [{ id: 's1', description: 'Test 1', vector: [] } as unknown as VisualState];
    const clusters = clusterVisualStates(states);
    expect(clusters).toEqual([]);
  });

  it('should cluster identical or highly similar vectors together', () => {
    const vecA = [1, 0, 0, 0];
    const vecB = [0.99, 0.01, 0, 0];
    const vecC = [0, 0, 1, 0];

    const states: VisualState[] = [
      { id: 'state-1', description: 'Screen A', vector: vecA } as unknown as VisualState,
      { id: 'state-2', description: 'Screen A Prime', vector: vecB } as unknown as VisualState,
      { id: 'state-3', description: 'Screen B', vector: vecC } as unknown as VisualState,
    ];

    const clusters = clusterVisualStates(states, 0.85);
    expect(clusters.length).toBe(2);
    expect(clusters[0].state_ids).toContain('state-1');
    expect(clusters[0].state_ids).toContain('state-2');
    expect(clusters[1].state_ids).toContain('state-3');
  });
});
