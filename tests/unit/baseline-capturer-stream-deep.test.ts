import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Readable, PassThrough } from 'stream';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runInteractiveBaselineCapture } from '../../src/core/baseline-capturer.js';
import { storage } from '../../src/core/storage.js';

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
    const inputLines = [
      'help',
      'list',
      'login-page-view',
      sampleImgPath,
      'list',
      'empty-skip-view',
      '', // skipped image
      'bad-file-view',
      '/non/existent/path.png', // read error
      'done',
    ];

    async function* generateLines() {
      for (const line of inputLines) {
        yield line + '\n';
        await new Promise((r) => setTimeout(r, 20));
      }
    }

    const inputStream = Readable.from(generateLines());
    const outputStream = new PassThrough();

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
