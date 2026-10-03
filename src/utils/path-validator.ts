import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface PathValidationConfig {
  allowedDirs: string[];
}

/**
 * Returns default allowed base directories:
 * - Current working directory / project root
 * - OS temp directory
 * - ~/.gemini/antigravity/brain (for screenshot artifacts)
 * - ~/.vision-memory-mcp
 * - Any directories specified in VISION_ALLOWED_DIRS (comma-separated)
 */
export function getDefaultAllowedDirs(projectRoot: string = process.cwd()): string[] {
  const allowed = [
    path.resolve(projectRoot),
    path.resolve(os.tmpdir()),
    path.resolve(os.homedir(), '.gemini', 'antigravity', 'brain'),
    path.resolve(os.homedir(), '.vision-memory-mcp'),
  ];

  if (process.env.VISION_ALLOWED_DIRS) {
    const extra = process.env.VISION_ALLOWED_DIRS.split(',')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => path.resolve(d));
    allowed.push(...extra);
  }

  // Deduplicate and filter out root / if present (prevent full escalation)
  const root = path.parse(path.resolve('/')).root;
  return Array.from(new Set(allowed)).filter((d) => d !== root);
}

/**
 * Validates that a user-provided path is safe and resolves within one of the allowed directories.
 */
export function validatePath(
  userPath: string,
  options: { projectRoot?: string; mustExist?: boolean } = {}
): string {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Path must be a non-empty string');
  }

  const norm = path.normalize(userPath);
  if (userPath.includes('..') || norm.split(path.sep).includes('..')) {
    throw new Error(`Path traversal detected: path "${userPath}" contains ".." segments`);
  }

  let resolvedPath = path.resolve(userPath);

  // Symlink resolution using longest existing ancestor
  let checkPath = resolvedPath;
  while (checkPath && checkPath !== path.parse(checkPath).root) {
    if (fs.existsSync(checkPath)) {
      try {
        const real = fs.realpathSync(checkPath);
        const rel = path.relative(checkPath, resolvedPath);
        resolvedPath = path.resolve(real, rel);
      } catch {
        // Fall back to resolvedPath if realpath fails
      }
      break;
    }
    checkPath = path.dirname(checkPath);
  }

  if (resolvedPath.split(path.sep).includes('..')) {
    throw new Error(
      `Path traversal detected: resolved path "${resolvedPath}" contains relative segments`
    );
  }

  const allowedDirs = getDefaultAllowedDirs(options.projectRoot);
  const isAllowed = allowedDirs.some((allowedDir) => {
    const relative = path.relative(allowedDir, resolvedPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });

  if (!isAllowed) {
    throw new Error(
      `Access denied: path "${userPath}" (resolved to "${resolvedPath}") is outside allowed directories: ${allowedDirs.join(', ')}`
    );
  }

  if (options.mustExist && !fs.existsSync(resolvedPath)) {
    throw new Error(`File does not exist: "${userPath}"`);
  }

  return resolvedPath;
}
