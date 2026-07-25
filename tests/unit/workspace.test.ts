import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { discoverSubGitRepos, discoverSubMemoryDatabases } from '../../src/utils/workspace.js';
import { getWorkspaceMemoryPaths } from '../../src/config.js';
import { storage } from '../../src/core/storage.js';
import { runDoctor } from '../../src/cli/commands/doctor.js';
import { runAudit } from '../../src/cli/commands/audit.js';

const TEST_DIR = path.resolve(process.cwd(), './data/test-workspace-discovery');
const SUB_REPO = path.join(TEST_DIR, 'sub-app');
const SUB_DB = path.join(TEST_DIR, 'sub-app/.vision-memory-mcp');

describe('Workspace Discovery & Multi-Database Observation', () => {
  beforeAll(async () => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SUB_REPO, { recursive: true });
    fs.mkdirSync(path.join(SUB_REPO, '.git'), { recursive: true });
    fs.mkdirSync(SUB_DB, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should discover root and sub-directory git repositories', () => {
    const repos = discoverSubGitRepos(TEST_DIR);
    expect(repos.length).toBeGreaterThanOrEqual(1);
    const subRepoMatch = repos.find((r) => r.relativePath.includes('sub-app'));
    expect(subRepoMatch).toBeDefined();
  });

  it('should discover sub-directory vision memory databases', () => {
    const dbs = discoverSubMemoryDatabases(TEST_DIR);
    expect(dbs.length).toBeGreaterThanOrEqual(1);
    const subDbMatch = dbs.find((d) => d.path === SUB_DB);
    expect(subDbMatch).toBeDefined();
  });

  it('should include sub-directory memory database in getWorkspaceMemoryPaths', () => {
    const paths = getWorkspaceMemoryPaths(TEST_DIR);
    expect(paths).toContain(SUB_DB);
  });

  it('should run doctor health check without error', async () => {
    await expect(runDoctor()).resolves.not.toThrow();
    await expect(runDoctor(['--json'])).resolves.not.toThrow();
  });

  it('should run workspace audit without error', async () => {
    await expect(runAudit()).resolves.not.toThrow();
    await expect(runAudit(['--json'])).resolves.not.toThrow();
  });
});
