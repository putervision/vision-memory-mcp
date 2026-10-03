import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import { validatePath, getDefaultAllowedDirs } from '../../src/utils/path-validator.js';
import { generatePlaywrightSnippet } from '../../src/core/automation-hooks.js';
import { s } from '../../src/schema/schemas.js';

describe('Path Security and Input Validation', () => {
  it('rejects path traversal attempts with .. segments', () => {
    expect(() => validatePath('../../../etc/passwd')).toThrow(/Path traversal detected/);
    expect(() => validatePath('foo/../../bar')).toThrow(/Path traversal detected/);
  });

  it('rejects paths outside allowed directories', () => {
    const sensitivePath = process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc/shadow';
    expect(() => validatePath(sensitivePath)).toThrow(/outside allowed directories/);
  });

  it('allows safe paths inside current directory or temp directory', () => {
    const safePath = path.join(process.cwd(), 'package.json');
    const validated = validatePath(safePath);
    expect(validated).toBe(path.resolve(safePath));

    const tmpPath = path.join(os.tmpdir(), 'safe-test-file.png');
    const validatedTmp = validatePath(tmpPath);
    expect(validatedTmp).toBe(path.resolve(tmpPath));
  });

  it('filters root / directory from allowed dirs to prevent privilege escalation', () => {
    const allowed = getDefaultAllowedDirs(process.cwd());
    const root = path.parse(path.resolve('/')).root;
    expect(allowed.includes(root)).toBe(false);
  });

  it('safely escapes injection attempts in Playwright snippet selectors and values', () => {
    const maliciousTarget = {
      action: 'click',
      target_selector: "button'); maliciousCode(); //",
    };
    const snippet = generatePlaywrightSnippet(maliciousTarget as any);
    expect(snippet).toBe("await page.click('button\\'); maliciousCode(); //');");

    const maliciousFill = {
      action: 'fill',
      target_selector: "input[name='pwd']",
      suggested_input_value: "'); evil(); ('",
    };
    const fillSnippet = generatePlaywrightSnippet(maliciousFill as any);
    expect(fillSnippet).toContain(
      "await page.fill('input[name=\\'pwd\\']', '\\'); evil(); (\\'');"
    );
  });

  it('filters prototype pollution keys in RecordSchema', () => {
    const schema = s.record(s.string());
    const raw = JSON.parse(
      '{"__proto__": "polluted", "constructor": "bad", "prototype": "bad", "valid": "ok"}'
    );
    const parsed = schema.parse(raw);
    expect(parsed.valid).toBe('ok');
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'prototype')).toBe(false);
  });
});
