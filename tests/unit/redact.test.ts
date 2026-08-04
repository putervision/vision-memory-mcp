import { describe, it, expect } from 'vitest';
import { redactText, redactData, redactUrl } from '../../src/utils/redact.js';

describe('Utils Redact Module', () => {
  describe('redactText', () => {
    it('should return empty string / non-string as-is', () => {
      expect(redactText('')).toBe('');
    });

    it('should redact Bearer tokens', () => {
      const input = 'Authorization: Bearer secret-token-12345';
      expect(redactText(input)).toBe('Authorization: Bearer [REDACTED]');
    });

    it('should redact OpenAI and GitHub API keys', () => {
      const input =
        'API key sk-proj-1234567890abcdef1234567890abcdef and token ghp_123456789012345678901234567890123456';
      const output = redactText(input);
      expect(output).toContain('[REDACTED_API_KEY]');
    });

    it('should redact email addresses', () => {
      const input = 'Contact user@example.com for help';
      expect(redactText(input)).toContain('[REDACTED_EMAIL]');
    });

    it('should redact key=value secret patterns', () => {
      const input = 'api_key="my-secret-value-123"';
      expect(redactText(input)).toContain('api_key="[REDACTED]"');
    });
  });

  describe('redactData', () => {
    it('should recursively redact objects and arrays', () => {
      const data = {
        user: { email: 'test@example.com', password: 'supersecretpassword' },
        tokens: ['sk-proj-1234567890abcdef1234567890abcdef'],
      };
      const redacted = redactData(data);
      expect(redacted.user.password).toBe('[REDACTED]');
      expect(redacted.user.email).toContain('[REDACTED_EMAIL]');
      expect(redacted.tokens[0]).toContain('[REDACTED_API_KEY]');
    });
  });

  describe('redactUrl', () => {
    it('should redact sensitive query parameters from URLs', () => {
      const url = 'https://bank.example.com/account?token=xyz123&user=john&api_key=secret99';
      const redacted = redactUrl(url);
      expect(redacted).toContain('token=%5BREDACTED%5D');
      expect(redacted).toContain('api_key=[REDACTED]');
      expect(redacted).toContain('user=john');
    });

    it('should fallback to redactText for non-URL strings', () => {
      const raw = 'not-a-valid-url user@example.com';
      expect(redactUrl(raw)).toContain('[REDACTED_EMAIL]');
    });
  });
});
