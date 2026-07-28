import { storage } from './storage.js';
import { memoryCache } from './cache.js';
import { logger } from '../logger.js';

export class EvictionManager {
  private timer: NodeJS.Timeout | null = null;

  startAutoEviction(intervalMs = 300000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runEvictionSweep().catch((err) => logger.debug('Background eviction sweep error:', err));
    }, intervalMs);
    // Unref timer so it doesn't block process exit
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  stopAutoEviction(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runEvictionSweep(): Promise<{ expiredCount: number; evictedSizeCount: number }> {
    logger.debug('Running background TTL and LRU eviction sweep...');
    let expiredCount = 0;
    const now = Date.now();

    try {
      const allStates = await storage.listStatesAll(undefined, 5000);
      for (const s of allStates) {
        if (s.ttl > 0 && s.created_at + s.ttl < now) {
          await storage.deleteState(s.id);
          expiredCount++;
        }
      }

      await storage.checkStorageSizeAndEvict();
      memoryCache.clear();

      if (expiredCount > 0) {
        logger.info(`Eviction sweep complete: purged ${expiredCount} expired visual states.`);
      }

      return { expiredCount, evictedSizeCount: 0 };
    } catch (err) {
      logger.error('Error during eviction sweep:', err);
      return { expiredCount: 0, evictedSizeCount: 0 };
    }
  }
}

export const evictionManager = new EvictionManager();
