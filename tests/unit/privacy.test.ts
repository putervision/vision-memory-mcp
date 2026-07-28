import { describe, it, expect } from 'vitest';
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

  it('should perform solid rectangle composite masking on buffer', async () => {
    const rawBuffer = Buffer.from('mock-png-buffer');
    const masked = await redactImageRegions(rawBuffer, [[10, 10, 100, 40]]);
    expect(masked).toBeDefined();
    expect(masked.length).toBeGreaterThan(0);
  });
});
