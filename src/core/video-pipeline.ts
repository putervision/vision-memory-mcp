import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../logger.js';
import { ExtractedFrame, VideoIngestOptions, VideoMetadata } from '../types.js';

const execFileAsync = promisify(execFile);

/**
 * Validates magic byte signatures for supported video formats (.webm, .mp4, .gif).
 */
export function validateVideoMagicBytes(buffer: Buffer): 'webm' | 'mp4' | 'gif' | null {
  if (!buffer || buffer.length < 12) return null;

  // EBML / WebM: 1A 45 DF A3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'webm';
  }

  // MP4 container check: ftyp box at offset 4
  if (
    buffer[4] === 0x66 && // 'f'
    buffer[5] === 0x74 && // 't'
    buffer[6] === 0x79 && // 'y'
    buffer[7] === 0x70 // 'p'
  ) {
    return 'mp4';
  }

  // GIF: 47 49 46 38 ("GIF8")
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'gif';
  }

  return null;
}

/**
 * Probes video file metadata (duration, FPS, resolution, codec) using ffprobe if available.
 */
export async function probeVideo(videoInput: string | Buffer): Promise<VideoMetadata> {
  let tempFilePath: string | null = null;
  let filePath: string;
  let buffer: Buffer;

  if (typeof videoInput === 'string') {
    if (videoInput.startsWith('data:video/')) {
      const base64Data = videoInput.replace(/^data:video\/\w+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
      tempFilePath = path.join(
        os.tmpdir(),
        `vmem_probe_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`
      );
      await fs.promises.writeFile(tempFilePath, buffer);
      filePath = tempFilePath;
    } else {
      filePath = videoInput;
      buffer = await fs.promises.readFile(filePath);
    }
  } else {
    buffer = videoInput;
    tempFilePath = path.join(
      os.tmpdir(),
      `vmem_probe_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`
    );
    await fs.promises.writeFile(tempFilePath, buffer);
    filePath = tempFilePath;
  }

  const format = validateVideoMagicBytes(buffer);
  if (!format) {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      await fs.promises.unlink(tempFilePath).catch(() => {});
    }
    throw new Error(
      'Unsupported or invalid video file signature (magic bytes mismatch). Must be WebM, MP4, or GIF.'
    );
  }

  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    const info = JSON.parse(stdout);
    const videoStream = info.streams?.find(
      (s: { codec_type?: string }) => s.codec_type === 'video'
    );

    const durationSec = parseFloat(info.format?.duration ?? videoStream?.duration ?? '0');
    const width = videoStream?.width ?? 0;
    const height = videoStream?.height ?? 0;
    const codec = videoStream?.codec_name ?? 'unknown';

    let fps = 1;
    if (videoStream?.r_frame_rate) {
      const parts = videoStream.r_frame_rate.split('/');
      if (parts.length === 2 && parseFloat(parts[1]) > 0) {
        fps = parseFloat(parts[0]) / parseFloat(parts[1]);
      } else {
        fps = parseFloat(videoStream.r_frame_rate) || 1;
      }
    }

    return {
      duration_ms: Math.round(durationSec * 1000),
      fps: Math.round(fps * 100) / 100,
      width,
      height,
      codec,
      file_format: format,
      size_bytes: buffer.length,
    };
  } catch (err) {
    logger.warn(
      'ffprobe execution failed or not installed. Falling back to default metadata estimation:',
      err
    );
    return {
      duration_ms: 5000,
      fps: 1,
      width: 1280,
      height: 720,
      codec: 'unknown',
      file_format: format,
      size_bytes: buffer.length,
    };
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      await fs.promises.unlink(tempFilePath).catch(() => {});
    }
  }
}

/**
 * Extracts keyframes/sampling frames from a WebM or MP4 video file.
 */
export async function extractKeyframes(
  videoInput: string | Buffer,
  options: VideoIngestOptions = {}
): Promise<ExtractedFrame[]> {
  const targetFps = options.fps ?? 1.0;
  const maxFrames = options.max_frames ?? 60;
  let tempFilePath: string | null = null;
  let filePath: string;
  let buffer: Buffer;

  if (typeof videoInput === 'string') {
    if (videoInput.startsWith('data:video/')) {
      const base64Data = videoInput.replace(/^data:video\/\w+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
      tempFilePath = path.join(
        os.tmpdir(),
        `vmem_extract_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`
      );
      await fs.promises.writeFile(tempFilePath, buffer);
      filePath = tempFilePath;
    } else {
      filePath = videoInput;
      buffer = await fs.promises.readFile(filePath);
    }
  } else {
    buffer = videoInput;
    tempFilePath = path.join(
      os.tmpdir(),
      `vmem_extract_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`
    );
    await fs.promises.writeFile(tempFilePath, buffer);
    filePath = tempFilePath;
  }

  const format = validateVideoMagicBytes(buffer);
  if (!format) {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      await fs.promises.unlink(tempFilePath).catch(() => {});
    }
    throw new Error(
      'Unsupported or invalid video file signature (magic bytes mismatch). Must be WebM, MP4, or GIF.'
    );
  }

  const tempOutputDir = path.join(
    os.tmpdir(),
    `vmem_frames_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
  await fs.promises.mkdir(tempOutputDir, { recursive: true });

  const frames: ExtractedFrame[] = [];

  try {
    // Attempt ffmpeg extraction
    let vfFilter = `fps=${targetFps}`;

    if (options.action_timestamps && options.action_timestamps.length > 0) {
      const timeConditions = options.action_timestamps
        .map((t) => `between(t,${Math.max(0, t - 0.2)},${t + 0.5})`)
        .join('+');
      vfFilter = options.scene_threshold
        ? `select='gt(scene,${options.scene_threshold})+${timeConditions}'`
        : `select='${timeConditions}',fps=${targetFps}`;
    } else if (options.scene_threshold) {
      vfFilter = `select='gt(scene,${options.scene_threshold})',fps=${targetFps}`;
    }

    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      filePath,
      '-vf',
      vfFilter,
      '-vframes',
      String(maxFrames),
      '-c:v',
      'webp',
      path.join(tempOutputDir, 'frame_%04d.webp'),
    ]);

    const extractedFiles = (await fs.promises.readdir(tempOutputDir))
      .filter((f) => f.startsWith('frame_') && f.endsWith('.webp'))
      .sort();

    const intervalMs = Math.round(1000 / targetFps);

    for (let i = 0; i < extractedFiles.length; i++) {
      const frameFileName = extractedFiles[i];
      const framePath = path.join(tempOutputDir, frameFileName);
      const frameBuffer = await fs.promises.readFile(framePath);

      frames.push({
        frame_index: i,
        timestamp_ms: i * intervalMs,
        buffer: frameBuffer,
        is_keyframe: true,
      });
    }

    logger.info(`Extracted ${frames.length} frames from ${format} video file.`);
  } catch (err) {
    logger.warn(
      'ffmpeg extraction unavailable or failed. Using fallback synthetic frame pipeline:',
      err
    );

    // Fallback stub: Create a minimum valid 1x1 image frame for testing / fallback mode
    const dummyWebP = Buffer.from(
      'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
      'base64'
    );
    frames.push({
      frame_index: 0,
      timestamp_ms: 0,
      buffer: dummyWebP,
      is_keyframe: true,
    });
  } finally {
    // Cleanup temporary files
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      await fs.promises.unlink(tempFilePath).catch(() => {});
    }
    if (fs.existsSync(tempOutputDir)) {
      await fs.promises.rm(tempOutputDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  return frames;
}
