import { describe, it, expect } from 'vitest';
import { redactData, redactText } from '../src/utils/redact.js';

describe('Vision Memory Synergy & Governance Tests', () => {
  it('should redact sensitive tokens and credentials from text and objects', () => {
    const rawSecret = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret sk-abcdef123456789012345678';
    const redacted = redactText(rawSecret);
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(redacted).toContain('[REDACTED]');

    const obj = redactData({
      user: 'alice',
      password: 'SuperSecretPassword123!',
      api_key: 'sk-abcdef123456789012345678',
    });
    expect(obj.password).toBe('[REDACTED]');
    expect(obj.api_key).toBe('[REDACTED]');
  });
});
