import { describe, it, expect } from 'vitest';
import { categorizeVideoFrames } from '../../src/core/video-categorizer.js';
import { ExtractedFrame } from '../../src/types.js';

describe('video-categorizer unit tests', () => {
  const dummyWebP = Buffer.from(
    'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
    'base64'
  );

  it('should categorize sequence of frames and construct transition graph', async () => {
    const frames: ExtractedFrame[] = [
      { frame_index: 0, timestamp_ms: 0, buffer: dummyWebP, is_keyframe: true },
      { frame_index: 1, timestamp_ms: 1000, buffer: dummyWebP, is_keyframe: true },
      { frame_index: 2, timestamp_ms: 2000, buffer: dummyWebP, is_keyframe: true },
    ];

    const result = await categorizeVideoFrames(
      frames,
      { category: 'test_playwright' },
      'test_video.webm'
    );

    expect(result).toBeDefined();
    expect(result.states.length).toBeGreaterThan(0);
    expect(result.timeline.length).toBe(3);
    expect(result.summary_description).toContain('Ingested 3 frames');
  });

  it('should perform dHash deduplication on identical contiguous frame buffers', async () => {
    const frames: ExtractedFrame[] = [
      { frame_index: 0, timestamp_ms: 0, buffer: dummyWebP, is_keyframe: true },
      { frame_index: 1, timestamp_ms: 1000, buffer: dummyWebP, is_keyframe: false },
    ];

    const result = await categorizeVideoFrames(frames, { category: 'dedup_test' }, 'dedup.mp4');

    expect(result.timeline.length).toBe(2);
    expect(result.timeline[0].state_id).toBe(result.timeline[1].state_id);
    expect(result.unique_states_count).toBe(1);
  });
});
