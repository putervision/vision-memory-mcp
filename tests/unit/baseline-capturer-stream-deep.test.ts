import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PassThrough, Writable } from 'stream';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runInteractiveBaselineCapture } from '../../src/core/baseline-capturer.js';
import { storage } from '../../src/core/storage.js';

vi.mock('playwright', () => {
  throw new Error('Playwright disabled in tests');
});

describe('Vision Memory Baseline Capturer Stream Deep Matrix', () => {
  let tmpDir: string;
  let sampleImgPath: string;
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-base-stream-'));
    sampleImgPath = path.join(tmpDir, 'test-view.png');
    fs.writeFileSync(sampleImgPath, Buffer.from(pngBase64, 'base64'));
    await storage.init();
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('should run interactive baseline session through stream input with help, list, skip, and file capture', async () => {
    const inputStream = new PassThrough();
    let viewStep = 0;
    let fileStep = 0;

    const outputStream = new Writable({
      write(chunk, _encoding, callback) {
        const text = chunk.toString();
        if (text.includes('Enter view name >')) {
          setImmediate(() => {
            if (viewStep === 0) {
              viewStep++;
              inputStream.write('help\n');
            } else if (viewStep === 1) {
              viewStep++;
              inputStream.write('list\n');
            } else if (viewStep === 2) {
              viewStep++;
              inputStream.write('login-page-view\n');
            } else if (viewStep === 3) {
              viewStep++;
              inputStream.write('empty-skip-view\n');
            } else if (viewStep === 4) {
              viewStep++;
              inputStream.write('bad-file-view\n');
            } else if (viewStep === 5) {
              viewStep++;
              inputStream.write('done\n');
            }
          });
        } else if (text.includes('Image File Path >')) {
          setImmediate(() => {
            if (fileStep === 0) {
              fileStep++;
              inputStream.write(sampleImgPath + '\n');
            } else if (fileStep === 1) {
              fileStep++;
              inputStream.write('\n');
            } else if (fileStep === 2) {
              fileStep++;
              inputStream.write('/non/existent/path.png\n');
            }
          });
        }
        callback();
      },
    });

    let capturedSpecCallback = false;
    const result = await runInteractiveBaselineCapture({
      input: inputStream,
      output: outputStream,
      outputPath: path.join(tmpDir, 'specs-manifest.json'),
      onCaptureSuccess: (info) => {
        capturedSpecCallback = true;
        expect(info.name).toBe('login-page-view');
      },
    });

    expect(result).toBeDefined();
    expect(result.captured_count).toBeGreaterThanOrEqual(1);
    expect(capturedSpecCallback).toBe(true);
  });
});
