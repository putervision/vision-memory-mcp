import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Load environment variables from .env if present
dotenv.config();

// Resolve project root by walking up from CWD
export function resolveProjectRoot(cwd: string = process.cwd()): string {
  let current = path.resolve(cwd);
  while (true) {
    const isHome = current === os.homedir();
    const hasGit = fs.existsSync(path.join(current, '.git'));
    const hasVisionMemory = !isHome && (
      fs.existsSync(path.join(current, '.vision-memory')) ||
      fs.existsSync(path.join(current, '.vision-memory-mcp'))
    );

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

const configSchema = z.object({
  LANCEDB_PATH: z.string().default('.vision-memory-mcp'),
  LANCEDB_CACHE_SIZE: z.coerce.number().int().positive().default(100),
  HASH_EXACT_THRESHOLD: z.coerce.number().int().min(0).max(64).default(5),
  HASH_SIMILAR_THRESHOLD: z.coerce.number().int().min(0).max(64).default(10),
  CLIP_MODEL: z.string().default('Xenova/clip-vit-base-patch32'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(512),
  VISION_MODEL_ENABLED: z
    .string()
    .transform((val) => val.toLowerCase() === 'true')
    .or(z.boolean())
    .default(false),
  VISION_MODEL_ENDPOINT: z.string().url().default('http://localhost:1234/v1'),
  VISION_MODEL_NAME: z.string().default('gpt-4o'),
  VISION_MODEL_MAX_TOKENS: z.coerce.number().int().positive().default(500),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TTL_DEFAULT_MS: z.coerce.number().int().nonnegative().default(604800000), // 7 days
  MAX_IMAGE_SIZE_MB: z.coerce.number().int().positive().default(10),
  THUMBNAIL_SIZE: z.coerce.number().int().positive().default(64),
});

export type Config = z.infer<typeof configSchema>;

let validatedConfig: Config;

try {
  validatedConfig = configSchema.parse({
    LANCEDB_PATH: process.env.LANCEDB_PATH,
    LANCEDB_CACHE_SIZE: process.env.LANCEDB_CACHE_SIZE,
    HASH_EXACT_THRESHOLD: process.env.HASH_EXACT_THRESHOLD,
    HASH_SIMILAR_THRESHOLD: process.env.HASH_SIMILAR_THRESHOLD,
    CLIP_MODEL: process.env.CLIP_MODEL,
    EMBEDDING_DIMENSIONS: process.env.EMBEDDING_DIMENSIONS,
    VISION_MODEL_ENABLED: process.env.VISION_MODEL_ENABLED,
    VISION_MODEL_ENDPOINT: process.env.VISION_MODEL_ENDPOINT,
    VISION_MODEL_NAME: process.env.VISION_MODEL_NAME,
    VISION_MODEL_MAX_TOKENS: process.env.VISION_MODEL_MAX_TOKENS,
    LOG_LEVEL: process.env.LOG_LEVEL,
    TTL_DEFAULT_MS: process.env.TTL_DEFAULT_MS,
    MAX_IMAGE_SIZE_MB: process.env.MAX_IMAGE_SIZE_MB,
    THUMBNAIL_SIZE: process.env.THUMBNAIL_SIZE,
  });
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid configuration environment variables:');
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
  } else {
    console.error('❌ Configuration error:', error);
  }
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
