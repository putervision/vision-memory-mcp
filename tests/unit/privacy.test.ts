import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { redactSensitiveText, redactImageRegions } from '../../src/core/privacy.js';

describe('Privacy & Sensitive-Data Redaction Module', () => {
  it('should detect and redact email addresses and API keys', () => {
    const rawText =
      'User email is john.doe@example.com and secret key is sk-proj-1234567890abcdef1234567890abcdef';
    const result = redactSensitiveText(rawText);

    expect(result.isRedacted).toBe(true);
    expect(result.detectedTypes).toContain('Email');
    expect(result.detectedTypes).toContain('OpenAI API Key');
    expect(result.redactedText).toContain('[REDACTED_EMAIL]');
    expect(result.redactedText).toContain('[REDACTED_OPENAI_API_KEY]');
  });

  it('should handle empty input in redactSensitiveText', () => {
    const res = redactSensitiveText('');
    expect(res.isRedacted).toBe(false);
  });

  it('should perform solid rectangle composite masking on a valid image buffer', async () => {
    const validBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const masked = await redactImageRegions(validBuffer, [[10, 10, 50, 50]]);
    expect(masked).toBeDefined();
    expect(masked.length).toBeGreaterThan(0);
  });

  it('should return original buffer if bboxes is empty or buffer is null', async () => {
    const buf = Buffer.from('test');
    const res = await redactImageRegions(buf, []);
    expect(res).toBe(buf);
  });
});
