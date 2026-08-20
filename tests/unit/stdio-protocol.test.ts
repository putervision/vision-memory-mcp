import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

describe('Area 3: E2E Standard I/O (Stdio) MCP Protocol Tests', () => {
  const cliPath = path.resolve(process.cwd(), 'dist/cli.js');

  beforeAll(() => {
    if (!fs.existsSync(cliPath)) {
      execSync('npm run build', { stdio: 'inherit' });
    }
  });

  it('should output current version from CLI binary with --version', () => {
    const output = execSync(`node "${cliPath}" --version`, { encoding: 'utf-8' }).trim();
    expect(output).toBe('1.0.0');
  });

  it('should support --skip-model-load flag in CLI help documentation', () => {
    const helpOutput = execSync(`node "${cliPath}" --help`, { encoding: 'utf-8' });
    expect(helpOutput).toContain('--skip-model-load');
  });
});
