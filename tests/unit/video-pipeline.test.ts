import { describe, it, expect } from 'vitest';
import {
  validateVideoMagicBytes,
  probeVideo,
  extractKeyframes,
} from '../../src/core/video-pipeline.js';

describe('video-pipeline unit tests', () => {
  it('should identify valid WebM magic bytes signature (1A 45 DF A3)', () => {
    const webmHeader = Buffer.from([
      0x1a, 0x45, 0xdf, 0xa3, 0x99, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81,
    ]);
    expect(validateVideoMagicBytes(webmHeader)).toBe('webm');
  });

  it('should identify valid MP4 container magic bytes (ftyp at offset 4)', () => {
    const mp4Header = Buffer.from([
      0x00,
      0x00,
      0x00,
      0x1c,
      0x66,
      0x74,
      0x79,
      0x70, // 'ftyp'
      0x69,
      0x73,
      0x6f,
      0x6d,
    ]);
    expect(validateVideoMagicBytes(mp4Header)).toBe('mp4');
  });

  it('should identify valid GIF magic bytes (GIF8)', () => {
    const gifHeader = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(validateVideoMagicBytes(gifHeader)).toBe('gif');
  });

  it('should return null for invalid or short buffer signature', () => {
    const invalidBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(validateVideoMagicBytes(invalidBuffer)).toBeNull();
  });

  it('should throw error when probing invalid video buffer signature', async () => {
    const invalidBuffer = Buffer.from([
      0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc,
    ]);
    await expect(probeVideo(invalidBuffer)).rejects.toThrow(
      'Unsupported or invalid video file signature'
    );
  });

  it('should fall back gracefully to default metadata when ffprobe is missing', async () => {
    const webmBuffer = Buffer.from([
      0x1a, 0x45, 0xdf, 0xa3, 0x99, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const metadata = await probeVideo(webmBuffer);
    expect(metadata).toBeDefined();
    expect(metadata.file_format).toBe('webm');
    expect(metadata.size_bytes).toBe(webmBuffer.length);
  });

  it('should extract fallback frames when extracting keyframes from synthetic video buffer', async () => {
    const webmBuffer = Buffer.from([
      0x1a, 0x45, 0xdf, 0xa3, 0x99, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const frames = await extractKeyframes(webmBuffer, { fps: 1.0, max_frames: 5 });
    expect(frames).toBeDefined();
    expect(Array.isArray(frames)).toBe(true);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0].frame_index).toBe(0);
  });
});
