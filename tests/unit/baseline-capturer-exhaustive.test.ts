import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runInteractiveBaselineCapture } from '../../src/core/baseline-capturer.js';
import { storage } from '../../src/core/storage.js';
import { PassThrough, Writable } from 'stream';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('playwright', () => {
  throw new Error('Playwright disabled in tests');
});

describe('Interactive Baseline Capturer Exhaustive Test Suite', () => {
  let tmpDir: string;
  let testImgPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-test-'));
    testImgPath = path.join(tmpDir, 'test-screen.png');
    // Minimal 1x1 PNG
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    fs.writeFileSync(testImgPath, Buffer.from(pngBase64, 'base64'));

    await storage.init();
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should run interactive baseline session using mock stream inputs responding to prompts', async () => {
    const input = new PassThrough();
    let step = 0;

    const output = new Writable({
      write(chunk, _encoding, callback) {
        const text = chunk.toString();
        if (text.includes('Enter view name >')) {
          setImmediate(() => {
            if (step === 0) {
              step++;
              input.write('help\n');
            } else if (step === 1) {
              step++;
              input.write('list\n');
            } else if (step === 2) {
              step++;
              input.write('Dashboard View\n');
            } else if (step === 3) {
              step++;
              input.write('list\n');
            } else if (step === 4) {
              step++;
              input.write('done\n');
            }
          });
        } else if (text.includes('Image File Path >')) {
          setImmediate(() => {
            input.write(testImgPath + '\n');
          });
        }
        callback();
      },
    });

    const manifestOutput = path.join(tmpDir, 'suite.json');
    const result = await runInteractiveBaselineCapture({
      targetUrl: 'http://127.0.0.1:9999',
      outputPath: manifestOutput,
      input,
      output,
    });

    expect(result).toBeDefined();
    expect(result.captured_count).toBe(1);
    expect(fs.existsSync(result.manifest_path)).toBe(true);
  });
});
