import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerProject, getRegistry, unregisterProject } from '../../src/core/registry.js';
import { runInitGlobal } from '../../src/cli/init.js';

describe('Vision Memory Global Init & Registry CLI Tests', () => {
  const tmpDir = path.join(
    os.tmpdir(),
    `vision-global-init-test-${Math.random().toString(36).substring(2)}`
  );
  const project1Path = path.join(tmpDir, 'project1');
  const project2Path = path.join(tmpDir, 'project2');

  beforeEach(() => {
    fs.mkdirSync(project1Path, { recursive: true });
    fs.mkdirSync(project2Path, { recursive: true });
    registerProject('vision-proj1-test', project1Path);
    registerProject('vision-proj2-test', project2Path);
  });

  afterEach(() => {
    unregisterProject('vision-proj1-test');
    unregisterProject('vision-proj2-test');
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should register and retrieve vision projects from global registry', () => {
    const registry = getRegistry();
    expect(registry['vision-proj1-test']).toBe(path.resolve(project1Path));
    expect(registry['vision-proj2-test']).toBe(path.resolve(project2Path));
  });

  it('should run init-global across all registered vision projects', async () => {
    await runInitGlobal(['--yes']);

    expect(fs.existsSync(path.join(project1Path, '.vision-memory-mcp'))).toBe(true);
    expect(fs.existsSync(path.join(project2Path, '.vision-memory-mcp'))).toBe(true);
    expect(fs.existsSync(path.join(project1Path, '.agents', 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(project2Path, '.agents', 'AGENTS.md'))).toBe(true);
  });

  it('should clean stale project registrations when --clean-stale flag is passed', async () => {
    const stalePath = path.join(tmpDir, 'stale_vision_project');
    registerProject('stale-vision-test', stalePath);

    expect(getRegistry()['stale-vision-test']).toBeDefined();

    await runInitGlobal(['--clean-stale', '--yes']);

    expect(getRegistry()['stale-vision-test']).toBeUndefined();
  });
});
