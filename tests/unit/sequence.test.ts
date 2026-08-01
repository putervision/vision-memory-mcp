import { describe, it, expect } from 'vitest';
import { SequenceTracker } from '../../src/core/sequence.js';

describe('SequenceTracker', () => {
  it('should maintain window size and track frames', () => {
    const tracker = new SequenceTracker(3);
    const hash = '0000000000000000000000000000000000000000000000000000000000000000';

    tracker.addFrame(hash);
    tracker.addFrame(hash);
    tracker.addFrame(hash);
    const window = tracker.addFrame(hash);

    expect(window.length).toBe(3);
  });

  it('should detect transient sequences based on hamming distance threshold', () => {
    const tracker = new SequenceTracker(5);
    const hash1 = '0000000000000000000000000000000000000000000000000000000000000000';
    const hash2 = '0000000000000000000000000000000000000000000000000000000000000001';

    expect(tracker.detectTransientSequence()).toBe(false);

    tracker.addFrame(hash1);
    tracker.addFrame(hash2);

    expect(tracker.detectTransientSequence(5)).toBe(true);

    tracker.clear();
    expect(tracker.detectTransientSequence()).toBe(false);
  });
});
