import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * Custom lightweight .env parser to eliminate `dotenv` dependency.
 */
function loadEnv(envPath: string = '.env'): void {
  const resolvedPath = path.resolve(process.cwd(), envPath);
  if (!fs.existsSync(resolvedPath)) return;

  try {
    const content = fs.readFileSync(resolvedPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        value = value.replace(/^["']|["']$/g, '');
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    }
  } catch {
    // Ignore unreadable env files
  }
}

// Load environment variables from .env if present
loadEnv();

// Resolve project root by walking up from CWD
export function resolveProjectRoot(cwd: string = process.cwd()): string {
  let current = path.resolve(cwd);
  while (true) {
    const isHome = current === os.homedir();
    const hasGit = fs.existsSync(path.join(current, '.git'));
    const hasVisionMemory =
      !isHome &&
      (fs.existsSync(path.join(current, '.vision-memory')) ||
        fs.existsSync(path.join(current, '.vision-memory-mcp')));

    if (hasGit || hasVisionMemory) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break; // reached root directory
    }
    current = parent;
  }
  return path.resolve(cwd); // default to cwd if none found
}

export interface Config {
  LANCEDB_PATH: string;
  LANCEDB_CACHE_SIZE: number;
  HASH_EXACT_THRESHOLD: number;
  HASH_SIMILAR_THRESHOLD: number;
  CLIP_MODEL: string;
  EMBEDDING_DIMENSIONS: number;
  VISION_MODEL_ENABLED: boolean;
  VISION_MODEL_ENDPOINT: string;
  VISION_MODEL_NAME: string;
  VISION_MODEL_MAX_TOKENS: number;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  TTL_DEFAULT_MS: number;
  MAX_IMAGE_SIZE_MB: number;
  THUMBNAIL_SIZE: number;
}

function parseNumber(
  val: string | undefined,
  defaultVal: number,
  fieldName: string,
  min?: number,
  max?: number
): number {
  if (val === undefined || val === '') return defaultVal;
  const num = Number(val);
  if (isNaN(num)) {
    throw new Error(`${fieldName} must be a valid number, got "${val}"`);
  }
  if (min !== undefined && num < min) {
    throw new Error(`${fieldName} must be >= ${min}, got ${num}`);
  }
  if (max !== undefined && num > max) {
    throw new Error(`${fieldName} must be <= ${max}, got ${num}`);
  }
  return num;
}

function parseConfig(env: Record<string, string | undefined>): Config {
  const logLevelRaw = (env.LOG_LEVEL || 'info').toLowerCase();
  const validLogLevels: Config['LOG_LEVEL'][] = [
    'debug',
    'info',
    'warn',
    'error',
  ];
  if (!validLogLevels.includes(logLevelRaw as Config['LOG_LEVEL'])) {
    throw new Error(
      `LOG_LEVEL must be one of [debug, info, warn, error], got "${env.LOG_LEVEL}"`
    );
  }

  const visionEnabledRaw = env.VISION_MODEL_ENABLED;
  const visionEnabled =
    typeof visionEnabledRaw === 'string'
      ? visionEnabledRaw.toLowerCase() === 'true'
      : false;

  return {
    LANCEDB_PATH: env.LANCEDB_PATH || '.vision-memory-mcp',
    LANCEDB_CACHE_SIZE: parseNumber(
      env.LANCEDB_CACHE_SIZE,
      100,
      'LANCEDB_CACHE_SIZE',
      1
    ),
    HASH_EXACT_THRESHOLD: parseNumber(
      env.HASH_EXACT_THRESHOLD,
      5,
      'HASH_EXACT_THRESHOLD',
      0,
      64
    ),
    HASH_SIMILAR_THRESHOLD: parseNumber(
      env.HASH_SIMILAR_THRESHOLD,
      10,
      'HASH_SIMILAR_THRESHOLD',
      0,
      64
    ),
    CLIP_MODEL: env.CLIP_MODEL || 'Xenova/clip-vit-base-patch32',
    EMBEDDING_DIMENSIONS: parseNumber(
      env.EMBEDDING_DIMENSIONS,
      512,
      'EMBEDDING_DIMENSIONS',
      1
    ),
    VISION_MODEL_ENABLED: visionEnabled,
    VISION_MODEL_ENDPOINT:
      env.VISION_MODEL_ENDPOINT || 'http://localhost:1234/v1',
    VISION_MODEL_NAME: env.VISION_MODEL_NAME || 'gpt-4o',
    VISION_MODEL_MAX_TOKENS: parseNumber(
      env.VISION_MODEL_MAX_TOKENS,
      500,
      'VISION_MODEL_MAX_TOKENS',
      1
    ),
    LOG_LEVEL: logLevelRaw as Config['LOG_LEVEL'],
    TTL_DEFAULT_MS: parseNumber(
      env.TTL_DEFAULT_MS,
      604800000,
      'TTL_DEFAULT_MS',
      0
    ),
    MAX_IMAGE_SIZE_MB: parseNumber(
      env.MAX_IMAGE_SIZE_MB,
      10,
      'MAX_IMAGE_SIZE_MB',
      1
    ),
    THUMBNAIL_SIZE: parseNumber(env.THUMBNAIL_SIZE, 64, 'THUMBNAIL_SIZE', 1),
  };
}

let validatedConfig: Config;

try {
  validatedConfig = parseConfig(
    process.env as Record<string, string | undefined>
  );
} catch (error: any) {
  console.error('❌ Configuration error:', error.message || error);
  process.exit(1);
}

// Ensure the path is absolute relative to the project root if not already absolute
const projectRoot = resolveProjectRoot();
export const config = {
  ...validatedConfig,
  LANCEDB_PATH: path.isAbsolute(validatedConfig.LANCEDB_PATH)
    ? validatedConfig.LANCEDB_PATH
    : path.resolve(projectRoot, validatedConfig.LANCEDB_PATH),
};
