import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';
import {
  setVisualSpec,
  listVisualSpecs,
  exportVisualSpecSuite,
} from '../../src/core/visual-spec.js';

async function createTestImage(width = 100, height = 100): Promise<Buffer> {
  try {
    const s = (await import('sharp')).default;
    return await s({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
  } catch {
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZSURBVHjP7cEBDQAAAMKg90t52gAAAAAAAAAAAD8D7gAB+e35AAAAAElFTkSuQmCC',
      'base64'
    );
  }
}

describe('Visual Spec Suite & Baseline Capturer Unit Tests', () => {
  const testDbDir = path.join(process.cwd(), '.test-baseline-capturer-db');
  const originalPath = config.LANCEDB_PATH;
  let testFile: string;

  beforeEach(async () => {
    config.LANCEDB_PATH = testDbDir;
    process.env.LANCEDB_PATH = testDbDir;
    await storage.init();

    const buf = await createTestImage(100, 100);
    testFile = path.join(testDbDir, 'sample.png');
    fs.writeFileSync(testFile, buf);
  });

  afterEach(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testFile)) {
      try {
        fs.unlinkSync(testFile);
      } catch {}
    }
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  it('should list registered visual spec baselines', async () => {
    await setVisualSpec({ name: 'Header View', filePath: testFile });
    await setVisualSpec({ name: 'Footer View', filePath: testFile });

    const specs = await listVisualSpecs();
    expect(specs.length).toBe(2);
    expect(specs.map((s) => s.name)).toContain('Header View');
    expect(specs.map((s) => s.name)).toContain('Footer View');
  });

  it('should export visual spec suite manifest to target JSON file', async () => {
    await setVisualSpec({ name: 'Checkout Page', filePath: testFile });

    const outPath = path.join(testDbDir, 'custom-manifest.json');
    const result = await exportVisualSpecSuite(outPath);

    expect(result.spec_count).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(outPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    expect(content.version).toBe('1.0.0');
    expect(content.specs.length).toBeGreaterThanOrEqual(1);
  });

  it('should run interactive baseline capture with user input loop, list, and help', async () => {
    const { Readable, Writable } = await import('stream');
    const inputBuffer = new Readable({
      read() {
        this.push('help\n');
        this.push('list\n');
        this.push('done\n');
        this.push(null);
      },
    });

    const outputBuffer = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });

    const { runInteractiveBaselineCapture } = await import('../../src/core/baseline-capturer.js');

    const result = await runInteractiveBaselineCapture({
      targetUrl: 'http://localhost:3000',
      outputPath: path.join(testDbDir, 'interactive-manifest.json'),
      input: inputBuffer,
      output: outputBuffer,
    });

    expect(result).toBeDefined();
    expect(fs.existsSync(result.manifest_path)).toBe(true);
  });
});
