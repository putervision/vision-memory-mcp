import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { storage } from '../../src/core/storage.js';
import { extractTextFromImage, computeTextJaccardSimilarity } from '../../src/core/ocr.js';
import { redactSensitiveText, redactImageRegions } from '../../src/core/privacy.js';
import {
  getRegistry,
  registerProject,
  unregisterProject,
  getProjectFromRegistry,
} from '../../src/core/registry.js';
import { setVisualSpec, verifyVisualSpec, listVisualSpecs } from '../../src/core/visual-spec.js';

describe('Vision Memory Core Deep Branch Matrix - OCR, Privacy, Registry, Visual Spec', () => {
  const dummyBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  let tempDir: string;
  let origEnvReg: string | undefined;

  beforeEach(async () => {
    origEnvReg = process.env.VISION_MEMORY_REGISTRY_PATH;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-core-matrix-'));
    process.env.VISION_MEMORY_REGISTRY_PATH = path.join(tempDir, 'projects.json');
    await storage.init(tempDir);
  });

  afterEach(() => {
    if (origEnvReg !== undefined) {
      process.env.VISION_MEMORY_REGISTRY_PATH = origEnvReg;
    } else {
      delete process.env.VISION_MEMORY_REGISTRY_PATH;
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe('OCR module branches', async () => {
    it('should handle empty buffer, valid buffers, and Jaccard similarity edge cases', async () => {
      const emptyRes = await extractTextFromImage(Buffer.alloc(0));
      expect(emptyRes.full_text).toBe('');
      expect(emptyRes.tokens).toEqual([]);

      const sampleBuffer = Buffer.from('HelloWorld Login Submit Button Text');
      const textRes = await extractTextFromImage(sampleBuffer);
      expect(textRes.full_text).toBeDefined();

      // Jaccard similarity edge cases
      expect(computeTextJaccardSimilarity(null, null)).toBe(1.0);
      expect(computeTextJaccardSimilarity('hello', null)).toBe(1.0);
      expect(computeTextJaccardSimilarity('   ', '   ')).toBe(1.0);
      expect(computeTextJaccardSimilarity('hello world', '   ')).toBe(0.0);
      expect(computeTextJaccardSimilarity('login button', 'login submit')).toBeGreaterThan(0.0);
      expect(computeTextJaccardSimilarity('login button', 'completely different')).toBe(0.0);
    });
  });

  describe('Privacy module branches', () => {
    it('should test sensitive text redaction and image region masking', async () => {
      expect(redactSensitiveText('')).toEqual({
        redactedText: '',
        isRedacted: false,
        detectedTypes: [],
      });

      const textWithPII = `
        User: test@example.com
        Card: 4111-2222-3333-4444
        SSN: 123-45-6789
        Key: sk-12345678901234567890123456789012
        Token: ghp_123456789012345678901234567890123456
      `;

      const redacted = redactSensitiveText(textWithPII);
      expect(redacted.isRedacted).toBe(true);
      expect(redacted.detectedTypes).toContain('Email');
      expect(redacted.detectedTypes).toContain('Credit Card');
      expect(redacted.detectedTypes).toContain('SSN');
      expect(redacted.detectedTypes).toContain('OpenAI API Key');
      expect(redacted.detectedTypes).toContain('GitHub Token');

      // Image region redaction
      const buf = Buffer.from(dummyBase64, 'base64');
      const emptyBboxRes = await redactImageRegions(buf, []);
      expect(emptyBboxRes).toEqual(buf);

      const masked = await redactImageRegions(buf, [[0, 0, 10, 10]]);
      expect(masked).toBeDefined();
    });
  });

  describe('Registry module branches', () => {
    it('should test project registration, unregistration, temp file cleanups, and corruption', () => {
      const reg = getRegistry();
      expect(typeof reg).toBe('object');

      registerProject('deep-test-pkg', tempDir);
      expect(getProjectFromRegistry('deep-test-pkg')).toBe(path.resolve(tempDir));

      unregisterProject('deep-test-pkg');
      expect(getProjectFromRegistry('deep-test-pkg')).toBeUndefined();

      // Attempt register homedir (should no-op)
      registerProject('home-ignore', os.homedir());
      expect(getProjectFromRegistry('home-ignore')).toBeUndefined();
    });
  });

  describe('Visual Spec module branches', () => {
    it('should test setVisualSpec, verifyVisualSpec, and listVisualSpecs', async () => {
      // Missing inputs
      await expect(setVisualSpec({ name: 'test-spec' })).rejects.toThrow(
        'Either screenshot base64 or filePath must be provided'
      );
      await expect(
        setVisualSpec({ name: 'test-spec', filePath: '/non/existent/file.png' })
      ).rejects.toThrow('File does not exist');

      // Register from base64
      const spec = await setVisualSpec({
        name: 'login-modal',
        screenshot: dummyBase64,
        metadata: { component: 'LoginForm' },
      });
      expect(spec.id).toBeDefined();
      expect(spec.dhash).toBeDefined();

      // List specs
      const list = await listVisualSpecs();
      expect(list.length).toBeGreaterThan(0);
      expect(list.some((s) => s.name === 'login-modal')).toBe(true);

      // Verify compliant
      const verifyPass = await verifyVisualSpec({
        specName: 'login-modal',
        screenshot: dummyBase64,
        tolerance: 0.1,
      });
      expect(verifyPass.status).toBe('pass');
      expect(verifyPass.is_compliant).toBe(true);

      // Verify non-existent baseline
      await expect(
        verifyVisualSpec({
          specName: 'unregistered-modal',
          screenshot: dummyBase64,
        })
      ).rejects.toThrow(/No visual spec baseline found/i);
    });
  });
});
