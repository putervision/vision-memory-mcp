import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerProject, getRegistry, unregisterProject } from '../../src/core/registry.js';
import { runDoctorGlobal } from '../../src/cli/commands/doctor.js';

describe('Vision Memory Global Doctor CLI Tests', () => {
  const tmpDir = path.join(
    os.tmpdir(),
    `vision-global-doctor-test-${Math.random().toString(36).substring(2)}`
  );
  const project1Path = path.join(tmpDir, 'project1');
  const project2Path = path.join(tmpDir, 'project2');

  beforeEach(() => {
    fs.mkdirSync(project1Path, { recursive: true });
    fs.mkdirSync(project2Path, { recursive: true });
    fs.mkdirSync(path.join(project1Path, '.vision-memory-mcp'), { recursive: true });
    fs.writeFileSync(path.join(project1Path, '.vision-memory-mcp', 'dummy.db'), 'hello world');

    registerProject('doctor-proj1-test', project1Path);
    registerProject('doctor-proj2-test', project2Path);
  });

  afterEach(() => {
    unregisterProject('doctor-proj1-test');
    unregisterProject('doctor-proj2-test');
    unregisterProject('stale-doctor-test');
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should run doctor-global and output text metrics', async () => {
    await runDoctorGlobal([]);
    const registry = getRegistry();
    expect(registry['doctor-proj1-test']).toBe(path.resolve(project1Path));
  });

  it('should run doctor-global and output JSON metrics', async () => {
    let outputData = '';
    const originalLog = console.log;
    console.log = (msg: string) => {
      outputData += msg + '\n';
    };

    try {
      await runDoctorGlobal(['--json']);
    } finally {
      console.log = originalLog;
    }

    const parsed = JSON.parse(outputData);
    expect(parsed.total_registered_projects).toBeGreaterThanOrEqual(2);
    expect(parsed.active_projects_count).toBeGreaterThanOrEqual(2);
    expect(parsed.global_health_percentage).toBeDefined();
    expect(parsed.projects).toBeDefined();
  });

  it('should clean stale project registrations with --clean-stale flag', async () => {
    const stalePath = path.join(tmpDir, 'stale_project');
    registerProject('stale-doctor-test', stalePath);

    expect(getRegistry()['stale-doctor-test']).toBeDefined();

    await runDoctorGlobal(['--clean-stale']);

    expect(getRegistry()['stale-doctor-test']).toBeUndefined();
  });
});
