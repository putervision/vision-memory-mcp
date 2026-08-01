import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';

let cachedDirSize = 0;
let lastSizeCalcTime = 0;
const DIR_SIZE_CACHE_TTL_MS = 60000; // Cache directory size for 60 seconds

/**
 * Recursively calculates total byte size of a directory.
 */
export function getDirSize(dirPath: string): number {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          size += getDirSize(filePath);
        } else {
          size += stats.size;
        }
      } catch (err) {
        logger.debug('Error checking file size:', err);
      }
    }
  } catch (err) {
    logger.debug('Error reading directory for size calculation:', err);
  }
  return size;
}

/**
 * Cached version of getDirSize with a 60s TTL to prevent repeated filesystem walks.
 */
export function getCachedDirSize(dirPath: string, force = false): number {
  const now = Date.now();
  if (!force && cachedDirSize > 0 && now - lastSizeCalcTime < DIR_SIZE_CACHE_TTL_MS) {
    return cachedDirSize;
  }
  cachedDirSize = getDirSize(dirPath);
  lastSizeCalcTime = now;
  return cachedDirSize;
}
