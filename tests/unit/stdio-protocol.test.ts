import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('Area 3: E2E Standard I/O (Stdio) MCP Protocol Tests', () => {
  it('should output current version from CLI binary with --version', () => {
    const cliPath = path.resolve(process.cwd(), 'dist/cli.js');
    const output = execSync(`node "${cliPath}" --version`, { encoding: 'utf-8' }).trim();
    expect(output).toBe('0.9.0');
  });

  it('should support --skip-model-load flag in CLI help documentation', () => {
    const cliPath = path.resolve(process.cwd(), 'dist/cli.js');
    const helpOutput = execSync(`node "${cliPath}" --help`, { encoding: 'utf-8' });
    expect(helpOutput).toContain('--skip-model-load');
  });
});
