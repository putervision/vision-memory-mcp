import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';
import { handleCreateEvidencePack, handleIngestVideo } from '../../src/tools/handlers.js';

describe('Dual-MCP Synergy Unit Test Suite', () => {
  const testDbDir = path.join(process.cwd(), '.test-synergy-db');
  const originalPath = config.LANCEDB_PATH;
  let dummyBase64: string;

  beforeEach(async () => {
    config.LANCEDB_PATH = testDbDir;
    process.env.LANCEDB_PATH = testDbDir;
    await storage.init();

    const buf = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 50, g: 150, b: 250, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    dummyBase64 = buf.toString('base64');
  });

  afterAll(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (_) {}
    }
  });

  it('should create an immutable evidence pack with cryptographic hash', async () => {
    // Save a dummy state
    const stateId = 'state-synergy-1';
    await storage.addState({
      id: stateId,
      dhash: '0123456789abcdef',
      ahash: 'fedcba9876543210',
      timestamp_ms: 1500,
      ocr_text: 'Error 500 Internal Server Error',
      vector: Array(512).fill(0.1),
      description: 'Synergy state',
      structured_data: '{}',
      accessibility_tree: '{}',
      thumbnail: dummyBase64,
      original_dimensions: '{"width":100,"height":100}',
      source_url: '/test',
      source_agent: 'test',
      trace_id: 'tr_123',
      git_branch: 'main',
      tags: '[]',
      importance_score: 0.5,
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1,
      ttl: 0,
    });

    const pack = await handleCreateEvidencePack({
      keyframe_state_ids: [stateId],
      source_video_id: 'vid_test_123',
      linked_state_memory_nodes: {
        blocker_ids: ['blocker-500'],
        decision_ids: ['dec-architecture'],
      },
    });

    expect(pack).toBeDefined();
    expect(pack.id).toMatch(/^pack_/);
    expect(pack.payload_hash).toBeDefined();
    expect(pack.keyframe_state_ids).toContain(stateId);
    expect(pack.linked_state_memory_nodes.blocker_ids).toContain('blocker-500');

    // Retrieve from storage
    const retrieved = await storage.getEvidencePack(pack.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.payload_hash).toBe(pack.payload_hash);
  });

  it('should construct video ingest evidence payload for state-memory linking', async () => {
    // WebM magic header byte buffer
    const webmHeader = Buffer.from([
      0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2,
      0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, 0x42, 0x87,
      0x81, 0x02, 0x42, 0x85, 0x81, 0x02,
    ]);

    const result = await handleIngestVideo({
      video_data: `data:video/webm;base64,${webmHeader.toString('base64')}`,
      category: 'synergy_test',
      action_timestamps: [1.0, 2.5],
    });

    expect(result).toBeDefined();
    expect(result.video_id).toBeDefined();
    expect(result.evidence_payload).toBeDefined();
    expect(result.evidence_payload?.source_video_id).toBe(result.video_id);
    expect(result.evidence_payload?.frame_range).toBeDefined();
  });
});
