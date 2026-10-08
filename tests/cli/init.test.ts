import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runInit, runAutoInit } from '../../src/cli/init.js';
import { runDoctor } from '../../src/cli/commands/doctor.js';
import { analyzeStorageHealth, REQUIRED_TABLES } from '../../src/core/storage-health.js';
import { unregisterProject } from '../../src/core/registry.js';

describe('Vision Memory Local Init & Project Scaffolding CLI Tests', () => {
  let tmpDir: string;
  let testProjectDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-init-test-'));
    testProjectDir = path.join(tmpDir, 'mock-project');
    fs.mkdirSync(testProjectDir, { recursive: true });
  });

  afterEach(() => {
    unregisterProject(path.basename(testProjectDir));
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('should initialize a fresh project with all LanceDB tables, migrations, .env, and agent rules', async () => {
    await runInit(['--yes'], testProjectDir);

    const dbDir = path.join(testProjectDir, '.vision-memory-mcp');
    expect(fs.existsSync(dbDir)).toBe(true);

    // Verify all 5 required LanceDB tables exist on disk
    for (const tableName of REQUIRED_TABLES) {
      const tablePath = path.join(dbDir, `${tableName}.lance`);
      expect(fs.existsSync(tablePath)).toBe(true);
    }

    // Verify schema_version.json is present and at version 2
    const schemaFile = path.join(dbDir, 'schema_version.json');
    expect(fs.existsSync(schemaFile)).toBe(true);
    const schemaContent = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
    expect(schemaContent.version).toBe(2);

    // Verify .env exists and has LANCEDB_PATH
    const envFile = path.join(testProjectDir, '.env');
    expect(fs.existsSync(envFile)).toBe(true);
    const envContent = fs.readFileSync(envFile, 'utf8');
    expect(envContent).toContain('LANCEDB_PATH=.vision-memory-mcp');

    // Verify .gitignore exists
    const gitignoreFile = path.join(testProjectDir, '.gitignore');
    expect(fs.existsSync(gitignoreFile)).toBe(true);
    const gitignoreContent = fs.readFileSync(gitignoreFile, 'utf8');
    expect(gitignoreContent).toContain('.vision-memory-mcp');
    expect(gitignoreContent).toContain('.env');

    // Verify agent instructions and skills exist
    expect(fs.existsSync(path.join(testProjectDir, '.agents', 'AGENTS.md'))).toBe(true);
    expect(
      fs.existsSync(path.join(testProjectDir, '.agents', 'skills', 'vision-memory-mcp', 'SKILL.md'))
    ).toBe(true);

    // Verify analyzeStorageHealth returns healthy with 5 tables
    const health = analyzeStorageHealth(dbDir);
    expect(health.exists).toBe(true);
    expect(health.isHealthy).toBe(true);
    expect(health.tables).toHaveLength(5);
    expect(health.missingTables).toHaveLength(0);
  });

  it('should preserve pre-existing .env and append vision configuration if missing', async () => {
    const envFile = path.join(testProjectDir, '.env');
    fs.writeFileSync(envFile, 'EXISTING_SECRET=keep_this_safe\nPORT=8080\n', 'utf8');

    await runInit(['--yes'], testProjectDir);

    const updatedEnv = fs.readFileSync(envFile, 'utf8');
    expect(updatedEnv).toContain('EXISTING_SECRET=keep_this_safe');
    expect(updatedEnv).toContain('PORT=8080');
    expect(updatedEnv).toContain('LANCEDB_PATH=.vision-memory-mcp');
  });

  it('should accept target root as positional argument in args array', async () => {
    const subProj = path.join(tmpDir, 'positional-project');
    fs.mkdirSync(subProj, { recursive: true });

    await runInit(['init', subProj, '--yes']);

    const dbDir = path.join(subProj, '.vision-memory-mcp');
    expect(fs.existsSync(dbDir)).toBe(true);
    expect(fs.existsSync(path.join(dbDir, 'visual_states.lance'))).toBe(true);
    expect(fs.existsSync(path.join(dbDir, 'schema_version.json'))).toBe(true);
    unregisterProject(path.basename(subProj));
  });

  it('should accept target root via --root flag', async () => {
    const flagProj = path.join(tmpDir, 'flag-project');
    fs.mkdirSync(flagProj, { recursive: true });

    await runInit(['--root', flagProj, '--yes']);

    const dbDir = path.join(flagProj, '.vision-memory-mcp');
    expect(fs.existsSync(dbDir)).toBe(true);
    expect(fs.existsSync(path.join(dbDir, 'visual_states.lance'))).toBe(true);
    unregisterProject(path.basename(flagProj));
  });

  it('should forward root parameter in runAutoInit', async () => {
    const autoProj = path.join(tmpDir, 'auto-project');
    fs.mkdirSync(autoProj, { recursive: true });

    await runAutoInit(autoProj);

    const dbDir = path.join(autoProj, '.vision-memory-mcp');
    expect(fs.existsSync(dbDir)).toBe(true);
    expect(fs.existsSync(path.join(dbDir, 'visual_states.lance'))).toBe(true);
    unregisterProject(path.basename(autoProj));
  });

  it('doctor should detect missing tables and doctor --fix should auto-repair them', async () => {
    // Scaffold initial directory structure without tables
    const dbDir = path.join(testProjectDir, '.vision-memory-mcp');
    fs.mkdirSync(dbDir, { recursive: true });

    // Storage health should detect missing tables
    const preHealth = analyzeStorageHealth(dbDir);
    expect(preHealth.exists).toBe(true);
    expect(preHealth.isHealthy).toBe(false);
    expect(preHealth.missingTables).toHaveLength(5);

    // Run doctor --fix in testProjectDir
    const origCwd = process.cwd();
    try {
      process.chdir(testProjectDir);
      await runDoctor(['--fix', '--json']);
    } finally {
      process.chdir(origCwd);
    }

    // Now all tables should exist and health should be true
    const postHealth = analyzeStorageHealth(dbDir);
    expect(postHealth.isHealthy).toBe(true);
    expect(postHealth.missingTables).toHaveLength(0);
    expect(fs.existsSync(path.join(dbDir, 'visual_states.lance'))).toBe(true);
  });
});
