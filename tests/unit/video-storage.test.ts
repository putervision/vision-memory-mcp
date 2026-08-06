import { describe, it, expect, beforeAll } from 'vitest';
import { storage } from '../../src/core/storage.js';
import { VideoMemoryRecord } from '../../src/types.js';

describe('video-storage unit tests', () => {
  beforeAll(async () => {
    await storage.init();
  });

  it('should save, retrieve, list, and delete VideoMemoryRecord', async () => {
    const videoId = `vid_test_${Date.now()}`;
    const testRecord: VideoMemoryRecord = {
      id: videoId,
      source_file: '/tmp/test_video.mp4',
      file_format: 'mp4',
      duration_ms: 4500,
      fps: 2,
      resolution: JSON.stringify({ width: 1280, height: 720 }),
      total_frames_extracted: 9,
      unique_states_count: 3,
      category: 'unit_test',
      tags: JSON.stringify(['test', 'video']),
      created_at: Date.now(),
      summary_description: 'Unit test video recording',
      keyframe_timeline: '[]',
      trace_id: 'tr_test_123',
      git_branch: 'main',
    };

    await storage.saveVideoRecord(testRecord);

    const fetched = await storage.getVideoRecord(videoId);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(videoId);
    expect(fetched?.source_file).toBe('/tmp/test_video.mp4');

    const searchResults = await storage.searchVideoRecords('unit_test');
    expect(searchResults.some((v) => v.id === videoId)).toBe(true);

    const deleted = await storage.deleteVideoRecord(videoId);
    expect(deleted).toBe(true);

    const check = await storage.getVideoRecord(videoId);
    expect(check).toBeNull();
  });
});
