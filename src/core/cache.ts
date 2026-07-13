import { execSync } from 'child_process';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { VisualState } from '../types.js';

let cachedBranch: string | null = null;
let lastBranchCheck = 0;
const BRANCH_CHECK_INTERVAL_MS = 10000; // Cache branch name for 10s to avoid execSync overhead

/**
 * Executes a git command synchronously to get the active branch.
 * Falls back to 'main' if git is not initialized or fails.
 */
export function getCurrentBranch(): string {
  const now = Date.now();
  if (cachedBranch && now - lastBranchCheck < BRANCH_CHECK_INTERVAL_MS) {
    return cachedBranch;
  }

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    cachedBranch = branch || 'main';
  } catch (error) {
    cachedBranch = 'main';
  }
  lastBranchCheck = now;
  return cachedBranch;
}

interface CacheEntry {
  state: VisualState;
  insertedAt: number;
  ttl: number; // in ms, 0 = never expire
}

export class MemoryCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize: number = config.LANCEDB_CACHE_SIZE) {
    this.maxSize = maxSize;
  }

  /**
   * Generates a branch-specific key for the state.
   */
  private makeKey(id: string, branch: string = getCurrentBranch()): string {
    return `${branch}:${id}`;
  }

  /**
   * Retrieves a VisualState from the in-memory cache.
   * Returns null if not found, expired, or branch does not match.
   */
  get(id: string, branch: string = getCurrentBranch()): VisualState | null {
    const key = this.makeKey(id, branch);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.ttl > 0 && Date.now() - entry.insertedAt > entry.ttl) {
      logger.debug(`LRU Cache: Evicting expired state ${id}`);
      this.cache.delete(key);
      return null;
    }

    // Refresh LRU position by deleting and re-inserting
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.state;
  }

  /**
   * Inserts or updates a VisualState in the cache.
   * Evicts the oldest entry if size limit is exceeded.
   */
  set(state: VisualState, ttlMs: number = config.TTL_DEFAULT_MS): void {
    const branch = state.git_branch || getCurrentBranch();
    const key = this.makeKey(state.id, branch);

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest (first entry in insertion order)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        logger.debug(`LRU Cache: Cache full, evicting oldest state ${oldestKey}`);
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      state,
      insertedAt: Date.now(),
      ttl: ttlMs,
    });
    logger.debug(`LRU Cache: Cached state ${state.id} on branch ${branch}`);
  }

  /**
   * Removes a specific state from the cache.
   */
  delete(id: string, branch: string = getCurrentBranch()): void {
    const key = this.makeKey(id, branch);
    this.cache.delete(key);
    logger.debug(`LRU Cache: Removed state ${id} on branch ${branch}`);
  }

  /**
   * Clears all cached items.
   */
  clear(): void {
    this.cache.clear();
    logger.info('LRU Cache cleared.');
  }

  /**
   * Returns current size of the cache.
   */
  get size(): number {
    return this.cache.size;
  }
}

export const memoryCache = new MemoryCache();
