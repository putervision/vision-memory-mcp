import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface DiscoveredGitRepo {
  path: string;
  relativePath: string;
  branch: string;
  isRoot: boolean;
}

export interface DiscoveredMemoryDb {
  path: string;
  relativePath: string;
  isRoot: boolean;
}

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  '.git',
  'coverage',
  '.next',
]);

const CACHE_TTL_MS = 10000;
let cachedGitRepos: { timestamp: number; key: string; data: DiscoveredGitRepo[] } | null = null;
let cachedMemoryDbs: { timestamp: number; key: string; data: DiscoveredMemoryDb[] } | null = null;

export function clearWorkspaceCache(): void {
  cachedGitRepos = null;
  cachedMemoryDbs = null;
}

/**
 * Discovers Git repositories in the workspace, including the root repository and sub-directories.
 * Uses a 10s TTL cache to maximize performance during frequent tool queries.
 */
export function discoverSubGitRepos(rootDir: string = process.cwd()): DiscoveredGitRepo[] {
  const rootResolved = path.resolve(rootDir);
  const now = Date.now();

  if (
    cachedGitRepos &&
    cachedGitRepos.key === rootResolved &&
    now - cachedGitRepos.timestamp < CACHE_TTL_MS
  ) {
    return cachedGitRepos.data;
  }

  const results: DiscoveredGitRepo[] = [];

  function getBranch(repoPath: string): string {
    try {
      const headPath = path.join(repoPath, '.git', 'HEAD');
      if (fs.existsSync(headPath)) {
        const content = fs.readFileSync(headPath, 'utf8').trim();
        if (content.startsWith('ref: refs/heads/')) {
          return content.substring(16);
        }
        if (/^[0-9a-f]{40}$/i.test(content)) {
          return 'HEAD';
        }
      }
    } catch {
      // Fallback
    }

    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: repoPath,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
      return branch || 'main';
    } catch {
      return 'main';
    }
  }

  // Check root
  if (fs.existsSync(path.join(rootResolved, '.git'))) {
    results.push({
      path: rootResolved,
      relativePath: '.',
      branch: getBranch(rootResolved),
      isRoot: true,
    });
  }

  function scanDir(dir: string, depth: number = 0) {
    if (depth > 5) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (DEFAULT_IGNORE_DIRS.has(name) || name.startsWith('.')) continue;

      const fullPath = path.join(dir, name);
      const hasGit = fs.existsSync(path.join(fullPath, '.git'));
      const relativePath = path.relative(rootResolved, fullPath);

      if (hasGit) {
        results.push({
          path: fullPath,
          relativePath,
          branch: getBranch(fullPath),
          isRoot: false,
        });
      }

      scanDir(fullPath, depth + 1);
    }
  }

  scanDir(rootResolved, 0);
  cachedGitRepos = { timestamp: now, key: rootResolved, data: results };
  return results;
}

/**
 * Discovers vision memory databases (.vision-memory-mcp or .vision-memory) in root and sub-directories.
 * Uses a 10s TTL cache to maximize performance during frequent tool queries.
 */
export function discoverSubMemoryDatabases(rootDir: string = process.cwd()): DiscoveredMemoryDb[] {
  const rootResolved = path.resolve(rootDir);
  const now = Date.now();

  if (
    cachedMemoryDbs &&
    cachedMemoryDbs.key === rootResolved &&
    now - cachedMemoryDbs.timestamp < CACHE_TTL_MS
  ) {
    return cachedMemoryDbs.data;
  }

  const results: DiscoveredMemoryDb[] = [];
  const visitedPaths = new Set<string>();

  function addIfDb(dbPath: string, isRoot: boolean) {
    const resolved = path.resolve(dbPath);
    if (
      fs.existsSync(resolved) &&
      fs.statSync(resolved).isDirectory() &&
      !visitedPaths.has(resolved)
    ) {
      try {
        const realPath = fs.realpathSync(resolved);
        if (!realPath.startsWith(rootResolved)) {
          return;
        }
      } catch {
        return;
      }
      visitedPaths.add(resolved);
      results.push({
        path: resolved,
        relativePath: isRoot ? '.' : path.relative(rootResolved, resolved),
        isRoot,
      });
    }
  }

  // Check root paths
  addIfDb(path.join(rootResolved, '.vision-memory-mcp'), true);
  addIfDb(path.join(rootResolved, '.vision-memory'), true);

  function scanDir(dir: string, depth: number = 0) {
    if (depth > 5) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;

      if (name === '.vision-memory-mcp' || name === '.vision-memory') {
        const dbPath = path.join(dir, name);
        addIfDb(dbPath, dir === rootResolved);
        continue;
      }

      if (
        DEFAULT_IGNORE_DIRS.has(name) ||
        (name.startsWith('.') && name !== '.vision-memory-mcp' && name !== '.vision-memory')
      ) {
        continue;
      }

      const fullPath = path.join(dir, name);
      scanDir(fullPath, depth + 1);
    }
  }

  scanDir(rootResolved, 0);
  cachedMemoryDbs = { timestamp: now, key: rootResolved, data: results };
  return results;
}
