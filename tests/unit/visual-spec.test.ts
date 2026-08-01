import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { setVisualSpec, verifyVisualSpec } from '../../src/core/visual-spec.js';
import { storage } from '../../src/core/storage.js';
import { config } from '../../src/config.js';

describe('Visual Spec Baseline Engine', () => {
  const testDbDir = path.join(process.cwd(), '.test-visual-spec-db');
  const sampleBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const originalPath = config.LANCEDB_PATH;

  beforeEach(async () => {
    config.LANCEDB_PATH = testDbDir;
    process.env.LANCEDB_PATH = testDbDir;
    await storage.init();
  });

  afterEach(async () => {
    config.LANCEDB_PATH = originalPath;
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  it('should store a visual spec baseline from base64 input', async () => {
    const res = await setVisualSpec({
      name: 'Homepage Header',
      screenshot: sampleBase64,
      metadata: { author: 'QA' },
    });

    expect(res.id).toContain('spec-homepage-header');
    expect(res.name).toBe('Homepage Header');
    expect(res.dhash).toBeDefined();
  });

  it('should store a visual spec baseline from a file path', async () => {
    const tmpFile = path.join(process.cwd(), '.tmp-spec-sample.png');
    fs.writeFileSync(tmpFile, Buffer.from(sampleBase64, 'base64'));

    try {
      const res = await setVisualSpec({
        name: 'File Spec',
        filePath: tmpFile,
      });

      expect(res.id).toContain('spec-file-spec');
      expect(res.dhash).toBeDefined();
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  });

  it('should throw error if neither screenshot nor filePath is provided', async () => {
    await expect(setVisualSpec({ name: 'Empty' })).rejects.toThrow(
      'Either screenshot base64 or filePath must be provided.'
    );
  });

  it('should throw error if filePath does not exist', async () => {
    await expect(
      setVisualSpec({ name: 'Invalid', filePath: '/non-existent-file.png' })
    ).rejects.toThrow('File does not exist');
  });

  it('should verify a matching screenshot against a visual spec baseline', async () => {
    await setVisualSpec({
      name: 'Dashboard UI',
      screenshot: sampleBase64,
    });

    const verifyResult = await verifyVisualSpec({
      specName: 'Dashboard UI',
      screenshot: sampleBase64,
      tolerance: 64,
      sddRequirementId: 'REQ-101',
    });

    expect(verifyResult.is_compliant).toBe(true);
    expect(verifyResult.status).toBe('pass');
    expect(verifyResult.sdd_requirement_id).toBe('REQ-101');
    expect(verifyResult.message).toContain('complies with visual spec');
  });

  it('should throw error when verifying non-existent spec name', async () => {
    await expect(
      verifyVisualSpec({
        specName: 'NonExistentSpec',
        screenshot: sampleBase64,
      })
    ).rejects.toThrow('No visual spec baseline found with name');
  });
});
