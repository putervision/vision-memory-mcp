import { describe, it, expect } from 'vitest';
import { validateVideoMagicBytes, probeVideo } from '../../src/core/video-pipeline.js';

describe('Video Pipeline Exhaustive Test Suite', () => {
  it('should validate magic bytes for WebM, MP4, GIF, and reject invalid', () => {
    expect(validateVideoMagicBytes(Buffer.from([]))).toBeNull();
    expect(validateVideoMagicBytes(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))).toBeNull();

    // WebM: 1A 45 DF A3
    const webmBuf = Buffer.alloc(16);
    webmBuf[0] = 0x1a;
    webmBuf[1] = 0x45;
    webmBuf[2] = 0xdf;
    webmBuf[3] = 0xa3;
    expect(validateVideoMagicBytes(webmBuf)).toBe('webm');

    // MP4: ftyp at offset 4
    const mp4Buf = Buffer.alloc(16);
    mp4Buf[4] = 0x66;
    mp4Buf[5] = 0x74;
    mp4Buf[6] = 0x79;
    mp4Buf[7] = 0x70;
    expect(validateVideoMagicBytes(mp4Buf)).toBe('mp4');

    // GIF: GIF8
    const gifBuf = Buffer.from('GIF89a1234567890');
    expect(validateVideoMagicBytes(gifBuf)).toBe('gif');
  });

  it('should probe video metadata or gracefully fallback when ffprobe is missing/simulated', async () => {
    const gifBuf = Buffer.from('GIF89a1234567890');
    const meta = await probeVideo(gifBuf);
    expect(meta).toBeDefined();
    expect(meta.file_format).toBe('gif');

    const dataUri = `data:video/gif;base64,${gifBuf.toString('base64')}`;
    const metaDataUri = await probeVideo(dataUri);
    expect(metaDataUri.file_format).toBe('gif');

    // Invalid magic bytes
    await expect(probeVideo(Buffer.from('not a video at all 12345'))).rejects.toThrow(
      'Unsupported or invalid video'
    );
  });
});
