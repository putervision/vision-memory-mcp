import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { storage } from '../../src/core/storage.js';
import {
  handleIngestVideo,
  handleSearchVideoMemory,
  handleGetVideoTimeline,
  handleCompareVideoTrajectories,
} from '../../src/tools/handlers.js';

import fs from 'fs';
import path from 'path';
import { config } from '../../src/config.js';

describe('video-handlers unit tests', () => {
  const originalPath = config.LANCEDB_PATH;
  const testDbDir = path.resolve(process.cwd(), '.test-video-handlers-db');

  beforeAll(async () => {
    config.LANCEDB_PATH = testDbDir;
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true });
      } catch (_) {}
    }
    await storage.init();
  });

  afterAll(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (_) {}
    }
  });

  const dummyWebMBase64 =
    'data:video/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKygQRC8oEEQvOBCEKygQRC8oEEQvOBCEKygQRC8oEEQvOBCEKygQRC8oEEQvOBCEKygQRC8oEEQvOBCEKygQRC8oEEQvOBCEKygA==';

  it('should handle video ingestion via base64 data', async () => {
    const res = await handleIngestVideo({
      video_data: dummyWebMBase64,
      fps: 1.0,
      category: 'handler_test',
    });

    expect(res).toBeDefined();
    expect(res.video_id).toBeDefined();
    expect(res.file_format).toBe('webm');

    const searched = await handleSearchVideoMemory({ query: 'handler_test' });
    expect(searched.some((v) => v.id === res.video_id)).toBe(true);

    const timeline = await handleGetVideoTimeline({ video_id: res.video_id });
    expect(timeline.video.id).toBe(res.video_id);
    expect(Array.isArray(timeline.timeline)).toBe(true);
  });

  it('should compare two video trajectories and compute visual similarity score', async () => {
    const vidA = await handleIngestVideo({
      video_data: dummyWebMBase64,
      fps: 1.0,
      category: 'traj_a',
    });

    const vidB = await handleIngestVideo({
      video_data: dummyWebMBase64,
      fps: 1.0,
      category: 'traj_b',
    });

    const comp = await handleCompareVideoTrajectories({
      video_a_id: vidA.video_id,
      video_b_id: vidB.video_id,
    });

    expect(comp).toBeDefined();
    expect(comp.video_a_id).toBe(vidA.video_id);
    expect(comp.video_b_id).toBe(vidB.video_id);
    expect(typeof comp.similarity_score).toBe('number');
  });

  it('should throw error when video is not found for timeline query', async () => {
    await expect(handleGetVideoTimeline({ video_id: 'non_existent_vid_999' })).rejects.toThrow(
      "Video memory record 'non_existent_vid_999' not found"
    );
  });
});
