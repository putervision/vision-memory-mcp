import { describe, it, expect } from 'vitest';
import { redactSensitiveText, redactImageRegions } from '../../src/core/privacy.js';

async function createTestPngBuffer(): Promise<Buffer> {
  try {
    const s = (await import('sharp')).default;
    return await s({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
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
    const validBuffer = await createTestPngBuffer();
    const redacted = await redactImageRegions(validBuffer, [[10, 10, 30, 30]]);
    expect(redacted).toBeDefined();
    expect(redacted.length).toBeGreaterThan(0);
  });

  it('should return original buffer if bboxes is empty or buffer is null', async () => {
    const buf = Buffer.from('test');
    const res = await redactImageRegions(buf, []);
    expect(res).toBe(buf);
  });
});
